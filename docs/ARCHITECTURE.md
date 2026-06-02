# Architecture

_Last updated: 2026-06-01_

## One-line shape

Full-stack hidden-information chess platform — Vite-bundled TypeScript browser client + Node.js WebSocket server + Postgres. The Node server serves the built static client and the WebSocket on the same port; everything runs on Railway.

## Package layout

```text
packages/game          Pure game logic: types, rules, visibility, variants, tests
packages/board-render  Shared SVG/interactive board rendering primitives
apps/server            WebSocket rooms, session management, clocks, event append, HTTP API
apps/web               Browser client (Vite + vanilla TypeScript, no framework)
```

## Key abstraction

`getPlayerView(state, color)` — the central function in `packages/game`. For Fog of War it returns only the visible partial state for that player: their pieces, visible opponent pieces, legal moves, and clock. The server calls this before every outbound WebSocket message. Nothing downstream of this call touches hidden truth.

## Data flow

1. Browser creates a room via HTTP POST (`/api/rooms`). Server returns a room ID and seat token.
2. Browser opens a WebSocket connection. Server sends an initial `PlayerView` snapshot.
3. On move: browser sends a `move` message. Server validates against the canonical full state, appends a `GameEvent`, projects the new state, and broadcasts per-player `PlayerView` updates.
4. On game end: server appends a terminal event and writes one row to the `games` aggregate table.
5. Postgame: browser switches to replay mode. The `GET /api/games/:roomId/events` endpoint is public only after terminal state; pre-terminal requests are rejected or return a seat-scoped view.

## State model

- **`GameState`** — canonical server-side truth. Never serialized to clients.
- **`PlayerView`** — the per-player projection sent over WebSocket. Contains only visible squares, legal moves, and clock.
- **`GameEvent`** — an append-only log entry in Postgres `events(room_id, seq, payload JSONB)`. Full game state is deterministically reconstructable by replaying the event log.
- **`games`** — a one-row-per-finished-game aggregate table. Written at terminal projection. Used for leaderboards, ratings infra (currently hidden), and analytics.

## Packages/game internals

Key files:
- `types.ts` — `GameState`, `PlayerView`, `GameEvent`, piece and square types
- `variants.ts` — `darkChessVariant`, `draft960Variant`, and the fog visibility kernel (`fogVisibleSquares`, `fogMovesFrom`, `applyFogMove`)
- `game-specs.ts` — taxonomy for current and future hidden-information game families
- `chess960.ts` — `pickDraft960Offer(seed)` — generates a seeded offer of 3 Chess960 back-ranks
- `events.ts` — event projection: `replayGameEvents` reduces a sequence of `GameEvent`s into a `GameProjection`
- `notation.ts` — algebraic/coordinate move notation
- `clocks.ts` — clock math (`createClock`, `advanceClock`, `clockRemainingMs`)
- `time-controls.ts` — official time controls and time-class derivation
- `variants-xiangqi.ts`, `variants-shogi.ts` — non-chess rules kernels for hidden/dev/future variants

Tests live in `packages/game/src/*.test.ts`. Run with `npm test` from root or from the package directory.

## Packages/board-render internals

`packages/board-render` owns shared board rendering used by server/build/browser
surfaces: OG images, article compositions, thumbnails, and interactive article
boards. It depends on `packages/game` types but not on server runtime state.

## Server internals

Key files:
- `main.ts` — production entry point; installs shutdown handlers and starts the server
- `index.ts` — server orchestration and dependency wiring
- `server-http.ts` — HTTP entry routing, static serving, health, API dispatch, and page fallbacks
- `http-api.ts` and `routes/*` — REST endpoints split by domain
- `server-ws-connection.ts` — chess-family WebSocket connection and message handling
- `server-ws-dark-xiangqi.ts` plus `server-dark-xiangqi-*` — hidden Dark Xiangqi runtime behind explicit flags
- `server-room-lifecycle.ts` — room creation, hydration, stale-room cleanup, pause/resume handling
- `room-manager.ts` — core chess-family game loop and event append/broadcast logic
- `payloads.ts` — recipient-scoped snapshot construction and fog redaction

Server unit tests live in `apps/server/src/*.test.ts`; Postgres-backed tests
skip unless `TEST_DATABASE_URL` or `DATABASE_URL` is set. WebSocket integration
tests live under `apps/server/integration/` and use the integration harness.
Run `npm run test:persistent` for the local Postgres-backed server suite.

## Persistence

Events and games write to Postgres. In dev, `DATABASE_URL` is optional — the server falls back to in-memory rooms. Use `npm run dev:persistent` when testing anything that requires survival across a server restart.

See [`docs/persistence.md`](persistence.md) for the full schema and API surface.

## External dependencies

- Railway (Node server + static client + Postgres)
- Domain: mistboard.com

Provider choice is not load-bearing — the server is plain Node and the client is a static Vite build. Postgres is the only stateful dependency.

## Notable choices

- **Server-authoritative is non-negotiable.** Hidden-information correctness depends on it. The client never holds the canonical `GameState`. A correct Fog of War implementation must never send hidden truth to the wrong consumer.
- **Event log as source of truth.** Game state is always reconstructable by replaying the event log. This means replay, reconnect, and postgame review all share the same projection path.
- **`PlayerView` as the security boundary.** All outbound WebSocket messages and non-admin API responses go through `getPlayerView` before leaving the server. Sending raw `GameState` to a client is a security bug.
- **Variants are pluggable but Fog of War is the only flagship.** `draft960` exists in code but is a pregame configuration inside Fog of War, not a separate product surface.
