"""Deep dive: one Phase 2b position run to 200 iterations with strategy
checkpoints every 10 iters.

Question being tested: does Phase 2b's mixed strategy (mean argmax_prob
0.394 across 38 positions) sharpen toward 1.0 with more iterations
(meaning the original 50-iter smoke was under-converged), or does it
stay diffuse (meaning the mixing is intentional equilibrium behavior
that CFR-family algorithms produce and chess-family ones cannot)?

Run:
    PYTHONPATH=src .venv/bin/python lab/diag/cfr_phase2b_deep_dive.py [annotation_id_prefix]

Default target: `9ad0b093` (the lowest argmax_prob position from Gate 2b
smoke, argmax_prob 0.043 on 47 legal moves).
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import chess
import torch

from fow_chess.cfr.deep_cfr import solve_subgame_deep_cfr
from fow_chess.cfr.encoders import FowFactoredMarginalsEncoder
from fow_chess.cfr.leaf_eval import hybrid_fog_leaf_eval
from fow_chess.cfr.regret_net import FowRegretNet
from fow_chess.cfr.strategy_net import FowStrategyNet
from fow_chess.cfr.walker import SubgameNode, factored_marginals_from_truth


CFR_DEPTH = int(os.environ.get("CFR_DEPTH", "3"))
CFR_ITERATIONS = int(os.environ.get("CFR_ITERATIONS", "200"))
CFR_TRAJECTORIES = int(os.environ.get("CFR_TRAJECTORIES", "100"))
CFR_REGRET_EPOCHS = int(os.environ.get("CFR_REGRET_EPOCHS", "10"))
CFR_STRATEGY_EPOCHS = int(os.environ.get("CFR_STRATEGY_EPOCHS", "20"))
CFR_VALUE_SAMPLES = int(os.environ.get("CFR_VALUE_SAMPLES", "500"))
CHECKPOINT_INTERVAL = int(os.environ.get("CHECKPOINT_INTERVAL", "10"))
DEFAULT_ANNOTATION_ID_PREFIX = "9ad0b093"


# Reconstruction helper — duplicated from cfr_phase2b_smoke.py.
def _reconstruct_board_before(
    board_after: chess.Board,
    move: chess.Move,
    mover_color: chess.Color,
) -> chess.Board:
    moving_piece_after = board_after.piece_at(move.to_square)
    if moving_piece_after is None:
        raise RuntimeError("no piece at destination in board_after")
    if move.promotion is not None:
        original_piece = chess.Piece(chess.PAWN, moving_piece_after.color)
    else:
        original_piece = moving_piece_after
    opp_color = not original_piece.color
    capture_options: list[chess.Piece | None] = [None] + [
        chess.Piece(pt, opp_color)
        for pt in (chess.PAWN, chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN)
    ]
    candidates: list[tuple[chess.Board, chess.Piece | None]] = []
    for captured in capture_options:
        candidate = board_after.copy()
        candidate.remove_piece_at(move.to_square)
        candidate.set_piece_at(move.from_square, original_piece)
        if captured is not None:
            candidate.set_piece_at(move.to_square, captured)
        candidate.turn = mover_color
        if move not in candidate.pseudo_legal_moves:
            continue
        test = candidate.copy()
        test.push(move)
        if test.board_fen() == board_after.board_fen():
            candidates.append((candidate, captured))
    if not candidates:
        raise RuntimeError("could not reconstruct board_before")
    for cb, cap in candidates:
        if cap is None:
            return cb
    return candidates[0][0]


def _load_annotation(id_prefix: str) -> dict:
    path = Path(__file__).parents[2] / "feedback" / "annotations.jsonl"
    with path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            ann = json.loads(line)
            if ann["id"].startswith(id_prefix):
                return ann
    raise SystemExit(f"No annotation matching prefix {id_prefix!r}")


def main(argv: list[str]) -> int:
    id_prefix = argv[1] if len(argv) >= 2 else DEFAULT_ANNOTATION_ID_PREFIX
    ann = _load_annotation(id_prefix)
    print(f"Target: {ann['id'][:8]} ply {ann['ply']} {ann['move_played_color']} to move")
    print(f"Played: {ann['move_played_uci']}  Suggested: {ann['suggested_move_uci']}")

    mover = chess.WHITE if ann["move_played_color"] == "white" else chess.BLACK
    to_move_after = "b" if ann["move_played_color"] == "white" else "w"
    board_after = chess.Board(f"{ann['board_fen_after']} {to_move_after} - - 0 1")
    played = chess.Move.from_uci(ann["move_played_uci"])
    board_before = _reconstruct_board_before(board_after, played, mover)
    print(f"n_legal: {len(list(board_before.pseudo_legal_moves))}")

    marginals_white = factored_marginals_from_truth(board_before, chess.WHITE)
    marginals_black = factored_marginals_from_truth(board_before, chess.BLACK)
    root = SubgameNode.root(
        board_before,
        to_move=mover,
        marginals_white=marginals_white,
        marginals_black=marginals_black,
    )
    encoder = FowFactoredMarginalsEncoder()

    def regret_factory():
        return FowRegretNet(
            feature_dim=encoder.feature_dim, num_actions=encoder.num_actions
        )

    def strategy_factory():
        return FowStrategyNet(
            feature_dim=encoder.feature_dim, num_actions=encoder.num_actions
        )

    torch.set_num_threads(1)

    print(
        f"Settings: depth={CFR_DEPTH} iters={CFR_ITERATIONS} traj={CFR_TRAJECTORIES} "
        f"checkpoint_interval={CHECKPOINT_INTERVAL}"
    )
    t0 = time.monotonic()
    sol = solve_subgame_deep_cfr(
        root,
        encoder,
        regret_factory,
        avg_strategy_net_factory=strategy_factory,
        depth=CFR_DEPTH,
        leaf_eval=hybrid_fog_leaf_eval,
        iterations=CFR_ITERATIONS,
        trajectories_per_iter=CFR_TRAJECTORIES,
        regret_train_epochs=CFR_REGRET_EPOCHS,
        avg_strategy_train_epochs=CFR_STRATEGY_EPOCHS,
        value_estimate_samples=CFR_VALUE_SAMPLES,
        checkpoint_interval=CHECKPOINT_INTERVAL,
    )
    wall = time.monotonic() - t0

    out_path = (
        Path(__file__).parent
        / f"cfr-phase2b-deep-dive-{ann['id'][:8]}-results.json"
    )

    final_strategy = {mv.uci(): p for mv, p in sol.strategy_at_root.items()}
    top5_final = sorted(final_strategy.items(), key=lambda kv: -kv[1])[:5]

    print()
    print(f"Wall: {wall:.1f}s")
    print("Checkpoint trajectory (iteration | argmax_prob | entropy | n_samples):")
    for cp in sol.checkpoints:
        print(
            f"  it={cp['iteration']:3d} | argmax={cp['argmax_prob']:.3f} | "
            f"H={cp['entropy']:.3f} | n_samples={cp['n_strategy_samples']:6d}"
        )
    print()
    print(f"Final argmax: {max(final_strategy.items(), key=lambda kv: kv[1])}")
    print(f"Final entropy: {sol.checkpoints[-1]['entropy'] if sol.checkpoints else '?'}")
    print(f"Final top 5:")
    for uci, p in top5_final:
        tag = ""
        if uci == ann["suggested_move_uci"]:
            tag = " ← suggested"
        elif uci == ann["move_played_uci"]:
            tag = " ← played"
        print(f"  {uci}: {p:.4f}{tag}")

    payload = {
        "annotation_id": ann["id"],
        "ply": ann["ply"],
        "mover": ann["move_played_color"],
        "played": ann["move_played_uci"],
        "suggested": ann["suggested_move_uci"],
        "n_legal": len(list(board_before.pseudo_legal_moves)),
        "settings": {
            "depth": CFR_DEPTH,
            "iterations": CFR_ITERATIONS,
            "trajectories_per_iter": CFR_TRAJECTORIES,
            "regret_train_epochs": CFR_REGRET_EPOCHS,
            "avg_strategy_train_epochs": CFR_STRATEGY_EPOCHS,
            "value_samples": CFR_VALUE_SAMPLES,
            "checkpoint_interval": CHECKPOINT_INTERVAL,
        },
        "wall_seconds": wall,
        "checkpoints": sol.checkpoints,
        "final_strategy": final_strategy,
        "final_value_at_root": sol.value_at_root,
    }
    out_path.write_text(json.dumps(payload, indent=2))
    print()
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
