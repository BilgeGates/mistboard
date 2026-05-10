# QA Checklist

Use this checklist before widening private-alpha testing. Keep bug reports
concrete: room URL, browser context, move sequence, expected behavior, and actual
behavior. Convert privacy, reconnect, persistence, or rules bugs into regression
tests when feasible.

## Private-Alpha Smoke Path

Run this path against a production-like build before inviting more testers or
after changing live-room, replay, reconnect, or visibility code.

### Setup

- Start from a clean browser profile or clear Mistboard local storage.
- Use one desktop-width browser window and one mobile-width viewport.
- Create fresh rooms from the `/play` surface unless a step says otherwise.
- Keep DevTools Network available for privacy checks, but do not record or share
  cookies, local storage values, or other browser secrets.

### PvP Live Privacy

- Create a Fog of War friend room.
- Open the room as White in one tab and as Black in a second tab.
- Confirm each player sees a different player-specific board view.
- Open the same live room in a third normal tab.
- Confirm the third tab is rejected or disconnected before it receives a board,
  move list, or snapshot content.
- Make one legal move as White and confirm Black receives only Black's live
  player view.
- Confirm the live move list does not reveal hidden opponent moves to either
  player.

### PvE Observer Policy

- Create a play-vs-engine Fog room.
- Make at least one human move and wait for the engine reply.
- Open the live room in an observer tab.
- Confirm the observer follows the human perspective, not full truth.
- Confirm observer legal moves are empty.
- Confirm the observer sees human move events but not engine move events.

### EvE / Watch Visibility

- Open a recent or generated EvE game through the watch or review surface.
- Confirm EvE is labeled as an engine game.
- Confirm full-truth board visibility is available by design.
- Confirm the move list includes both engine sides.
- Confirm this full-truth behavior is not available for an unfinished PvP game.

### Reconnect

- In a two-player PvP room, make one legal move.
- Refresh the White tab and confirm it returns as White.
- Refresh the Black tab and confirm it returns as Black.
- Temporarily disconnect one tab's network or close the socket from DevTools.
- Confirm the UI enters a reconnecting state and then restores the same seat and
  current board state.
- Confirm reconnect does not create a spectator tab or extra seated player.

### Duplicate Tab

- Duplicate the White player's tab during a live PvP game.
- Record the observed behavior for both tabs.
- Confirm the duplicate-tab behavior is deterministic and visible to the user.
- Confirm only one effective White move can be accepted for a single turn.
- If behavior is ambiguous, file it as a reconnect-authority bug.

### Clock And Timeout

- Confirm the live room shows the current server time control.
- Confirm the clock starts only after both seats are ready.
- Make moves for both sides and confirm the active clock switches correctly.
- Let the active clock expire.
- Confirm the game ends by timeout and the board remains available after game
  over.

### Postgame Review

- Finish a Fog game by king capture or timeout.
- Confirm the live room clearly says the game is over.
- Open the review URL from the live room.
- Confirm the final board is fully revealed.
- Confirm White view, Black view, and full-truth review behavior is clear.
- Confirm replay controls work from first event to final state.
- Share or reopen the review URL and confirm it loads the same finished game.

## Broader Exploratory Checklist

Use these checks after the smoke path passes or when changing the related area.

### Fog Rules And Visibility

- Confirm own pieces are visible and hidden squares are fogged.
- Confirm empty pawn diagonals stay hidden.
- Confirm pawn forward legal moves are visible.
- Confirm diagonal pawn captures reveal the target piece.
- Confirm a directly blocked pawn does not reveal the blocker unless another
  piece sees it.
- Confirm the active player's legal moves do not reveal more hidden-board
  information than the documented rules allow.
- Confirm rejected or failed move attempts do not act as hidden-board probes.
- Confirm en passant reveals the destination and threatened pawn for the
  capturing turn.
- Confirm the pushing side does not see its own en-passant target merely because
  it exists.
- Confirm castling visibility and accepted castling input match the documented
  representation.
- Confirm kings can move through, into, and remain in attacked squares, and that
  king capture ends the game.
- Confirm king capture takes precedence over automatic draw conditions.
- Confirm captures and king-capture termination match the documented rules.
- Confirm no horizontal overflow on mobile during ordinary play.

### Room Creation And Navigation

- Confirm `/`, `/watch`, `/play`, `/room/:id`, and `/game/:id` load without a
  blank page.
- Confirm Create Room links generate fresh room IDs.
- Confirm copy/share room-link controls are available where players need them.
- Confirm `reset=1` works only as an intentional local/dev reset path.
- Confirm room actions point back to play and review surfaces appropriately.

### Replay And Review

- Confirm replay first/previous/next/latest controls do not desync the board.
- Confirm the selected review perspective matches the board and move list.
- Confirm postgame reveal does not retroactively expose live hidden information
  before terminal state.
- Confirm finished games remain replayable after a server restart when
  persistence is enabled.

### PvE And Engine Surfaces

- Confirm play-vs-engine rooms do not expose engine-only information to the
  human player or observers.
- Confirm engine moves advance clocks and game state like normal server-owned
  moves.
- Confirm engine-game review surfaces identify engine sides clearly.
- Confirm failed or missing engine games show an empty/error state instead of a
  blank page.

### Experimental Modes

- Open Bid For White by direct URL with `variant=bid-for-white`.
- Confirm the mode does not appear as a flagship Create Room choice.
- Submit a bid in one tab and confirm the other tab does not see the amount.
- Submit the second bid and confirm bids reveal.
- Confirm the higher bidder receives White and White's clock is reduced by the
  winning bid.
- Open a Draft960-start path only when testing Fog pregame work, not as a
  standalone product surface.

### Regression Triggers

Add or update tests when manual QA finds:

- hidden opponent pieces or moves in a live payload;
- live PvP spectator access before terminal state;
- replay API and WebSocket snapshot policy mismatch;
- reconnect changing a player's seat or creating an extra seat;
- move legality, visibility, en passant, clock, timeout, or postgame reveal bugs;
- blank pages on primary surfaces.
