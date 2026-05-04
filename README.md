# Bichess

Tiny open chess-variant lab for elegant chess modes that mainstream platforms ignore or implement poorly.

Bichess is an independent open-source project. It is not affiliated with lichess, chess.com, or any other chess platform.

## Vision

Bichess is not a lichess clone. It is a small real-time variant site where two players can open a link and play variants that preserve chess literacy while adding one clean twist.

Primary modes:

1. **Draft960** - both players choose from three legal Chess960 starts before the game begins.
2. **Fog of War** - hidden-information chess implemented correctly: the server owns truth, clients receive only their legal player view.

Experimental lab mode:

- **Bid For White** - players secretly bid clock time for the right to play White. It exists as an architecture exercise and may remain hidden from the main room picker unless testing suggests stronger product value.

## Why These Modes

### Fog of War

Fog of War is broken if the client receives the opponent's true move and then hides it visually. A player can inspect network payloads or parse client events and recover hidden information. Bichess treats fog as a server-authoritative hidden-information game:

- the server stores the canonical full board
- the browser never receives hidden pieces or hidden opponent moves
- each player receives only a `PlayerView`
- spectators and replay modes are explicitly separated from live player views

### Draft960

Chess960 disrupts memorized piece arrangements, but it preserves mirrored setup and White's first-move initiative. Draft960 adds a tiny pregame choice layer: players select the kind of starting-position texture they want before move one.

### Bid For White

Bid For White changes incentives without changing chess rules: both players secretly bid clock time, the higher bidder gets White and pays the time. It is implemented and testable, but not currently a flagship mode because the game after resolution is still normal chess.

## Scope

In scope for v1:

- anonymous create/join links
- WebSocket game rooms
- server-authoritative state
- Draft960 pregame flow
- complete timed Draft960 games
- Fog of War player views
- replay from event history

Out of scope for v1:

- ratings
- matchmaking
- tournaments
- chat/moderation
- engine analysis
- OAuth
- monetization
- full lila fork

## Architecture

```text
apps/web      browser UI, board rendering, player interaction
apps/server   WebSocket game rooms, clocks, event log
packages/game shared variant kernel, state types, player views
```

The critical abstraction is `getPlayerView(state, color)`. Standard and Draft960 games can expose full board state. Fog of War must return only the visible partial state for that player.

## Development

```bash
npm install
npm run dev
npm test
```

The scaffold starts with in-memory rooms. Persistence comes after Draft960 is playable.

For one-browser local testing, use solo dev mode:

```text
http://localhost:3000/?room=dev-room&reset=1&dev=solo
```

Solo mode lets one browser make both Draft960 start selections and move for whichever color is on turn. Normal rooms still use two browser tabs.

The app sidebar includes Create Room links for Draft960 and Fog of War. Direct room URLs are still useful for repeatable tests and experimental modes.

Fog of War rooms can be created with:

```text
http://localhost:3000/?room=fog-dev&reset=1&variant=fog-of-war
```

Bid For White remains available as an experimental direct URL:

```text
http://localhost:3000/?room=bid-dev&reset=1&variant=bid-for-white
```

## Repository Policy

Bichess is intended to be a public/open-source repo from day one. The project uses GPL-family chess libraries such as `chessops`, and future board work may use `chessground`, so the repo is licensed as GPL-3.0-or-later.

The npm packages remain marked `"private": true` to prevent accidental package publishing. That setting does not imply a private GitHub repository.

This is a quiet build artifact for now, not a public product launch. Broad distribution should wait until Draft960 is pleasant to play.
