# @mistboard/game

Pure game logic for Mistboard. No I/O, no side effects, no server dependencies.

This is the correct place to work on:
- Fog of War visibility rules
- legal move generation
- Chess960 / Draft960 back-rank logic
- game event projection (event log → GameState)
- draw conditions (50-move, threefold repetition)

## Key abstractions

**`getPlayerView(state, color)`** — the central function. Returns a `PlayerView`: visible squares, opponent pieces on visible squares, legal moves, and clock. This is the security boundary. The server calls this before every outbound WebSocket message.

**`GameState`** — canonical server-side truth. Never sent to clients.

**`PlayerView`** — the per-player projection. Safe to send to clients.

**`GameEvent`** — an append-only event. Full game state is deterministically reconstructable by replaying events through `applyEvent`.

## Files

| File | Purpose |
|------|---------|
| `types.ts` | `GameState`, `PlayerView`, `GameEvent`, piece and square types |
| `visibility.ts` | Fog of War visibility computation |
| `variants.ts` | `darkChessVariant`, `draft960Variant` |
| `chess960.ts` | `pickDraft960Offer(seed)` — seeded offer of 3 Chess960 back-ranks |
| `events.ts` | Event projection: sequence of `GameEvent` → `GameState` |

## Running tests

```bash
npm test                   # from repo root
cd packages/game && npm test  # from this package
```

Tests live in `src/*.test.ts`. When adding a new rule or visibility behavior, add a test here — not in the server integration tests. The server tests verify payloads; this package verifies the rules.

## Rules reference

- Fog of War rules baseline: [`docs/rules.md`](../../docs/rules.md)
- Edge cases and regression targets: the visibility and replay tests in `src/*.test.ts`
