"""Belief layer diagnostics — does the engine actually "see" correctly?

Runs production-vs-production self-play and measures whether each side's
particle cloud contains the actual true board (which we know in self-play
because we're the harness).

Output per ply per side:
  - truth_in_belief: bool (is the canonical board one of the particles?)
  - n_particles, n_unique_particles
  - weight_entropy (Shannon entropy over particle weights, nats)
  - csp_reseed_fired, repair_fired
  - decision_path (which strategy branch fired)

Aggregate metrics per game and across games:
  - % plies where truth was in belief (the headline)
  - Mean / median entropy over the game
  - CSP / repair frequency
  - When truth leaves belief, at what ply and after what kind of move?

Usage:
    .venv/bin/python3 scripts/belief_diagnostics.py --games 20 --out lab/diag/belief-v0
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from collections import Counter
from pathlib import Path

import chess

_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

from fow_chess.engine import static_builder
from fow_chess.evaluator import fow_evaluator
from fow_chess.move_priors import uniform_prior
from fow_chess.selfplay import play_game
from fow_chess.strategies import Tier1Strategy


def _piece_map_sig(board: chess.Board) -> tuple:
    """Stable hashable signature of a board's piece placement (ignores side-to-move,
    castling rights, en passant). Used for truth-in-belief equality.
    """
    return tuple(sorted(
        (sq, p.piece_type, p.color)
        for sq, p in board.piece_map().items()
    ))


def _shannon_entropy(weights: list[float]) -> float:
    """Shannon entropy in nats over normalized weights."""
    total = sum(weights)
    if total <= 0:
        return 0.0
    h = 0.0
    for w in weights:
        if w <= 0:
            continue
        p = w / total
        h -= p * math.log(p)
    return h


class _BeliefCaptureStrategy:
    """Wraps Tier1Strategy. Captures particle piece-map signatures + weights
    per pick_move so the harness can check truth-in-belief externally.
    """

    def __init__(self, inner: "Tier1Strategy") -> None:
        self._inner = inner
        self.per_move: list[dict] = []

    def __getattr__(self, name: str):
        return getattr(self._inner, name)

    def pick_move(self, view) -> "chess.Move":
        chosen = self._inner.pick_move(view)
        belief = self._inner._belief
        if belief is None:
            self.per_move.append({"belief": None})
        else:
            sigs = [_piece_map_sig(p) for p in belief.particles]
            unique_sigs = set(sigs)
            weights = list(belief.weights)
            entropy = _shannon_entropy(weights)
            self.per_move.append({
                "n_particles": len(belief.particles),
                "n_unique": len(unique_sigs),
                "entropy": entropy,
                "signatures": sigs,
                "weights": weights,
                "csp_reseed_fired": bool(belief.last_csp_reseed_fired),
                "csp_reseed_count": belief.last_csp_reseed_count,
                "last_jitter_fired": belief.last_jitter_fired,
                "last_constraint_pruned": belief.last_constraint_pruned,
            })
        return chosen


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--games", type=int, default=20)
    ap.add_argument("--max-plies", type=int, default=200)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--opening-random-plies", type=int, default=4,
                    help="Random opening plies (matches tournament default).")
    args = ap.parse_args()

    out = args.out if args.out.is_absolute() else (_LAB_ROOT / args.out)
    out.mkdir(parents=True, exist_ok=True)
    belief_path = out / "belief.jsonl"
    summary_path = out / "summary.json"

    builder = static_builder(fow_evaluator())
    prior = uniform_prior

    games_summary = []
    n_total_plies = 0
    n_truth_in_belief = 0
    csp_fires = 0
    jitter_fires = 0
    t_start = time.time()

    _PROMO = {"queen": "q", "rook": "r", "bishop": "b", "knight": "n"}

    with belief_path.open("w", encoding="utf-8", buffering=1) as bout:
        for i in range(args.games):
            seed_w = args.seed + i * 7919
            seed_b = args.seed + i * 7919 + 1

            white_inner = Tier1Strategy(
                evaluator_builder=builder, move_prior=prior,
                target_n=256, max_eval_particles=16, seed=seed_w,
                mcts_rollouts=0,  # PRODUCTION-style — full Tier1Strategy machinery
                verbose_belief_capture=True,
            )
            black_inner = Tier1Strategy(
                evaluator_builder=builder, move_prior=prior,
                target_n=256, max_eval_particles=16, seed=seed_b,
                mcts_rollouts=0,
                verbose_belief_capture=True,
            )
            white = _BeliefCaptureStrategy(white_inner)
            black = _BeliefCaptureStrategy(black_inner)

            t_g = time.time()
            result = play_game(
                white, black, max_plies=args.max_plies,
                room_id=f"belief-g{i:04d}", seed=seed_w,
            )
            wall = time.time() - t_g

            # Walk events, reconstruct canonical board, correlate with belief.
            board = chess.Board()
            white_idx = 0
            black_idx = 0
            game_truth_hits = 0
            game_plies = 0
            game_first_truth_lost: int | None = None

            for evt in result.events:
                if evt.get("type") != "move-played":
                    continue
                # Canonical truth at the moment THIS player is about to move.
                # piece_map() before push() reflects the position they're evaluating.
                color = evt["color"]
                truth_sig = _piece_map_sig(board)

                strat = white if color == "white" else black
                idx_attr = "white_idx" if color == "white" else "black_idx"
                idx = white_idx if color == "white" else black_idx

                belief_snap: dict | None = None
                truth_in_belief: bool | None = None
                if not evt.get("opening_random"):
                    if idx < len(strat.per_move):
                        belief_snap = strat.per_move[idx]
                        if belief_snap.get("signatures"):
                            truth_in_belief = truth_sig in set(belief_snap["signatures"])
                            if truth_in_belief:
                                game_truth_hits += 1
                            elif game_first_truth_lost is None:
                                game_first_truth_lost = board.ply()
                            game_plies += 1
                    if color == "white":
                        white_idx += 1
                    else:
                        black_idx += 1

                if belief_snap is not None and belief_snap.get("signatures"):
                    record = {
                        "game": i,
                        "ply": board.ply(),
                        "color": color,
                        "truth_in_belief": truth_in_belief,
                        "n_particles": belief_snap.get("n_particles"),
                        "n_unique": belief_snap.get("n_unique"),
                        "entropy": belief_snap.get("entropy"),
                        "csp_reseed_fired": belief_snap.get("csp_reseed_fired"),
                        "csp_reseed_count": belief_snap.get("csp_reseed_count"),
                        "jitter_fired": bool(belief_snap.get("last_jitter_fired")),
                        "constraint_pruned": belief_snap.get("last_constraint_pruned"),
                    }
                    bout.write(json.dumps(record) + "\n")
                    if record["csp_reseed_fired"]:
                        csp_fires += 1
                    if record["jitter_fired"]:
                        jitter_fires += 1

                # Apply move to canonical board
                m = evt["move"]
                promo = m.get("promotion")
                pl = _PROMO.get(promo, "") if promo else ""
                board.push(chess.Move.from_uci(f"{m['from']}{m['to']}{pl}"))

            n_total_plies += game_plies
            n_truth_in_belief += game_truth_hits
            games_summary.append({
                "game": i,
                "winner": result.winner,
                "plies": result.plies,
                "tracked_plies": game_plies,
                "truth_hit_count": game_truth_hits,
                "truth_hit_rate": game_truth_hits / game_plies if game_plies else 0.0,
                "first_truth_lost_at_ply": game_first_truth_lost,
                "wall_seconds": round(wall, 1),
            })
            print(
                f"  g{i:04d} winner={result.winner or 'none':<5} plies={result.plies:>3} "
                f"truth-hit={game_truth_hits}/{game_plies} ({(game_truth_hits/game_plies*100 if game_plies else 0):>5.1f}%) "
                f"wall={wall:>5.1f}s"
            )

    wall_total = time.time() - t_start
    summary = {
        "games": args.games,
        "wall_seconds": round(wall_total, 1),
        "tracked_plies": n_total_plies,
        "truth_hit_count": n_truth_in_belief,
        "truth_hit_rate_overall": (
            n_truth_in_belief / n_total_plies if n_total_plies else 0.0
        ),
        "csp_reseed_fires_total": csp_fires,
        "jitter_fires_total": jitter_fires,
        "per_game": games_summary,
    }
    summary_path.write_text(json.dumps(summary, indent=2))

    print()
    print(f"=== Belief diagnostics summary ===")
    print(f"  games: {args.games}, wall: {wall_total:.0f}s")
    print(f"  tracked plies: {n_total_plies}")
    print(f"  truth-in-belief rate: {summary['truth_hit_rate_overall']*100:.1f}%")
    print(f"  CSP reseed fires: {csp_fires}")
    print(f"  Jitter fires: {jitter_fires}")
    print(f"  → belief.jsonl + summary.json at {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
