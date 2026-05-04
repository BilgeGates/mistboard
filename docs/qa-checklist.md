# QA Checklist

Use this for the next manual deep dive. Record bugs as concrete positions, URLs, and expected vs actual behavior.

## Draft960

- Create a Draft960 room from the sidebar.
- Open two tabs in the same room and confirm seating is White then Black.
- Select the same start from both tabs and confirm that start resolves.
- Select different starts and confirm one of the selected starts resolves.
- Make normal pawn, knight, bishop, rook, queen, and king moves.
- Test Chess960 castling on starts where rooks/kings are unusual.
- Test promotion and promotion picker.
- Test clocks decrement and switch after moves.
- Test replay first/prev/next/latest after several moves.
- Refresh a tab midgame and confirm the board returns from server state.

## Fog of War

- Create a Fog room from the sidebar.
- Open two tabs in the same room and confirm separate White/Black views.
- Confirm own pieces are visible and hidden squares are fogged.
- Confirm empty pawn diagonals stay hidden.
- Confirm pawn forward legal moves are visible.
- Confirm diagonal pawn captures reveal the target piece.
- Confirm a directly blocked pawn does not reveal the blocker unless another piece sees it.
- Confirm en passant reveals the destination and threatened pawn for the capturing turn.
- Confirm live move list does not reveal hidden move events.
- Capture a king and confirm the game finishes.
- After finish, confirm full-truth replay shows the complete board and move list.
- Test mobile layout for board sizing and side-panel stacking.

## Bid For White Experimental

- Open direct URL with `variant=bid-for-white`.
- Confirm the mode does not appear in the primary Create Room picker.
- Submit a bid in one tab and confirm the other tab does not see the amount.
- Submit the second bid and confirm bids reveal.
- Confirm higher bidder receives White.
- Confirm White clock is reduced by the winning bid.
- Test equal bids and confirm a random color resolution.
- Make the first move after resolution.

## Cross-Variant

- Confirm Create Room links generate fresh room IDs.
- Confirm `reset=1` resets an existing room.
- Confirm spectators join after two players.
- Confirm New room creates a fresh Draft960 room.
- Confirm no horizontal overflow on mobile.
- Confirm Playwright visual check remains green after fixes.
