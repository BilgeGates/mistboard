# Variant Rules

## Draft960

Draft960 is a Fog of War pregame configuration. Each player independently
drafts their own Chess960 back-rank before play begins. The opponent's
back-rank is never revealed during the game.

Pregame:

1. The server generates a private offer of three legal Chess960 back-ranks for
   each player independently. The two offers are drawn separately; they are not
   conditioned on each other and are not visible to the opponent.
2. Each player privately selects one of their three offered back-ranks.
3. Neither the offer nor the choice is visible to the opponent at any point.
4. Both choices are locked before play begins and cannot be changed.

Starting position:

- White's back-rank is White's chosen Chess960 arrangement on rank 1; pawns on rank 2.
- Black's back-rank is Black's chosen Chess960 arrangement on rank 8; pawns on rank 7.
- The two back-ranks are independent. Piece files need not match between sides.
- Castling rights derive from each player's own back-rank rook positions.

During play:

- A player knows their own back-rank and castling rights, but not the opponent's.
- Opponent pieces become visible only under normal Fog of War visibility rules.
- A player can infer the opponent's back-rank arrangement from accumulated
  observation, but the server provides no annotation or assistance.

Postgame:

- On game end, both players' chosen back-ranks are revealed alongside the
  standard Fog of War reveal.
- Replay supports per-side perspectives (preserving each player's initial
  back-rank uncertainty) and a full-truth mode that shows both back-ranks from
  move one.

## Fog of War

Working rule baseline:

- Players see their own pieces.
- Players see squares their pieces can legally move to from the canonical server position, even while waiting for the opponent.
- Pawn vision follows legal pawn movement, not generic attack maps:
  - empty forward pawn moves are visible;
  - empty diagonal pawn attack squares stay fogged;
  - diagonal enemy pieces are visible when capturable;
  - a directly blocked pawn does not reveal the blocking piece unless another piece can see that square.
- Visible opponent pieces are shown only when occupying a visible square.
- Hidden opponent moves are not sent in live player views.
- There is no check or checkmate.
- Legal moves are pseudo-legal chess moves: a king may move through, into, or remain in attacked squares.
- The game ends when a king is captured.
- The game is automatically drawn when the 50-move rule is reached.
- The game is automatically drawn on threefold repetition.
- The terminal king-capture state is postgame reveal: Fog is lifted for the main board, debug player/opponent views, spectators, and replay at that final state.
- Earlier replay positions keep the player-specific Fog view until the replay reaches the terminal state.
- Castling is legal even through, into, or out of attacked squares when the normal occupancy/castling-rights requirements are met.
- En passant is legal. The en passant destination and threatened pawn are visible to the capturing player until that turn ends.
- Promotion uses normal chess promotion choices; opponents only see the promoted piece if they can see the promotion square.
- The server owns the full board.
- Live clients receive only their own player view.
- Live spectators receive a neutral no-board view.
- Live move history is withheld because hidden opponent moves can reveal hidden information.
- Finished games expose full-truth board state and event history for replay.

Developer note: subtle rule-risk areas such as hidden occupancy inference,
en-passant visibility, castling representation, no-check king semantics, and
terminal reveal boundaries are tracked in
[`docs/fog-of-war/rules-edge-cases.md`](./fog-of-war/rules-edge-cases.md).

## Bid For White (Experimental)

Bid For White is an experimental lab mode. It is not part of the main
product. It is kept out of the primary Create Room flow.

Working rule baseline:

1. Both players join provisional seats.
2. Each player privately bids an amount of starting clock time.
3. Before resolution, a player can see only their own submitted bid.
4. After both players bid, the higher bidder receives White.
5. The player who receives White starts with their clock reduced by the winning bid amount.
6. The other player receives Black with the normal starting clock.
7. Ties are resolved randomly between the two players.
8. After color resolution, the game is normal chess from the standard starting position.
9. Bids and the color assignment are revealed after resolution.

Design intent: price White's first-move advantage without changing chess rules.
