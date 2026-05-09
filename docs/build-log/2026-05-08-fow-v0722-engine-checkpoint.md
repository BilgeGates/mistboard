# 2026-05-08 - Tier-1 v0.7.22 engine checkpoint

This checkpoint closes the current engine-track iteration and prepares the work
for handoff back to `main`.

## Shipped Locally

Tier-1 advanced from the v0.7.x belief-recovery line into v0.7.22:

- v0.7.17 tightened exact visible-piece facts and their expiry.
- v0.7.18 changed resampling to preserve unique particles instead of padding
  duplicates.
- v0.7.19 added Stage-A near-collapse repair supplementation.
- v0.7.20 added Stage-B near-collapse repair supplementation.
- v0.7.21 added profiling counters and two hot-path cost optimizations.
- v0.7.22 added decision-audit traces and tightened immediate king-risk
  consumption.

The biggest behavioral change is v0.7.22: immediate king-capture risk is now
treated as terminal risk. If more than 5% of supporting particles say a move
leaves the king capturable on the next opponent move, the strategy filters that
move when safer alternatives exist.

## Particle Engine Learnings

Raising `target_n` helped only after repair paths could actually spend the
larger budget. Once Stage A and Stage B learned to supplement near-collapsed
survivor sets, target-256 runs carried much healthier diversity.

The cost profile then became visible:

- Stage B expansion is the steady bottleneck.
- Stage B repair is spiky and can dominate individual rows.
- Generic CSP reseed should remain rare; when it fires, it is still a review
  target because it can scramble previously good hidden-piece tracks.

The profiling instrumentation now records Stage A/B elapsed time, filter/expand
time, repair time, CSP time, resample time, expanded candidate counts,
full-observation check counts, and rejection counts. The belief panel and
review queue both surface those fields.

## Decision Engine Learnings

The g18/g20 annotations and audits separated belief quality from decision
quality. Several losses were not obvious belief contradictions: the particles
had enough signal, but the move selector tolerated low-probability terminal
king-capture lines or skipped visible material opportunities.

Decision-audit trace fields now record:

- chosen piece/value;
- chosen visible capture value;
- best visible capture/value;
- missed visible capture value;
- chosen move immediate king-capture risk;
- chosen move immediate piece-capture risk.

The review queue ranks missed visible captures and chosen-move risk alongside
belief collapse and profiling rows.

## Validation

Core checks:

- `research/python-fow-lab/.venv/bin/pytest -q` - 106 passed.
- `npm run build` - passed.
- `git diff --check` - passed.

Targeted v0.7.22 validation:

- v0.7.21 same-seed g20: Tier-1 lost in 150 plies.
- v0.7.22 same-seed g20: Tier-1 won in 117 plies.
- Hard-fact check on the v0.7.22 artifact: 0 violations.
- CSP reseeds in that artifact: 0.

Artifact:

```text
apps/web/public/bakeoff-v0.7.22-g20-king-risk/
```

Review link:

```text
http://localhost:3000/?bakeoff=/bakeoff-v0.7.22-g20-king-risk/manifest.json&game=20&ply=117&capture=belief&beliefSeat=tier1_a&beliefKind=decision
```

## Production Readiness

The product worker registry now includes:

```text
python-tier1-v0.7.22
```

This is still owner-only Python subprocess execution. Production workers need
the Python lab runtime, `python-chess`, and Stockfish available. The packaged
engine pin is suitable for archive/replay/tournament loading; the current
worker path still runs the checked-in Python source.

Pinned engine snapshots:

```text
research/python-fow-lab/engine_versions/v0.7.22-king-risk@5d3ddffa74f6/
research/python-fow-lab/engine_versions/v2-baseline@4c93543bb9f7/
```

Zip archives:

```text
research/python-fow-lab/engine_versions/archives/v0.7.22-king-risk@5d3ddffa74f6.zip
sha256 369e7e5a669b95cd8fe6d2fa6ec6e1741ea97567a8703d3bc494d8ed9b0395f4

research/python-fow-lab/engine_versions/archives/v2-baseline@4c93543bb9f7.zip
sha256 516034d4405562b14149e13bea283f3fa7cda34e7043f2b81e0b5c939fb75f46
```

## Next Session

Recommended next loop:

1. Run a 3-game v0.7.22 rung.
2. Hard-fact check it.
3. Review only the top queue rows for:
   - missed visible captures;
   - chosen-piece risk;
   - expensive Stage-B repair;
   - high Stage-B expansion.
4. If no hard belief contradictions appear, continue improving decision
   consumption before raising `target_n` again.
