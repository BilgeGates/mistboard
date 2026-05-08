# Engine Lab Loop

Engine Lab is the local learning loop for Fog of War engine work. Its job is
to turn candidate engine changes into ranked evidence, a small annotation queue,
and the next concrete patch.

## Loop

1. Name the experiment.
   - Candidate version, baseline version, seed range, evaluator, opponent, and
     expected signal.
   - Example: v0.7.0 asks whether CSP reseed eliminates belief collapse and
     produces plausible recovery states.
2. Run the smallest useful validation rung.
   - Start with a regression for the exact bug or tuning question.
   - Expand only when the lower rung is clean.
   - Every run should produce a manifest, saved games, trace rows, and pinned
     engine identity.
   - Use verbose belief snapshots when the experiment is about belief state,
     reseeds, or hidden-position hypotheses.
3. Auto-triage moments.
   - The run should flag suspicious plies instead of asking a human to inspect
     whole games.
4. Annotate the top queue.
   - Human review is scarce. Review 10-20 high-signal moments before expanding
     the queue.
5. Convert annotations into hypotheses.
   - Each annotation should map to a belief bug, evaluator bug, tactical
     short-circuit bug, acceptable Fog of War uncertainty, or process/UI issue.
   - Belief bugs that contradict hard observations are blocking defects in the
     Belief Particle Engine subtrack, not normal engine-quality misses.
6. Promote, reject, or patch the candidate.
   - Promotion is not just win rate. The candidate needs fewer unexplained major
     errors, no new collapse class, and reproducible artifacts.

## Laddered Rollout

Large bake-offs are confirmation tools, not the first discovery step. During
active belief or evaluator work, default to this ladder:

1. **Rung 0 — exact regression.**
   - Add or run a unit/replay regression for the specific bug just found.
   - Example: after black `Re8xe2`, white belief must remove the captured bishop
     from `e2` and represent the visible black rook.
2. **Rung 1 — one targeted game.**
   - Re-run the exact game, seed, or smallest corpus that exposed the bug.
   - The goal is only to prove the previous bug is gone in artifact form.
   - Example:
     `.venv/bin/python scripts/bake_off.py --games 1 --start-index 8 --seed 1 --opponent tier1 --verbose-belief --save-only all --save-dir ../../apps/web/public/bakeoff-v0.7.1-q8-check`
3. **Rung 2 — 3-5 targeted annotation games.**
   - Generate a tiny queue with verbose belief enabled.
   - Pick only a few critical moments per game for human review.
4. **Rung 3 — 10-game smoke.**
   - Use this when the first annotation set shows no obvious hard-fact bugs and
     no immediate tuning reversal.
5. **Rung 4 — 30+ comparable mirror.**
   - Run this only when lower rungs show a stable candidate worth measuring.
   - Use it for promotion confidence, not for finding the first obvious bug.

If any rung finds a hard-observation contradiction, repeated collapse, or
obvious tuning defect, stop the ladder and patch first. Do not spend hours on a
30-game mirror when one targeted artifact already tells us the candidate is not
ready.

## Standard Artifacts

- `manifest.json`: version, commit, run config, record, saved game list.
- `games/*.jsonl`: replayable game events.
- `trace.jsonl`: per-decision path, particle counts, diagnostics, and scores.
- `belief.jsonl`: optional per-ply marginal field and top particle clusters.
- `move_quality.csv`: optional full-info Stockfish comparison.
- `feedback/annotations.jsonl`: durable human labels; treat this as first-class
  training and regression data, not scratch output.

## Annotation Queue Signals

Flag plies when any of these fire:

- game is a loss or draw;
- `csp_reseed_fired = true`;
- Stage A or Stage B particle count falls sharply;
- `belief_unique_count` is low;
- belief snapshots contradict hard visible facts or own-capture observations;
- decision path is king capture, king defense, queen capture, queen save, or
  visible minor/rook capture;
- Stockfish-truth comparison shows a large disagreement;
- material swings sharply within the next few plies;
- king is captured soon after the move.

The queue should include game index, ply, side/seat, replay sample id, reason,
trace summary, and whether a belief snapshot exists.

## How The Process Has Improved

- **Tier-1 vs random:** established a basic strength and latency gate, then
  saturated.
- **Mirror bake-offs:** exposed candidate-vs-candidate belief failures better
  than random games.
- **Saved corpora:** made runs replayable instead of ephemeral console output.
- **Trace rows:** made decision paths, particle counts, and tactical shortcuts
  inspectable.
- **Stockfish-truth comparison:** added a useful, non-authoritative move-quality
  diagnostic.
- **Annotations:** turned human review into durable data.
- **Verbose belief capture:** made hidden-state hypotheses visible enough to
  debug reseeds and collapse recovery.

The next process upgrade is an automatic review-queue generator that ranks the
top moments from `trace.jsonl`, `belief.jsonl`, and `move_quality.csv`.

Local command:

```sh
.venv/bin/python scripts/review_queue.py /path/to/bakeoff-run
```

This writes `review_queue.json` and `review_queue.md` next to the bake-off
artifacts. The current scorer is intentionally simple and transparent: it ranks
CSP reseeds, particle drops, low belief diversity, critical tactical decision
paths, constraint pruning, and late plies in losses/draws. Treat the score as a
triage priority, not a verdict on the move.

Hard-observation contradictions are higher priority than score implies. If a
belief snapshot shows an impossible own piece, misses a visible opponent piece,
or ignores an `own_capture_square` signal, stop and fix the Belief Particle
Engine before using that artifact for move-quality conclusions.

## Current Local Question

v0.7.0 is a belief-recovery experiment. The expected learning is whether CSP
reseed keeps belief alive without hiding an upstream tracker bug. Success means:

- no hard Stage A or Stage B collapses;
- CSP reseeds are occasional, not constant;
- post-reseed particles are plausible enough for annotation;
- losses point to tactical/evaluator work rather than opaque belief failure.
