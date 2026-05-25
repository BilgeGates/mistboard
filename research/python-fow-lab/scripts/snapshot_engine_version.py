"""Snapshot the current engine state as a versioned, archivable bundle.

Captures everything needed to LATER load and play this exact engine
version, so future versions can bake against frozen prior versions
without recompiling or git-checkout-ing.

What's snapshotted:
  - src/fow_chess/  — full Python source for v2 + dependencies
  - The built fow_rust .so file (platform-specific)
  - configs/  — Tier-1 / opponent configs the engine depends on
  - version.json — git SHA, timestamp, perf/result metadata, lineage

Naming: `lab/engine-versions/<name>-<date>/` (e.g., v2.0-2026-05-24).

To USE a snapshot in a later bakeoff:
  - The versioned bakeoff runner (planned; not yet built) spawns each
    side's per-game subprocess with PYTHONPATH pointing into the
    snapshot's src/ + a sys.path inject pointing at the snapshot's
    fow_rust .so.

Forward-compatibility:
  - Snapshots are immutable. Don't overwrite an existing snapshot dir.
  - The schema_version field lets future readers detect schema drift.
  - Extra fields (blind_spots_known, bakeoff_records) can be appended
    to version.json without breaking older readers.

Usage:
    PYTHONPATH=src .venv/bin/python scripts/snapshot_engine_version.py \\
        --name v2.0 \\
        --baseline-record "28W 0L 3D vs v0.9.5 (rung 4 ladder 2026-05-24)" \\
        --notes "Rust port complete (RP3-RP9), cap=5M default, KLUSS k=2 plumbed but not enabled"
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSIONS_ROOT = ROOT / "lab" / "engine-versions"


def _git_sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=ROOT.parent.parent,
            text=True,
        ).strip()
    except Exception:
        return "unknown"


def _git_branch() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=ROOT.parent.parent,
            text=True,
        ).strip()
    except Exception:
        return "unknown"


def _git_dirty() -> bool:
    try:
        out = subprocess.check_output(
            ["git", "status", "--porcelain"],
            cwd=ROOT.parent.parent,
            text=True,
        ).strip()
        return bool(out)
    except Exception:
        return True


def _locate_fow_rust_so() -> Path | None:
    candidates = list(ROOT.glob(".venv/lib/python*/site-packages/fow_rust/fow_rust*.so"))
    return candidates[0] if candidates else None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--name", required=True,
                    help="version name, e.g., v2.0 or v2.1-kluss")
    ap.add_argument("--baseline-record", default="",
                    help="W/L/D vs the v0.9.5 baseline (or another reference)")
    ap.add_argument("--predecessor-record", default="",
                    help="W/L/D vs the immediate prior version, if any")
    ap.add_argument("--blind-spots-known", action="append", default=[],
                    help="catalog of blind spots known at this version (repeatable)")
    ap.add_argument("--notes", default="",
                    help="free-form notes (max ~500 chars; longer goes in README.md)")
    ap.add_argument("--predecessor", default=None,
                    help="name of the immediate prior version, e.g., v2.0")
    ap.add_argument("--allow-dirty", action="store_true",
                    help="snapshot even if git working tree is dirty (NOT recommended)")
    args = ap.parse_args()

    if _git_dirty() and not args.allow_dirty:
        print("ERROR: git working tree has uncommitted changes. Commit first, "
              "or pass --allow-dirty (snapshot will note the dirty state).",
              file=sys.stderr)
        return 2

    timestamp = dt.datetime.now().strftime("%Y-%m-%d")
    dir_name = f"{args.name}-{timestamp}"
    out_dir = VERSIONS_ROOT / dir_name

    if out_dir.exists():
        print(f"ERROR: snapshot dir already exists: {out_dir}\n"
              f"Snapshots are immutable. Pick a different --name or delete the "
              f"existing dir manually if intentional.",
              file=sys.stderr)
        return 2

    out_dir.mkdir(parents=True, exist_ok=False)

    # 1. Source snapshot
    src_dst = out_dir / "src"
    shutil.copytree(ROOT / "src", src_dst, ignore=shutil.ignore_patterns(
        "__pycache__", "*.pyc", ".pytest_cache", "*.egg-info"
    ))

    # 2. Rust extension binary
    so_src = _locate_fow_rust_so()
    if so_src is None:
        print("ERROR: could not locate built fow_rust .so in .venv. "
              "Run `cd fow_rust && maturin develop --release` first.",
              file=sys.stderr)
        shutil.rmtree(out_dir)
        return 2
    rust_dst_dir = out_dir / "fow_rust"
    rust_dst_dir.mkdir()
    shutil.copy2(so_src, rust_dst_dir / so_src.name)
    # Also copy the package __init__.py + dist-info for completeness
    fow_rust_pkg = so_src.parent
    if (fow_rust_pkg / "__init__.py").exists():
        shutil.copy2(fow_rust_pkg / "__init__.py", rust_dst_dir / "__init__.py")

    # 3. Configs
    configs_src = ROOT / "configs"
    if configs_src.exists():
        shutil.copytree(configs_src, out_dir / "configs",
                        ignore=shutil.ignore_patterns("*.lock"))

    # 4. Version manifest
    manifest = {
        "schema_version": 1,
        "name": args.name,
        "dir_name": dir_name,
        "snapshotted_at": dt.datetime.now().isoformat(timespec="seconds"),
        "git_sha": _git_sha(),
        "git_branch": _git_branch(),
        "git_dirty": _git_dirty(),
        "platform": sys.platform,
        "python_version": sys.version.split()[0],
        "predecessor": args.predecessor,
        "baseline_record": args.baseline_record,
        "predecessor_record": args.predecessor_record,
        "blind_spots_known": args.blind_spots_known,
        "notes": args.notes,
        "fow_rust_so": str((rust_dst_dir / so_src.name).relative_to(out_dir)),
    }
    (out_dir / "version.json").write_text(json.dumps(manifest, indent=2))

    # 5. Human README
    readme = [
        f"# {args.name} ({timestamp})",
        "",
        f"Snapshot taken {manifest['snapshotted_at']} from git "
        f"{manifest['git_branch']}@{manifest['git_sha'][:10]}"
        f"{' (DIRTY)' if manifest['git_dirty'] else ''}.",
        "",
        "## Baseline record",
        f"  {args.baseline_record or '(not recorded)'}",
        "",
        "## Predecessor",
        f"  {args.predecessor or '(none — first version)'}",
        f"  vs predecessor: {args.predecessor_record or '(not recorded)'}",
        "",
        "## Known blind spots",
    ]
    if args.blind_spots_known:
        for b in args.blind_spots_known:
            readme.append(f"  - {b}")
    else:
        readme.append("  (none catalogued at snapshot time)")
    readme.extend([
        "",
        "## Notes",
        args.notes or "(none)",
        "",
        "## Layout",
        "  - `src/`          — Python source for fow_chess + cfr + p_enum",
        "  - `fow_rust/`     — pre-built Rust extension binary (platform-specific)",
        "  - `configs/`      — opponent configs the engine references",
        "  - `version.json`  — machine-readable manifest",
        "",
        "## How to use",
        "",
        "(Versioned bakeoff runner planned but not yet built.)",
        "When built, each side of a bakeoff will run in its own subprocess",
        "with PYTHONPATH set to this snapshot's `src/` and the `fow_rust/`",
        "binary inserted at the head of `sys.path`. Snapshots are platform-",
        "specific because of the .so; cross-platform shipping requires",
        "re-snapshotting on the target platform.",
    ])
    (out_dir / "README.md").write_text("\n".join(readme) + "\n")

    print(f"snapshotted to {out_dir}")
    print(f"  src files: {sum(1 for _ in src_dst.rglob('*.py'))} .py")
    print(f"  rust .so:  {(rust_dst_dir / so_src.name).stat().st_size // 1024} KB")
    print(f"  total:     {sum(f.stat().st_size for f in out_dir.rglob('*') if f.is_file()) // 1024} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
