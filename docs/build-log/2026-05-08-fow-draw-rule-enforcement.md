# 2026-05-08 - Fog of War draw rule enforcement

We decided Bichess Fog of War should enforce standard automatic draw limits in
the game engine, not only rely on EvE max-ply truncation.

## Rules

- King capture remains the primary win condition.
- The 50-move rule is automatic: after 100 halfmoves without a pawn move or
  capture, the game ends as a draw.
- Threefold repetition is automatic: the third occurrence of the same position
  ends the game as a draw.
- Repetition identity uses canonical truth, not player-visible fog:
  - true board placement;
  - side to move;
  - castling rights;
  - en-passant square.
- Repetition identity intentionally excludes clocks, move number, halfmove
  clock, and any player-specific visibility state.

## Implementation Notes

- `packages/game` now carries `GameState.positionCounts` for Fog of War replay
  and live state.
- `fogOfWarVariant.applyMove` checks king capture first, then draw conditions.
- Draw status is represented as:

```ts
{ type: 'finished', winner: null, reason: 'draw' }
```

- The Python self-play harness now mirrors the same draw behavior so
  subprocess EvE games do not drift from the canonical TS rule engine.
- The TS Python subprocess runner now accepts Python `endReason: "draw"`.

## Caveats

- We enforce automatic draws rather than claimable draws.
- Persisted `games.termination` remains generic `draw`; it does not yet
  distinguish `fifty-move-rule` from `threefold-repetition`.
- Historical games do not have `positionCounts`; replay reconstructs the counts
  naturally from the event stream as moves are applied.

## Verification

Ran:

```sh
npm run test --workspace=@bichess/game
npm run build --workspace=@bichess/server
npm run build
```
