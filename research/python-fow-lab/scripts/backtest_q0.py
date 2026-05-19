"""Back-test the v0.9.4-pre1 stopgap on q0 (game 21 from b-learned-v0-vs-uniform).

Replays the SAME deterministic game with the new Tier1Strategy and compares
the engine's choices at the q0 blunder plies (22, 94, 116, 170, 190) against
what the original engine played. A "fix" is a move that is NOT the original
blunder UCI.

Note: changing the strategy changes the game flow from the divergence point
onward, so we can only check the BLUNDER ply if the game reached the same
position there. We log:
  - At each blunder ply: original move vs new move (if game reached this ply)
  - Per-game: total plies, winner, end_reason

Compare new run against the existing replay-g0021 events at the matching
plies to spot fixes.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

import chess
from fow_chess.engine import static_builder
from fow_chess.evaluator import fow_evaluator
from fow_chess.move_priors import learned_policy_prior, uniform_prior
from fow_chess.selfplay import play_game
from fow_chess.strategies import Tier1Strategy


BLUNDER_PLIES = {
    22: ("d8g5", "queen-into-attackers"),
    94: ("f6b6", "queen-recapture-loses-queen"),
    116: ("a7b7", "rook-into-defended-loses-rook"),
    170: ("d7c5", "knight-blocks-onto-defended-pawn"),
    190: ("d7c8", "shuffle-when-ahead"),
}


def _make_prior(name: str, weights: str | None):
    if name == "uniform":
        return uniform_prior
    if name == "learned":
        return learned_policy_prior(weights, temperature=1.0)
    raise ValueError(name)


def _make_strategy(builder, prior, seed: int, stopgap_on: bool):
    if stopgap_on:
        # Calibrated values. First try at 100/200/0.10/0.12 made both engines
        # refuse all non-king moves; game died to 50-move rule. These leave
        # vetoes at production thresholds and add a soft nudge on top.
        return Tier1Strategy(
            evaluator_builder=builder, move_prior=prior,
            target_n=256, max_eval_particles=16, seed=seed,
            mcts_rollouts=0,
            capture_risk_penalty_coef=10.0,
            anti_shuffle_penalty=20.0,
            anti_shuffle_window=4,
            queen_fog_risk_threshold=0.20,
            piece_fog_risk_threshold=0.25,
        )
    # Recovers v0.9.3 production behavior (zero soft penalties, original thresholds)
    return Tier1Strategy(
        evaluator_builder=builder, move_prior=prior,
        target_n=256, max_eval_particles=16, seed=seed,
        mcts_rollouts=0,
        capture_risk_penalty_coef=0.0,
        anti_shuffle_penalty=0.0,
        queen_fog_risk_threshold=0.20,
        piece_fog_risk_threshold=0.25,
    )


def _move_uci(evt: dict) -> str:
    m = evt["move"]
    promo = {"queen": "q", "rook": "r", "bishop": "b", "knight": "n"}.get(m.get("promotion"), "")
    return f"{m['from']}{m['to']}{promo}"


def run_one(stopgap_on: bool, game_index: int = 21, base_seed: int = 12345, max_plies: int = 200):
    builder = static_builder(fow_evaluator())
    learned = _make_prior(
        "learned",
        str(_LAB_ROOT / "lab/nets/policy/railway-v0/weights.npz"),
    )
    color_swap = (game_index % 2) == 1  # True → challenger=black
    seed_c = base_seed + game_index * 7919
    seed_b = base_seed + game_index * 7919 + 1
    chall = _make_strategy(builder, learned, seed_c, stopgap_on)
    base = _make_strategy(builder, uniform_prior, seed_b, stopgap_on)
    if not color_swap:
        white, black = chall, base
    else:
        white, black = base, chall

    t0 = time.time()
    result = play_game(
        white, black,
        max_plies=max_plies,
        room_id=f"backtest-g{game_index:04d}-stopgap-{int(stopgap_on)}",
        seed=seed_c,
    )
    wall = time.time() - t0

    moves = [_move_uci(e) for e in result.events if e.get("type") == "move-played"]
    return {
        "stopgap_on": stopgap_on,
        "plies": result.plies,
        "winner": result.winner,
        "end_reason": result.end_reason,
        "wall_seconds": wall,
        "moves": moves,
    }


def compare(orig: dict, new: dict):
    print(f"\nORIGINAL (stopgap_on={orig['stopgap_on']}): {orig['plies']} plies, "
          f"winner={orig['winner']}, end={orig['end_reason']}, wall={orig['wall_seconds']:.0f}s")
    print(f"NEW      (stopgap_on={new['stopgap_on']}): {new['plies']} plies, "
          f"winner={new['winner']}, end={new['end_reason']}, wall={new['wall_seconds']:.0f}s")
    print()
    print(f"{'ply':>4} {'reason':<35} {'original':<8} {'new':<8} {'diverged_at':<11} {'verdict'}")
    print("-" * 90)
    diverge_at = None
    for i, (om, nm) in enumerate(zip(orig["moves"], new["moves"])):
        if om != nm:
            diverge_at = i + 1
            break
    print(f"first divergence at ply {diverge_at}")
    print()
    for ply, (blunder_uci, reason) in sorted(BLUNDER_PLIES.items()):
        orig_at = orig["moves"][ply - 1] if ply <= len(orig["moves"]) else None
        new_at = new["moves"][ply - 1] if ply <= len(new["moves"]) else None
        same_path = diverge_at is None or ply <= diverge_at
        if not same_path:
            verdict = "GAME DIVERGED"
        elif new_at != blunder_uci:
            verdict = "✅ FIXED"
        else:
            verdict = "❌ same blunder"
        print(f"{ply:>4} {reason:<35} {orig_at or '-':<8} {new_at or '-':<8} "
              f"{'yes' if not same_path else 'no':<11} {verdict}")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--game-index", type=int, default=21)
    args = ap.parse_args()

    print("Running ORIGINAL (stopgap off)...")
    orig = run_one(stopgap_on=False, game_index=args.game_index)
    print("Running NEW (stopgap on)...")
    new = run_one(stopgap_on=True, game_index=args.game_index)
    compare(orig, new)
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
