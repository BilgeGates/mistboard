# @mistboard/web

Browser client for Mistboard. Built with Next.js App Router.

## Key responsibilities

- Render the game board using `chessground`
- Manage client-side WebSocket connection and `PlayerView` state
- Game screens: lobby, pregame, in-game, postgame replay
- Landing page, articles (`/articles`), leaderboard, OG share surfaces

## Running locally

```bash
npm run dev    # from repo root starts both web and server
```

The web client expects the game server at the URL in `NEXT_PUBLIC_WS_URL` (defaults to `ws://localhost:3001`).

## Key directories

| Directory | Purpose |
|-----------|---------|
| `app/` | Next.js App Router pages and layouts |
| `app/game/` | In-game and postgame screens |
| `app/articles/` | Article pages |
| `components/` | Shared UI components |
| `hooks/` | WebSocket and game state hooks |

## Board rendering

The board uses `chessground`. Legal move destinations come from `PlayerView.legalMoves` sent by the server — the client does not compute legality locally. This is intentional: the server owns move authority.

## Fog of War UI contract

- The client renders only what is in `PlayerView`. It never requests or reconstructs hidden state.
- Hidden squares should visually communicate fog, not look like missing textures.
- Spectator mode and replay mode are separate rendering paths — they do not receive live `PlayerView` updates.
