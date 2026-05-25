"""Artifact store: paths, resolution, champions.

The store is a directory under `<lab_root>/lab/`:

    lab/nets/<arch>/v<N>/         — versioned trained networks
    lab/corpora/c<N>/             — versioned training corpora
    lab/runs/<uuid>/              — every job's outputs (eval / gate / etc)
    lab/champions.json            — current strongest network per arch

Artifacts are referenced by a *ref* string: "nets/psqt/v2", "corpora/c2",
"runs/<uuid>". Resolution turns refs into absolute paths against the lab root.

This is deliberately filesystem-only for v1 — no DB, no HTTP. Swap to S3
later by replacing the path-resolution functions; consumers shouldn't care.
"""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path

# Lab root is the parent of this src/ tree's repo root. We resolve it by
# walking up to find the `lab/` directory marker, which means tests/CI can
# point at a temporary lab via $FOWLAB_ROOT.
_REPO_ROOT = Path(__file__).resolve().parents[3]


def lab_root() -> Path:
    """Where lab/ lives. Override with FOWLAB_ROOT env var for tests/CI."""
    env = os.environ.get("FOWLAB_ROOT")
    if env:
        return Path(env)
    return _REPO_ROOT / "lab"


def resolve(ref: str) -> Path:
    """'nets/psqt/v2' -> /abs/path/to/lab/nets/psqt/v2.

    Special refs that resolve to non-artifact teachers:
      'fow', 'material'  -> returned as a Path with that single component
      so callers can detect via name == 'fow' etc.
    """
    if ref in ("fow", "material"):
        return Path(ref)
    if Path(ref).is_absolute():
        return Path(ref)
    return lab_root() / ref


def new_run_dir(*, prefix: str = "run") -> Path:
    """Allocate a fresh runs/<uuid>/ directory and return it."""
    run_id = f"{prefix}-{uuid.uuid4().hex[:12]}"
    d = lab_root() / "runs" / run_id
    d.mkdir(parents=True, exist_ok=False)
    return d


# --- Champions ---

_CHAMPIONS_FILE = "champions.json"


def champions_path() -> Path:
    return lab_root() / _CHAMPIONS_FILE


def read_champions() -> dict[str, str | None]:
    p = champions_path()
    if not p.exists():
        return {}
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_champions(d: dict[str, str | None]) -> None:
    """Atomic write (write+rename) so concurrent readers never see a partial file."""
    p = champions_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(d, f, indent=2, sort_keys=True)
        f.write("\n")
    tmp.replace(p)


def get_champion(arch: str) -> str | None:
    return read_champions().get(arch)


def set_champion(arch: str, ref: str | None) -> None:
    d = read_champions()
    d[arch] = ref
    write_champions(d)
