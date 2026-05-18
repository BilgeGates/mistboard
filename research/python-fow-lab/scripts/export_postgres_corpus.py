"""Export a Postgres-stored lab corpus to local JSONL files.

Reads lab_games rows for the given corpus_id and writes:
  <out>/corpus.jsonl    — flattened positions (one per line; train_policy_net format)
  <out>/games.jsonl     — per-game sidecar (events, plies, winner, ...)
  <out>/manifest.json   — lineage and metrics

The Postgres schema groups one row per game; this script flattens
data["positions"] into the per-position record format used by the
existing trainer.

Usage:
    DATABASE_URL=... .venv/bin/python3 scripts/export_postgres_corpus.py \\
        --corpus-id c-prod-railway-v0 \\
        --out lab/corpora/c-prod-railway-v0
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

from fow_chess.lab import manifest as mf
from fow_chess.lab.postgres_store import LabCorpusStore


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--corpus-id", required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--dsn", default=None, help="overrides DATABASE_URL")
    args = ap.parse_args()

    out: Path = args.out if args.out.is_absolute() else (_LAB_ROOT / args.out)
    if out.exists():
        print(f"out dir {out} already exists; refusing to overwrite", file=sys.stderr)
        return 1
    out.mkdir(parents=True)
    corpus_path = out / "corpus.jsonl"
    games_path = out / "games.jsonl"

    n_positions = 0
    n_games = 0
    winners: dict[str, int] = {"white": 0, "black": 0, "none": 0}

    dsn = args.dsn or os.environ.get("DATABASE_URL")
    if not dsn:
        print("DATABASE_URL not set (or pass --dsn)", file=sys.stderr)
        return 1

    with LabCorpusStore(corpus_id=args.corpus_id, dsn=dsn) as store, \
         corpus_path.open("w", encoding="utf-8") as fc, \
         games_path.open("w", encoding="utf-8") as fg:
        for data in store.iter_games():
            winners[data.get("winner") or "none"] = winners.get(data.get("winner") or "none", 0) + 1
            fg.write(json.dumps({
                "schema_version": data.get("schema_version", 2),
                "game": data["game"],
                "game_id": data.get("game_id"),
                "winner": data.get("winner"),
                "end_reason": data.get("end_reason"),
                "plies": data.get("plies"),
                "seed_white": data.get("seed_white"),
                "seed_black": data.get("seed_black"),
                "events": data.get("events", []),
            }) + "\n")
            for pos in data.get("positions", []):
                fc.write(json.dumps(pos) + "\n")
                n_positions += 1
            n_games += 1

    manifest = mf.build(
        type="corpus",
        id=out.name,
        spec={
            "type": "export-postgres-corpus",
            "source": "postgres lab_games",
            "corpus_id": args.corpus_id,
            "label_mode": "policy",
        },
        inputs={"postgres_corpus_id": args.corpus_id},
        outputs={"corpus": "corpus.jsonl", "games": "games.jsonl"},
        metrics={
            "n_positions": n_positions,
            "n_games": n_games,
            "winners": winners,
        },
        lineage=[],
        notes=f"Flattened from Postgres lab_games where corpus_id='{args.corpus_id}'.",
    )
    mf.write(mf.manifest_path(out), manifest)
    print(f"{n_positions} positions over {n_games} games → {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
