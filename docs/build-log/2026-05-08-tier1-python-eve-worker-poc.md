# 2026-05-08 - Tier-1 Python EvE worker POC

We built the first owner-only path for running Python research engines through
the EvE worker.

## What Changed

- Added known external engine versions:
  - `python-tier1-v0.7.0`
  - `python-random-legal`
- Added a Python whole-game subprocess runner:
  - `research/python-fow-lab/scripts/eve_game_runner.py`
- Updated the TypeScript worker runner:
  - built-in TypeScript engines still run in-process;
  - Python engines run as subprocess whole-game jobs;
  - returned move events are persisted into `events`;
  - `games`, `eve_games`, queue task state, and debug artifacts are persisted through the existing EvE schema.
- Added a `python-engine-game-summary` debug artifact for subprocess games.

The first working design is whole-game subprocess execution, not per-move IPC.
This matches the Python Tier-1 harness: it already owns belief state,
observations, Stockfish process lifecycle, clocks, and event emission.

## Tier-1 v0.7.0 Package

The local research tree later had Tier-1 `0.7.1` edits, so v0.7.0 tests used a
clean package root exported from `HEAD`.

Clean bundle:

```text
local exported Tier-1 v0.7.0 source bundle
```

SHA-256:

```text
cc07248da58fcb061a2005fcee049e4f03be634a3daaf48506e67d5a79f4ee9f
```

The package smoke verified:

- manifest engine version: `tier1-v0.7.0`
- `TIER1_VERSION`: `0.7.0`
- config hash: `b22f29dd73f5`
- engine class: `Tier1Strategy`

## Local Worker Smoke

Ran a one-game local queue/worker smoke:

- White: `python-tier1-v0.7.0`
- Black: `python-random-legal`
- Max plies: 2
- Result: completed draw by truncation
- Persisted game/events/EvE metadata and a Python summary artifact.

## Five-Game Mirror Profile

Then ran a 5-game local mirror profile:

- Job: `job_8138dd11-1dcc-4526-a224-eb357776b1ef`
- White: `python-tier1-v0.7.0`
- Black: `python-tier1-v0.7.0`
- Seed base: `2026050811`
- Max plies: 160
- Stockfish: `/opt/homebrew/bin/stockfish`
- Clean package root: local temporary smoke-test directory

| Game | Result | Termination | Plies | Wall Time | Sec/Ply |
|---:|---|---|---:|---:|---:|
| 0 | white-wins | king-captured | 25 | 24.7s | 0.987 |
| 1 | white-wins | king-captured | 23 | 25.1s | 1.091 |
| 2 | white-wins | king-captured | 21 | 70.6s | 3.360 |
| 3 | white-wins | king-captured | 27 | 30.1s | 1.116 |
| 4 | black-wins | king-captured | 32 | 44.0s | 1.375 |

Aggregate:

- 5/5 completed
- 0 failed
- 128 total plies
- 194.5s total wall time
- 38.9s/game average
- 1.52s/ply average
- median game time: 30.1s
- white won 4, black won 1

## Caveats

- The first attempted 5-game job failed because `apps/server/dist` was stale and
  did not include the Python engine registry. Rebuilding `@bichess/server` fixed
  this; the fresh job completed cleanly.
- Per-move profiling is not good enough yet. The TS worker currently persists
  Python subprocess events after the subprocess returns, so event timestamps are
  batch-time rather than true move-time.
- Production workers still need Python runtime dependencies and Stockfish
  available before `python-tier1-v0.7.0` can run there.
- This is owner-only execution. It is not a public engine-upload sandbox.

## Next Steps

- Add per-move `compute_ms` and timing/debug records from the Python harness.
- Preserve those timings into `events` or `game_debug_artifacts`.
- Decide how to package the Python runtime for production:
  - checked-in source plus venv/image setup;
  - artifact bundle;
  - dedicated container;
  - external compute provider.
- Add a production smoke once the worker image has Python, `python-chess`, and
  Stockfish.
