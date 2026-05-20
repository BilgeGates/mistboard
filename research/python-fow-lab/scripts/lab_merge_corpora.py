"""Merge multiple corpora into a single training corpus with provenance.

Stockfish/Leela accumulate training data across runs — the same lever, applied
locally. Concatenates the .jsonl files, writes a manifest naming the parents.

Usage:
    .venv/bin/python3 scripts/lab_merge_corpora.py \\
        --inputs c2 c3 c5 --out c6_merged
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

_LAB_ROOT_REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT_REPO / "src"))

from fow_chess.lab import manifest as mf
from fow_chess.lab.store import lab_root


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--inputs", nargs="+", required=True,
                    help="Corpus ids under lab/corpora/, e.g. c2 c3 c5")
    ap.add_argument("--out", required=True, help="Output corpus id, e.g. c6_merged")
    ap.add_argument("--notes", default="")
    args = ap.parse_args()

    lab = lab_root()
    dst_dir = lab / "corpora" / args.out
    if dst_dir.exists():
        print(f"corpus {args.out} already exists; refusing to overwrite", file=sys.stderr)
        return 1
    dst_dir.mkdir(parents=True)
    dst_corpus = dst_dir / "corpus.jsonl"

    src_paths = [lab / "corpora" / cid / "corpus.jsonl" for cid in args.inputs]
    for p in src_paths:
        if not p.exists():
            print(f"source missing: {p}", file=sys.stderr)
            return 1

    total = 0
    per_corpus_counts: dict[str, int] = {}
    with dst_corpus.open("w", encoding="utf-8") as out:
        for cid, src in zip(args.inputs, src_paths):
            n = 0
            with src.open("r", encoding="utf-8") as f:
                for line in f:
                    out.write(line)
                    n += 1
            per_corpus_counts[cid] = n
            total += n
            print(f"  + {cid}: {n} positions")

    manifest = mf.build(
        type="corpus",
        id=args.out,
        spec={
            "type": "merge-corpora",
            "inputs": args.inputs,
        },
        inputs={f"corpus_{cid}": f"corpora/{cid}" for cid in args.inputs},
        outputs={"corpus": "corpus.jsonl"},
        metrics={
            "n_positions": total,
            "per_corpus_counts": per_corpus_counts,
        },
        lineage=args.inputs,
        notes=args.notes,
    )
    mf.write(mf.manifest_path(dst_dir), manifest)
    print(f"✓ corpus {args.out}: {total} positions → {dst_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
