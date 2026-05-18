"""Fit a linear piece-square-table evaluator from a distillation corpus.

Features (768): 6 piece types × 64 squares × 2 (own / opp). Each position
is encoded relative to the perspective-of-the-mover, then a closed-form
least-squares fit predicts the eventual game outcome (-1 / +1).

The fitted weights are saved as a single npz file with arrays:
  w_own[6, 64]   — own-piece coefficients (centipawns)
  w_opp[6, 64]   — opp-piece coefficients
  bias           — scalar offset

Outcome ∈ {-1, +1} is rescaled by 1000 during fit so weights land in
the centipawn scale the engine expects.

Usage:
    .venv/bin/python3 scripts/train_psqt.py --corpus distill/v0/corpus.jsonl \\
        --out distill/v0/psqt.npz
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import chess
import numpy as np

_LAB_ROOT = Path(__file__).resolve().parent.parent

_PIECE_INDEX = {
    chess.PAWN: 0,
    chess.KNIGHT: 1,
    chess.BISHOP: 2,
    chess.ROOK: 3,
    chess.QUEEN: 4,
    chess.KING: 5,
}


def encode_position(board: chess.Board, perspective: chess.Color) -> np.ndarray:
    """Return a flat 768-d feature vector: [own(6×64) | opp(6×64)]."""
    feat = np.zeros(768, dtype=np.float32)
    for sq, piece in board.piece_map().items():
        pi = _PIECE_INDEX[piece.piece_type]
        if piece.color == perspective:
            feat[pi * 64 + sq] = 1.0
        else:
            feat[384 + pi * 64 + sq] = 1.0
    return feat


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--corpus", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--scale", type=float, default=1000.0,
                    help="Rescale {-1,+1} labels by this so weights are in centipawn units.")
    ap.add_argument("--ridge", type=float, default=1.0,
                    help="L2 regularization strength.")
    ap.add_argument("--val-frac", type=float, default=0.1)
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args()

    corpus_path = args.corpus if args.corpus.is_absolute() else (_LAB_ROOT / args.corpus)
    out_path = args.out if args.out.is_absolute() else (_LAB_ROOT / args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"loading {corpus_path}")
    rows = []
    with corpus_path.open("r") as f:
        for line in f:
            rec = json.loads(line)
            rows.append(rec)
    print(f"  {len(rows)} positions")

    # Encode all
    X = np.zeros((len(rows), 768), dtype=np.float32)
    y = np.zeros(len(rows), dtype=np.float32)
    for i, rec in enumerate(rows):
        b = chess.Board(rec["fen"])
        persp = chess.WHITE if rec["perspective"] == "white" else chess.BLACK
        X[i] = encode_position(b, persp)
        y[i] = rec["label"] * args.scale

    # Train/val split
    rng = np.random.default_rng(args.seed)
    idx = rng.permutation(len(rows))
    n_val = int(args.val_frac * len(rows))
    val_idx, train_idx = idx[:n_val], idx[n_val:]
    X_tr, y_tr = X[train_idx], y[train_idx]
    X_va, y_va = X[val_idx], y[val_idx]

    # Ridge regression with explicit bias.
    # Augment X with a constant column for the bias.
    X_tr_aug = np.hstack([X_tr, np.ones((len(X_tr), 1), dtype=np.float32)])
    X_va_aug = np.hstack([X_va, np.ones((len(X_va), 1), dtype=np.float32)])

    # (XᵀX + λI) w = Xᵀ y    (don't regularize bias)
    XtX = X_tr_aug.T @ X_tr_aug
    reg = np.eye(769, dtype=np.float32) * args.ridge
    reg[-1, -1] = 0.0
    Xty = X_tr_aug.T @ y_tr
    w_full = np.linalg.solve(XtX + reg, Xty)
    w, bias = w_full[:768], float(w_full[768])

    pred_tr = X_tr_aug @ w_full
    pred_va = X_va_aug @ w_full
    rmse_tr = float(np.sqrt(np.mean((pred_tr - y_tr) ** 2)))
    rmse_va = float(np.sqrt(np.mean((pred_va - y_va) ** 2)))
    # Sign-agreement: does the eval predict the correct side?
    agree_va = float(np.mean(np.sign(pred_va) == np.sign(y_va)))
    print(f"  RMSE train: {rmse_tr:.1f}    RMSE val: {rmse_va:.1f}")
    print(f"  val sign-agreement: {agree_va:.1%}   "
          f"(50% = random, 100% = perfect)")

    w_own = w[:384].reshape(6, 64)
    w_opp = w[384:].reshape(6, 64)

    np.savez(out_path, w_own=w_own, w_opp=w_opp, bias=np.float32(bias))
    print(f"saved → {out_path}")
    print(f"  shape w_own={w_own.shape} w_opp={w_opp.shape} bias={bias:.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
