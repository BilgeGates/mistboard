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
- Players see squares their pieces can legally move to.
- Visible opponent pieces are shown only when occupying a visible square.
- There is no check or checkmate.
- The game ends when a king is captured.
- The server owns the full board.
- Live clients receive only their own player view.

Open rules to decide before implementation:

- exact promotion visibility
- whether capture destination details are revealed when not otherwise visible
- spectator behavior during live games
- whether postgame full-truth replay is immediately available

## Bid For White

Deferred third mode:

1. Time control is selected.
2. Both players secretly bid an amount of clock time.
3. The higher bidder receives White.
4. The winner's starting clock is reduced by the bid amount.
5. Ties are resolved randomly or by color preference, to be decided.

Design intent: price White's first-move advantage without changing chess rules.

