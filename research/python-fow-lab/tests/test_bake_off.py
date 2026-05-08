import importlib.util
import sys
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "bake_off.py"
SPEC = importlib.util.spec_from_file_location("bake_off", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
bake_off = importlib.util.module_from_spec(SPEC)
sys.modules["bake_off"] = bake_off
SPEC.loader.exec_module(bake_off)


def test_game_seed_preserves_saved_bakeoff_index_schedule() -> None:
    assert bake_off._game_seed(base_seed=1, game_index=0) == 1
    assert bake_off._game_seed(base_seed=1, game_index=8) == 63353
