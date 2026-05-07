# Persistence

How bichess stores game state across server restarts.

Until M6 / Phase E, `apps/server` kept everything in `rooms: Map<string, Room>` in process memory. Restart = total loss. This doc describes the move to Postgres-backed persistence and the related transition to running `apps/server` in prod (replacing today's static-only deploy).

## Goals

In priority order:

1. **Replay URLs survive restart.** A finished game's URL keeps working across redeploys.
2. **Mid-game reconnect across restart.** A live game survives a server crash or redeploy as long as both clients reconnect.
3. **Phase E corpus capture.** Human-vs-bot games persist in a queryable form the engine work can consume offline.
4. **Cross-game queries.** Foundation for PL3 ladder (Elo, head-to-head, per-engine stats) without retrofitting the storage layer.

## Non-goals (v1)

- Multi-instance WS scale-out. Single Node process is the assumption.
- Multi-region replication. Single-region Postgres on Railway.
- Real-time analytics / OLAP. Standard transactional Postgres only.
- User accounts, registered identities. v1 stays anonymous + link-based.

## Storage model

Two tables. Events are the source of truth; `games` is a derived aggregate updated on game-end.

### `events`

Append-only log. One row per `GameEvent`.

```sql
CREATE TABLE events (
  room_id    TEXT        NOT NULL,
  seq        INTEGER     NOT NULL,
  type       TEXT        NOT NULL,
  payload    JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, seq)
);

CREATE INDEX events_created_at_idx ON events (created_at);
```

- `payload` stores the full `GameEvent` object, including `type` (denormalized into the column for indexed type filtering).
- `seq` is per-room, starting at 0 with `room-created`.
- No FK to `games` — events stand alone, `games` is a projection convenience.

### `games`

Aggregate row updated when a game terminates (king capture, clock expiry, resignation later). One row per finished room.

```sql
CREATE TABLE games (
  room_id        TEXT        PRIMARY KEY,
  variant        TEXT        NOT NULL,
  result         TEXT        NOT NULL,    -- 'white-wins' | 'black-wins' | 'draw' | 'aborted'
  termination    TEXT        NOT NULL,    -- 'king-capture' | 'clock-expiry' | ...
  ply_count      INTEGER     NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL,
  ended_at       TIMESTAMPTZ NOT NULL,
  white_client   TEXT,
  black_client   TEXT
);

CREATE INDEX games_ended_at_idx ON games (ended_at DESC);
CREATE INDEX games_variant_idx  ON games (variant);
```

Pre-PL3, this table is light. PL3 adds engine identity columns; PL3 leaderboards read from `games` joined with a future `ratings` table.

## API surface (apps/server)

```ts
// apps/server/src/persistence.ts

export async function loadRoom(roomId: string): Promise<GameEvent[] | null>;
export async function appendEvent(roomId: string, seq: number, event: GameEvent): Promise<void>;
export async function listActiveRoomIds(since: Date): Promise<string[]>;
export async function recordGameEnd(roomId: string, summary: GameSummary): Promise<void>;
```

Wire-up:

- `getOrCreateRoom(roomId)` first calls `loadRoom`. If non-null, rehydrate via `replayGameEvents` and skip the synthetic `room-created` event.
- `appendEvent` (existing in-memory function) gains an `await persistence.appendEvent(...)` before the broadcast. Synchronous insert per event — Postgres handles dozens-of-rooms × low-frequency moves trivially.
- On terminal game state in `appendEvent`'s post-projection check, call `recordGameEnd`.

## Hosting

**Railway Postgres plugin.** One-click provision, injects `DATABASE_URL` as a service-scoped env var. Same Railway project as the bichess service; private network connection (no egress, no TLS overhead in-cluster).

- Plan: starter plan, scales storage and connections as needed.
- Region: same as the WS service.
- Connection pooling: `pg.Pool` with low max (5–10) is sufficient for v1; PgBouncer becomes a question only if WS instance count rises above 1 (which it shouldn't for this roadmap).

Env:

- `DATABASE_URL` — required in prod, set automatically by the plugin.
- `DATABASE_URL` in dev — optional; if absent, `apps/server` falls back to in-memory rooms (current behavior, useful for quick local iteration without a DB running).

Local dev DB: `docker compose up postgres` (compose file added alongside this work) or any local Postgres. Migrations run via a tiny in-repo script — no ORM, no migration framework. Schema is two tables; raw SQL files in `apps/server/migrations/` applied in order.

## Apps/server in prod (the deploy transition)

Today: `nixpacks.toml` runs `npm start` → `serve apps/web/dist`. apps/server is built but not run.

After this work: `npm start` → `node apps/server/dist/index.js`, which serves both:

- Static `apps/web/dist/*` over HTTP from the same `$PORT`.
- WebSocket upgrades on the same port.

This is the path the build log already telegraphed ("when phase E lands, apps/server takes over and serves both static + WebSocket on the same port"). Persistence forces the issue because there's no point persisting events from a server that doesn't run in prod.

Concrete server changes:

- Add a static-file handler (e.g., `serve-handler` or hand-rolled `fs.createReadStream`) wired into the existing `createServer` in `apps/server/src/index.ts`.
- Keep the existing JSON `{ ok: true, service: 'bichess-server' }` response for `/health` only.
- Build pipeline: `npm run build` must produce `apps/web/dist` before `apps/server` starts (already true today).

## Rollout

1. Provision Railway Postgres plugin (user, dashboard).
2. Land schema + migration runner; commit migrations to repo.
3. Land `persistence.ts` + tests behind a `DATABASE_URL`-present check (no behavior change when unset).
4. Land server wire-up (hydration + write-through). Deploy to a Railway preview environment first; verify cold-restart preserves a finished game.
5. Land `apps/server` static-serving + flip `nixpacks.toml` to run apps/server. Single deploy that swaps prod posture.
6. Smoke-test bichess.org: landing still loads, replay URLs work, can create a room and finish a game, redeploy, replay URL still works.

Each step is a separate PR / commit. Steps 1–5 can land while prod stays static-only (no user-visible change). Step 5 is the cutover.

## Write ordering: persist-then-apply

```ts
async function appendEvent(room, event) {
  const seq = room.events.length;
  await persistence.appendEvent(room.id, seq, event);  // throws on failure
  room.events.push(event);
  room.projection = replayGameEvents(room.events);
  scheduleClockTimeout(room);
}
```

Postgres write goes first. If it fails, in-memory state never changes; the move (or seat assignment, or clock tick) effectively did not happen. The caller decides how to surface the failure to clients. State drift between memory and DB is impossible by construction — they either both have the event or neither does.

The cost is ~5–20ms of Postgres roundtrip per event. At chess pacing this is invisible. If write back-pressure ever shows up under bot traffic, batching is the answer (see "Future: batched writes" below).

## Crash semantics

- **Per-event durable.** `appendEvent` awaits the Postgres insert before the broadcast. A crash mid-write either commits the row or doesn't — no partial state.
- **Hydration is deterministic.** `replayGameEvents(events)` is pure; rehydrating produces the same `GameProjection` regardless of when the crash happened.
- **Clock state.** `clock-expired` is itself an event — if the server crashes mid-tick, on rehydration the next `scheduleClockTimeout` will detect already-expired clocks and emit the event then. No clock drift across restarts beyond the redeploy window itself, which is acceptable for v1 (testers reconnect, see expected state).

## Failure handling

The dangerous failure mode is silent: Postgres degrades, writes start failing, and games keep playing in memory while users believe their moves are persisted. Every defense is built around making that scenario impossible.

**Persist-then-apply ordering** is the structural defense (above). The rest is observability and surfacing.

- **Loud structured logs.** On every persistence failure, emit a single-line JSON log to stdout:
  ```
  console.error(JSON.stringify({
    level: 'error',
    kind: 'persistence_failure',
    roomId, seq, eventType: event.type,
    error: err.message,
    at: Date.now(),
  }));
  ```
  Railway captures stdout. Future alerting (Logtail / Better Stack / etc.) hooks `kind: persistence_failure`.

- **Don't swallow.** Errors propagate up to the WS message handler, which:
  1. Skips the broadcast (in-memory state was never updated, so there's nothing consistent to broadcast).
  2. Sends `{ type: 'error', reason: 'persistence_failure' }` to the originating client.
  3. The client surfaces a toast or "reconnecting" indicator and may retry the move.

- **Health endpoint surfaces recent failures.**
  ```
  GET /health
  → 200 { ok: true, persistenceErrors: { count1m: 0, lastAt: null } }
  → 503 { ok: false, persistenceErrors: { count1m: 4, lastAt: 1714... } }
  ```
  Railway can be configured to alert on 503s; this gives operational visibility without standing up Prometheus.

- **No silent retries in v1.** Retry logic adds complexity ahead of evidence. We'd rather see real failure modes first and design retries around what actually breaks.

The combination — persist-then-apply + loud logs + non-200 health on recent failures — means a degrading Postgres can't go unnoticed. Either every move starts visibly failing for clients, or operators see the 503 / log spike, or both.

## Future: batched writes

Synchronous per-event inserts are fine through PL2. The pressure point will likely be PL3 ladder traffic with multiple bots playing concurrently — Postgres write throughput per connection becomes the ceiling, not Postgres itself.

When that arrives, the change is to a per-room write queue with a debounce (e.g., 50ms) that flushes a batch insert. Crash semantics shift slightly: a crash within the debounce window can lose up to N events. The mitigation is to flush synchronously at game-end (`king-capture`, `clock-expired`) and at any event the WS handler doesn't explicitly mark as batchable. Mid-game move events are batchable; terminal events aren't.

Not building this yet, but the persist-then-apply API surface is forward-compatible: `persistence.appendEvent` becomes "enqueue and resolve when flushed" rather than "insert and resolve."

## Migration & data model evolution

- New `GameEvent` variants: payload-only changes, no DDL.
- Renaming or restructuring an existing event: keep the old shape readable. The `replayGameEvents` reducer is the single chokepoint that needs to handle both.
- Backfill: if a payload format changes, write a one-shot script that reads + rewrites JSONB rows. Don't add migration framework ceremony for this.

## Cold archival (PL2+, not now)

Once the corpus pipeline matures, finished games dump to R2/S3 as NDJSON nightly:

```
SELECT payload FROM events
WHERE room_id IN (SELECT room_id FROM games WHERE ended_at::date = $1)
ORDER BY room_id, seq
```

Lab corpus consumers continue to read NDJSON. Live server doesn't depend on the archive.

## Open questions

- **Pregame-abandoned rooms.** A room created but never moved past `room-created` clutters `events`. Lean: GC rows older than 7 days where `seq` never exceeded a threshold. Cron, not v1.
- **Spectator semantics across restart.** Spectator state is connection-only, not persisted. After restart, spectators reconnect and see live state via fresh `PlayerView` snapshots. No data persistence concern.
- **Schema versioning.** Skipped intentionally. Two tables, JSONB payload — versioning happens at the application layer when reading payloads.
