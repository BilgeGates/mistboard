"""Run parity checks across a mistboard corpus.

Three modes:

- consistency (default): for every opp-move ply, assert that the canonical
  truth board passes `consistent_with(after, before, observation, perspective)`.
  Deterministic. Tests the rules-level correctness of `observation_from_transition`,
  `visible_squares`, `visible_piece_map`, and `consistent_with` — all internal
  to the lab.

- visibility: for every canonical board state, assert the lab's
  `visible_squares(board, color)` equals the TS-dumped `PlayerView.visibleSquares`
  square-for-square, for both perspectives. Deterministic. This is the test
  that catches drift between the mistboard TS visibility model and the lab's
  Python implementation. Together with consistency, this closes P1 correctness.

- retention: replay through `BeliefState` with a uniform prior and assert the
  canonical truth FEN is in the particle set after every ply. Statistical:
  retention depends on prior quality and target_n, not correctness. Kept for
  diagnostic comparison once better priors arrive (P4).

Usage:
    .venv/bin/python scripts/run_parity.py [corpus_dir] [--mode consistency|retention]

Default corpus_dir: research/python-fow-lab/corpora/random-ep-bias-v2.
"""

from __future__ import annotations

import argparse
import random
import sys
from dataclasses import dataclass
from pathlib import Path

import chess

# Allow running from anywhere by making `src/` importable.
_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

from fow_chess.belief import BeliefState
from fow_chess.corpus import GameEntry, load_corpus, read_events, read_views
from fow_chess.event_log import iter_steps, replay_canonical
from fow_chess.move_priors import uniform_prior
from fow_chess.observation import consistent_with
from fow_chess.visibility import visible_squares


@dataclass
class Failure:
    seed: int
    perspective: str
    ply: int
    reason: str
    detail: str = ""


def run_consistency_on_game(game: GameEntry) -> list[Failure]:
    """Deterministic check: truth must pass consistent_with at every opp ply."""
    failures: list[Failure] = []
    events = read_events(game)

    for perspective in (chess.WHITE, chess.BLACK):
        perspective_name = "white" if perspective == chess.WHITE else "black"
        try:
            for step in iter_steps(events, perspective):
                if step.opp_observation is None:
                    continue
                if not consistent_with(
                    step.canonical_after,
                    step.canonical_before,
                    step.opp_observation,
                    perspective,
                ):
                    failures.append(
                        Failure(
                            seed=game.seed,
                            perspective=perspective_name,
                            ply=step.ply,
                            reason="consistent_with_rejected_truth",
                            detail=f"truth={step.canonical_after.fen()}",
                        )
                    )
        except Exception as exc:  # noqa: BLE001
            failures.append(
                Failure(
                    seed=game.seed,
                    perspective=perspective_name,
                    ply=-1,
                    reason="exception",
                    detail=f"{type(exc).__name__}: {exc}",
                )
            )

    return failures


def run_visibility_on_game(game: GameEntry) -> list[Failure]:
    """Cross-language check: lab visible_squares must equal TS PlayerView.visibleSquares per ply."""
    failures: list[Failure] = []
    events = read_events(game)
    views = read_views(game)

    boards = list(replay_canonical(events))
    if len(boards) != len(views):
        failures.append(
            Failure(
                seed=game.seed,
                perspective="-",
                ply=-1,
                reason="length_mismatch",
                detail=f"boards={len(boards)} views={len(views)}",
            )
        )
        return failures

    for ply, (board, view) in enumerate(zip(boards, views)):
        if view.get("final"):
            # TS visibility short-circuits to own-pieces-only on finished states;
            # the lab computes from the canonical board regardless. Skip by design.
            continue
        if view["ply"] != ply:
            failures.append(
                Failure(
                    seed=game.seed,
                    perspective="-",
                    ply=ply,
                    reason="ply_index_mismatch",
                    detail=f"view ply={view['ply']}",
                )
            )
            continue
        for color_name, color in (("white", chess.WHITE), ("black", chess.BLACK)):
            ts_squares = {chess.parse_square(s) for s in view[color_name]}
            lab_mask = visible_squares(board, color)
            lab_squares = set(lab_mask)
            if ts_squares != lab_squares:
                only_ts = ts_squares - lab_squares
                only_lab = lab_squares - ts_squares
                failures.append(
                    Failure(
                        seed=game.seed,
                        perspective=color_name,
                        ply=ply,
                        reason="visibility_mismatch",
                        detail=(
                            f"only_ts={sorted(chess.square_name(s) for s in only_ts)} "
                            f"only_lab={sorted(chess.square_name(s) for s in only_lab)} "
                            f"fen={board.fen()}"
                        ),
                    )
                )

    return failures


def run_retention_on_game(game: GameEntry, target_n: int) -> list[Failure]:
    """Statistical check: truth FEN must be in particles after every ply."""
    failures: list[Failure] = []
    events = read_events(game)

    for perspective in (chess.WHITE, chess.BLACK):
        belief = BeliefState.initial(
            perspective=perspective,
            move_prior=uniform_prior,
            target_n=target_n,
            rng=random.Random(game.seed),
        )
        perspective_name = "white" if perspective == chess.WHITE else "black"
        try:
            for step in iter_steps(events, perspective):
                if step.own_move is not None:
                    belief.update_after_own_move(step.own_move)
                else:
                    assert step.opp_observation is not None
                    belief.update_after_opp_move(step.opp_observation)

                truth_fen = step.canonical_after.fen()
                if belief.collapsed():
                    failures.append(
                        Failure(
                            seed=game.seed,
                            perspective=perspective_name,
                            ply=step.ply,
                            reason="collapsed",
                            detail=f"truth={truth_fen}",
                        )
                    )
                    break
                if not any(p.fen() == truth_fen for p in belief.particles):
                    failures.append(
                        Failure(
                            seed=game.seed,
                            perspective=perspective_name,
                            ply=step.ply,
                            reason="truth_missing",
                            detail=f"particles={len(belief.particles)}",
                        )
                    )
                    break
        except Exception as exc:  # noqa: BLE001
            failures.append(
                Failure(
                    seed=game.seed,
                    perspective=perspective_name,
                    ply=-1,
                    reason="exception",
                    detail=f"{type(exc).__name__}: {exc}",
                )
            )

    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "corpus_dir",
        nargs="?",
        default=str(
            _LAB_ROOT.parent.parent
            / "research/python-fow-lab/corpora/random-ep-bias-v2"
        ),
    )
    parser.add_argument(
        "--mode",
        choices=("consistency", "visibility", "retention"),
        default="consistency",
    )
    parser.add_argument("--target-n", type=int, default=256)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--max-failures-shown", type=int, default=10)
    args = parser.parse_args()

    corpus = load_corpus(args.corpus_dir)
    games = corpus.games[: args.limit] if args.limit else corpus.games
    print(
        f"corpus: {corpus.root.name} (generator={corpus.generator}, "
        f"bias={corpus.bias}, games={len(games)})"
    )
    print(f"mode: {args.mode}")
    if args.mode == "retention":
        print(f"target_n: {args.target_n}")

    all_failures: list[Failure] = []
    games_with_failures = 0

    for i, game in enumerate(games):
        if args.mode == "consistency":
            failures = run_consistency_on_game(game)
        elif args.mode == "visibility":
            failures = run_visibility_on_game(game)
        else:
            failures = run_retention_on_game(game, args.target_n)
        if failures:
            games_with_failures += 1
            all_failures.extend(failures)
        if (i + 1) % 100 == 0:
            print(
                f"  ..{i + 1}/{len(games)} "
                f"({games_with_failures} with failures so far)"
            )

    print()
    print(f"games run:           {len(games)}")
    print(f"games with failures: {games_with_failures}")
    print(f"total failures:      {len(all_failures)}")

    if all_failures:
        by_reason: dict[str, int] = {}
        for f in all_failures:
            by_reason[f.reason] = by_reason.get(f.reason, 0) + 1
        print("failures by reason:")
        for reason, count in sorted(by_reason.items()):
            print(f"  {reason}: {count}")

        print()
        print(f"first {min(args.max_failures_shown, len(all_failures))} failures:")
        for f in all_failures[: args.max_failures_shown]:
            print(
                f"  seed={f.seed} {f.perspective} ply={f.ply} "
                f"reason={f.reason} :: {f.detail}"
            )
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
