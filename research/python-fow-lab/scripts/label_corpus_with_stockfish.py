"""Generate Stockfish-eval labels for a self-play corpus.

The value-net training that ships uses outcome labels (±1 / 0 from the
mover's POV at the end of the game). That label is noisy at the
per-position level: a hanging-queen position in a game that drew gets
labeled "0" because the game drew, even though the position is -8.

Stockfish at depth 8 gives a per-position centipawn evaluation — what
the canonical strongest chess engine thinks of THIS position right
now, independent of whatever happened afterward. Per-position labels
that are roughly ground truth.

Pipeline:
  - Load corpus.jsonl rows: { fen_before, mover, outcome, ... }.
  - Dedupe by (fen, mover) — corpus rows share fens within games.
  - Run Stockfish at the requested depth on each unique fen.
  - Cap cp at ±2000 to bound the signal (mate-in-N folds into ±10000).
  - Write corpus-sf.jsonl with each row including sf_cp.

Notes:
  - SF doesn't know about Fog of War — it sees the canonical board and
    evaluates as if both sides had full info. That's correct for the
    value head we're training: V(state) = "how good is THIS position
    in the long run", which is exactly what SF estimates.
  - The mover field in the corpus matches whose turn it is in the FEN.
    SF scores from side-to-move POV, which IS the mover. So sf_cp is
    directly comparable to outcome (both from mover's POV).

Usage:
    .venv/bin/python3 scripts/label_corpus_with_stockfish.py \\
        --corpus lab/corpora/c-prod-railway-v1/corpus.jsonl \\
        --out lab/corpora/c-prod-railway-v1/corpus-sf.jsonl \\
        --depth 8 --movetime-ms 200
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

from fow_chess.evaluator import _UCIEngine


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--corpus", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--depth", type=int, default=8)
    ap.add_argument("--movetime-ms", type=int, default=200)
    ap.add_argument("--cp-clip", type=float, default=2000.0,
                    help="cap |cp| at this value (defaults to ±2000 = ±20 pawns).")
    ap.add_argument("--threads", type=int, default=1)
    args = ap.parse_args()

    corpus_path = args.corpus if args.corpus.is_absolute() else (_LAB_ROOT / args.corpus)
    out_path = args.out if args.out.is_absolute() else (_LAB_ROOT / args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"loading {corpus_path}")
    rows = [json.loads(l) for l in corpus_path.open()]
    print(f"  {len(rows)} positions")

    unique_fens = {r["fen_before"] for r in rows}
    print(f"  {len(unique_fens)} unique fens")

    engine = _UCIEngine(path="stockfish", threads=args.threads)
    cache: dict[str, float] = {}
    t0 = time.time()
    n_done = 0
    n_timeout = 0
    n_crash = 0
    last_print = 0.0
    try:
        for fen in unique_fens:
            # FoW-edge fens occasionally crash Stockfish; restart and skip.
            cp = None
            for attempt in range(2):
                engine._ensure_alive()
                try:
                    cp = engine.evaluate_fen(
                        fen, depth=args.depth, movetime_ms=args.movetime_ms
                    )
                    break
                except (BrokenPipeError, OSError):
                    n_crash += 1
                    engine._ensure_alive()
                    cp = None
            if cp is None:
                n_timeout += 1
                cp = 0.0  # neutral fallback
            cp_clipped = max(-args.cp_clip, min(args.cp_clip, cp))
            cache[fen] = cp_clipped
            n_done += 1
            now = time.time()
            if now - last_print > 5:
                pct = 100 * n_done / len(unique_fens)
                rate = n_done / max(now - t0, 0.1)
                eta = (len(unique_fens) - n_done) / max(rate, 0.1)
                print(f"  {n_done}/{len(unique_fens)} ({pct:.1f}%) "
                      f"rate={rate:.1f}/s eta={eta:.0f}s "
                      f"timeouts={n_timeout} crashes={n_crash}")
                last_print = now
    finally:
        engine.close()

    wall = time.time() - t0
    print(f"labeled {len(cache)} fens in {wall:.0f}s ({len(cache)/wall:.1f}/s)")
    if n_timeout:
        print(f"  {n_timeout} timeouts (treated as cp=0 — review if many)")

    # Write augmented corpus
    n_written = 0
    with out_path.open("w") as fout:
        for r in rows:
            sf_cp = cache.get(r["fen_before"])
            r["sf_cp"] = sf_cp
            fout.write(json.dumps(r) + "\n")
            n_written += 1
    print(f"wrote {n_written} rows → {out_path}")

    # Quick sanity stats
    import statistics
    cps = list(cache.values())
    print(f"  cp distribution: mean={statistics.mean(cps):.1f} "
          f"stdev={statistics.stdev(cps):.1f} "
          f"min={min(cps):.0f} max={max(cps):.0f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
