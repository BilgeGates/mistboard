"""Parse the Phase 1c hand-validation report and compute the score.

Reads ``cfr-phase1c-hand-validation.md``, finds the marked checkbox under
each position's judgment, and tallies. Reports the defensible rate
(better + comparable) — that's the discriminating metric for whether
Phase 1b should be considered a soft pass or a real fail.

Thresholds (from the phased plan):
- ≥60% defensible → metric was unfair to CFR; Phase 1b is a soft pass.
- 30-60% defensible → inconclusive; collect more data or accept fail.
- <30% defensible → metric was fair; Phase 1b really did fail.

Run:
    cd research/python-fow-lab
    .venv/bin/python lab/diag/cfr_phase1c_score.py
"""

from __future__ import annotations

import re
from pathlib import Path

INPUT_PATH = Path(__file__).parent / "cfr-phase1c-hand-validation.md"

# Match a checked checkbox followed by the tag in backticks: e.g.
# "- [x] `[B]` Better than suggested"
PATTERN = re.compile(
    r"^- \[[xX]\] `\[([BCW?])\]`", re.MULTILINE
)


def main() -> None:
    text = INPUT_PATH.read_text()
    # Split per-position by the ## headers
    positions = re.split(r"\n## Position \d+", text)[1:]
    if not positions:
        print("No position blocks found.")
        return

    tally = {"B": 0, "C": 0, "W": 0, "?": 0, "unmarked": 0}
    for i, block in enumerate(positions, 1):
        marks = PATTERN.findall(block)
        if not marks:
            tally["unmarked"] += 1
        elif len(marks) > 1:
            print(f"Position {i}: multiple marks ({marks}); using first ({marks[0]})")
            tally[marks[0]] += 1
        else:
            tally[marks[0]] += 1

    total = sum(tally.values())
    judged = total - tally["unmarked"]
    print(f"Total positions: {total}")
    print(f"Judged: {judged}; Unmarked: {tally['unmarked']}")
    print()
    print("Breakdown:")
    print(f"  [B] Better than suggested:    {tally['B']}")
    print(f"  [C] Comparable to suggested:  {tally['C']}")
    print(f"  [W] Worse than suggested:     {tally['W']}")
    print(f"  [?] Can't tell:               {tally['?']}")
    print()

    if judged == 0:
        print("No judgments yet — fill in the report and re-run.")
        return

    defensible = tally["B"] + tally["C"]
    rate = defensible / judged
    print(f"Defensible rate (B+C / judged): {defensible}/{judged} = {rate:.0%}")
    print()
    if rate >= 0.60:
        print("Result: ≥60% defensible — metric was unfair to CFR.")
        print("Phase 1b is a SOFT PASS. Proceed to Phase 2 design.")
    elif rate >= 0.30:
        print(f"Result: {rate:.0%} defensible — inconclusive.")
        print("Either collect more validations or accept Phase 1b as fail.")
    else:
        print(f"Result: {rate:.0%} defensible — metric was fair.")
        print("Phase 1b really did fail. Honor the gate; stop CFR investment.")


if __name__ == "__main__":
    main()
