"""P3.0 tournament harness — bot configs, run_pair, results store, Elo."""

from .config import (
    BotConfig,
    BotConfigError,
    TimeControl,
    canonical_hash,
    load_config,
    verify_lockfile,
    write_lockfile,
)
from .play_signature import compute_play_signature, per_file_signatures
from .runtime import bot_runtime
from .run_pair import PairSpec, derive_seed, run_pair
from .sprt import SPRTRunner, SPRTVerdict, sprt_pair

__all__ = [
    "BotConfig",
    "BotConfigError",
    "PairSpec",
    "SPRTRunner",
    "SPRTVerdict",
    "TimeControl",
    "bot_runtime",
    "canonical_hash",
    "compute_play_signature",
    "derive_seed",
    "load_config",
    "per_file_signatures",
    "run_pair",
    "sprt_pair",
    "verify_lockfile",
    "write_lockfile",
]
