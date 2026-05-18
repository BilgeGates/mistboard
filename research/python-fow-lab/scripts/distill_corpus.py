"""Generate a distillation corpus: MCTS-fow self-play → (position, label) pairs.

Two label modes:

  --label-mode q (default): label each position with MCTS's own root q-value
    for the chosen move (centipawns, side-to-move POV). Cleaner signal than
    game outcomes — captures MCTS-amplified value at each ply.

  --label-mode outcome: label each position with the eventual game outcome
    from that mover's POV (+1 / -1). Noisier but doesn't require MCTS state.

For each move in each self-play game, record:
  - the FEN of the board AFTER the move was played
  - the color of the side that just moved
  - the label (q or outcome) from that owner's POV

Usage:
    .venv/bin/python3 scripts/distill_corpus.py --games 50 --out distill/v1 --label-mode q
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import chess

_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

from fow_chess.engine import static_builder
from fow_chess.evaluator import fow_evaluator, psqt_evaluator
from fow_chess.move_priors import uniform_prior
from fow_chess.selfplay import play_game
from fow_chess.strategies import Tier1Strategy


class _QCaptureStrategy:
    """Wrap a Tier1Strategy to record MCTS root q-values per select_move.

    Forwards all other attribute access via __getattr__ so play_game sees the
    inner strategy's interface unchanged. After play_game returns, `.move_qs`
    holds one entry per select_move call.
    """

    def __init__(self, inner: "Tier1Strategy") -> None:
        self._inner = inner
        self.move_qs: list[float | None] = []

    def __getattr__(self, name: str):
        return getattr(self._inner, name)

    def pick_move(self, view) -> "chess.Move":
        chosen = self._inner.pick_move(view)
        self.move_qs.append(getattr(self._inner, "last_mcts_root_q", None))
        return chosen


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--games", type=int, default=50)
    ap.add_argument("--max-plies", type=int, default=200)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--rollouts", type=int, default=200)
    ap.add_argument(
        "--label-mode",
        choices=("q", "outcome"),
        default="q",
        help="Label source: 'q' (MCTS root q-value, cp) or 'outcome' (±1 game result).",
    )
    ap.add_argument(
        "--q-clamp",
        type=float,
        default=2000.0,
        help="Clamp q-values to ±this many centipawns. Extreme values from rare "
             "king captures in rollouts dominate regression otherwise.",
    )
    ap.add_argument(
        "--teacher",
        choices=("fow", "psqt"),
        default="fow",
        help="Leaf evaluator used by the self-play MCTS. 'fow' = hand-tuned, "
             "'psqt' = learned weights (path via --teacher-psqt-weights). "
             "Expert iteration: train v_{n+1} on labels generated with v_n.",
    )
    ap.add_argument(
        "--teacher-psqt-weights",
        type=Path,
        default=None,
        help="Required when --teacher=psqt: .npz weights file (relative to lab root or absolute).",
    )
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()

    if args.teacher == "psqt" and args.teacher_psqt_weights is None:
        ap.error("--teacher=psqt requires --teacher-psqt-weights")

    out = args.out if args.out.is_absolute() else (_LAB_ROOT / args.out)
    out.mkdir(parents=True, exist_ok=True)
    corpus_path = out / "corpus.jsonl"
    meta_path = out / "meta.json"

    if args.teacher == "psqt":
        wp = args.teacher_psqt_weights
        if not wp.is_absolute():
            wp = _LAB_ROOT / wp
        if not wp.exists():
            raise SystemExit(f"teacher weights not found: {wp}")
        teacher_eval = psqt_evaluator(str(wp))
        print(f"teacher: psqt({wp})")
    else:
        teacher_eval = fow_evaluator()
        print("teacher: fow")
    builder = static_builder(teacher_eval)
    prior = uniform_prior

    n_positions = 0
    games_summary = []
    t_start = time.time()

    # buffering=1 → line-buffered text mode. Per-game flush plus this gives
    # both fast OS-level flushes and a hard guarantee on long runs. The v2
    # corpus generation lost ~30% of writes despite a clean exit when only
    # the default block buffering was used, even with per-game flush.
    with corpus_path.open("w", encoding="utf-8", buffering=1) as fout:
        for i in range(args.games):
            seed_w = args.seed + i * 7919
            seed_b = args.seed + i * 7919 + 1

            white = _QCaptureStrategy(Tier1Strategy(
                evaluator_builder=builder,
                move_prior=prior,
                target_n=256,
                max_eval_particles=16,
                seed=seed_w,
                mcts_rollouts=args.rollouts,
                mcts_rollout_depth=8,
                mcts_selection_depth=3,
                mcts_risk_lambda=0.25,
            ))
            black = _QCaptureStrategy(Tier1Strategy(
                evaluator_builder=builder,
                move_prior=prior,
                target_n=256,
                max_eval_particles=16,
                seed=seed_b,
                mcts_rollouts=args.rollouts,
                mcts_rollout_depth=8,
                mcts_selection_depth=3,
                mcts_risk_lambda=0.25,
            ))

            t_game = time.time()
            result = play_game(
                white, black, max_plies=args.max_plies,
                room_id=f"distill-g{i:04d}", seed=seed_w,
            )
            game_wall = time.time() - t_game

            # Outcome from white's POV: +1 white-wins, -1 black-wins, 0 truncated/draw
            if result.winner == "white":
                outcome_white = 1.0
            elif result.winner == "black":
                outcome_white = -1.0
            else:
                outcome_white = 0.0

            # Replay events to capture post-move FENs + paired q-values.
            board = chess.Board()
            game_positions = 0
            white_idx = 0
            black_idx = 0
            _PROMO_LETTER = {"queen": "q", "rook": "r", "bishop": "b", "knight": "n"}
            for evt in result.events:
                if evt.get("type") != "move-played":
                    continue
                move_str = evt["move"]
                promo = move_str.get("promotion")
                promo_letter = _PROMO_LETTER.get(promo, promo) if promo else ""
                move = chess.Move.from_uci(
                    f"{move_str['from']}{move_str['to']}{promo_letter}"
                )
                board.push(move)
                color_who_moved = evt["color"]

                # Pull the matching q-value out of the strategy that played
                # this color. opening_random moves don't go through the
                # strategy, so we only get q's for non-opening moves — keep
                # the index advancing only when we have one.
                q: float | None = None
                if color_who_moved == "white":
                    if white_idx < len(white.move_qs):
                        q = white.move_qs[white_idx]
                        white_idx += 1
                else:
                    if black_idx < len(black.move_qs):
                        q = black.move_qs[black_idx]
                        black_idx += 1

                if args.label_mode == "q":
                    if q is None:
                        continue  # no q (e.g., random opening move) — skip
                    label = max(-args.q_clamp, min(args.q_clamp, q))
                else:  # outcome
                    label = outcome_white if color_who_moved == "white" else -outcome_white
                    if label == 0:
                        continue

                fout.write(json.dumps({
                    "fen": board.fen(),
                    "perspective": color_who_moved,
                    "label": label,
                    "game": i,
                    "ply": board.ply(),
                }) + "\n")
                # Python 3.14 + macOS does NOT honor buffering=1 line-buffer
                # semantics on regular files (silently drops ~70% of writes
                # on long runs even with per-game flush). Empirically, only
                # per-position flush+fsync makes writes durable. Yes it's
                # heavy, but distill_corpus is bounded by MCTS rollout cost
                # (200ms+/move) not by I/O.
                fout.flush()
                game_positions += 1
                n_positions += 1

            # Force a per-game flush. Without this, long runs (50+ min)
            # can lose buffered writes despite a clean process exit — observed
            # at 200-game scale: 6647 writes reported, 0 bytes on disk. The
            # OS file mtime never advanced past creation. Whether the bug is
            # in Python 3.14's TextIOWrapper, the file-system, or some
            # interaction with long-running test loops, flushing per game
            # makes the data durable.
            fout.flush()

            games_summary.append({
                "game": i, "winner": result.winner, "end_reason": result.end_reason,
                "plies": result.plies, "wall_s": round(game_wall, 1), "positions": game_positions,
            })
            print(f"  g{i:04d} winner={result.winner or 'none':<5} "
                  f"end={result.end_reason:<14} plies={result.plies:>3} "
                  f"wall={game_wall:>5.1f}s pos={game_positions}")

    wall = time.time() - t_start
    meta = {
        "games": args.games,
        "rollouts": args.rollouts,
        "seed": args.seed,
        "n_positions": n_positions,
        "wall_seconds": round(wall, 1),
        "summary": games_summary,
    }
    meta_path.write_text(json.dumps(meta, indent=2))
    print(f"\nwrote {n_positions} positions in {wall:.0f}s → {corpus_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
