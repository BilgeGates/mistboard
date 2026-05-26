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

`EngineTurnRequest.legalMoves` reuses the public game `Move` shape: promotion
values are role names (`queen`, `rook`, `bishop`, `knight`). Visible pieces in
observations use protocol letters (`Q`, `R`, `B`, `N`, `P`, `K`).

On Railway, set `MISTBOARD_INTERNAL_ENGINE_URL` on web to the engine-worker
private domain with the service port, e.g. `http://<engine-worker-private-domain>:3001`.
The engine-worker HTTP listener binds to `::` by default for Railway private
networking and can be overridden with `MISTBOARD_ENGINE_SERVICE_HOST`.

If that service is missing or unhealthy, Python-engine turns fail closed and
are logged instead of being masked by a random local move under the engine's
identity.

After deploying either web or engine-worker, run the production playout smoke
from the repo root:

```bash
npm run prod:smoke:engine-playout -- --base https://mistboard.com --engine python-tier1-v0.9.5 --target-plies 64 --reply-timeout-ms 45000 --total-timeout-ms 600000
```

Passing means the script returns `ok: true` by reaching the target ply count or
by reaching a normal terminal result. A failure, engine forfeit, indefinite
pause, or per-reply timeout means the live engine path is not healthy enough to
ship.

The engine-worker service keeps the warm Python pool. `MISTBOARD_PYTHON_POOL_SIZE`
caps concurrent live engine requests there; when unset, the HTTP service starts
with 4 workers. `MISTBOARD_LIVE_ENGINE_SEATS` caps admitted live PvE games and
defaults to the pool size. `MISTBOARD_ENGINE_RESERVATION_TTL_MS` controls stale
reservation expiry and defaults to 30 minutes. Set `MISTBOARD_BUILD_ENGINE=1`,
`RAILPACK_PACKAGES=python@3.11`, and `RAILPACK_DEPLOY_APT_PACKAGES=stockfish`
only on the engine-worker build so Railpack installs Python, Stockfish, and the
private engine repo there, not on the web build.

When only the private engine implementation changes, redeploy engine-worker
from source and leave web alone. When the public protocol, engine registry,
reservation contract, or player-facing engine failure UI changes, deploy web
and engine-worker together. Prefer pinning `MISTBOARD_ENGINE_REF` to a tag or
SHA for release builds so engine rollouts are explicit and reversible.

The metrics tick emits `kind: "metrics"` counters for dashboards. Actionable
engine failures also emit a separate `kind: "engine_alert"` line at `error` or
`warn` level. Notification rules should page on critical engine alerts and route
capacity warnings separately. Critical alert fields include
`engine_fallbacks_tick`, `engine_move_failures_tick`, `engine_turns_failed_tick`,
`engine_turn_timeouts_tick`, `python_pool_errors_tick`,
`python_pool_timeouts_tick`, `engine_reservation_errors_tick`, and
`engine_reservation_release_failures_tick`. The capacity warning is
`engine_reservation_busy_tick`; it means admission control protected running
games, but demand exceeded available live engine seats. Watch
`engine_turn_deadline_guards_tick` as a trend metric rather than a page, because
deadline guards are expected near the end of low-clock games.

## Security invariant

A `PlayerView` — not a `GameState` — is the only thing that should ever leave the server toward a client. Any outbound path that sends full board state or hidden moves is a security bug. See [`SECURITY.md`](../../SECURITY.md).
