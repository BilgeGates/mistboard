"""Train a small MLP value evaluator from a distillation corpus.

Architecture: 768 → 256 → 64 → 1 (~205k params). Non-linear capacity that
PSQT lacks — should be able to absorb sharper teacher signals (e.g. q-values
from MCTS-PSQT-v2 self-play) where linear PSQT plateaued (Phase 1 v2 result).

Input features match PSQT exactly (768-d piece-square indicators, perspective-
relative), so the comparison is "same input encoding, more capacity."

The trained model is saved as a state_dict .pt file. The companion
mlp_evaluator() in fow_chess/evaluator.py loads it for use as an MCTS
leaf evaluator.

Usage:
    .venv/bin/python3 scripts/train_mlp.py --corpus distill/v2/corpus.jsonl \\
        --out distill/v2/mlp.pt
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import chess
import numpy as np
import torch
import torch.nn as nn

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
    feat = np.zeros(768, dtype=np.float32)
    for sq, piece in board.piece_map().items():
        pi = _PIECE_INDEX[piece.piece_type]
        if piece.color == perspective:
            feat[pi * 64 + sq] = 1.0
        else:
            feat[384 + pi * 64 + sq] = 1.0
    return feat


class MLP(nn.Module):
    def __init__(self, in_dim: int = 768, h1: int = 256, h2: int = 64):
        super().__init__()
        self.fc1 = nn.Linear(in_dim, h1)
        self.fc2 = nn.Linear(h1, h2)
        self.fc3 = nn.Linear(h2, 1)
        self.act = nn.ReLU()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.act(self.fc1(x))
        x = self.act(self.fc2(x))
        return self.fc3(x).squeeze(-1)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--corpus", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--epochs", type=int, default=80)
    ap.add_argument("--batch-size", type=int, default=128)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--weight-decay", type=float, default=1e-4)
    ap.add_argument("--val-frac", type=float, default=0.1)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--h1", type=int, default=256)
    ap.add_argument("--h2", type=int, default=64)
    args = ap.parse_args()

    corpus_path = args.corpus if args.corpus.is_absolute() else (_LAB_ROOT / args.corpus)
    out_path = args.out if args.out.is_absolute() else (_LAB_ROOT / args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)

    print(f"loading {corpus_path}")
    rows = []
    with corpus_path.open("r") as f:
        for line in f:
            rows.append(json.loads(line))
    print(f"  {len(rows)} positions")

    X = np.zeros((len(rows), 768), dtype=np.float32)
    y = np.zeros(len(rows), dtype=np.float32)
    for i, rec in enumerate(rows):
        b = chess.Board(rec["fen"])
        persp = chess.WHITE if rec["perspective"] == "white" else chess.BLACK
        X[i] = encode_position(b, persp)
        y[i] = rec["label"]

    rng = np.random.default_rng(args.seed)
    idx = rng.permutation(len(rows))
    n_val = int(args.val_frac * len(rows))
    val_idx, train_idx = idx[:n_val], idx[n_val:]

    X_tr = torch.from_numpy(X[train_idx])
    y_tr = torch.from_numpy(y[train_idx])
    X_va = torch.from_numpy(X[val_idx])
    y_va = torch.from_numpy(y[val_idx])

    model = MLP(in_dim=768, h1=args.h1, h2=args.h2)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    loss_fn = nn.MSELoss()

    n_train = len(X_tr)
    best_val_rmse = float("inf")
    best_state = None
    t0 = time.time()
    for epoch in range(args.epochs):
        model.train()
        perm = torch.randperm(n_train)
        epoch_loss = 0.0
        for s in range(0, n_train, args.batch_size):
            bi = perm[s:s + args.batch_size]
            xb, yb = X_tr[bi], y_tr[bi]
            opt.zero_grad()
            pred = model(xb)
            loss = loss_fn(pred, yb)
            loss.backward()
            opt.step()
            epoch_loss += loss.item() * len(bi)
        train_rmse = (epoch_loss / n_train) ** 0.5

        model.eval()
        with torch.no_grad():
            val_pred = model(X_va)
            val_rmse = float(torch.sqrt(loss_fn(val_pred, y_va)))
            sign_agree = float(torch.mean((torch.sign(val_pred) == torch.sign(y_va)).float()))

        if val_rmse < best_val_rmse:
            best_val_rmse = val_rmse
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}

        if epoch % 10 == 0 or epoch == args.epochs - 1:
            print(f"  ep {epoch:>3}: train RMSE {train_rmse:>6.1f}, val RMSE {val_rmse:>6.1f}, "
                  f"sign-agree {sign_agree:.1%}")

    wall = time.time() - t0
    print(f"trained in {wall:.1f}s, best val RMSE: {best_val_rmse:.1f}")

    torch.save({
        "state_dict": best_state,
        "arch": {"in_dim": 768, "h1": args.h1, "h2": args.h2},
        "meta": {
            "corpus": str(corpus_path),
            "n_positions": len(rows),
            "best_val_rmse": best_val_rmse,
            "epochs": args.epochs,
        },
    }, out_path)
    print(f"saved → {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
