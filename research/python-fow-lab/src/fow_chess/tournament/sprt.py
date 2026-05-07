"""Sequential Probability Ratio Test (SPRT) over head-to-head game results.

The single highest-leverage piece of the calibration track. Replaces fixed-N
tournaments with adaptive testing:

- H0: Elo Δ ≤ elo0 (the "regression" hypothesis — typically 0)
- H1: Elo Δ ≥ elo1 (the "improvement" hypothesis — typically +5)
- alpha, beta: Type I and Type II error rates (typically 0.05 each)

After each game, compute the cumulative log-likelihood-ratio:

    LLR = sum over games of log( P(observed_score | H1) / P(observed_score | H0) )

Where P(score | H) is the Bernoulli-style probability under the binomial Elo
model with rating difference dictated by H.

Stopping rules:

    LLR >= log((1 - beta) / alpha)        → accept H1 (challenger is stronger)
    LLR <= log(beta / (1 - alpha))        → accept H0 (challenger is not stronger)
    otherwise                              → continue

Maximum games is a safety cap; if the test doesn't resolve by max_games,
return INCONCLUSIVE.

Usage:
    runner: SPRTRunner = SPRTRunner(challenger_perspective=...)
    for each game:
        runner.update(challenger_score)  # 1.0/0.5/0.0
        if runner.verdict() != PENDING:
            break
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .run_pair import PairSpec


class SPRTVerdict(Enum):
    PENDING = "pending"
    PASS = "pass"      # H1 accepted: challenger is stronger by at least elo1
    FAIL = "fail"      # H0 accepted: challenger is not stronger than elo0
    INCONCLUSIVE = "inconclusive"  # max_games reached


def _elo_to_score(elo: float) -> float:
    """Convert an Elo difference to expected score (probability of win + 0.5*draw)."""
    return 1.0 / (1.0 + 10.0 ** (-elo / 400.0))


def _bernoulli_log_likelihood(score: float, p: float) -> float:
    """Log-likelihood of observing `score` ∈ [0, 1] under expected-score `p`.

    Uses a soft-Bernoulli interpretation: score=1.0 is a "success" (logp),
    score=0.0 is a failure (log(1-p)), score=0.5 is a draw treated as
    half-success-half-failure (0.5 * log(p) + 0.5 * log(1-p)).
    """
    eps = 1e-12
    p = max(eps, min(1.0 - eps, p))
    return score * math.log(p) + (1.0 - score) * math.log(1.0 - p)


@dataclass
class SPRTRunner:
    """Online SPRT state. Update with each game's challenger score; check verdict."""

    elo0: float = 0.0
    elo1: float = 5.0
    alpha: float = 0.05
    beta: float = 0.05
    max_games: int = 1000

    games_played: int = 0
    challenger_score_sum: float = 0.0
    llr: float = 0.0
    history: list[float] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.elo1 <= self.elo0:
            raise ValueError(f"elo1 ({self.elo1}) must be > elo0 ({self.elo0})")
        if not 0.0 < self.alpha < 1.0 or not 0.0 < self.beta < 1.0:
            raise ValueError("alpha and beta must be in (0, 1)")
        if self.max_games <= 0:
            raise ValueError("max_games must be > 0")
        self._upper_bound = math.log((1.0 - self.beta) / self.alpha)
        self._lower_bound = math.log(self.beta / (1.0 - self.alpha))

    @property
    def upper_bound(self) -> float:
        return self._upper_bound

    @property
    def lower_bound(self) -> float:
        return self._lower_bound

    def update(self, challenger_score: float) -> None:
        """Record one game's outcome from the challenger's perspective.

        challenger_score: 1.0 (challenger won), 0.5 (draw), 0.0 (challenger lost).
        """
        if challenger_score not in (0.0, 0.5, 1.0):
            raise ValueError(
                f"challenger_score must be 0.0, 0.5, or 1.0; got {challenger_score}"
            )
        p0 = _elo_to_score(self.elo0)
        p1 = _elo_to_score(self.elo1)
        self.llr += _bernoulli_log_likelihood(
            challenger_score, p1
        ) - _bernoulli_log_likelihood(challenger_score, p0)
        self.games_played += 1
        self.challenger_score_sum += challenger_score
        self.history.append(self.llr)

    def verdict(self) -> SPRTVerdict:
        if self.llr >= self._upper_bound:
            return SPRTVerdict.PASS
        if self.llr <= self._lower_bound:
            return SPRTVerdict.FAIL
        if self.games_played >= self.max_games:
            return SPRTVerdict.INCONCLUSIVE
        return SPRTVerdict.PENDING

    @property
    def empirical_score(self) -> float:
        return (
            self.challenger_score_sum / self.games_played
            if self.games_played > 0
            else 0.0
        )

    @property
    def empirical_elo(self) -> float:
        """Estimated Elo difference from current empirical score."""
        eps = 1e-9
        s = max(eps, min(1.0 - eps, self.empirical_score))
        return -400.0 * math.log10(1.0 / s - 1.0)

    def report(self) -> dict:
        v = self.verdict()
        return {
            "verdict": v.value,
            "games_played": self.games_played,
            "empirical_score": self.empirical_score,
            "empirical_elo": self.empirical_elo if self.games_played > 0 else None,
            "llr": self.llr,
            "upper_bound": self._upper_bound,
            "lower_bound": self._lower_bound,
            "elo0": self.elo0,
            "elo1": self.elo1,
            "alpha": self.alpha,
            "beta": self.beta,
            "max_games": self.max_games,
        }


def challenger_score_from_row(row: dict) -> float:
    """Extract the challenger's score from a results.jsonl row.

    Convention: in SPRT runs, `bot_b` is always the challenger and `bot_a`
    is always the reference. So challenger_score = bot_b's score in this game.

    color_swap=False means bot_a is white, bot_b is black.
    color_swap=True  means bot_a is black, bot_b is white.
    """
    color_swap = bool(row.get("color_swap"))
    b_color = "white" if color_swap else "black"
    result = row.get("result")
    if result == "draw":
        return 0.5
    if result == f"{b_color}-wins":
        return 1.0
    return 0.0


def sprt_pair(
    spec: "PairSpec",
    output_dir: Path,
    *,
    elo0: float = 0.0,
    elo1: float = 5.0,
    alpha: float = 0.05,
    beta: float = 0.05,
    max_games: int = 1000,
    stockfish_path: str = "stockfish",
    progress: bool = True,
) -> dict:
    """Run SPRT on a pair: keep playing games until one of the SPRT bounds is crossed.

    Wraps `run_pair` with an early-exit callback. Resume-friendly: scans
    existing results.jsonl rows for this pair and replays them through the
    runner before continuing. If the test was already decided in a prior run,
    returns immediately.

    Convention: `bot_b` in PairSpec is the challenger; `bot_a` is the reference.

    Returns the SPRT report (verdict, games_played, empirical_elo, llr).
    Also writes a `sprt-{pair_id}.json` sidecar to output_dir capturing the
    final report.
    """
    from .run_pair import run_pair  # local import: sprt module loads under run_pair

    runner = SPRTRunner(
        elo0=elo0,
        elo1=elo1,
        alpha=alpha,
        beta=beta,
        max_games=max_games,
    )

    # Replay any existing rows for this pair through the runner.
    results_path = output_dir / "results.jsonl"
    if results_path.exists():
        with results_path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if row.get("pair_id") != spec.pair_id:
                    continue
                runner.update(challenger_score_from_row(row))
                if runner.verdict() != SPRTVerdict.PENDING:
                    break

    if progress:
        bounds = (runner.lower_bound, runner.upper_bound)
        print(
            f"  SPRT[{spec.pair_id}] elo0={elo0:+.1f} elo1={elo1:+.1f} "
            f"α={alpha} β={beta} bounds=({bounds[0]:.2f}, {bounds[1]:.2f}) "
            f"replayed={runner.games_played} llr_init={runner.llr:.3f}"
        )

    if runner.verdict() != SPRTVerdict.PENDING:
        if progress:
            print(
                f"  SPRT[{spec.pair_id}] verdict from prior data: "
                f"{runner.verdict().value} (no new games)"
            )
        report = runner.report()
        _write_sprt_sidecar(output_dir, spec.pair_id, report)
        return report

    # Spec.games is the hard cap — won't play more than spec.games regardless
    # of max_games. Use spec.games = max_games + replayed for SPRT runs.
    def on_game(row: dict) -> bool:
        runner.update(challenger_score_from_row(row))
        v = runner.verdict()
        if progress and runner.games_played % 10 == 0:
            print(
                f"    [SPRT progress] n={runner.games_played} "
                f"score={runner.empirical_score:.3f} "
                f"elo≈{runner.empirical_elo:+.1f} llr={runner.llr:+.3f}"
            )
        return v != SPRTVerdict.PENDING

    run_pair(
        spec,
        output_dir,
        stockfish_path=stockfish_path,
        progress=progress,
        early_exit_check=on_game,
    )

    report = runner.report()
    _write_sprt_sidecar(output_dir, spec.pair_id, report)

    if progress:
        emp_elo = report["empirical_elo"]
        elo_str = f"{emp_elo:+.1f}" if emp_elo is not None else "—"
        print(
            f"  SPRT[{spec.pair_id}] FINAL: verdict={report['verdict']} "
            f"n={report['games_played']} score={report['empirical_score']:.3f} "
            f"elo≈{elo_str} llr={report['llr']:+.3f}"
        )

    return report


def _write_sprt_sidecar(output_dir: Path, pair_id: str, report: dict) -> None:
    sidecar = output_dir / f"sprt-{pair_id}.json"
    with sidecar.open("w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)
        fh.write("\n")
