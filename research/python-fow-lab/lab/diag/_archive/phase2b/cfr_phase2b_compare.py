"""Compare Phase 2b Deep CFR results to Phase 1 / 1b tabular baselines.

Run after ``cfr_phase2b_smoke.py`` completes. Loads the most recent
Phase 2b result file (or the one passed on argv) plus both Phase 1
baselines, prints summary stats, and emits a Gate 2b verdict.

Gate 2b (from cfr-phase2-spec.md):
    Match or exceed Phase 1b (hybrid_fog) on
    - cfr_argmax_match_rate ≥ 0.289
    - cfr_direction_hit_rate ≥ 0.82

Usage:
    PYTHONPATH=src .venv/bin/python lab/diag/cfr_phase2b_compare.py
    PYTHONPATH=src .venv/bin/python lab/diag/cfr_phase2b_compare.py \
        lab/diag/cfr-phase2b-hybrid_fog-smoke-results.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

DIAG_DIR = Path(__file__).parent

PHASE_1_PATH = DIAG_DIR / "cfr-phase1-smoke-results.json"
PHASE_1B_PATH = DIAG_DIR / "cfr-phase1b-smoke-results.json"


def _gate_targets() -> tuple[float, float]:
    """Phase 1b's actual rates (not rounded values). Read at compare time so
    re-running Phase 1b shifts the gate automatically.
    """
    if not PHASE_1B_PATH.exists():
        # Fall back to the spec's rounded numbers if Phase 1b is missing.
        return 0.289, 0.82
    data = json.loads(PHASE_1B_PATH.read_text())
    s = data.get("summary", {})
    return (
        float(s.get("cfr_argmax_match_rate", 0.289)),
        float(s.get("cfr_direction_hit_rate", 0.82)),
    )


GATE_2B_ARGMAX_TARGET, GATE_2B_DIRECTION_TARGET = _gate_targets()


def _load(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def _summary(payload: dict, label: str) -> None:
    s = payload.get("summary", {})
    n = s.get("n_valid", 0)
    dir_rate = s.get("cfr_direction_hit_rate")
    arg_rate = s.get("cfr_argmax_match_rate")
    wall = s.get("cfr_avg_wall_seconds")
    print(
        f"  {label:24}  n={n:3d}  "
        f"direction={_fmt(dir_rate)}  argmax={_fmt(arg_rate)}  "
        f"avg_wall={_fmt_wall(wall)}"
    )


def _fmt(x) -> str:
    if x is None:
        return "  ?  "
    return f"{x:.3f}"


def _fmt_wall(x) -> str:
    if x is None:
        return "    ?s"
    return f"{x:5.1f}s"


def _verdict(payload: dict) -> None:
    s = payload.get("summary", {})
    dir_rate = s.get("cfr_direction_hit_rate")
    arg_rate = s.get("cfr_argmax_match_rate")
    if dir_rate is None or arg_rate is None:
        print("\nGate 2b verdict: INCOMPLETE — summary missing CFR rates.")
        return

    direction_pass = dir_rate >= GATE_2B_DIRECTION_TARGET
    argmax_pass = arg_rate >= GATE_2B_ARGMAX_TARGET

    print()
    print("Gate 2b targets (from Phase 1b hybrid_fog baseline):")
    print(
        f"  direction ≥ {GATE_2B_DIRECTION_TARGET:.3f}  →  "
        f"observed {dir_rate:.3f}  "
        f"[{'PASS' if direction_pass else 'FAIL'}]"
    )
    print(
        f"  argmax    ≥ {GATE_2B_ARGMAX_TARGET:.3f}  →  "
        f"observed {arg_rate:.3f}  "
        f"[{'PASS' if argmax_pass else 'FAIL'}]"
    )
    print()
    if direction_pass and argmax_pass:
        print("Gate 2b: PASS — Deep CFR substrate validated for FoW. Phase 3 can begin.")
    elif direction_pass or argmax_pass:
        print(
            "Gate 2b: PARTIAL — one rate met. Debug the failing rate before "
            "committing to Phase 3 GPU spend."
        )
    else:
        print(
            "Gate 2b: FAIL — Deep CFR underperforms tabular on both rates. "
            "Inspect per-position results; common suspects: too few iters, "
            "regret-net underfitting, or marginal-update rule too lossy in "
            "practice (re-run property test against actual smoke positions)."
        )


def _pick_phase2b_result(argv: list[str]) -> Path | None:
    if len(argv) >= 2:
        return Path(argv[1])
    # Prefer hybrid_fog (real Gate 2b leaf); fall back to material.
    candidates = [
        DIAG_DIR / "cfr-phase2b-hybrid_fog-smoke-results.json",
        DIAG_DIR / "cfr-phase2b-material-smoke-results.json",
    ]
    for c in candidates:
        if c.exists():
            return c
    return None


def main(argv: list[str]) -> int:
    phase2b_path = _pick_phase2b_result(argv)
    if phase2b_path is None:
        print(
            "No Phase 2b result file found. Run cfr_phase2b_smoke.py first.",
            file=sys.stderr,
        )
        return 1

    print(f"Phase 2b result: {phase2b_path.name}")
    p1 = _load(PHASE_1_PATH)
    p1b = _load(PHASE_1B_PATH)
    p2b = _load(phase2b_path)

    if not p2b:
        print(f"Could not load {phase2b_path}", file=sys.stderr)
        return 1

    settings = p2b.get("settings", {})
    if settings:
        print(f"Settings: {settings}")
    workers = p2b.get("n_workers")
    wall = p2b.get("total_wall_seconds")
    if workers and wall:
        print(f"Run: {workers} workers, total wall {wall:.1f}s")

    print()
    print("Summary comparison:")
    if p1:
        _summary(p1, "Phase 1  (material)")
    if p1b:
        _summary(p1b, "Phase 1b (hybrid_fog)")
    label_leaf = settings.get("leaf_eval", "?")
    _summary(p2b, f"Phase 2b ({label_leaf})")

    _verdict(p2b)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
