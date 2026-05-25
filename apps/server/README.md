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

## Live engine service

Live PvE sends first-party Python engine turns to an internal engine-worker
HTTP service. The web/server process builds the redacted `EngineTurnRequest`
and POSTs it to `MISTBOARD_INTERNAL_ENGINE_URL`; both sides must share
`MISTBOARD_INTERNAL_ENGINE_TOKEN`. Before creating a Python-engine PvE room,
web reserves a live engine seat with engine-worker. Turns must carry that
reservation id, and game end releases it. If engine-worker is at capacity,
room creation returns `engine_busy` instead of starting a game that cannot
receive honest engine moves.

On Railway, set `MISTBOARD_INTERNAL_ENGINE_URL` on web to the engine-worker
private domain with the service port, e.g. `http://<engine-worker-private-domain>:3001`.
The engine-worker HTTP listener binds to `::` by default for Railway private
networking and can be overridden with `MISTBOARD_ENGINE_SERVICE_HOST`.

If that service is missing or unhealthy, Python-engine turns fail closed and
are logged instead of being masked by a random local move under the engine's
identity.

The engine-worker service keeps the warm Python pool. `MISTBOARD_PYTHON_POOL_SIZE`
caps concurrent live engine requests there; when unset, the HTTP service starts
with 4 workers. `MISTBOARD_LIVE_ENGINE_SEATS` caps admitted live PvE games and
defaults to the pool size. `MISTBOARD_ENGINE_RESERVATION_TTL_MS` controls stale
reservation expiry and defaults to 30 minutes. Set `MISTBOARD_BUILD_ENGINE=1`,
`RAILPACK_PACKAGES=python@3.11`, and `RAILPACK_DEPLOY_APT_PACKAGES=stockfish`
only on the engine-worker build so Railpack installs Python, Stockfish, and the
private engine repo there, not on the web build.

## Security invariant

A `PlayerView` — not a `GameState` — is the only thing that should ever leave the server toward a client. Any outbound path that sends full board state or hidden moves is a security bug. See [`SECURITY.md`](../../SECURITY.md).
