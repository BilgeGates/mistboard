# 2026-05-10 - Production Tier-1 EvE Sample

## Summary

A one-game production EvE sample ran successfully between the two current
owner-operated Tier-1 engine pins under the standard engine time control.

The sample verified that production can enqueue a small tournament job, have
the Railway engine worker claim it, execute a Python subprocess game, persist
canonical events, write runtime artifacts, and expose the completed game through
the public replay API.

## Run

Command shape, executed inside the Railway `engine-worker` service container:

```sh
npm --workspace=@mistboard/server run engine:enqueue-tournament -- \
  --engines python-tier1-v0.8.9,python-tier1-v0.7.22 \
  --games-per-pair 1 \
  --time-control standard \
  --opening standard \
  --providers railway \
  --max-plies 160 \
  --tournament-id prod-top-tier1-3plus2-20260510-1028z \
  --created-by codex-prod-sample
```

`standard` resolved to 180 seconds plus a 2 second increment.

## Result

- Job: `job_a538c31b-66fd-47d7-9e15-c5a6d5023631`
- Task: `task_f24a704c-d0be-41a4-819e-151bd57f15fc`
- Game: `eve_task_f24a704c-d0be-41a4-819e-151bd57f15fc`
- Replay page: `/game/eve_task_f24a704c-d0be-41a4-819e-151bd57f15fc`
- White: `python-tier1-v0.8.9`
- Black: `python-tier1-v0.7.22`
- Result: White won by `king-captured`
- Length: 127 plies
- Runtime: 288,741 ms
- Throughput: 0.440 plies/sec
- Artifacts: one `engine-runtime-summary` and one
  `python-engine-game-summary`

The tournament report showed `python-tier1-v0.8.9` at 1-0-0 and
`python-tier1-v0.7.22` at 0-1-0 for this sample.

## Validation

Production queue status showed the job completed with one completed task and no
failed tasks. The public game summary endpoint returned a completed EvE game
with public participants, the expected 180+2 time control, and terminal
`king-captured` result. The public events endpoint returned the persisted event
history for replay.

## Caveats / Next Steps

Local `railway run` is not sufficient for DB-backed production commands when
`DATABASE_URL` points at Railway's private Postgres host. Use `railway ssh` to
run queue and tournament commands inside the target service container.

The always-on worker heartbeat is not updated while the TypeScript worker is
blocked waiting for a whole-game Python subprocess. During this 4m49s game, the
task remained correctly claimed and eventually completed, but queue status
temporarily omitted the worker from `activeWorkers`. Long-running Python games
need either subprocess progress heartbeats or worker-side polling so production
status does not look stale while a valid game is still computing.
