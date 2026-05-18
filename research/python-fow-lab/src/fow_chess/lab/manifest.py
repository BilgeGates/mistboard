"""Artifact manifests for the engine lab.

Every artifact (corpus, net, run result) carries a manifest.json with full
provenance: which spec produced it, which inputs it consumed (by hash), what
metrics it scored. Manifests are append-only — never edit, only create new
versions. This is the contract that makes the chain reproducible.

Schema (informal — kept loose so adding fields doesn't break consumers):

    {
      "type": "net" | "corpus" | "run-result",
      "id":   "<arch>/v<N>" | "c<N>" | "<uuid>",
      "created_at": ISO 8601,
      "git_sha": short SHA of HEAD when produced,
      "spec": <the JobSpec dict that produced this>,
      "inputs": {                       # named refs to parent artifacts
        "corpus": "lab/corpora/c2",
        "parent_net": "lab/nets/psqt/v2"
      },
      "outputs": {                      # files in this manifest's dir
        "weights": "weights.npz",
        ...
      },
      "metrics": {                      # arbitrary k→v
        "val_rmse": 906.3,
        ...
      },
      "lineage": ["c2", "fow"],         # flat ancestry for ease of querying
      "notes": "free text"
    }
"""

from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


def _git_sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short=12", "HEAD"],
            stderr=subprocess.DEVNULL, text=True,
        ).strip()
    except Exception:
        return "unknown"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def build(
    *,
    type: str,
    id: str,
    spec: dict[str, Any],
    inputs: dict[str, str | None] | None = None,
    outputs: dict[str, str] | None = None,
    metrics: dict[str, Any] | None = None,
    lineage: Iterable[str] | None = None,
    notes: str = "",
) -> dict[str, Any]:
    return {
        "type": type,
        "id": id,
        "created_at": now_iso(),
        "git_sha": _git_sha(),
        "spec": spec,
        "inputs": inputs or {},
        "outputs": outputs or {},
        "metrics": metrics or {},
        "lineage": list(lineage or []),
        "notes": notes,
    }


def write(path: Path, manifest: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, sort_keys=False)
        f.write("\n")


def read(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def manifest_path(artifact_dir: Path) -> Path:
    return artifact_dir / "manifest.json"
