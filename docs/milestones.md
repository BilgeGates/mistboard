# Milestones

## Milestone 0: Repo Bootstrap

Goal: board renders, server runs, and two browser tabs can sync room state.

- [x] Create TypeScript monorepo.
- [x] Add shared game package.
- [x] Add WebSocket server with in-memory rooms.
- [x] Add web client that connects to a room.
- [x] Render a board from server-provided `PlayerView.board`.

Checkpoint: `npm run dev` starts server and web app; two tabs receive the same room state.

## Milestone 1: Draft960 Pregame

Goal: two players join one link and choose from three legal Chess960 positions.

- [x] Generate legal Chess960 starts.
- [x] Generate deterministic three-start room offers.
- [x] Add seats: White, Black, and spectator.
- [x] Store per-seat pregame selections on the server.
- [x] Validate selection messages against the room offer.
- [x] Resolve selected start after both players pick.
- [x] Build the initial board from the resolved Chess960 start.
- [x] Broadcast per-client `PlayerView`s after resolution.

Checkpoint: two browser tabs choose starts and reach a shared initial position.

## Milestone 1.5: Play Surface

Goal: create a responsive, board-first game screen that can support Draft960 now and Fog of War later.

- [x] Isolate board rendering from full-page rerenders.
- [x] Keep the board as the primary responsive element on desktop and mobile.
- [x] Support orientation by seat.
- [x] Add click/tap square selection.
- [x] Add drag/drop, or explicitly defer it after tap movement is solid.
- [x] Add selected square, legal target, and last-move highlights.
- [x] Add a promotion picker surface.
- [x] Add stable side panels for offers, clocks, move list, and game status.
- [x] Redraw the game from a server snapshot after reconnect.

Checkpoint: the board feels stable and immediate while room status, offers, and future move data update around it.

### UI Polish Track

Goal: make the game surface feel closer to lichess-grade interaction and visual quality.

- [x] Replace the custom grid board with `chessground`.
- [x] Use real piece assets instead of temporary text/glyph pieces.
- [x] Support smooth drag/drop and tap movement.
- [x] Feed legal destinations from server-provided `PlayerView.legalMoves`.
- [x] Preserve replay read-only mode.
- [x] Preserve solo dev mode.
- [x] Tighten Draft960 offer panel spacing, hierarchy, and disabled states.
- [x] Verify desktop and mobile board sizing.

## Milestone 2: Draft960 Complete Game

Goal: complete timed Draft960 game with replay.

- [x] Integrate legal move validation.
- [x] Define append-only game events.
- [x] Apply moves through server-owned game state only.
- [x] Reconstruct replay from event history.
- [x] Add server-side clocks.
- [x] Record clock changes in event history.

Checkpoint: complete a timed Draft960 game from link creation through replay.

## Milestone 3: Fog of War Kernel

Goal: server-owned truth and tested player-specific views.

- [x] Define exact Fog rules.
- [x] Implement legal-move-derived visibility.
- [x] Implement `getPlayerView` from canonical server state.
- [x] Add visibility tests from known positions.
- [x] Add server outbound payload tests proving hidden information is absent.
- [x] Define spectator/replay behavior.

Checkpoint: player-view tests pass and no outbound live payload contains hidden truth.

## Milestone 4: Fog of War Playable

Goal: two players can complete a Fog game online.

- [x] Render fogged board UI.
- [x] Implement Fog move application and game-over handling.
- [x] Add White view, Black view, and full-truth postgame replay.

Checkpoint: complete a Fog game without hidden-state leaks in network payloads.

## Milestone 5: Bid For White Experimental

Goal: two players can privately bid clock time for the White pieces, then play a normal timed game.

- [x] Define Bid For White rules.
- [x] Add bid submission and resolution events.
- [x] Replay resolved bids into swapped color seats and adjusted clocks.
- [x] Keep unrevealed opponent bids out of live pregame payloads.
- [x] Add a minimal bid submission UI.
- [x] Add browser smoke coverage for bid resolution and first move.

Checkpoint: two browser tabs submit bids, the higher bidder receives White with the bid deducted from their clock, and play starts.

Product status: implemented as an experimental/lab mode and kept out of the primary Create Room picker. Draft960 and Fog of War are the current flagship modes.

## Milestone 6: Private Alpha Hardening

Goal: turn the playable prototype into a reliable private alpha focused on Draft960 and Fog of War.

- [ ] Run the manual QA checklist for Draft960.
- [ ] Run the manual QA checklist for Fog of War.
- [ ] Convert manual bugs into focused regression tests.
- [ ] Improve variant identity in the header and side panel.
- [ ] Add copy/share room-link affordance.
- [ ] Polish replay controls and move-list behavior.
- [ ] Decide persistence strategy for event logs and room recovery.
- [ ] Define the Fog engine/analysis direction.

Checkpoint: Draft960 and Fog of War can be shared with private testers with known limitations documented.
