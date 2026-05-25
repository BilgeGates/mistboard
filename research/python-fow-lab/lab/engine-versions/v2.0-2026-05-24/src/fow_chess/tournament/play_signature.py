"""Computes a play_signature: SHA-12 over engine source + Stockfish version.

Identity model:
- `config_hash`  = canonical hash of BotConfig fields (declarative parameters).
- `play_signature` = hash of the *implementation* code + Stockfish version.

Bot identity = (config_hash, play_signature). Two rows with the same
config_hash but different play_signature are different bots — same name,
different code. This is the active-development reality: engine code changes
between tournaments, and we want each commit to be a separately-rated bot
without manually bumping every config name.

The signature covers the 8 source files that determine how a strategy plays:
    strategies.py, engine.py, belief.py, evaluator.py,
    move_priors.py, selfplay.py, observation.py, visibility.py

Plus the Stockfish version line. Python and python-chess versions could
theoretically also be included; for v1 we don't, on the assumption they
don't shift bot strength meaningfully and would just churn the signature.

Computed once per process startup (not per game) — engine source is
guaranteed not to change inside a running process due to Python's
import-time loading. The harness records the same signature on every row
in a single tournament run, refuses to resume a tournament whose existing
rows carry a different signature.
"""

from __future__ import annotations

import functools
import hashlib
import subprocess
from pathlib import Path

_LAB_SRC = Path(__file__).resolve().parent.parent
_PLAY_FILES = (
    "strategies.py",
    "engine.py",
    "belief.py",
    "evaluator.py",
    "move_priors.py",
    "selfplay.py",
    "observation.py",
    "visibility.py",
)


@functools.lru_cache(maxsize=1)
def compute_play_signature(stockfish_path: str = "stockfish") -> str:
    h = hashlib.sha256()
    for name in sorted(_PLAY_FILES):
        h.update(name.encode("utf-8"))
        h.update(b"\0")
        h.update((_LAB_SRC / name).read_bytes())
    try:
        sf_line = (
            subprocess.check_output(
                [stockfish_path, "--help"],
                stderr=subprocess.STDOUT,
                timeout=5,
            )
            .split(b"\n", 1)[0]
            .decode("utf-8", errors="replace")
            .strip()
        )
    except (subprocess.SubprocessError, OSError):
        sf_line = "stockfish-unavailable"
    h.update(b"\0stockfish\0")
    h.update(sf_line.encode("utf-8"))
    return h.hexdigest()[:12]


def per_file_signatures() -> dict[str, str]:
    """Per-source-file SHA-12s. Useful for debugging which file changed."""
    out: dict[str, str] = {}
    for name in sorted(_PLAY_FILES):
        contents = (_LAB_SRC / name).read_bytes()
        out[name] = hashlib.sha256(contents).hexdigest()[:12]
    return out


def stockfish_version_line(stockfish_path: str = "stockfish") -> str:
    try:
        return (
            subprocess.check_output(
                [stockfish_path, "--help"],
                stderr=subprocess.STDOUT,
                timeout=5,
            )
            .split(b"\n", 1)[0]
            .decode("utf-8", errors="replace")
            .strip()
        )
    except (subprocess.SubprocessError, OSError):
        return "stockfish-unavailable"
