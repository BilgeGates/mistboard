# Mistboard

> **Live at [mistboard.com](https://mistboard.com)** — Play Fog of War chess.

Mistboard is an open-source site for **Fog of War chess**: a hidden-information chess variant where each player sees only what their pieces can legally see, enforced by the server.

Players create a room, share a link, and play. The full board exists only on the server; clients receive only their own legal view.

Mistboard is an independent open-source project. It is not affiliated with lichess, chess.com, or any other chess platform.

## Status

Live PvP Fog of War is playable at [mistboard.com](https://mistboard.com). The project is working toward [M1 pre-distribution gates](docs/ROADMAP.md) before wider outreach.

## How It Works

Two players open a room link and play a hidden-information chess game. Optionally, each player privately drafts their own Chess960 back-rank before play begins (Draft960). The server enforces visibility — hidden pieces and hidden opponent moves are never sent to the wrong client. After the game ends, the full board is revealed and replayable from either player's perspective or full truth.

See [`docs/rules.md`](docs/rules.md) for the complete rule baseline and edge cases.

## Architecture

```text
packages/game   Pure game logic: types, rules, visibility, variants
apps/server     WebSocket rooms, clocks, event log, HTTP API
apps/web        Board UI, game screens, client WebSocket handling
```

The central abstraction is `getPlayerView(state, color)` — the security boundary that ensures no hidden truth reaches the wrong client. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full data flow and state model.

## Development

```bash
npm install
npm run dev              # in-memory server, fastest for UI work
npm run dev:persistent   # Postgres-backed server
npm test
```

Fog of War dev room:

```text
http://localhost:3000/?room=fog-dev&reset=1&variant=fog-of-war
```

Engine dev room (human as White, random-move engine as Black):

```text
http://localhost:3000/?room=fog-engine-dev&reset=1&variant=fog-of-war&dev=engine
```

Local Postgres (required for reconnect, replay, and postgame review):

```bash
npm run db:up            # local Postgres on host port 5435
npm run db:migrate
npm run test:persistent
```

See [`docs/persistence.md`](docs/persistence.md) for the full schema, env vars, and failure semantics.

## License

AGPL-3.0-or-later. See [`LICENSE`](LICENSE). Mistboard uses GPL-family chess libraries (`chessops`, `chessground`), which are AGPL-compatible.

The npm packages are marked `"private": true` to prevent accidental package publishing — this is intentional and does not affect the repository's public/open-source status.

## Governance

Mistboard is founder-led. The code is open source, but the official project identity, `mistboard.com`, hosted service, roadmap, and production infrastructure remain controlled project assets.

See [`GOVERNANCE.md`](GOVERNANCE.md), [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md), [`docs/project-direction.md`](docs/project-direction.md).
