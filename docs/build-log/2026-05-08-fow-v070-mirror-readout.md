# 2026-05-08 — v0.7.0 mirror bake-off readout

Comparable mirror run for Tier-1 v0.7.0 after landing CSP belief reseed and
the local Engine Lab review queue.

## Run

Command shape:

```sh
research/python-fow-lab/.venv/bin/python research/python-fow-lab/scripts/bake_off.py \
  --games 30 \
  --opponent tier1 \
  --evaluator stockfish \
  --max-particles 16 \
  --target-n 512 \
  --max-plies 300 \
  --seed 1 \
  --save-dir apps/web/public/bakeoff-v0.7.0-mirror \
  --save-only all \
  --verbose-belief
```

Artifacts:

- `apps/web/public/bakeoff-v0.7.0-mirror/manifest.json`
- `apps/web/public/bakeoff-v0.7.0-mirror/trace.jsonl`
- `apps/web/public/bakeoff-v0.7.0-mirror/belief.jsonl`
- `apps/web/public/bakeoff-v0.7.0-mirror/review_queue.md`
- `apps/web/public/bakeoff-v0.7.0-mirror/review_queue.json`

Engine-lab change SHA: `0aec624`.

Manifest SHA caveat: the manifest records `8875890` because server-track commits
advanced `main` while the bake-off process was running and `tier1_commit()` is
evaluated when the manifest is written. Those commits were server-side; the
engine-lab change under test is `0aec624`.

## Result

- Record: 12W / 18L / 0D.
- Win rate: 40.0%.
- Total plies: 1391.
- Avg Tier-1 move time: 0.79s, below the 5s gate.

Prior comparable mirrors:

- v0.6.0: 10W / 20L / 0D.
- v0.6.1: 12W / 18L / 0D.
- v0.6.2: 11W / 19L / 0D.

Strength did not regress relative to the v0.6.x mirror band, but the bake-off
was not a clean strength breakthrough.

## Belief Signals

From `trace.jsonl`:

- Rows: 1391.
- Stage-A hard collapses: 0.
- Stage-B hard collapses: 0.
- CSP reseed rows: 23.
- CSP reseed total particles: 1472.
- Low-unique rows (`belief_unique_count <= 1`): 357.

Interpretation:

- v0.7.0 achieved the primary belief-recovery goal: no hard Stage A or Stage B
  collapses in the 30-game comparable mirror.
- CSP reseed fires occasionally rather than constantly.
- Low belief diversity remains common. That is now an annotation/evaluator
  question, not a tracker-crash question.

## Review Queue

`review_queue.md` produced 30 ranked annotation targets. Top signals are mostly:

- CSP reseed followed by tactical decision paths.
- Stage-A particle drops.
- Constraint pruning around losses.
- Late king-capture windows in losses.

This is the first full local loop where a bake-off produced saved games,
decision traces, belief snapshots, and a ranked review queue.

## Next Engine Questions

1. Annotate the top 10-20 queue items before changing the engine again.
2. Separate acceptable Fog of War uncertainty from genuine tactical/evaluator
   errors.
3. If repeated queue items are "CSP reseed + implausible hidden layout", improve
   CSP priors.
4. If repeated queue items are "low diversity + bad tactical move", work on
   diversity replenishment or evaluator robustness.
5. If repeated queue items are "visible capture/king-defense path but wrong
   choice", tighten the short-circuit logic before adding more belief machinery.
