"""Pin the current engine source as a named version snapshot.

Freezes the 8 play_signature-determining source files into
`engine_versions/<name>@<sig>/`, alongside a `manifest.json` capturing the
play_signature, git head, and timestamp. Once pinned, the snapshot is
immutable and can be loaded by `versioned_loader.load_versioned_engine`
to play tournament games against current code.

Usage:
    .venv/bin/python scripts/pin_engine_version.py <name> [--notes "..."]

The pinned directory is named `<name>@<short_sig>` for at-a-glance identification.
Examples:
    v1-baseline@777dee603a9b
    v2-queen-stageA@f343d96bdd37

Refuses to overwrite an existing pin — if you need to re-pin under the same
name, delete the directory manually first (intentional friction; pins are
meant to be immutable).
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

_LAB_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_LAB_ROOT / "src"))

from fow_chess.tournament.play_signature import (
    _LAB_SRC,
    _PLAY_FILES,
    compute_play_signature,
    per_file_signatures,
    stockfish_version_line,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "name",
        help="Human-readable version label (e.g., 'v1-baseline'). The pin "
        "directory will be named '<name>@<short_play_signature>'.",
    )
    parser.add_argument(
        "--notes",
        default="",
        help="Free-text notes about what this version represents.",
    )
    parser.add_argument(
        "--stockfish",
        default="stockfish",
        help="Path to Stockfish (used only to capture the version line in the manifest).",
    )
    args = parser.parse_args()

    play_sig = compute_play_signature(args.stockfish)
    pin_dirname = f"{args.name}@{play_sig}"
    pin_dir = _LAB_ROOT / "engine_versions" / pin_dirname

    if pin_dir.exists():
        print(
            f"ERROR: pin already exists at {pin_dir}",
            file=sys.stderr,
        )
        print(
            "Pins are immutable. Delete the directory manually if you "
            "intentionally want to re-pin.",
            file=sys.stderr,
        )
        return 1

    pin_dir.mkdir(parents=True)

    # Copy the 8 source files
    for fname in _PLAY_FILES:
        src = _LAB_SRC / fname
        dst = pin_dir / fname
        shutil.copy2(src, dst)

    # Capture git head + dirty-state for documentation
    try:
        git_head = (
            subprocess.check_output(
                ["git", "rev-parse", "HEAD"],
                cwd=_LAB_ROOT,
                stderr=subprocess.DEVNULL,
                timeout=5,
            )
            .decode()
            .strip()
        )
    except Exception:  # noqa: BLE001
        git_head = "unknown"
    try:
        git_dirty = bool(
            subprocess.check_output(
                ["git", "status", "--porcelain", "src/fow_chess"],
                cwd=_LAB_ROOT,
                timeout=5,
            ).strip()
        )
    except Exception:  # noqa: BLE001
        git_dirty = None

    from datetime import datetime, timezone

    manifest = {
        "name": args.name,
        "play_signature": play_sig,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "git_head": git_head,
        "git_dirty_in_src": git_dirty,
        "stockfish_version_line": stockfish_version_line(args.stockfish),
        "files_in_play_signature": list(_PLAY_FILES),
        "per_file_signatures": per_file_signatures(),
        "notes": args.notes,
    }
    manifest_path = pin_dir / "manifest.json"
    with manifest_path.open("w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")

    print(f"pinned: {pin_dirname}")
    print(f"  path:           {pin_dir.relative_to(_LAB_ROOT)}")
    print(f"  play_signature: {play_sig}")
    print(f"  files copied:   {len(_PLAY_FILES)}")
    print(f"  manifest:       {manifest_path.relative_to(_LAB_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
