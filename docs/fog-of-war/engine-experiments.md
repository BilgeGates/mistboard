# Engine Experiments

Engine experiments are the generalized system behind EvE mining, bake-offs, calibration, and regression checks. EvE remains the game mode for engine-vs-engine games; the experiment layer is the provider-neutral orchestration around those games.

The local learning loop is documented in `docs/fog-of-war/engine-lab-loop.md`.
That loop governs how bake-offs become trace artifacts, annotation queues, and
next-engine hypotheses before the workflow is promoted into EvE.

## Use Cases

- Continuous mining: generate EvE games for Lab review and training data.
- Bake-offs: compare a candidate engine version against a pinned baseline.
- Calibration: estimate strength across engine versions, time controls, openings, and seeds.
- Regression checks: run a small fixed suite before promoting an engine pin.
- Burst runs: use a temporary worker provider for higher-throughput experiments.
- Debug reproduction: rerun a suspicious game from engine ids, seed, opening policy, time control, and artifacts.

## Service Boundary

The web server does not run engines. It creates jobs, exposes admin controls, and reads results.

Workers are separate stateless processes:

- local worker for development
- always-on worker for modest continuous throughput
- burst worker for temporary high-throughput experiments
- future worker providers with the same DB protocol

Postgres is the queue and source of truth. No external queue is required until we have evidence that Postgres row claiming is the bottleneck.

Current worker entrypoint:

```sh
npm run engine:enqueue-smoke
npm run worker:dev
npm run worker:dev:execute
```

By default this is a dry-run claimer: it registers a worker run, claims the next queued task if one exists, releases it without consuming an attempt, and exits. Engine execution is intentionally gated behind `--execute`.

The first execution runner is intentionally simple: `npm run worker:dev:execute` plays one claimed Fog of War game with a built-in deterministic random-legal move selector. This is a smoke path for the worker/DB lifecycle, not a production engine identity.

Owner-only Python Tier-1 identities currently registered for worker execution:

- `python-tier1-v0.7.0` - first Python subprocess proof of concept.
- `python-tier1-v0.7.22` - profiled particle-update build with terminal
  king-risk filtering.
- `python-random-legal` - Python random legal baseline.

These are not public upload slots. They are controlled engine identities used
for EvE jobs and production-adjacent smoke tests.

## Server-Side Tournament Seed

Early server-side tournaments are queued as normal EvE jobs. The command creates
a round-robin task set, alternates colors per pair, and stores the tournament
shape in `eve_jobs.config`:

```sh
npm run engine:enqueue-tournament -- \
  --engines builtin-capture-seeker,builtin-random-legal,python-tier1-v0.7.22 \
  --games-per-pair 2 \
  --time-control 10+2 \
  --opening random-first-4 \
  --providers local,railway
```

`--time-control` accepts `none` or `initial+increment` in seconds. Standard
time controls are copied onto each task and replay clock events. In-process
worker games enforce timeout from the engine's reported `thinkTimeMs`; Python
whole-game workers receive the same policy and enforce it inside the Python
harness.

Workers write an `engine-runtime-summary` debug artifact per completed task with
runner, engine pair, wall time, total reported think time, ply count, and
plies/second. `npm run engine:queue-status` summarizes those artifacts by
runner and engine pair so early cloud throughput experiments can compare worker
providers without a separate metrics service.

After workers have completed games, the tournament status command derives
standings from canonical EvE game rows:

```sh
npm run engine:tournament-status -- --job <job_id>
npm run engine:tournament-status -- --tournament-id <tournament_id> --format markdown
```

With no filter it reports the newest tournament-shaped EvE job. This is still
an operational report, not a public leaderboard.

## Data Model

`eve_jobs` is the experiment/job row. It describes intent: mining, bake-off, calibration, smoke, or regression.

`engine_game_tasks` is the schedulable unit. A task can sit in `queued` state before a canonical game exists. When a worker claims it, the worker creates or links the `games` row, appends normal events, and finishes the task.

`games` and `events` stay canonical. A completed EvE game should be inspectable the same way as a PvP or PvE game.

`eve_games` remains the EvE-specific output metadata table. It links a produced game to the EvE job, seed, engine identities, and task id.

`engine_worker_runs` records worker-provider runs and heartbeats. This makes local, always-on, and burst workers observable without changing task semantics.

## Job Config Shape

Use `eve_jobs.config` for experiment-level policy:

```json
{
  "pairing": {
    "kind": "baseline-vs-candidate",
    "baseline_engine_id": "tier1-v0.6.3",
    "candidate_engine_id": "tier1-v0.6.4",
    "color_policy": "mirrored"
  },
  "time_control": {
    "kind": "per-move",
    "milliseconds": 500
  },
  "opening_policy": {
    "kind": "seeded-random",
    "mirror_pairs": true
  },
  "sample": {
    "target_games": 100,
    "max_failures": 10
  },
  "resource_policy": {
    "providers": ["always-on", "burst"],
    "concurrency": 4,
    "cpu": "shared-1",
    "memory_mb": 1024
  },
  "artifact_policy": {
    "belief_snapshots": false,
    "engine_logs": "on-failure"
  },
  "review_policy": {
    "enqueue_engine_lab": true,
    "initial_review_status": "unreviewed"
  }
}
```

Task rows materialize the parts that need scheduling or querying: assigned engines, seed, time control, opening policy, artifact policy, resource policy, priority, attempts, provider, and worker run.

## Claim Protocol

Workers claim work with row locks:

```sql
SELECT id
FROM engine_game_tasks
WHERE status = 'queued'
  AND scheduled_at <= now()
ORDER BY priority DESC, scheduled_at, created_at
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

Within the same transaction, the worker marks the task `running`, records provider metadata, increments `attempt_count`, sets a claim expiry, and links its `engine_worker_runs.id`.

After claim:

1. Create the canonical `games` row with `mode = 'eve'` and `status = 'running'`.
2. Link `engine_game_tasks.game_id`.
3. Run the engines under the task time/resource policies.
4. Append normal game events.
5. Update `games` to `completed` or `aborted`.
6. Update the task to `completed`, `failed`, or `aborted`.
7. Update `eve_jobs.completed_games` or `eve_jobs.failed_games`.

## Failure Semantics

Infrastructure interruption is not a game result. If a worker disappears, its running task can be retried while `attempt_count < max_attempts`, or marked `aborted` when the retry budget is exhausted. Any linked running game should be marked `aborted` with a non-scoring termination such as `worker-aborted` or `server-restarted`.

Engine failure is a game result when the worker stayed healthy and the engine violated the protocol, crashed, or exceeded its fair budget. Those games can complete with `termination = 'engine-failure'` or `termination = 'timeout'`.

## Provider Scaling

All worker providers should run the same worker code. Provider differences live in metadata and resource policy:

- `engine_worker_runs.provider`
- `engine_worker_runs.provider_run_id`
- `engine_game_tasks.provider`
- `engine_game_tasks.provider_run_id`
- `resource_policy`

This lets the scheduler ask for throughput without hardcoding a provider into the game model. A burst launcher can insert or claim the same tasks as an always-on worker; the worker binary should not need provider-specific game logic.

Specific services such as Railway, Modal, or similar platforms are deployment examples. Account setup, live topology, deploy triggers, private networking, and incident operations belong outside this public design note.

## Near-Term Build Order

1. Add the experiment task schema.
2. Add server-side helpers for creating jobs and materializing tasks.
3. Add a local worker command that claims one task and exits.
4. Add stale-running-task cleanup and retry handling.
5. Wire the admin-gated Lab surface to query completed EvE games by `review_status`.
6. Add always-on worker deployment.
7. Add burst-worker launcher once local and always-on semantics are stable.
