"""Train a value net from Stockfish-eval labels (NNUE-style label source).

The classic Pillar 2 v1 script (train_value_net.py) used GAME OUTCOMES as
labels (+1/-1/0 from mover's POV). On a small corpus that signal collapses
to "everything is a draw" because most games are draws. SF-eval labels are
per-position centipawn estimates — independent of how the game ended — so
each position carries its own training signal regardless of whether the
game it came from was decisive.

Architecture matches train_value_net.py (768→256→256→1 tanh head) so the
runtime evaluator (value_net_evaluator) loads either kind of weights.
Only the loss/labels differ.

Label scaling: sf_cp is in centipawns (clipped to ±2000 by the labeling
script). Map to tanh-friendly target via tanh(cp / k) with k=500 so the
net's natural output range [-1, +1] is well-utilized: ±200cp ≈ ±0.38,
±500cp ≈ ±0.76, ±1500cp ≈ ±0.99.

Usage:
    .venv/bin/python3 scripts/train_value_net_sf.py \\
        --corpus lab/corpora/c-prod-railway-v1/corpus-sf.jsonl \\
        --out lab/nets/value/railway-v1-sf/weights.pt
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

import chess
import numpy as np
import torch
import torch.nn as nn

_LAB_ROOT = Path(__file__).resolve().parent.parent

_PIECE_INDEX = {
    chess.PAWN: 0, chess.KNIGHT: 1, chess.BISHOP: 2,
    chess.ROOK: 3, chess.QUEEN: 4, chess.KING: 5,
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


class ValueNet(nn.Module):
    def __init__(self, in_dim: int = 768, h: int = 256):
        super().__init__()
        self.fc1 = nn.Linear(in_dim, h)
        self.fc2 = nn.Linear(h, h)
        self.fc3 = nn.Linear(h, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = torch.relu(self.fc1(x))
        x = torch.relu(self.fc2(x))
        return torch.tanh(self.fc3(x))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--corpus", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--batch-size", type=int, default=128)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--weight-decay", type=float, default=1e-4)
    ap.add_argument("--val-frac", type=float, default=0.1)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--h", type=int, default=256)
    ap.add_argument("--label-scale-cp", type=float, default=500.0,
                    help="cp value where tanh saturates to ~0.76 (k in tanh(cp/k)).")
    ap.add_argument("--label-field", type=str, default="sf_cp",
                    help="JSONL field holding the centipawn label (sf_cp for SF, "
                         "fow_cp for fow_evaluator distillation).")
    args = ap.parse_args()

    corpus_path = args.corpus if args.corpus.is_absolute() else (_LAB_ROOT / args.corpus)
    out_path = args.out if args.out.is_absolute() else (_LAB_ROOT / args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)

    print(f"loading {corpus_path}")
    rows = [json.loads(l) for l in corpus_path.open() if json.loads(l).get(args.label_field) is not None]
    print(f"  {len(rows)} labeled positions (label field: {args.label_field})")

    X = np.zeros((len(rows), 768), dtype=np.float32)
    y = np.zeros((len(rows),), dtype=np.float32)
    for i, rec in enumerate(rows):
        b = chess.Board(rec["fen_before"])
        persp = chess.WHITE if rec["mover"] == "white" else chess.BLACK
        X[i] = encode_position(b, persp)
        # tanh-scale the centipawn label
        y[i] = math.tanh(rec[args.label_field] / args.label_scale_cp)

    print(f"  label range: min={y.min():.3f} max={y.max():.3f} mean={y.mean():.3f}")

    rng = np.random.default_rng(args.seed)
    idx = rng.permutation(len(rows))
    n_val = int(args.val_frac * len(rows))
    val_idx, train_idx = idx[:n_val], idx[n_val:]

    X_tr = torch.from_numpy(X[train_idx])
    y_tr = torch.from_numpy(y[train_idx]).unsqueeze(1)
    X_va = torch.from_numpy(X[val_idx])
    y_va = torch.from_numpy(y[val_idx]).unsqueeze(1)

    model = ValueNet(in_dim=768, h=args.h)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    loss_fn = nn.MSELoss()

    n_train = len(X_tr)
    best_val_loss = float("inf")
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
            out = model(xb)
            loss = loss_fn(out, yb)
            loss.backward()
            opt.step()
            epoch_loss += loss.item() * len(bi)
        train_loss = epoch_loss / n_train

        model.eval()
        with torch.no_grad():
            val_pred = model(X_va)
            val_loss = float(loss_fn(val_pred, y_va))
            sign_acc = float(((val_pred * y_va) > 0).float().mean())

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}

        if epoch % 10 == 0 or epoch == args.epochs - 1:
            print(f"  ep {epoch:>3}: train {train_loss:.4f}, val {val_loss:.4f}, sign_acc {sign_acc:.1%}")

    wall = time.time() - t0
    print(f"trained in {wall:.1f}s, best val: {best_val_loss:.4f}")

    torch.save({
        "state_dict": best_state,
        "arch": {"in_dim": 768, "h": args.h},
        "meta": {
            "corpus": str(corpus_path),
            "n_positions": len(rows),
            "best_val_loss": best_val_loss,
            "epochs": args.epochs,
            "kind": "value-sf",
            "label_scale_cp": args.label_scale_cp,
        },
    }, out_path)
    npz_path = out_path.with_suffix(".npz")
    np.savez(
        npz_path,
        **{k: v.detach().cpu().numpy() for k, v in best_state.items()},
    )
    print(f"saved → {out_path} (+ {npz_path.name} for torch-free serving)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
