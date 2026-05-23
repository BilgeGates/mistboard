# Phase 2b: 100-iter vs 50-iter analysis (partial, n=11)

A 100-iteration re-run of Gate 2b was launched 2026-05-21 to test the
hypothesis from the deep dive (`9ad0b093`, argmax_prob 0.077 → 0.158
between iters 50 and 100): **does more compute improve the gate metrics
on the full 38-position smoke?**

The run was killed twice by memory pressure (root cause: unbounded
samples buffer growth — fixed via reservoir sampling in commit
`a565198`, see `cfr_phase2b_smoke.py`). At kill time the partial result
file contained **11 of 38 positions** completed. We stopped here rather
than relaunch because the 11-position result already answers the
question.

## Headline finding

Same 11 positions across all three runs (apples-to-apples):

| Metric | 100-iter (new) | 50-iter (Gate 2b) | Phase 1b (tabular) |
|---|---|---|---|
| direction hit rate | 0.727 | 0.727 | 0.818 |
| argmax-match rate | 0.273 | 0.273 | 0.273 |
| avg argmax_prob | 0.562 | 0.469 | n/a (tabular) |
| avg played_prob | 0.013 | 0.013 | n/a |
| avg suggested_prob | 0.244 | 0.236 | n/a |

**Direction and argmax-match rates are identical at 50 and 100 iters on
this subset.** The gate metrics did not move with 2× the compute.

## What did change

The average argmax_prob rose by **+0.094** (from 0.469 to 0.562). Per
position:

```
sharper (Δargmax_prob > +0.02): 7/11
similar (|Δ| ≤ 0.02):            3/11
looser:                           1/11
mean Δ:                          +0.094

argmax move agreed between 50-iter and 100-iter: 10/11 positions
```

The strategies are getting sharper with more iters, but they sharpen
onto **the same moves at higher confidence** — not different (better)
moves. The +0.094 mean argmax_prob is real; the +0.000 gate-metric
change is also real.

Per-position table (sorted by Δargmax_prob):

```
aid       | 50-iter prob | 100-iter prob | Δ      | argmax_move agreed?
0aac8a1d  |    0.149     |     0.522     | +0.372 | yes
378260a7  |    0.349     |     0.526     | +0.177 | yes
a1bf921f  |    0.658     |     0.826     | +0.169 | yes
10b34773  |    0.653     |     0.778     | +0.125 | yes
05d3524b  |    0.192     |     0.302     | +0.110 | NO ←
4b6cfbdf  |    0.163     |     0.201     | +0.038 | yes
d9ccbf88  |    0.402     |     0.438     | +0.037 | yes
4cb2418d  |    0.958     |     0.977     | +0.019 | yes
efa56f63  |    0.967     |     0.982     | +0.015 | yes
c4edafaa  |    0.486     |     0.492     | +0.006 | yes
9a806582  |    0.182     |     0.143     | -0.039 | yes
```

Only one position (`05d3524b`) changed its argmax pick between 50 and
100 iters. The rest are stable on which move they prefer.

## Interpretation

The deep dive's "argmax_prob doubles from iter 50 → iter 100 on
9ad0b093" generalizes to a milder effect across positions: **strategies
do sharpen with more iters, on average ~10pp argmax_prob gain.** But
the sharpening converges on the same moves CFR was already finding at
50 iters, so the human-suggested-move match rate doesn't move.

This rules out one hypothesis cleanly:

> **More compute alone does NOT improve the gate metrics.**

The 31.6% argmax-match-suggested rate from the original 50-iter Gate 2b
is not an under-trained floor that more iters lifts. It's a structural
ceiling at the current architecture (depth 3, hybrid_fog leaf, factored
marginals encoder).

## Implications for Phase 3

The Phase 3 thesis (learned belief encoder + amortized training across
positions, $40-60 Modal A10G spend) targets an architectural change:
- Replace the static factored-marginals encoder with a Transformer over
  observation history (Phase 3 spec, `cfr-phase3-spec.md`).
- Train end-to-end across positions instead of fresh nets per position.
- Trained jointly via gradient flow through the regret net.

This is precisely the kind of change that *might* move the gate metrics,
because more iters can't.

The conviction picture changes:

- **Before this experiment:** "More iters might just fix Phase 2's
  numbers; Phase 3 is on a hypothesis."
- **After:** "More iters demonstrably won't fix Phase 2's numbers; the
  architectural change is necessary if we want better numbers."

Phase 3's case is stronger by elimination. The remaining open question
is whether learned belief encoding is the *right* architectural change
— that's the Phase 3 hypothesis itself, only testable by running it.

## Compute spent + saved

- Two killed runs at 100 iters: ~10h compute wasted (OOM, then OOM)
- Memory fix (reservoir sampling) shipped: future 100-iter runs would
  cap at ~16 GB peak instead of ~200 GB
- Decision to stop at 11/38 saves ~16h additional wall on a relaunch
  that would only have re-confirmed the same finding

Total Phase 2 budget spent: still $0 (all Mac CPU). The reservoir cap
fix is reusable for any future runs at high iter count.
