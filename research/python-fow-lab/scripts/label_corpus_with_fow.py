"""Label a self-play corpus with fow_evaluator's own opinion of each position.

Distillation target: train a value net to MIMIC the hand-tuned fow_evaluator.
The SF-labeling experiment failed because SF labels carry no FoW-specific
knowledge — the learned net traded fow's hand-coded FoW intuition for SF's
better tactical resolution, and the trade was a wash or worse in PIMC.

This labeling uses fow_evaluator(fen_before, actual_move_played, mover_perspective)
as the label — i.e., the score the hand-tuned evaluator assigned to the
move actually played at this position. By construction, a net trained on
these labels mimics fow's FoW worldview. PIMC + distilled-net should be at
parity with PIMC + fow_evaluator (the load-bearing test).

Once parity holds, the path is: identify positions where SF disagrees
with fow, label those specifically with SF eval, train a hybrid. The
learned net then ADDS tactical knowledge on top of FoW intuition rather
than replacing it.

Usage:
    .venv/bin/python3 scripts/label_corpus_with_fow.py \\
        --corpus lab/corpora/c-prod-railway-v1/corpus.jsonl \\
        --out lab/corpora/c-prod-railway-v1/corpus-fow.jsonl
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

from fow_chess.evaluator import fow_evaluator

_PROMO = {"queen": "q", "rook": "r", "bishop": "b", "knight": "n"}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--corpus", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--cp-clip", type=float, default=2000.0,
                    help="cap |fow_cp| at this value (avoids king-capture sentinels saturating).")
    args = ap.parse_args()

    corpus_path = args.corpus if args.corpus.is_absolute() else (_LAB_ROOT / args.corpus)
    out_path = args.out if args.out.is_absolute() else (_LAB_ROOT / args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"loading {corpus_path}")
    rows = [json.loads(l) for l in corpus_path.open()]
    print(f"  {len(rows)} positions")

    fow = fow_evaluator()
    t0 = time.time()
    n_written = 0
    n_skipped = 0
    fow_cps = []
    with out_path.open("w") as fout:
        for r in rows:
            board = chess.Board(r["fen_before"])
            mover = chess.WHITE if r["mover"] == "white" else chess.BLACK
            # fen_before's side_to_move must equal mover (otherwise the row is malformed)
            if board.turn != mover:
                n_skipped += 1
                continue
            try:
                move = chess.Move.from_uci(r["move_uci"])
            except ValueError:
                n_skipped += 1
                continue
            if not board.is_pseudo_legal(move):
                n_skipped += 1
                continue
            score = fow(board, move, mover)
            score_clipped = max(-args.cp_clip, min(args.cp_clip, score))
            r["fow_cp"] = score_clipped
            fow_cps.append(score_clipped)
            fout.write(json.dumps(r) + "\n")
            n_written += 1

    wall = time.time() - t0
    print(f"labeled {n_written} rows ({n_skipped} skipped) in {wall:.1f}s ({n_written/wall:.0f}/s)")

    import statistics
    if fow_cps:
        print(f"  fow_cp distribution: mean={statistics.mean(fow_cps):.1f} "
              f"stdev={statistics.stdev(fow_cps):.1f} "
              f"min={min(fow_cps):.0f} max={max(fow_cps):.0f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
