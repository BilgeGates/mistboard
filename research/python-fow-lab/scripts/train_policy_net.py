"""Train a small policy net from a production self-play corpus.

Input: 768-d piece-square indicator (perspective-relative — same encoding as PSQT).
Output: 4096 logits over (from_sq × to_sq) pairs. At inference, mask to legal
moves and softmax with temperature.

Architecture: 768 → 256 → 256 → 4096 (~1.5M params). Small enough to train
on CPU in minutes from a few thousand positions.

Loss: cross-entropy on the actual move played (one-hot at from*64+to).

Usage:
    .venv/bin/python3 scripts/train_policy_net.py \\
        --corpus lab/corpora/c-prod-v0/corpus.jsonl \\
        --out lab/nets/policy/v0/weights.pt
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


def move_target_index(move_uci: str) -> int:
    """from_sq * 64 + to_sq. Promotions: ignored at the target (treated as base move)."""
    m = chess.Move.from_uci(move_uci)
    return m.from_square * 64 + m.to_square


class PolicyNet(nn.Module):
    def __init__(self, in_dim: int = 768, h: int = 256):
        super().__init__()
        self.fc1 = nn.Linear(in_dim, h)
        self.fc2 = nn.Linear(h, h)
        self.fc3 = nn.Linear(h, 64 * 64)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = torch.relu(self.fc1(x))
        x = torch.relu(self.fc2(x))
        return self.fc3(x)


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
    y = np.zeros(len(rows), dtype=np.int64)
    for i, rec in enumerate(rows):
        b = chess.Board(rec["fen_before"])
        persp = chess.WHITE if rec["mover"] == "white" else chess.BLACK
        X[i] = encode_position(b, persp)
        y[i] = move_target_index(rec["move_uci"])

    rng = np.random.default_rng(args.seed)
    idx = rng.permutation(len(rows))
    n_val = int(args.val_frac * len(rows))
    val_idx, train_idx = idx[:n_val], idx[n_val:]

    X_tr = torch.from_numpy(X[train_idx])
    y_tr = torch.from_numpy(y[train_idx])
    X_va = torch.from_numpy(X[val_idx])
    y_va = torch.from_numpy(y[val_idx])

    model = PolicyNet(in_dim=768, h=args.h)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    loss_fn = nn.CrossEntropyLoss()

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
            logits = model(xb)
            loss = loss_fn(logits, yb)
            loss.backward()
            opt.step()
            epoch_loss += loss.item() * len(bi)
        train_loss = epoch_loss / n_train

        model.eval()
        with torch.no_grad():
            val_logits = model(X_va)
            val_loss = float(loss_fn(val_logits, y_va))
            # Top-1 accuracy
            top1 = float(torch.mean((torch.argmax(val_logits, dim=1) == y_va).float()))
            # Top-5 accuracy (ignoring legality)
            top5 = float(torch.mean((torch.topk(val_logits, 5, dim=1).indices == y_va.unsqueeze(1)).any(dim=1).float()))

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}

        if epoch % 10 == 0 or epoch == args.epochs - 1:
            print(f"  ep {epoch:>3}: train {train_loss:>5.3f}, val {val_loss:>5.3f}, top1 {top1:.1%}, top5 {top5:.1%}")

    wall = time.time() - t0
    print(f"trained in {wall:.1f}s, best val: {best_val_loss:.3f}")

    torch.save({
        "state_dict": best_state,
        "arch": {"in_dim": 768, "h": args.h},
        "meta": {
            "corpus": str(corpus_path),
            "n_positions": len(rows),
            "best_val_loss": best_val_loss,
            "epochs": args.epochs,
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
