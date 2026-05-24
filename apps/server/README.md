# @mistboard/server

WebSocket game server. Handles room lifecycle, player sessions, clocks, event persistence, and the HTTP API.

## Key responsibilities

- Create and manage game rooms (in-memory or Postgres-backed)
- Enforce hidden-information: all outbound messages go through `getPlayerView` before leaving the server
- Validate moves against canonical `GameState` and append `GameEvent`s
- Serve static web client (`apps/web/dist`) and WebSocket upgrades on the same port
- HTTP API for room creation, lobby, replay, OG images

## Running locally

```bash
npm run dev              # in-memory rooms, no Postgres required
npm run dev:persistent   # Postgres-backed rooms (required for reconnect/replay testing)
```

Dev room URLs:

```text
http://localhost:3000/?room=fog-dev&reset=1&variant=dark-chess
http://localhost:3000/?room=fog-engine-dev&reset=1&variant=dark-chess&dev=engine
```

## Tests

```bash
npm test                 # in-memory harness
npm run test:persistent  # requires local Postgres (npm run db:up first)
```

Integration tests in `src/*.test.ts`. Tests that check hidden-information correctness should use `test:persistent` — the in-memory harness cannot catch DB-constraint violations or persistence bugs.

## Key files

| File | Purpose |
|------|---------|
| `index.ts` | WebSocket server, room lifecycle, message handlers |
| `http-api.ts` | REST endpoints (room creation, lobby, replay, OG images) |
| `room-manager.ts` | In-memory and Postgres-backed room store |
| `main.ts` | Entry point |

## Security invariant

A `PlayerView` — not a `GameState` — is the only thing that should ever leave the server toward a client. Any outbound path that sends full board state or hidden moves is a security bug. See [`SECURITY.md`](../../SECURITY.md).
