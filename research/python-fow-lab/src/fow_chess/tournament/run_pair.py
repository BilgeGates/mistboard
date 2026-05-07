"""run_pair — pure(-ish) function that plays N games between two BotConfigs.

The fan-out boundary: today this is called in a for-loop by `tournament.py`.
Tomorrow (if we lift to a server) it's called by a queue consumer. Same
function, different transport.

Design:
- Color-balanced: A is white in even games, black in odd games.
- Idempotent: scans existing results.jsonl on entry, skips already-completed
  (pair_id, game_index, color_swap) triples.
- Per-game wall is recorded (wall_seconds) but not interrupted: play_game
  has no per-ply callback to safely abort mid-game without leaking
  Stockfish state. The protection is the across-game watchdog below; within
  a game we trust Stockfish at depth 4 / movetime 50ms not to run away.
- Per-pair latency-drift watchdog: rolling baseline established after 5
  games, halt the pair if any later game exceeds `latency_drift_factor` ×
  baseline (default 5x). Catches pathological drift, not normal variance.
- Each game's full bichess GameEvent log is persisted to games/{game_id}.ndjson
  in the tournament dir. results.jsonl gets one line per completed game,
  shaped like the production `games` table + tournament metadata.

All times are recorded as Unix ms (UTC). harness_version is stamped on every
result row; mid-tournament harness updates are forbidden by convention, and
mismatched versions in one results.jsonl are a corruption signal.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

import chess

from ..selfplay import GameResult, OpeningPolicy, TimeControlSpec, play_game
from .config import BotConfig, TimeControl
from .play_signature import compute_play_signature
from .runtime import bot_runtime

HARNESS_VERSION = "1.1.1"  # bump: play_signature stamped on every row


@dataclass(frozen=True)
class PairSpec:
    pair_id: str
    bot_a: BotConfig
    bot_b: BotConfig
    games: int
    tournament_id: str = ""
    max_plies: int = 300
    seed_base: str = ""
    time_control: TimeControl | None = None
    # Forward-compat for Draft960. "canonical" = standard FOW start. A3 in
    # the engine-roadmap actually resolves this into a starting FEN; today
    # it's a placeholder so future Draft960 specs don't need a schema
    # migration on every locked tournament dir.
    start_position: str = "canonical"
    # Opening diversity policy. Decouples sample size from real-information-content
    # by randomizing the first N plies of each game. Essential for SPRT to converge
    # on Tier-1-vs-Tier-1 measurements where deterministic seeding produces highly
    # correlated games. None = canonical opening (no randomization).
    opening_policy: OpeningPolicy | None = None

    def __post_init__(self) -> None:
        if not self.seed_base:
            object.__setattr__(self, "seed_base", self.pair_id)


def derive_seed(pair_id: str, game_index: int, role: str) -> int:
    """Stable per-(pair, game, role) seed.

    `role` is "a" or "b" — bot identity, not color. Using bot identity (not
    color) means a bot's own RNG sequence is the same regardless of which
    color it played. That keeps debug-by-replay possible: same seed → same
    Tier-1 internal decisions modulo color.
    """
    h = hashlib.sha256(f"{pair_id}|{game_index}|{role}".encode("utf-8")).digest()
    return int.from_bytes(h[:8], "big") % (2**31)


def run_pair(
    spec: PairSpec,
    output_dir: Path,
    *,
    stockfish_path: str = "stockfish",
    latency_drift_factor: float = 10.0,
    latency_drift_consecutive: int = 2,
    progress: bool = True,
    early_exit_check: "Callable[[dict], bool] | None" = None,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    games_dir = output_dir / "games"
    games_dir.mkdir(exist_ok=True)
    results_path = output_dir / "results.jsonl"

    play_sig = compute_play_signature(stockfish_path)
    completed = _scan_completed(results_path, spec.pair_id, play_sig)
    pending = [i for i in range(spec.games) if i not in completed]
    if not pending:
        if progress:
            print(f"  pair {spec.pair_id}: all {spec.games} games already complete")
        return

    if progress:
        print(
            f"  pair {spec.pair_id}: {len(pending)} of {spec.games} games "
            f"to play (resumed from {len(completed)})"
        )

    with (
        bot_runtime(spec.bot_a, stockfish_path=stockfish_path) as factory_a,
        bot_runtime(spec.bot_b, stockfish_path=stockfish_path) as factory_b,
    ):
        latency_samples: list[float] = []
        baseline_avg: float | None = None
        consecutive_drift = 0

        for game_index in pending:
            color_swap = game_index % 2 == 1  # 0: a=white, 1: a=black
            seed_a = derive_seed(spec.seed_base, game_index, "a")
            seed_b = derive_seed(spec.seed_base, game_index, "b")

            bot_a = _LatencyTracking(factory_a(seed_a))
            bot_b = _LatencyTracking(factory_b(seed_b))

            if not color_swap:
                white, black = bot_a, bot_b
                white_name, black_name = spec.bot_a.name, spec.bot_b.name
            else:
                white, black = bot_b, bot_a
                white_name, black_name = spec.bot_b.name, spec.bot_a.name

            game_id = f"{spec.pair_id}-g{game_index:04d}-{'b' if color_swap else 'a'}white"
            started_at_ms = _now_ms()
            t0 = time.time()
            time_control_spec = (
                TimeControlSpec(
                    initial_seconds=spec.time_control.initial_seconds,
                    increment_seconds=spec.time_control.increment_seconds,
                )
                if spec.time_control is not None
                else None
            )
            # Opening policy uses a per-game seed so each game in the pair
            # gets a different random opening (when randomized). Derived
            # deterministically from the pair seed_base + game_index so
            # resume reproduces the same openings.
            opening_seed = derive_seed(spec.seed_base, game_index, "opening")
            result = play_game(
                white,
                black,
                max_plies=spec.max_plies,
                room_id=game_id,
                seed=opening_seed,
                time_control=time_control_spec,
                opening_policy=spec.opening_policy,
            )
            wall = time.time() - t0
            ended_at_ms = _now_ms()

            game_path = games_dir / f"{game_id}.ndjson"
            with game_path.open("w", encoding="utf-8") as fh:
                for event in result.events:
                    fh.write(json.dumps(event) + "\n")

            row = _build_result_row(
                spec=spec,
                game_index=game_index,
                color_swap=color_swap,
                game_id=game_id,
                white_name=white_name,
                black_name=black_name,
                seed_a=seed_a,
                seed_b=seed_b,
                result=result,
                wall_seconds=wall,
                started_at_ms=started_at_ms,
                ended_at_ms=ended_at_ms,
                bot_a_latency=bot_a,
                bot_b_latency=bot_b,
                game_path_relative=game_path.relative_to(output_dir).as_posix(),
                play_signature=play_sig,
            )
            with results_path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(row) + "\n")

            avg_per_move = (
                (bot_a.total_seconds + bot_b.total_seconds)
                / max(bot_a.move_count + bot_b.move_count, 1)
            )
            latency_samples.append(avg_per_move)
            if len(latency_samples) == 5:
                baseline_avg = sum(latency_samples) / len(latency_samples)
            elif baseline_avg is not None:
                if avg_per_move > latency_drift_factor * baseline_avg:
                    consecutive_drift += 1
                    if consecutive_drift >= latency_drift_consecutive:
                        raise RuntimeError(
                            f"pair {spec.pair_id} game {game_index}: latency "
                            f"drift {avg_per_move:.2f}s/move vs baseline "
                            f"{baseline_avg:.2f}s for {consecutive_drift} "
                            f"consecutive games — halt"
                        )
                else:
                    consecutive_drift = 0

            if progress:
                outcome = _outcome_letter(result, color_swap)
                print(
                    f"    g{game_index:04d} "
                    f"{'a=black' if color_swap else 'a=white'} "
                    f"{outcome} plies={result.plies:3d} end={result.end_reason} "
                    f"wall={wall:5.1f}s "
                    f"avg={avg_per_move:.2f}s"
                )

            if early_exit_check is not None and early_exit_check(row):
                if progress:
                    print(
                        f"  pair {spec.pair_id}: early exit requested after "
                        f"game {game_index}"
                    )
                return


# ----- internals -----


def _scan_completed(
    results_path: Path, pair_id: str, current_play_signature: str
) -> set[int]:
    """Return completed game indices for this pair, refusing to mix versions.

    Two version-mixing safeguards are checked:
    - `harness_version` mismatch: a different harness wrote the prior rows;
      mixing breaks the row schema.
    - `play_signature` mismatch: the same harness wrote the rows but the
      engine source has changed since; mixing combines games played by
      different bots under the same name.

    Pre-1.1.1 rows have no `play_signature` field; tolerate that by skipping
    the play_sig check on those rows. The harness_version check still
    catches them — pre-1.1.1 rows have version 1.1.0 or older, which won't
    match 1.1.1.
    """
    if not results_path.exists():
        return set()
    completed: set[int] = set()
    versions: set[str] = set()
    play_sigs: set[str] = set()
    with results_path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if row.get("pair_id") == pair_id and "game_index" in row:
                completed.add(int(row["game_index"]))
                hv = row.get("harness_version")
                if hv:
                    versions.add(hv)
                ps = row.get("play_signature")
                if ps:
                    play_sigs.add(ps)
    if versions and HARNESS_VERSION not in versions:
        raise RuntimeError(
            f"results.jsonl for pair {pair_id} contains harness versions "
            f"{sorted(versions)}, but harness is now {HARNESS_VERSION}. "
            f"Refusing to mix versions. Re-run from scratch in a new tournament_id."
        )
    if play_sigs and current_play_signature not in play_sigs:
        raise RuntimeError(
            f"results.jsonl for pair {pair_id} contains play_signatures "
            f"{sorted(play_sigs)}, but current engine code computes "
            f"{current_play_signature}. Engine source has changed since the "
            f"prior games were played. Refusing to mix bot identities under "
            f"the same name. Re-run from scratch in a new tournament_id, or "
            f"revert engine source to match prior signature."
        )
    return completed


def _build_result_row(
    *,
    spec: PairSpec,
    game_index: int,
    color_swap: bool,
    game_id: str,
    white_name: str,
    black_name: str,
    seed_a: int,
    seed_b: int,
    result: GameResult,
    wall_seconds: float,
    started_at_ms: int,
    ended_at_ms: int,
    bot_a_latency: "_LatencyTracking",
    bot_b_latency: "_LatencyTracking",
    game_path_relative: str,
    play_signature: str,
) -> dict:
    if result.winner == "white":
        production_result = "white-wins"
    elif result.winner == "black":
        production_result = "black-wins"
    else:
        production_result = "draw"

    if result.end_reason == "king-captured":
        production_termination = "king-captured"
    elif result.end_reason == "clock-expired":
        production_termination = "timeout"
    else:
        production_termination = "draw"

    return {
        # production `games` table shape
        "room_id": game_id,
        "variant": "fog-of-war",
        "result": production_result,
        "termination": production_termination,
        "ply_count": result.plies,
        "started_at_ms": started_at_ms,
        "ended_at_ms": ended_at_ms,
        "white_client": white_name,
        "black_client": black_name,
        # tournament-specific
        "tournament_id": spec.tournament_id or None,
        "pair_id": spec.pair_id,
        "game_index": game_index,
        "color_swap": color_swap,
        "bot_a_name": spec.bot_a.name,
        "bot_a_hash": _hash_for(spec.bot_a),
        "bot_b_name": spec.bot_b.name,
        "bot_b_hash": _hash_for(spec.bot_b),
        "seed_a": seed_a,
        "seed_b": seed_b,
        "harness_version": HARNESS_VERSION,
        "play_signature": play_signature,
        "end_reason": result.end_reason,
        "truncated": result.truncated,
        "wall_seconds": wall_seconds,
        "time_control": (
            {
                "initial_seconds": spec.time_control.initial_seconds,
                "increment_seconds": spec.time_control.increment_seconds,
            }
            if spec.time_control is not None
            else None
        ),
        "final_white_clock_ms": result.final_clocks_ms[0],
        "final_black_clock_ms": result.final_clocks_ms[1],
        "bot_a_avg_move_seconds": (
            bot_a_latency.total_seconds / bot_a_latency.move_count
            if bot_a_latency.move_count
            else 0.0
        ),
        "bot_b_avg_move_seconds": (
            bot_b_latency.total_seconds / bot_b_latency.move_count
            if bot_b_latency.move_count
            else 0.0
        ),
        "game_path": game_path_relative,
    }


def _hash_for(config: BotConfig) -> str:
    from .config import canonical_hash

    return canonical_hash(config)


def _outcome_letter(result: GameResult, color_swap: bool) -> str:
    a_color = "black" if color_swap else "white"
    if result.winner == a_color:
        return "A"
    if result.winner is None:
        return "D"
    return "B"


def _now_ms() -> int:
    return int(time.time() * 1000)


class _LatencyTracking:
    """Strategy wrapper that accumulates per-move wall-clock time."""

    def __init__(self, inner: object) -> None:
        self.inner = inner
        self.move_count = 0
        self.total_seconds = 0.0

    def reset(self, perspective: chess.Color) -> None:
        self.inner.reset(perspective)

    def observe_own_move(self, move: chess.Move, observation) -> None:
        self.inner.observe_own_move(move, observation)

    def observe_opp_move(self, observation) -> None:
        self.inner.observe_opp_move(observation)

    def pick_move(self, view) -> chess.Move:
        t0 = time.time()
        move = self.inner.pick_move(view)
        self.total_seconds += time.time() - t0
        self.move_count += 1
        return move
