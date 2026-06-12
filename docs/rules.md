# Rules

> Status: current public rules hub.
> Canonical implementation: `packages/game/src/variants.ts` and related variant
> rule modules.
> Last reviewed: 2026-06-12.

Mistboard's public rules documentation should answer two questions quickly:

1. What can people play today?
2. Which candidate rulesets are research or future planning rather than current
   product commitments?

## Current Public Rulesets

| Ruleset | Status | Detail |
|---|---|---|
| Fog of War chess | Current flagship ruleset | [Fog of War baseline](#fog-of-war-chess), [rulesets.md](fog-of-war/rulesets.md), [rules-edge-cases.md](fog-of-war/rules-edge-cases.md) |
| Draft960 hidden starts | Built as a Fog of War pregame configuration, not a standalone launch surface | [Draft960 hidden starts](#draft960-hidden-starts) |
| Dark Mini Xiangqi | Public alpha, casual-only | [dark-mini-xiangqi-rules.md](fog-of-war/dark-mini-xiangqi-rules.md), [dark-mini-xiangqi-plan.md](fog-of-war/dark-mini-xiangqi-plan.md) |

## Candidate And Historical Rulesets

These notes are useful public reference material, but they are not current
homepage or rated-ladder commitments.

| Ruleset | Status | Detail |
|---|---|---|
| Dark Xiangqi | Flag-gated development spike | [dark-xiangqi-rules.md](fog-of-war/dark-xiangqi-rules.md) |
| Dark Shogi | Candidate future ruleset | [dark-shogi-rules.md](fog-of-war/dark-shogi-rules.md) |
| Shogi4 | Rules reference for a small shogi-family game | [shogi4-rules.md](shogi4-rules.md) |

Current product direction and launch gates live in [ROADMAP.md](ROADMAP.md), not
in individual candidate rules files.

## Fog Of War Chess

Working rule baseline:

- Players see their own pieces.
- Players see squares their pieces can legally move to from the canonical
  server position, even while waiting for the opponent.
- Pawn vision follows legal pawn movement, not generic attack maps:
  - empty forward pawn moves are visible;
  - empty diagonal pawn attack squares stay fogged;
  - diagonal enemy pieces are visible when capturable;
  - a directly blocked pawn does not reveal the blocking piece unless another
    piece can see that square.
- Visible opponent pieces are shown only when occupying a visible square.
- Hidden opponent moves are not sent in live player views.
- There is no check or checkmate.
- Legal moves are pseudo-legal chess moves: a king may move through, into, or
  remain in attacked squares.
- The game ends when a king is captured.
- The game is automatically drawn when the 50-move rule is reached.
- The game is automatically drawn on threefold repetition.
- The terminal king-capture state is postgame reveal: fog is lifted for the main
  board, debug player/opponent views, spectators, and replay at that final
  state.
- Earlier replay positions keep the player-specific fog view until the replay
  reaches the terminal state.
- Castling is legal even through, into, or out of attacked squares when the
  normal occupancy and castling-rights requirements are met.
- En passant is legal. The en passant destination and threatened pawn are
  visible to the capturing player until that turn ends.
- Promotion uses normal chess promotion choices; opponents only see the promoted
  piece if they can see the promotion square.
- The server owns the full board.
- Live clients receive only their own player view.
- Live spectators receive a neutral no-board view.
- Live move history is withheld because hidden opponent moves can reveal hidden
  information.
- Finished games expose full-truth board state and event history for replay.

Subtle rule-risk areas such as hidden occupancy inference, en passant
visibility, castling representation, no-check king semantics, and terminal
reveal boundaries are tracked in
[rules-edge-cases.md](fog-of-war/rules-edge-cases.md).

## Draft960 Hidden Starts

Draft960 is a Fog of War pregame configuration. Each player independently
drafts their own Chess960 back rank before play begins. The opponent's back rank
is never revealed during the game.

Pregame:

1. The server generates a private offer of three legal Chess960 back ranks for
   each player independently. The two offers are drawn separately; they are not
   conditioned on each other and are not visible to the opponent.
2. Each player privately selects one of their three offered back ranks.
3. Neither the offer nor the choice is visible to the opponent at any point.
4. Both choices are locked before play begins and cannot be changed.

Starting position:

- White's back rank is White's chosen Chess960 arrangement on rank 1; pawns are
  on rank 2.
- Black's back rank is Black's chosen Chess960 arrangement on rank 8; pawns are
  on rank 7.
- The two back ranks are independent. Piece files need not match between sides.
- Castling rights derive from each player's own back-rank rook positions.

During play:

- A player knows their own back rank and castling rights, but not the
  opponent's.
- Opponent pieces become visible only under normal Fog of War visibility rules.
- A player can infer the opponent's back-rank arrangement from accumulated
  observation, but the server provides no annotation or assistance.

Postgame:

- On game end, both players' chosen back ranks are revealed alongside the
  standard Fog of War reveal.
- Replay supports per-side perspectives, preserving each player's initial
  back-rank uncertainty, and a full-truth mode that shows both back ranks from
  move one.
