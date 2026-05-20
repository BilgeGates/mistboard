"""Belief diagnostics v2 — measures the right things.

v1 only checked "exact-board-in-belief," which conflates "filter is broken"
with "256 samples is small vs the consistent space." This version measures
what the eval actually consumes: per-piece marginal accuracy.

Per ply per side:
  - exact_match              — is the true board in the particle cloud? (v1 metric)
  - n_hidden_opp_pieces      — pieces the perspective can't see directly
  - marginal_strict_mean     — for each hidden opp piece, weighted prob cloud places
                                that exact (type, color) at its true square. Averaged.
  - marginal_anyopp_mean     — same but for "any opp piece at that square"
  - weight_entropy           — Shannon entropy over particle weights (nats)
  - ess                      — effective sample size = (Σw)² / Σw²
  - csp_reseed_fired
  - jitter_fired

Aggregate metrics across games + plies. Run at multiple target_n values to
test sample-budget scaling.

Usage:
    .venv/bin/python3 scripts/belief_diagnostics_v2.py \\
        --games 5 --target-n 256 --out lab/diag/belief-v2-n256
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

import chess

_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

from contextlib import ExitStack, nullcontext

from fow_chess.engine import static_builder
from fow_chess.evaluator import fow_evaluator
from fow_chess.move_priors import (
    learned_policy_prior,
    stockfish_shallow_prior_ctx,
    uniform_prior,
)
from fow_chess.selfplay import play_game
from fow_chess.strategies import Tier1Strategy
from fow_chess.visibility import visible_squares


def _piece_sig(board: chess.Board) -> frozenset[tuple[int, int, bool]]:
    """Stable signature: set of (square, piece_type, color) tuples."""
    return frozenset((sq, p.piece_type, p.color) for sq, p in board.piece_map().items())


def _ess(weights: list[float]) -> float:
    s = sum(weights)
    if s <= 0:
        return 0.0
    return (s * s) / sum(w * w for w in weights)


def _shannon_entropy(weights: list[float]) -> float:
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


def _compute_marginals(
    canonical_board: chess.Board,
    perspective: chess.Color,
    particles: list[chess.Board],
    weights: list[float],
) -> dict:
    """Return marginal accuracy stats for the hidden opp pieces.

    For each opp piece on the canonical board that is NOT in the perspective's
    visible squares, compute:
      - marginal_strict[sq] = Σ wᵢ · 1[particleᵢ has (opp_color, true_type) at sq]
      - marginal_anyopp[sq] = Σ wᵢ · 1[particleᵢ has any opp piece at sq]
    Return per-piece values and the mean.
    """
    opp = not perspective
    visible = visible_squares(canonical_board, perspective)
    hidden_opp_pieces: list[tuple[int, int]] = []  # (sq, piece_type)
    for sq, p in canonical_board.piece_map().items():
        if p.color == opp and sq not in visible:
            hidden_opp_pieces.append((sq, p.piece_type))

    if not hidden_opp_pieces:
        return {
            "n_hidden_opp_pieces": 0,
            "marginal_strict_per_piece": [],
            "marginal_anyopp_per_piece": [],
            "marginal_strict_mean": None,
            "marginal_anyopp_mean": None,
        }

    total_w = sum(weights)
    if total_w <= 0:
        return {
            "n_hidden_opp_pieces": len(hidden_opp_pieces),
            "marginal_strict_per_piece": [0.0] * len(hidden_opp_pieces),
            "marginal_anyopp_per_piece": [0.0] * len(hidden_opp_pieces),
            "marginal_strict_mean": 0.0,
            "marginal_anyopp_mean": 0.0,
        }

    # Precompute each particle's piece map for fast lookup.
    particle_maps = [p.piece_map() for p in particles]

    strict_per_piece: list[float] = []
    anyopp_per_piece: list[float] = []
    for sq, true_type in hidden_opp_pieces:
        strict = 0.0
        anyopp = 0.0
        for pm, w in zip(particle_maps, weights):
            piece = pm.get(sq)
            if piece is None:
                continue
            if piece.color == opp:
                anyopp += w
                if piece.piece_type == true_type:
                    strict += w
        strict_per_piece.append(strict / total_w)
        anyopp_per_piece.append(anyopp / total_w)

    return {
        "n_hidden_opp_pieces": len(hidden_opp_pieces),
        "marginal_strict_per_piece": strict_per_piece,
        "marginal_anyopp_per_piece": anyopp_per_piece,
        "marginal_strict_mean": sum(strict_per_piece) / len(strict_per_piece),
        "marginal_anyopp_mean": sum(anyopp_per_piece) / len(anyopp_per_piece),
    }


class _CaptureStrategy:
    """Wrap Tier1Strategy, capture particles + weights per pick_move."""

    def __init__(self, inner: "Tier1Strategy") -> None:
        self._inner = inner
        self.per_move: list[dict] = []

    def __getattr__(self, name: str):
        return getattr(self._inner, name)

    def pick_move(self, view) -> "chess.Move":
        chosen = self._inner.pick_move(view)
        belief = self._inner._belief
        if belief is None:
            self.per_move.append(None)
        else:
            self.per_move.append({
                "particles": [p.copy() for p in belief.particles],
                "weights": list(belief.weights),
                "csp_reseed_fired": bool(belief.last_csp_reseed_fired),
                "jitter_fired": bool(belief.last_jitter_fired),
            })
        return chosen


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--games", type=int, default=5)
    ap.add_argument("--target-n", type=int, default=256)
    ap.add_argument("--max-particles", type=int, default=16)
    ap.add_argument("--max-plies", type=int, default=200)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument(
        "--prior",
        choices=("uniform", "stockfish_shallow", "learned"),
        default="uniform",
        help="Opponent move prior. uniform = uniform over legal moves; "
             "stockfish_shallow = depth-2 Stockfish softmax; "
             "learned = MLP policy net trained on production self-play (set --prior-weights).",
    )
    ap.add_argument("--prior-weights", type=Path, default=None,
                    help="For --prior learned: .pt weights path (relative to lab root or absolute).")
    ap.add_argument("--prior-temperature", type=float, default=1.0)
    ap.add_argument("--prior-depth", type=int, default=2)
    ap.add_argument("--prior-movetime-ms", type=int, default=50)
    ap.add_argument("--prior-top-k", type=int, default=8)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()

    out = args.out if args.out.is_absolute() else (_LAB_ROOT / args.out)
    out.mkdir(parents=True, exist_ok=True)
    belief_path = out / "belief.jsonl"
    summary_path = out / "summary.json"

    builder = static_builder(fow_evaluator())

    games_summary = []
    n_total_records = 0
    sum_strict = 0.0
    sum_anyopp = 0.0
    sum_ess = 0.0
    sum_exact = 0
    csp_fires = 0
    jitter_fires = 0
    t_start = time.time()

    _PROMO = {"queen": "q", "rook": "r", "bishop": "b", "knight": "n"}

    with ExitStack() as prior_stack, belief_path.open("w", encoding="utf-8", buffering=1) as bout:
        if args.prior == "stockfish_shallow":
            prior = prior_stack.enter_context(stockfish_shallow_prior_ctx(
                path="stockfish",
                depth=args.prior_depth,
                movetime_ms=args.prior_movetime_ms,
                top_k=args.prior_top_k,
                softmax_temperature_cp=100.0,
                uniform_blend=0.3,
            ))
            print(f"prior: stockfish_shallow (depth={args.prior_depth}, top_k={args.prior_top_k})")
        elif args.prior == "learned":
            if args.prior_weights is None:
                ap.error("--prior learned requires --prior-weights")
            wp = args.prior_weights
            if not wp.is_absolute():
                wp = _LAB_ROOT / wp
            prior = learned_policy_prior(str(wp), temperature=args.prior_temperature)
            print(f"prior: learned ({wp}, T={args.prior_temperature})")
        else:
            prior = uniform_prior
            print(f"prior: uniform")
        for i in range(args.games):
            seed_w = args.seed + i * 7919
            seed_b = args.seed + i * 7919 + 1

            white_inner = Tier1Strategy(
                evaluator_builder=builder, move_prior=prior,
                target_n=args.target_n, max_eval_particles=args.max_particles,
                seed=seed_w, mcts_rollouts=0,
                verbose_belief_capture=False,
            )
            black_inner = Tier1Strategy(
                evaluator_builder=builder, move_prior=prior,
                target_n=args.target_n, max_eval_particles=args.max_particles,
                seed=seed_b, mcts_rollouts=0,
                verbose_belief_capture=False,
            )
            white = _CaptureStrategy(white_inner)
            black = _CaptureStrategy(black_inner)

            t_g = time.time()
            result = play_game(
                white, black, max_plies=args.max_plies,
                room_id=f"belief-g{i:04d}", seed=seed_w,
            )
            wall = time.time() - t_g

            board = chess.Board()
            white_idx = 0
            black_idx = 0
            game_records = []

            for evt in result.events:
                if evt.get("type") != "move-played":
                    continue
                color = evt["color"]
                perspective = chess.WHITE if color == "white" else chess.BLACK
                strat = white if color == "white" else black
                idx = white_idx if color == "white" else black_idx

                if not evt.get("opening_random") and idx < len(strat.per_move):
                    snap = strat.per_move[idx]
                    if snap is not None and snap["particles"]:
                        # Compute metrics
                        truth_sig = _piece_sig(board)
                        particle_sigs = [_piece_sig(p) for p in snap["particles"]]
                        exact_match = truth_sig in set(particle_sigs)

                        ess = _ess(snap["weights"])
                        entropy = _shannon_entropy(snap["weights"])
                        margs = _compute_marginals(
                            board, perspective, snap["particles"], snap["weights"]
                        )

                        record = {
                            "game": i,
                            "ply": board.ply(),
                            "color": color,
                            "exact_match": exact_match,
                            "n_particles": len(snap["particles"]),
                            "n_unique": len(set(particle_sigs)),
                            "weight_entropy": entropy,
                            "ess": ess,
                            "n_hidden_opp_pieces": margs["n_hidden_opp_pieces"],
                            "marginal_strict_mean": margs["marginal_strict_mean"],
                            "marginal_anyopp_mean": margs["marginal_anyopp_mean"],
                            "csp_reseed_fired": snap["csp_reseed_fired"],
                            "jitter_fired": snap["jitter_fired"],
                        }
                        bout.write(json.dumps(record) + "\n")
                        game_records.append(record)
                        n_total_records += 1
                        sum_ess += ess
                        if exact_match:
                            sum_exact += 1
                        if margs["marginal_strict_mean"] is not None:
                            sum_strict += margs["marginal_strict_mean"]
                            sum_anyopp += margs["marginal_anyopp_mean"]
                        if snap["csp_reseed_fired"]:
                            csp_fires += 1
                        if snap["jitter_fired"]:
                            jitter_fires += 1

                if color == "white":
                    white_idx += 1
                else:
                    black_idx += 1

                m = evt["move"]
                promo = m.get("promotion")
                pl = _PROMO.get(promo, "") if promo else ""
                board.push(chess.Move.from_uci(f"{m['from']}{m['to']}{pl}"))

            # Per-game aggregates
            n = len(game_records)
            game_summary = {
                "game": i,
                "winner": result.winner,
                "plies": result.plies,
                "tracked": n,
                "exact_match_rate": sum(1 for r in game_records if r["exact_match"]) / n if n else 0.0,
                "marginal_strict_mean": sum(r["marginal_strict_mean"] for r in game_records if r["marginal_strict_mean"] is not None) / max(1, sum(1 for r in game_records if r["marginal_strict_mean"] is not None)),
                "marginal_anyopp_mean": sum(r["marginal_anyopp_mean"] for r in game_records if r["marginal_anyopp_mean"] is not None) / max(1, sum(1 for r in game_records if r["marginal_anyopp_mean"] is not None)),
                "mean_ess": sum(r["ess"] for r in game_records) / n if n else 0.0,
                "wall_seconds": round(wall, 1),
            }
            games_summary.append(game_summary)
            print(
                f"  g{i:04d} winner={result.winner or 'none':<5} plies={result.plies:>3} "
                f"exact={game_summary['exact_match_rate']*100:>5.1f}% "
                f"marg_strict={game_summary['marginal_strict_mean']*100:>5.1f}% "
                f"marg_anyopp={game_summary['marginal_anyopp_mean']*100:>5.1f}% "
                f"ess={game_summary['mean_ess']:>5.1f}/{args.target_n} "
                f"wall={wall:>5.1f}s"
            )

    wall_total = time.time() - t_start
    summary = {
        "games": args.games,
        "target_n": args.target_n,
        "wall_seconds": round(wall_total, 1),
        "tracked_records": n_total_records,
        "exact_match_rate": sum_exact / n_total_records if n_total_records else 0.0,
        "marginal_strict_mean": sum_strict / n_total_records if n_total_records else 0.0,
        "marginal_anyopp_mean": sum_anyopp / n_total_records if n_total_records else 0.0,
        "mean_ess": sum_ess / n_total_records if n_total_records else 0.0,
        "csp_reseed_fires": csp_fires,
        "jitter_fires": jitter_fires,
        "per_game": games_summary,
    }
    summary_path.write_text(json.dumps(summary, indent=2))

    print()
    print(f"=== Belief diagnostics v2 — target_n={args.target_n} ===")
    print(f"  games: {args.games}, wall: {wall_total:.0f}s, records: {n_total_records}")
    print(f"  Exact-match rate:           {summary['exact_match_rate']*100:.1f}%   (v1 metric — strict)")
    print(f"  Marginal STRICT mean:       {summary['marginal_strict_mean']*100:.1f}%   (avg P(piece type at sq) across hidden opp pieces)")
    print(f"  Marginal ANY-OPP mean:      {summary['marginal_anyopp_mean']*100:.1f}%   (avg P(any opp piece at sq))")
    print(f"  Mean ESS:                   {summary['mean_ess']:.1f} / {args.target_n}")
    print(f"  CSP fires:                  {csp_fires}")
    print(f"  Jitter fires:               {jitter_fires}")
    print(f"  → {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
