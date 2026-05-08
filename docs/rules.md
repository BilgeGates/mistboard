# Variant Rules

## Draft960

Before the game:

1. The server generates three legal Chess960 starting positions.
2. Both players choose one position.
3. If both choose the same position, that position is used.
4. If players choose different positions, the server randomly selects between the two chosen positions.
5. The game begins as a normal Chess960 game from the selected position.

Design intent: add pregame agency over starting-position texture without changing chess after move one.

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

## Bid For White

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
