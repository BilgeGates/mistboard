# EvE Roadmap

EvE is the server-side engine-vs-engine lane for mining games, calibrating engine changes, and feeding the Engine Lab review workflow.

## Storage Direction

Use one canonical game store:

- `events` remains the append-only replay truth for every game mode.
- `games` is the one-row aggregate for PvP, PvE, EvE, imported, and manual games.
- `games.mode` tells us where a game came from: `pvp`, `pve`, `eve`, `imported`, or `manual`.
- `games.status` separates `running`, `completed`, and `aborted` games.
- `games.review_status` lets Engine Lab build an annotation queue without inventing a separate game table.

Only add side tables when the shape is genuinely different. EvE has different lifecycle data, so it gets side tables:

- `engine_versions` stores pinned engine identities, config hashes, and play signatures.
- `eve_jobs` stores mining/calibration batches and their progress.
- `eve_games` links a canonical game row to an EvE job, engines, seed, time control, and worker metadata.
- `game_debug_artifacts` stores optional per-game/per-ply debug blobs or object-store URIs.

## Restart Semantics

Server or worker restarts should not become forfeits. Any EvE game still marked `running` when a worker claims startup ownership should be marked `aborted` with a non-scoring termination such as `server-restarted` or `worker-aborted`.

Engine-caused failures are different. If an engine crashes, times out, or produces invalid output under a fair time budget, that can be recorded as a completed scored game with `termination = 'engine-failure'` or `termination = 'timeout'`.

## Fair Compute

Run EvE games outside the request path in a worker process. Start with one game per worker so both engines get comparable wall-clock budgets and the web server stays responsive.

For each move:

- Spawn or reuse the pinned engine implementation for each side.
- Give both sides the same time-control policy and wall-clock accounting.
- Persist engine identity via `engine_versions`, not display names.
- Store deterministic seeds and opening policy in `eve_games` so suspect games can be reproduced.

## Save Flow

Create the `games` row at game start with `mode = 'eve'` and `status = 'running'`. Append game events normally. On terminal game state, update the row to `status = 'completed'`, set `result`, `termination`, `ended_at`, and final `ply_count`.

If the worker aborts for infrastructure reasons, update the row to `status = 'aborted'`, keep `result = NULL`, set a non-scoring `termination`, and leave the events available for debugging.

## Build Order

1. Land the schema foundation.
2. Add read-only Engine Lab queue APIs over `games` filtered by `mode` and `review_status`.
3. Add a single-game EvE worker that records one game end to end.
4. Add startup cleanup that aborts stale running EvE games owned by the worker.
5. Add batch `eve_jobs` scheduling and progress accounting.
