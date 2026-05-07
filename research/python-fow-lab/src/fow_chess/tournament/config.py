"""BotConfig + canonical hash + lockfile-enforced freeze for ladder anchors.

Design:
- A `BotConfig` is a frozen dataclass with all parameters that affect play.
- `canonical_hash(config)` is SHA-256 over the sorted-key JSON dict, truncated
  to 12 hex chars. The hash is identity; the name is decorative.
- A `BotConfig` whose name is in a `*.lock` file is checked on load — any
  mismatch raises `BotConfigError`. This is how `tier1-v1` stays frozen
  across the lifetime of the project.

JSON not YAML — keeps the dependency footprint at python-chess only.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


class BotConfigError(Exception):
    """Raised on lockfile mismatch, unknown kind, or malformed config."""


@dataclass(frozen=True)
class TimeControl:
    """Standard chess time control: initial clock + per-move increment.

    Player starts with `initial_seconds` on their clock. After each of their
    own moves, `increment_seconds` is added. If their clock hits 0 while they
    are thinking, they lose on time (`clock-expired` termination).

    A bot config with no `time_control` (None) is regime-1 — offline training,
    unbounded thinking, ineligible for tournament ladders.
    """

    initial_seconds: float
    increment_seconds: float

    def __post_init__(self) -> None:
        if self.initial_seconds <= 0:
            raise ValueError("initial_seconds must be > 0")
        if self.increment_seconds < 0:
            raise ValueError("increment_seconds must be >= 0")


@dataclass(frozen=True)
class BotConfig:
    name: str
    family: str
    kind: str

    evaluator: str | None = None
    evaluator_depth: int | None = None

    prior: str | None = None
    prior_depth: int | None = None
    prior_movetime_ms: int | None = None
    prior_top_k: int | None = None
    prior_temperature_cp: float | None = None
    prior_uniform_blend: float | None = None

    fog_lambda: float = 0.0
    target_n: int = 256
    max_particles: int = 16
    risk_aversion: float = 0.0

    # Forward-compat for Draft960. Default "canonical" preserves current
    # behavior (standard FOW start). Field exists so future Draft960 work
    # doesn't need to migrate every locked config file. See engine-roadmap.md
    # "Capability Tracks" — A1/A2/A3 will actually consume this; for now it's
    # a placeholder included in canonical_hash so the API surface is stable.
    start_position: str = "canonical"

    # Engine version pinning (Stage 1.5 of the calibration roadmap).
    # When set, names a directory under `engine_versions/` whose snapshot is
    # loaded into the process and used in place of the live source tree.
    # `None` (default) means "use current code." Cross-version tournaments
    # work by giving bot_a a pinned version and bot_b the current code (or
    # different pinned versions on each side).
    engine_version: str | None = None

    notes: str = ""


_VALID_KINDS = ("tier1", "legal_greedy", "random")


def canonical_hash(config: BotConfig) -> str:
    """SHA-12 hex of canonical JSON (sorted keys, no whitespace).

    Notes field excluded — documentation should not change identity.
    Time control is NOT part of bot identity — it's a property of the
    tournament/match, not the strategy. Two bots play under one shared
    clock; cross-control comparisons are diagnostic experiments, not
    ladder events.
    """
    payload = {k: v for k, v in asdict(config).items() if k != "notes"}
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()[:12]


def load_config(path: Path | str, *, verify_lock: bool = True) -> BotConfig:
    """Load a BotConfig from JSON. If `<path>.lock` exists, verify the hash.

    `verify_lock=False` is escape-hatch only (e.g., during initial lockfile
    write). Production code paths should leave it True.
    """
    path = Path(path)
    with path.open("r", encoding="utf-8") as fh:
        raw = json.load(fh)
    if not isinstance(raw, dict):
        raise BotConfigError(f"{path}: top-level must be a JSON object")
    config = _from_dict(raw, source=str(path))
    if verify_lock:
        lock_path = path.with_suffix(path.suffix + ".lock")
        if lock_path.exists():
            verify_lockfile(config, lock_path)
    return config


def verify_lockfile(config: BotConfig, lock_path: Path) -> None:
    """Raise BotConfigError if lock_path's hash doesn't match config's."""
    with lock_path.open("r", encoding="utf-8") as fh:
        lock = json.load(fh)
    expected_name = lock.get("name")
    expected_hash = lock.get("hash")
    if expected_name is None or expected_hash is None:
        raise BotConfigError(f"{lock_path}: malformed lockfile (need name+hash)")
    if config.name != expected_name:
        raise BotConfigError(
            f"{lock_path}: name mismatch — lock says {expected_name!r}, "
            f"config has {config.name!r}"
        )
    actual = canonical_hash(config)
    if actual != expected_hash:
        raise BotConfigError(
            f"{lock_path}: hash mismatch for {config.name} — "
            f"lock={expected_hash}, computed={actual}. "
            f"This config has been modified since the lockfile was written. "
            f"If the change is intentional, give the bot a new name."
        )


def write_lockfile(config: BotConfig, lock_path: Path) -> None:
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"name": config.name, "hash": canonical_hash(config)}
    with lock_path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)
        fh.write("\n")


def _from_dict(raw: dict[str, Any], *, source: str) -> BotConfig:
    field_names = {f.name for f in BotConfig.__dataclass_fields__.values()}
    unknown = set(raw) - field_names
    if unknown:
        raise BotConfigError(f"{source}: unknown fields {sorted(unknown)}")
    if "name" not in raw or "family" not in raw or "kind" not in raw:
        raise BotConfigError(f"{source}: required fields name+family+kind missing")
    if raw["kind"] not in _VALID_KINDS:
        raise BotConfigError(
            f"{source}: kind must be one of {_VALID_KINDS}, got {raw['kind']!r}"
        )
    return BotConfig(**raw)
