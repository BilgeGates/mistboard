# Bichess

> **Live at [bichess.org](https://bichess.org)** — Fog of War chess rooms, replays, and engine-game review surfaces.

Bichess is an open-source site for **Fog of War chess**: a hidden-information chess variant where each player sees only what their pieces can legally see, enforced by the server.

Players create a room, share a link, and play. The full board exists only on the server; clients receive only their own legal view.

Bichess is an independent open-source project. It is not affiliated with lichess, chess.com, or any other chess platform.

## Status

The site at [bichess.org](https://bichess.org) is moving from public replay/engine review toward private-alpha live play. Playable rooms, server-enforced Fog of War views, persistence, and postgame reveal foundations are implemented; the current work is reliability, polish, and review quality. See [`docs/milestones.md`](docs/milestones.md) for the roadmap.

## Vision

Bichess aims to be the best place to play, study, and understand Fog of War chess.

That means:

- correct hidden information, enforced by the server
- fast shared-link games that are easy to start
- clear player views, replay, and postgame reveal
- pregame agency over the starting position when players want it
- future tools for learning, analysis, and Fog-specific engine work

## How A Game Works

The flagship and only flagship mode is **Fog of War**. Two players open a room link, optionally pick their starting position, and play a hidden-information chess game.

### Pregame: Standard Start vs Draft960

Before the game begins, the room can be configured with one of two starting-position policies:

- **Standard start** — the classical chess opening position. The fastest path to a Fog of War game.
- **Draft960** — both players are offered three legal Chess960 positions and each picks one. The selected position becomes the Fog of War starting position.

Draft960 is a pregame **feature** of Fog of War, not a separate mode. It exists because Fog of War is more interesting from non-mirrored starts: asymmetric setups create asymmetric vision, and the pregame draft adds agency over the kind of positional texture both players want before move one.

### In-Game: Fog of War

During play, Bichess treats fog as a server-authoritative hidden-information game:

- the server stores the canonical full board
- the browser never receives hidden pieces or hidden opponent moves
- each player receives only a `PlayerView`
- spectators and replay modes are explicitly separated from live player views

A correct Fog of War implementation must never send hidden truth to the wrong client. Existing UI-layer fog implementations leak the real opponent move in network payloads and rely on client code to hide it visually — anyone inspecting payloads or parsing client events can recover hidden information. Bichess does not do that.

### Postgame: Reveal And Replay

After the game ends, the canonical truth is revealed. Replay can be viewed from White's perspective, Black's perspective, or full truth.

## Why Fog of War

Fog of War is Bichess's main product focus. The medium-term roadmap centers on partial-information understanding:

- visibility history (when did each side see what)
- postgame reveal that highlights hidden-information turning points
- analysis tooling that marks king exposure, missed king-capture chances, and high-information moves
- engine and bot work that reasons about uncertainty instead of pretending the full board is known

This is structurally different from analyzing classical chess. Bichess treats hidden information as a first-class rules, replay, and analysis problem.

## Experimental Lab

**Bid For White** — players secretly bid clock time for the right to play White. After resolution, the game proceeds as normal Fog of War. Implemented and accessible via direct URL, but not part of the primary Create Room flow. Useful for testing the bid/resolve event architecture; not currently a flagship feature.

## Scope

In scope for v1:

- anonymous create/join links
- WebSocket game rooms
- server-authoritative state
- correct Fog of War player views
- playable timed Fog of War games (standard start)
- Fog of War games with Draft960 pregame start selection
- Fog postgame reveal and replay foundations
- replay from event history

Out of scope for v1:

- ratings
- matchmaking
- tournaments
- chat / moderation
- engine analysis
- OAuth
- monetization
- standalone non-Fog game modes as primary product surface

## Architecture

```text
apps/web      browser UI, board rendering, player interaction
apps/server   WebSocket game rooms, clocks, event log
packages/game shared variant kernel, state types, player views
```

The critical abstraction is `getPlayerView(state, color)`. For Fog of War, this returns only the visible partial state for that player. For other game shapes used internally (e.g., the classical/Draft960 surface used to validate the play surface), it returns the full board.

## Repository Layout

```text
apps/                  Production app (TS)
packages/              Shared game kernel (TS)
docs/                  Product docs and rules
docs/fog-of-war/       FOW-specific rule and research notes
research/              Offline research, not shipped in the product
research/python-fow-lab/  Python sidecar for visibility/bot/inference experiments
```

## Persistence

Events and games are persisted to Postgres. The `events` table is an append-only log of every `GameEvent` (JSONB payload, keyed by `(room_id, seq)`). The `games` table is a one-row-per-finished-game aggregate, written when a terminal projection state is observed. See [`docs/persistence.md`](docs/persistence.md).

In dev, persistence is optional — `apps/server` falls back to in-memory rooms if `DATABASE_URL` is unset.
Use the persistent dev script when testing postgame review, reconnect recovery, or anything that should survive a server restart.

```bash
docker compose up -d postgres   # local Postgres on host port 5435
npm run dev:persistent           # server uses the local Docker Postgres
TEST_DATABASE_URL=postgres://bichess:bichess@localhost:5435/bichess npm test
```

## Development

```bash
npm install
npm run dev              # in-memory server, fastest for UI work
npm run dev:persistent   # Postgres-backed server, use for game/replay recovery
npm test
```

Fog of War rooms can be created with:

```text
http://localhost:3000/?room=fog-dev&reset=1&variant=fog-of-war
```

Fog of War random-engine dev rooms can be created with:

```text
http://localhost:3000/?room=fog-engine-dev&reset=1&variant=fog-of-war&dev=engine
```

This harness seats the human as White, reserves Black for a basic random-move engine, and shows dev-only Player, Black, and True view boards in the sidebar.

For the Draft960 pregame surface (currently still wired to a standalone variant URL during the transition):

```text
http://localhost:3000/?room=dev-room&reset=1&variant=draft960&dev=solo
```

Solo dev mode lets one browser make both start selections and move for whichever color is on turn. Normal rooms still use two browser tabs.

Bid For White remains available as an experimental direct URL:

```text
http://localhost:3000/?room=bid-dev&reset=1&variant=bid-for-white
```

## Deployment

Production builds run `apps/server`, which serves both the static `apps/web/dist` bundle and WebSocket upgrades on the same port. Postgres-backed persistence is required for production-like runtimes, and migrations apply on container boot.

Production-like runtimes require `DATABASE_URL` by default. If it is missing, the server should fail startup or report unhealthy instead of silently falling back to in-memory rooms. Live game snapshots and event history are private until the game is over; public replay APIs only expose full events after terminal state.

Provider-specific deployment details, account configuration, and operational runbooks live outside the public repository.

## License

GPL-3.0-or-later. Bichess uses GPL-family chess libraries (`chessops`, `chessground`).

The npm packages are marked `"private": true` to prevent accidental package publishing — this is intentional and does not affect the repository's public/open-source status.

## Governance And Funding

Bichess is founder-led. The code is open source, but the official project identity, `bichess.org`, hosted service, package publishing, roadmap, tournaments, sponsorships, and production infrastructure remain controlled project assets.

See:

- [`GOVERNANCE.md`](GOVERNANCE.md)
- [`CONTRIBUTING.md`](CONTRIBUTING.md)
- [`SECURITY.md`](SECURITY.md)
- [`TRADEMARK.md`](TRADEMARK.md)
- [`SPONSORSHIP.md`](SPONSORSHIP.md)
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- [`docs/documentation-policy.md`](docs/documentation-policy.md)
- [`docs/legal-and-fiscal.md`](docs/legal-and-fiscal.md)
