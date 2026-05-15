# Intermittent prod-smoke 500s from stale node-postgres pool connections

**Date:** 2026-05-15
**Status:** resolved
**Severity:** sev3 (internal only — CI pipeline blocked, no user-visible gameplay impact)

## What happened

The `prod-smoke` CI job started failing intermittently on `POST /api/rooms`, returning `500 {"error":"internal_error"}`. The failure began with the deployment of `e922782` (Leaderboard: per-bucket Elo) and persisted across 4 of the next 6 CI runs, with no consistent relationship to what code the commits actually changed.

The failure pattern was highly consistent when tested directly against production: **the first request of every test session failed with 500; all subsequent requests in the same session succeeded.** This is the diagnostic signature of a stale socket in the connection pool.

### Root cause

Railway Postgres closes idle TCP connections without notifying the client. The `node-postgres` pool had no `keepAlive` and no `idleTimeoutMillis`, so connections could sit idle in the pool after Railway's TCP timeout elapsed. When the pool next handed one of these dead sockets to a query, the first `getPool().query(...)` call failed with a connection error. The pool then discarded the connection and created a fresh one; all subsequent requests succeeded.

The `/health` endpoint made this invisible to Railway. It checked only `persistence.isInitialized()` — a boolean flag set at startup — and the `persistenceErrors` array, which is only populated from the WebSocket handler path. A broken pool connection on the HTTP path recorded no persistence error and set no flag. Railway saw `{"ok":true}` and kept routing traffic to the degraded instance.

The CI `prod-smoke` job fired the `/api/rooms` request immediately after the health check passed. On deployments where the pool had a stale connection, that first request hit the dead socket and returned 500, failing the CI run.

### Why the Paperclip agent couldn't address it

The CI failure was filed as GitHub issue #2. The Paperclip agent monitors the Paperclip board, not GitHub issues, so it never saw the task. Even if it had, the observable error was only `{"error":"internal_error"}` — the actual DB connection error is only visible in Railway logs, which the agent cannot access. The code path looked correct at a static read.

## Detection

Noticed by the owner manually after 4 consecutive CI failures across commits that included frontend-only changes (which couldn't plausibly introduce a room-creation bug). Confirmed via direct curl against production:

```
Attempt 1: HTTP_STATUS:500   ← dead socket
Attempt 2: HTTP_STATUS:201   ← fresh connection after pool discards the broken one
Attempt 3–8: HTTP_STATUS:201
```

## Impact

- `prod-smoke` CI job failed on 4 consecutive pushes to `main`.
- GitHub issue #2 (`ci-failure` label) accumulated 4 comments without resolution.
- No user-visible impact — the pool recovered after the first failed request, and real user traffic almost never hits this because user sessions issue several requests in sequence.

## Fix (677e9ff)

Three layers:

**1. Pool configuration** (`apps/server/src/persistence.ts`)

```typescript
pool = new pg.Pool({
  connectionString,
  max: 10,
  keepAlive: true,                    // TCP keep-alive packets prevent OS from marking sockets dead
  keepAliveInitialDelayMillis: 10_000,
  idleTimeoutMillis: 30_000,          // pool closes idle connections before Railway does (~60s)
});
```

**2. Health probe** (`apps/server/src/index.ts`)

The `/health` endpoint now issues an actual `SELECT 1` before reporting `ok: true`:

```typescript
const dbReachable = databaseRequired ? await persistence.probeDb() : true;
const ok = recent.length === 0 && dbReachable;
```

`probeDb()` is a new export on `persistence` that wraps `pool.query('SELECT 1')` in a try/catch and returns a boolean. With this change, Railway can detect a degraded instance (dead pool connections) and route away from it or restart it.

A bonus effect: the `SELECT 1` probe fires on every Railway health check interval (~10s), keeping at least one pool connection active and preventing it from going idle in the first place.

**3. Smoke test retry** (`scripts/prod-smoke.mjs`)

`createRoom` now retries up to 3 times with a 2-second gap before failing the CI run. This covers the window between a new Railway deploy going live and the `keepAlive` fix propagating to any existing instance:

```javascript
for (let attempt = 1; attempt <= 3; attempt += 1) {
  const response = await fetchJson(...);
  if (response.status === 201) return response.body;
  if (attempt < 3) await new Promise((r) => setTimeout(r, 2_000));
}
throw lastError;
```

## Learnings

See: `docs/learnings/` — health check must probe the DB, not just check a flag; pool keep-alive and idle timeout are not optional in a Railway-hosted node-postgres setup.
