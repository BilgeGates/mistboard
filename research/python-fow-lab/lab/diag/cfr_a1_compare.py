"""Compare two CFR smoke runs side-by-side.

Aligns by annotation_id and produces a side-by-side summary:

* aggregate metrics — direction hit rate, argmax match rate
* per-annotation diff — which positions did each leaf pick differently
* which leaf got the suggested move; agreement / disagreement counts

NOTE on metrics: per Brian's annotation framework, **direction-hit is
the load-bearing metric**, not argmax-match. The annotations call out
"suggested move is better than played," not "suggested is THE only
acceptable move." A leaf that picks a third-better move scores as an
argmax-miss but is producing the right answer.

Inputs default to A1 (Stockfish) vs Phase 1b (hybrid_fog). Override via:
    NEW_PATH=path/to/newer-results.json
    BASELINE_PATH=path/to/baseline-results.json
    NEW_LABEL="A2 (PCFR+ + Stockfish)"
    BASELINE_LABEL="A1 (Vanilla CFR + Stockfish)"

Run:
    PYTHONPATH=src .venv/bin/python lab/diag/cfr_a1_compare.py
"""

from __future__ import annotations

import json
import os
from pathlib import Path

DIAG = Path(__file__).parent

# Backwards-compat: A1_PATH is an alias for NEW_PATH.
NEW_PATH = Path(os.environ.get(
    "NEW_PATH",
    os.environ.get("A1_PATH", str(DIAG / "cfr-a1-stockfish-smoke-results.json")),
))
BASELINE_PATH = Path(os.environ.get(
    "BASELINE_PATH", str(DIAG / "cfr-phase1b-smoke-results.json")
))
NEW_LABEL = os.environ.get("NEW_LABEL", "NEW")
BASELINE_LABEL = os.environ.get("BASELINE_LABEL", "BASELINE")


def _load(path: Path) -> dict:
    with path.open() as f:
        return json.load(f)


def _index_by_id(results: list[dict]) -> dict[str, dict]:
    return {r["annotation_id"]: r for r in results if "error" not in r}


def main() -> None:
    a1 = _load(NEW_PATH)
    b = _load(BASELINE_PATH)

    a1_idx = _index_by_id(a1["results"])
    b_idx = _index_by_id(b["results"])

    print(f"{NEW_LABEL}: {NEW_PATH.name}")
    print(f"  settings: {a1['settings']}")
    print(f"  summary:  {json.dumps(a1['summary'], indent=2)}")
    print()
    print(f"{BASELINE_LABEL}: {BASELINE_PATH.name}")
    print(f"  settings: {b['settings']}")
    print(f"  summary:  {json.dumps(b['summary'], indent=2)}")
    print()

    common_ids = sorted(set(a1_idx) & set(b_idx))
    print(f"Annotations in common: {len(common_ids)}")
    print(f"  (A1 only: {len(set(a1_idx) - set(b_idx))}, "
          f"baseline only: {len(set(b_idx) - set(a1_idx))})")
    print()

    # Aggregate over common annotations only — apples to apples.
    a1_argmax_hits = 0
    b_argmax_hits = 0
    a1_dir_hits = 0
    b_dir_hits = 0
    a1_only_argmax = 0
    b_only_argmax = 0
    both_argmax = 0
    neither_argmax = 0
    agreement_count = 0  # same CFR argmax move

    diffs: list[dict] = []
    for aid in common_ids:
        ar = a1_idx[aid]
        br = b_idx[aid]
        a_hit = ar["argmax_match_suggested_cfr"]
        b_hit = br["argmax_match_suggested_cfr"]
        a1_argmax_hits += int(a_hit)
        b_argmax_hits += int(b_hit)
        a1_dir_hits += int(ar["direction_correct_cfr"])
        b_dir_hits += int(br["direction_correct_cfr"])
        if a_hit and not b_hit:
            a1_only_argmax += 1
        elif b_hit and not a_hit:
            b_only_argmax += 1
        elif a_hit and b_hit:
            both_argmax += 1
        else:
            neither_argmax += 1
        if ar["cfr_argmax_move"] == br["cfr_argmax_move"]:
            agreement_count += 1

        diffs.append({
            "id": aid,
            "severity": ar["severity"],
            "played": ar["played"],
            "suggested": ar["suggested"],
            "a1_argmax": ar["cfr_argmax_move"],
            "a1_argmax_prob": ar["cfr_argmax_prob"],
            "a1_hit": a_hit,
            "b_argmax": br["cfr_argmax_move"],
            "b_argmax_prob": br["cfr_argmax_prob"],
            "b_hit": b_hit,
            "sf_fallbacks": ar.get("sf_fallback_calls", -1),
        })

    n = len(common_ids)
    print("=== Apples-to-apples (intersection) ===")
    print(f"  n = {n}")
    print(f"  A1 argmax match rate:       {a1_argmax_hits/n:.1%} ({a1_argmax_hits}/{n})")
    print(f"  Baseline argmax match rate: {b_argmax_hits/n:.1%} ({b_argmax_hits}/{n})")
    print(f"  delta:                      {(a1_argmax_hits - b_argmax_hits)/n:+.1%}")
    print()
    print(f"  A1 direction hit rate:       {a1_dir_hits/n:.1%} ({a1_dir_hits}/{n})")
    print(f"  Baseline direction hit rate: {b_dir_hits/n:.1%} ({b_dir_hits}/{n})")
    print(f"  delta:                       {(a1_dir_hits - b_dir_hits)/n:+.1%}")
    print()
    print(f"  CFR argmax agreement (same move):  {agreement_count}/{n} ({agreement_count/n:.1%})")
    print()
    print(f"  Argmax match Venn:")
    print(f"    Both hit suggested:    {both_argmax}")
    print(f"    A1 only hit:           {a1_only_argmax}")
    print(f"    Baseline only hit:     {b_only_argmax}")
    print(f"    Neither hit:           {neither_argmax}")
    print()

    print("=== A1 wins (A1 hit, baseline missed) ===")
    for d in diffs:
        if d["a1_hit"] and not d["b_hit"]:
            print(f"  {d['id'][:8]} {d['severity']:>5}  played={d['played']} sugg={d['suggested']}  "
                  f"A1={d['a1_argmax']}@{d['a1_argmax_prob']:.2f}  "
                  f"B={d['b_argmax']}@{d['b_argmax_prob']:.2f}  "
                  f"sf_fb={d['sf_fallbacks']}")
    print()
    print("=== Baseline wins (baseline hit, A1 missed) ===")
    for d in diffs:
        if d["b_hit"] and not d["a1_hit"]:
            print(f"  {d['id'][:8]} {d['severity']:>5}  played={d['played']} sugg={d['suggested']}  "
                  f"A1={d['a1_argmax']}@{d['a1_argmax_prob']:.2f}  "
                  f"B={d['b_argmax']}@{d['b_argmax_prob']:.2f}  "
                  f"sf_fb={d['sf_fallbacks']}")


if __name__ == "__main__":
    main()
