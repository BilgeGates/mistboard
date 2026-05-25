"""Iterative Elo + Wald CIs from results.jsonl.

Convention:
- The "anchor" bot has Elo = 0 by definition. Every other bot is rated
  relative to it. This is the only way Elo numbers stay comparable across
  tournaments — see docs/fog-of-war/engine-roadmap.md P3.0 design notes.
- Identity is `bot_a_hash` / `bot_b_hash`, not the name. Renames are safe;
  config changes are detectable.
- Symbol convention: "score" = 1 for win, 0.5 for draw, 0 for loss, from
  bot's perspective.

Elo computation: simple closed-form against a fixed anchor.
   expected_score = 1 / (1 + 10 ** (-rating / 400))
   We solve for rating given empirical score. With Wald 95% CI:
   sigma_score ≈ sqrt(score_variance / N)
   sigma_rating ≈ sigma_score * (400 / ln(10)) / (expected * (1 - expected))
   For sanity-check we also report ±400/√N (the roadmap's first-pass band).
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable


@dataclass
class BotRecord:
    name: str
    hash: str
    games: int = 0
    wins: int = 0
    losses: int = 0
    draws: int = 0
    score_sum: float = 0.0  # sum of scores from this bot's perspective

    @property
    def score_rate(self) -> float:
        return self.score_sum / self.games if self.games else 0.0

    def record(self, score: float) -> None:
        self.games += 1
        self.score_sum += score
        if score == 1.0:
            self.wins += 1
        elif score == 0.0:
            self.losses += 1
        else:
            self.draws += 1


@dataclass
class LadderRow:
    name: str
    hash: str
    games: int
    wins: int
    losses: int
    draws: int
    score_rate: float
    elo: float
    ci_simple: float  # ±400/√N
    ci_wald: float    # ± from binomial CI translated to Elo
    is_anchor: bool = False


def compute_ladder(
    results_paths: Iterable[Path],
    *,
    anchor_hash: str,
    anchor_name: str | None = None,
) -> list[LadderRow]:
    by_hash: dict[str, BotRecord] = {}

    for path in results_paths:
        if not path.exists():
            continue
        with path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                row = json.loads(line)
                _accumulate(row, by_hash)

    if anchor_hash not in by_hash:
        # No games yet involving the anchor — return whatever we have at 0.
        return []

    anchor_rec = by_hash[anchor_hash]
    rows: list[LadderRow] = [
        LadderRow(
            name=anchor_name or anchor_rec.name,
            hash=anchor_rec.hash,
            games=anchor_rec.games,
            wins=anchor_rec.wins,
            losses=anchor_rec.losses,
            draws=anchor_rec.draws,
            score_rate=anchor_rec.score_rate,
            elo=0.0,
            ci_simple=0.0,
            ci_wald=0.0,
            is_anchor=True,
        )
    ]

    # For each non-anchor bot, count its games VS the anchor specifically and
    # rate it from those head-to-head results. This is what "anchor mode"
    # means — we don't infer rating from games against other challengers.
    head_to_head = _head_to_head(results_paths, anchor_hash)
    for bot_hash, h2h in head_to_head.items():
        if bot_hash == anchor_hash:
            continue
        N = h2h["games"]
        if N == 0:
            continue
        score = h2h["score_sum"] / N
        elo = _score_to_elo(score)
        ci_simple = 400.0 / math.sqrt(N) if N > 0 else float("inf")
        ci_wald = _wald_elo_ci(score, N)
        rows.append(
            LadderRow(
                name=h2h["name"],
                hash=bot_hash,
                games=N,
                wins=h2h["wins"],
                losses=h2h["losses"],
                draws=h2h["draws"],
                score_rate=score,
                elo=elo,
                ci_simple=ci_simple,
                ci_wald=ci_wald,
            )
        )

    rows.sort(key=lambda r: -r.elo)
    return rows


def render_ladder_markdown(rows: list[LadderRow]) -> str:
    if not rows:
        return "_(no games)_"
    lines = [
        "| Bot | Games | W-L-D | Score | Elo | ±CI (Wald) | ±CI (1/√N) |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for r in rows:
        elo_str = "0 (anchor)" if r.is_anchor else f"{r.elo:+.0f}"
        ci_wald_str = "—" if r.is_anchor else f"{r.ci_wald:.0f}"
        ci_simple_str = "—" if r.is_anchor else f"{r.ci_simple:.0f}"
        lines.append(
            f"| `{r.name}` | {r.games} | {r.wins}-{r.losses}-{r.draws} | "
            f"{r.score_rate:.3f} | {elo_str} | "
            f"{ci_wald_str} | {ci_simple_str} |"
        )
    return "\n".join(lines)


# ----- internals -----


def _accumulate(row: dict, by_hash: dict[str, BotRecord]) -> None:
    a_hash = row.get("bot_a_hash")
    b_hash = row.get("bot_b_hash")
    a_name = row.get("bot_a_name", "")
    b_name = row.get("bot_b_name", "")
    if not a_hash or not b_hash:
        return
    color_swap = bool(row.get("color_swap"))
    result = row.get("result")  # "white-wins" | "black-wins" | "draw"
    a_color = "black" if color_swap else "white"
    if result == "draw":
        a_score, b_score = 0.5, 0.5
    elif result == f"{a_color}-wins":
        a_score, b_score = 1.0, 0.0
    else:
        a_score, b_score = 0.0, 1.0

    a_rec = by_hash.setdefault(a_hash, BotRecord(name=a_name, hash=a_hash))
    b_rec = by_hash.setdefault(b_hash, BotRecord(name=b_name, hash=b_hash))
    a_rec.record(a_score)
    b_rec.record(b_score)


def _head_to_head(
    results_paths: Iterable[Path], anchor_hash: str
) -> dict[str, dict]:
    h2h: dict[str, dict] = {}
    for path in results_paths:
        if not path.exists():
            continue
        with path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                row = json.loads(line)
                a_hash = row.get("bot_a_hash")
                b_hash = row.get("bot_b_hash")
                if not a_hash or not b_hash:
                    continue
                if anchor_hash not in (a_hash, b_hash):
                    continue
                if a_hash == anchor_hash:
                    other_hash = b_hash
                    other_name = row.get("bot_b_name", "")
                    other_is_a = False
                else:
                    other_hash = a_hash
                    other_name = row.get("bot_a_name", "")
                    other_is_a = True

                color_swap = bool(row.get("color_swap"))
                result = row.get("result")
                a_color = "black" if color_swap else "white"
                if result == "draw":
                    a_score, b_score = 0.5, 0.5
                elif result == f"{a_color}-wins":
                    a_score, b_score = 1.0, 0.0
                else:
                    a_score, b_score = 0.0, 1.0
                other_score = a_score if other_is_a else b_score

                rec = h2h.setdefault(
                    other_hash,
                    {
                        "name": other_name,
                        "games": 0,
                        "wins": 0,
                        "losses": 0,
                        "draws": 0,
                        "score_sum": 0.0,
                    },
                )
                rec["games"] += 1
                rec["score_sum"] += other_score
                if other_score == 1.0:
                    rec["wins"] += 1
                elif other_score == 0.0:
                    rec["losses"] += 1
                else:
                    rec["draws"] += 1
    return h2h


def _score_to_elo(score: float) -> float:
    eps = 1e-9
    score = max(eps, min(1.0 - eps, score))
    return -400.0 * math.log10(1.0 / score - 1.0)


def _wald_elo_ci(score: float, N: int) -> float:
    """Translate a binomial Wald CI on score into ± Elo at the central score."""
    if N <= 0:
        return float("inf")
    eps = 1e-9
    p = max(eps, min(1.0 - eps, score))
    se = math.sqrt(p * (1 - p) / N)
    if se == 0:
        return 0.0
    upper = min(1 - eps, p + 1.96 * se)
    lower = max(eps, p - 1.96 * se)
    return (_score_to_elo(upper) - _score_to_elo(lower)) / 2.0
