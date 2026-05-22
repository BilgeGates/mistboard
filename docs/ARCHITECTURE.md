# Architecture

_Last updated: 2026-05-15_

## One-line shape

Full-stack hidden-information chess platform — Next.js web client + Node.js WebSocket server + Postgres, deployed to Railway (server) and Vercel (web).

## Package layout

```text
packages/game          Pure game logic: types, rules, visibility, variants, tests
apps/server            WebSocket rooms, session management, clocks, event append, HTTP API
apps/web               Board UI, game screens, client WebSocket handling (Next.js App Router)
research/python-fow-lab  Offline Python sidecar for visibility/bot/inference experiments — not shipped
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
- `visibility.ts` — Fog of War visibility computation from `GameState`
- `variants.ts` — `fogOfWarVariant`, `draft960Variant`; each exposes `applyMove` and `createInitialState`
- `chess960.ts` — `pickDraft960Offer(seed)` — generates a seeded offer of 3 Chess960 back-ranks
- `events.ts` — event projection logic: turns a sequence of `GameEvent`s into a `GameState`

Tests live in `packages/game/src/*.test.ts`. Run with `npm test` from root or from the package directory.

## Server internals

Key files:
- `index.ts` — WebSocket server, room lifecycle, message handlers
- `http-api.ts` — REST endpoints (room creation, lobby, replay, OG images)
- `room-manager.ts` — in-memory and Postgres-backed room store
- `variants.ts` — server-side variant dispatch
- `main.ts` — entry point; splits HTTP and WebSocket handling

Server integration tests in `apps/server/src/*.test.ts` use an in-memory harness by default. Run `npm run test:persistent` for tests against a real Postgres instance.

## Persistence

Events and games write to Postgres. In dev, `DATABASE_URL` is optional — the server falls back to in-memory rooms. Use `npm run dev:persistent` when testing anything that requires survival across a server restart.

See [`docs/persistence.md`](persistence.md) for the full schema and API surface.

## External dependencies

- Railway (server hosting)
- Vercel (web hosting)
- Postgres (Neon / Supabase / Railway Postgres)
- Domain: mistboard.com

## Notable choices

- **Server-authoritative is non-negotiable.** Hidden-information correctness depends on it. The client never holds the canonical `GameState`. A correct Fog of War implementation must never send hidden truth to the wrong consumer.
- **Event log as source of truth.** Game state is always reconstructable by replaying the event log. This means replay, reconnect, and postgame review all share the same projection path.
- **`PlayerView` as the security boundary.** All outbound WebSocket messages and non-admin API responses go through `getPlayerView` before leaving the server. Sending raw `GameState` to a client is a security bug.
- **Variants are pluggable but Fog of War is the only flagship.** `draft960` exists in code but is a pregame configuration inside Fog of War, not a separate product surface.
