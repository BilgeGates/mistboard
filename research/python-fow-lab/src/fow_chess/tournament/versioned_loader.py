"""Load a pinned engine version snapshot into the running process.

A pinned version is a directory under `engine_versions/<name>@<sig>/`
containing the 8 play_signature-determining source files. This module
loads them as a namespaced package (`_fow_v_<sig>`) so multiple versions
can coexist with the live source tree in one Python process.

Cross-version compatibility constraint: the harness always runs current
`selfplay.py` (the orchestrator), which constructs `PerspectiveView`
instances of the **current** shape. Pinned strategies are therefore
forward-compatible only — they may ignore `PerspectiveView` fields that
didn't exist when they were pinned, but they cannot require fields that
the current orchestrator doesn't supply.

Usage:
    snapshot = load_versioned_engine(Path("engine_versions/v1-baseline@777dee603a9b"))
    # snapshot is a SimpleNamespace with attributes:
    #   strategies, engine, belief, evaluator, move_priors,
    #   selfplay, observation, visibility
    # Each attribute is a fully-loaded module.
    # Construct a Tier-1 from the snapshot:
    #   Tier1Strategy = snapshot.strategies.Tier1Strategy
"""

from __future__ import annotations

import importlib.util
import json
import sys
import threading
from pathlib import Path
from types import ModuleType, SimpleNamespace

# Files load in dependency order — relative imports inside each file resolve
# via sys.modules entries set up here, so earlier files must be present
# when later files import them.
_LOAD_ORDER = (
    "observation",
    "visibility",
    "move_priors",
    "belief",
    "selfplay",
    "engine",
    "evaluator",
    "strategies",
)

_cache: dict[str, SimpleNamespace] = {}
_cache_lock = threading.Lock()


def load_versioned_engine(snapshot_dir: Path) -> SimpleNamespace:
    """Load the snapshot's modules into the current process under a unique namespace.

    Returns a SimpleNamespace with one attribute per loaded module. Idempotent:
    calling twice with the same snapshot returns the cached namespace; loaded
    modules persist in sys.modules under `_fow_v_<sig>.<modname>`.
    """
    snapshot_dir = snapshot_dir.resolve()
    if not snapshot_dir.is_dir():
        raise FileNotFoundError(f"snapshot dir not found: {snapshot_dir}")

    manifest_path = snapshot_dir / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(
            f"snapshot {snapshot_dir} is missing manifest.json — "
            f"was it pinned via pin_engine_version.py?"
        )
    with manifest_path.open("r", encoding="utf-8") as fh:
        manifest = json.load(fh)

    play_sig = manifest["play_signature"]
    pkg_name = _safe_pkg_name(play_sig)

    with _cache_lock:
        if pkg_name in _cache:
            return _cache[pkg_name]

        ns = _load_into_unique_namespace(snapshot_dir, pkg_name)
        _cache[pkg_name] = ns
        return ns


def _safe_pkg_name(play_sig: str) -> str:
    """Translate play_signature into a valid Python module name."""
    return f"_fow_v_{play_sig.replace('-', '_').replace('.', '_')}"


def _load_into_unique_namespace(
    snapshot_dir: Path, pkg_name: str
) -> SimpleNamespace:
    # Create a synthetic package whose __path__ points at the snapshot dir.
    # This makes relative imports inside the snapshot files resolve via
    # sys.modules under pkg_name.
    pkg = ModuleType(pkg_name)
    pkg.__path__ = [str(snapshot_dir)]  # type: ignore[attr-defined]
    pkg.__package__ = pkg_name
    sys.modules[pkg_name] = pkg

    loaded: dict[str, ModuleType] = {}
    try:
        for fname in _LOAD_ORDER:
            path = snapshot_dir / f"{fname}.py"
            if not path.exists():
                raise FileNotFoundError(
                    f"snapshot {snapshot_dir} missing required file: {fname}.py"
                )
            full_name = f"{pkg_name}.{fname}"
            spec = importlib.util.spec_from_file_location(
                full_name, path, submodule_search_locations=[]
            )
            if spec is None or spec.loader is None:
                raise RuntimeError(
                    f"failed to build spec for {full_name} from {path}"
                )
            module = importlib.util.module_from_spec(spec)
            module.__package__ = pkg_name
            sys.modules[full_name] = module
            spec.loader.exec_module(module)
            setattr(pkg, fname, module)
            loaded[fname] = module
    except Exception:
        # Roll back: don't leave a half-loaded package in sys.modules
        for full_name in list(sys.modules.keys()):
            if full_name == pkg_name or full_name.startswith(pkg_name + "."):
                del sys.modules[full_name]
        raise

    return SimpleNamespace(**loaded)


def list_pinned_versions(engine_versions_dir: Path) -> list[dict]:
    """Return [{name, play_signature, path, manifest}, ...] for all pins."""
    out = []
    if not engine_versions_dir.exists():
        return out
    for child in sorted(engine_versions_dir.iterdir()):
        if not child.is_dir():
            continue
        manifest_path = child / "manifest.json"
        if not manifest_path.exists():
            continue
        with manifest_path.open("r", encoding="utf-8") as fh:
            manifest = json.load(fh)
        out.append(
            {
                "dirname": child.name,
                "name": manifest.get("name"),
                "play_signature": manifest.get("play_signature"),
                "path": child,
                "manifest": manifest,
            }
        )
    return out
