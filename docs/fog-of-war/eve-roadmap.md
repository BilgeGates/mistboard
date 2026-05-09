# EvE Roadmap

EvE is the server-side engine-vs-engine lane for mining games, calibrating engine changes, and feeding the Engine Lab review workflow.

## Storage Direction

Use one canonical game store:

- `events` remains the append-only replay truth for every game mode.
- `games` is the one-row aggregate for PvP, PvE, EvE, imported, and manual games.
- `games.mode` tells us where a game came from: `pvp`, `pve`, `eve`, `imported`, or `manual`.
- `games.status` separates `running`, `completed`, and `aborted` games.
- `games.review_status` lets Engine Lab build an annotation queue without inventing a separate game table.

Only add side tables when the shape is genuinely different. EvE has different lifecycle and scheduling data, so it gets side tables:

- `engine_versions` stores pinned engine identities, config hashes, and play signatures.
- `eve_jobs` stores mining/calibration batches and their progress.
- `engine_game_tasks` stores provider-neutral queued/running/completed game work.
- `engine_worker_runs` stores local, always-on, burst, or future worker heartbeats.
- `eve_games` links a canonical game row to an EvE job, task, engines, seed, time control, and worker metadata.
- `game_debug_artifacts` stores optional per-game/per-ply debug blobs or object-store URIs.

The broader experiment design lives in `docs/fog-of-war/engine-experiments.md`.

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

Create an `engine_game_tasks` row first. It can remain `queued` without creating a canonical game row. When a worker claims the task, create the `games` row with `mode = 'eve'` and `status = 'running'`. Append game events normally. On terminal game state, update the row to `status = 'completed'`, set `result`, `termination`, `ended_at`, and final `ply_count`.

If the worker aborts for infrastructure reasons, update the row to `status = 'aborted'`, keep `result = NULL`, set a non-scoring `termination`, and leave the events available for debugging.

## Annotations

Engine Lab annotations are first-class state, not a debug artifact. Local development has been accumulating them as `research/python-fow-lab/feedback/annotations.jsonl`; by the time EvE ships in production, that history should be preserved as reviewed training and evaluation data rather than treated as a disposable local file.

Migrate as a real table — at minimum:

- `annotations` keyed by `game_room_id` + `ply` (FK into `games.room_id`).
- Fields: `severity` (major/minor/good/neutral), `note`, optional `suggested_move_uci`, optional `tags` array, `engine_version` snapshot at annotation time, `created_at`, `created_by`.
- Engine version is denormalized intentionally — annotations are about a specific bot's specific decision; engine version is part of the annotation's primary content, not a join field.

Do not re-derive annotations from the JSONL on each migration run. Backfill once at cutover, then JSONL becomes read-only history.

## Verbose Belief Capture

The Engine Lab belief debug workflow (see `docs/fog-of-war/engine-lab-loop.md`)
uses `--verbose-belief` capture for per-ply marginal piece occupancy + top-K
particle clusters. In production EvE this lives at the **job** level, not the
engine level:

- `eve_jobs.config` JSON includes `verbose_belief: true` when the operator wants belief snapshots.
- The worker reads the flag, configures Tier-1 with `verbose_belief_capture=True`, and on each ply persists one row to `game_debug_artifacts` with `kind = 'belief-snapshot'` and the marginal+top-K payload.
- Engine identity does NOT change with the verbose flag — same `engine_versions` row, same play signature. The flag is operational telemetry, not bot identity.

Pre-deciding this prevents a class of bugs where verbose-belief variants of the same engine accumulate as distinct identities and fragment the Elo pool.

## Build Order

1. Land the schema foundation.
2. Land the provider-neutral experiment task schema.
3. Add read-only Engine Lab queue APIs over `games` filtered by `mode` and `review_status`.
4. Add a single-game EvE worker that claims one task and records one game end to end.
5. Add startup cleanup that aborts stale running EvE games owned by the worker.
6. Add batch `eve_jobs` scheduling and progress accounting.
7. Add the `annotations` table + JSONL backfill at cutover.
8. Add `verbose_belief` job-config flag + `game_debug_artifacts` writes.
