#!/usr/bin/env python3
"""Build-time gate: every engine the registry OFFERS must be one the pinned engine
can SERVE. Run after the engine is cloned/checked-out in the build (railpack), so a
registry/engine mismatch fails the BUILD instead of 503-ing live players.

Asserts: every `python-v2-*` id in the registry's PROD_PLAYABLE_ENGINE_IDS is present
in the engine worker's V2_LIVE_ENGINES set. Exits non-zero (fails the build) on a gap.

Usage (paths default to the dev sibling layout):
  python3 scripts/check_engine_serveable.py [registry.ts] [live_move_worker.py]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent  # mistboard repo root
DEFAULT_REGISTRY = HERE / "apps/server/src/engines/registry.ts"
DEFAULT_WORKER = HERE.parent / "mistboard-engine/scripts/live_move_worker.py"

V2_ID = re.compile(r"""['"](python-v2-[\w.\-]+)['"]""")


def _block(text: str, start_pat: str, open_ch: str, close_ch: str) -> str:
    """Return the substring from the declaration's opening bracket to its match."""
    m = re.search(start_pat, text)
    if not m:
        return ""
    i = text.index(open_ch, m.end() - 1)
    depth = 0
    for j in range(i, len(text)):
        if text[j] == open_ch:
            depth += 1
        elif text[j] == close_ch:
            depth -= 1
            if depth == 0:
                return text[i : j + 1]
    return text[i:]


def offered_ids(registry_path: Path) -> set[str]:
    block = _block(registry_path.read_text(), r"PROD_PLAYABLE_ENGINE_IDS\s*=\s*new\s+Set\s*\(\s*\[", "[", "]")
    return set(V2_ID.findall(block))


def served_ids(worker_path: Path) -> set[str]:
    block = _block(worker_path.read_text(), r"V2_LIVE_ENGINES\s*=\s*\{", "{", "}")
    return set(V2_ID.findall(block))


def main() -> int:
    registry = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_REGISTRY
    worker = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_WORKER
    if not registry.exists() or not worker.exists():
        print(f"check_engine_serveable: missing input ({registry} / {worker})", file=sys.stderr)
        return 2
    offered = offered_ids(registry)
    served = served_ids(worker)
    if not offered:
        print("check_engine_serveable: no python-v2-* ids in PROD_PLAYABLE (nothing to check)")
        return 0
    missing = sorted(offered - served)
    if missing:
        print(
            "ENGINE-SERVEABILITY GATE FAILED: the registry offers v2 engine id(s) the\n"
            f"pinned engine does NOT serve (not in V2_LIVE_ENGINES): {missing}\n"
            f"  offered (PROD_PLAYABLE): {sorted(offered)}\n"
            f"  served  (V2_LIVE_ENGINES): {sorted(served)}\n"
            "Fix: bump engine.ref to an engine commit that registers these ids, or\n"
            "remove them from PROD_PLAYABLE_ENGINE_IDS.",
            file=sys.stderr,
        )
        return 1
    print(f"engine-serveability OK: offered v2 ids {sorted(offered)} all served by the pinned engine")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
