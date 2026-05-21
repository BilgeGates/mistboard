# CFR Phased-Investment Budget Tracker

Hard ceiling: **$100** total compute spend on the CFR-direction research.
Phases below have explicit gates; each fail kills the next phase. The
discipline only works if we honor the gates — no rolling over leftover
budget into a "keep trying" mode.

## Phases + budget breakdown

| Phase | What | Compute kind | Estimate | Gate to pass |
|---|---|---|---|---|
| 1b | Re-run smoke with `hybrid_fog` leaf eval | CPU only | **$0** | argmax-match ≥ 35% OR conf-conditional argmax ≥ 60% |
| 2a | Deep CFR — Kuhn validation | GPU ~1 hr | **$2–5** | Converges to −1/18 within 0.05 |
| 2b | Deep CFR — 38-position FoW smoke | GPU ~10 hr | **$15–25** | Match or exceed tabular CFR argmax-match rate |
| 3 | Neural belief encoder (Bet A) + integration | GPU ~20–30 hr | **$40–60** | +10pp argmax-match over Phase 1b best AND ≤60s/position |
| Reserve | Debugging, re-runs, unexpected | — | **$10–20** | n/a |
| **Total** | | | **$67–110** | |

Phase 4 (full bootstrap loop) is explicitly **out of this budget**. It
is a separate decision contingent on Phase 3 passing.

## Spend log

Update this table as actual spend occurs.

| Date | Phase | Expected | Actual | Cumulative | Notes |
|---|---|---|---|---|---|
| 2026-05-20 | 1b | $0 | $0 | $0 | CPU only; ran on Mac. Strict gates failed (28.9% argmax vs 35% gate; 32% conf-cond vs 60%) but direction-rate improved 71%→82%. |
| 2026-05-20 | 1c | $0 | $0 | $0 | Hand-validation by user (2000+ FoW player) on 16 CFR third-move picks via HTML interface. **75% defensible (12/16)** — soft pass on the rubric's ≥60% threshold. Phase 1b confirmed as soft pass. |

## Hard rules

1. **No phase starts before the previous phase's gate passes.** If
   Phase 1b fails, Phase 2 doesn't start. If Phase 2 fails, Phase 3
   doesn't start.
2. **No "exploratory" GPU spend.** Any compute use must be tied to a
   phase with a gate. Side experiments come out of the reserve.
3. **Stop immediately if cumulative spend hits $100** — even mid-phase,
   even with experiments in flight. The discipline is the point.
4. **Surface the running total at every checkpoint.** If the spend log
   isn't updated after a compute run, that's a process failure.

## What's explicitly out of scope of this $100

These are the chess-family / hand-tuning paths we deliberately chose
not to invest in:

- Bet D — large-corpus opp policy via co-training.
- Positional eval term tuning beyond what v0.9.6 already shipped.
- Targeted blunder guards (phantom-check, recapture-style fixes).
- `explain_move` diagnostic tool (chess-family iteration accelerator).
- Bake-off harness work (asymmetric measurement) — only relevant for
  hand-tuning, not the CFR research path.

If any of these creep back into the workplan, push back. Phase 1 (the
prior session's substrate + validation) was the bookend on the chess-
family direction.

## What happens after the budget

**If Phase 3 passes:** start a separate $500–2000 budget conversation
for the full Bet C bootstrap loop. That spend is contingent on Phase 3
giving us a calibrated, working architecture.

**If any earlier phase fails:** stop CFR work, write a publishable
post-mortem ("here's why CFR-on-FoW doesn't scale at this level of
investment"), and reopen the strategic conversation about engine
direction.

Either outcome is real progress and protects the runway.
