"""Compute the ladder from one or more tournament results.jsonl files."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

from fow_chess.tournament import canonical_hash, load_config
from fow_chess.tournament.elo import compute_ladder, render_ladder_markdown


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--anchor-config", required=True, type=Path)
    parser.add_argument(
        "results",
        nargs="+",
        type=Path,
        help="one or more results.jsonl files",
    )
    args = parser.parse_args()

    anchor = load_config(args.anchor_config)
    ladder = compute_ladder(
        args.results,
        anchor_hash=canonical_hash(anchor),
        anchor_name=anchor.name,
    )
    print(render_ladder_markdown(ladder))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
