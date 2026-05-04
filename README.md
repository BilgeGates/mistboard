# Bichess

Bichess is an open chess-variant lab for players who love the shape of chess and want more room to explore it together.

It is built around simple shared links, thoughtful variants, and fair real-time play. The goal is to make experimental chess feel welcoming, legible, and worth returning to, whether someone is discovering a mode for the first time or testing serious ideas with a friend.

Bichess is an independent open-source project. It is not affiliated with lichess, chess.com, or any other chess platform.

## Vision

Bichess exists to become a small, open home for chess variants that are easy to share, honest in their implementation, and deep enough to reward repeated play. We want two people to be able to open a link, understand the premise quickly, and play a game that still feels like chess while inviting a new kind of decision.

Our north star is Fog of War: make Bichess the best place to play, study, and understand hidden-information chess. That starts with correctness and a smooth live game, then grows into replay, learning tools, analysis, and eventually a Fog-specific engine.

Primary modes:

1. **Fog of War** - the flagship mode: hidden-information chess implemented correctly, where the server owns truth and clients receive only their legal player view.
2. **Draft960** - the approachable second mode: both players choose from three legal Chess960 starts before the game begins.

Experimental lab mode:

- **Bid For White** - players secretly bid clock time for the right to play White. It exists as an architecture exercise and may remain hidden from the main room picker unless testing suggests stronger product value.

## Why These Modes

### Fog of War

Fog of War is broken if the client receives the opponent's true move and then hides it visually. A player can inspect network payloads or parse client events and recover hidden information. Bichess treats fog as a server-authoritative hidden-information game:

- the server stores the canonical full board
- the browser never receives hidden pieces or hidden opponent moves
- each player receives only a `PlayerView`
- spectators and replay modes are explicitly separated from live player views

Longer term, Fog of War is where Bichess should build durable advantage: visibility history, postgame reveal, partial-information analysis, and engine work that understands uncertainty instead of pretending the full board is known.

### Draft960

Chess960 disrupts memorized piece arrangements, but it preserves mirrored setup and White's first-move initiative. Draft960 adds a tiny pregame choice layer: players select the kind of starting-position texture they want before move one.

Draft960 remains valuable because it is easy to understand, exercises the shared play surface, and keeps Bichess welcoming to players who want a smaller step away from classical chess. It is not the primary strategic wedge.

### Bid For White

Bid For White changes incentives without changing chess rules: both players secretly bid clock time, the higher bidder gets White and pays the time. It is implemented and testable, but not currently a flagship mode because the game after resolution is still normal chess.

## Scope

In scope for v1:

- anonymous create/join links
- WebSocket game rooms
- server-authoritative state
- correct Fog of War player views
- playable timed Fog of War games
- Fog postgame reveal and replay foundations
- Draft960 pregame flow
- complete timed Draft960 games
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

The scaffold starts with in-memory rooms. Persistence comes after Fog of War and Draft960 are reliable enough for private alpha testing.

For one-browser local testing, use solo dev mode:

```text
http://localhost:3000/?room=dev-room&reset=1&variant=draft960&dev=solo
```

Solo mode remains a Draft960-only utility that lets one browser make both start selections and move for whichever color is on turn. Normal rooms still use two browser tabs.

The app sidebar includes Create Room links for Fog of War and Fog vs Random. Direct room URLs are still useful for repeatable tests and hidden experimental modes.

Fog of War rooms can be created with:

```text
http://localhost:3000/?room=fog-dev&reset=1&variant=fog-of-war
```

Fog of War random-engine dev rooms can be created with:

```text
http://localhost:3000/?room=fog-engine-dev&reset=1&variant=fog-of-war&dev=engine
```

This harness seats the human as White, reserves Black for a basic random-move engine, and shows dev-only Player, Black, and True view boards in the sidebar.

Bid For White remains available as an experimental direct URL:

```text
http://localhost:3000/?room=bid-dev&reset=1&variant=bid-for-white
```

## Repository Policy

Bichess is intended to be a public/open-source repo from day one. The project uses GPL-family chess libraries such as `chessops`, and future board work may use `chessground`, so the repo is licensed as GPL-3.0-or-later.

The npm packages remain marked `"private": true` to prevent accidental package publishing. That setting does not imply a private GitHub repository.

This is a quiet build artifact for now, not a public product launch. Broad distribution should wait until Fog of War is reliable, understandable, and pleasant to play.
