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

- [ ] Isolate board rendering from full-page rerenders.
- [ ] Keep the board as the primary responsive element on desktop and mobile.
- [ ] Support orientation by seat.
- [ ] Add click/tap square selection.
- [ ] Add drag/drop, or explicitly defer it after tap movement is solid.
- [ ] Add selected square, legal target, and last-move highlights.
- [ ] Add a promotion picker surface.
- [ ] Add stable side panels for offers, clocks, move list, and game status.
- [ ] Redraw the game from a server snapshot after reconnect.

Checkpoint: the board feels stable and immediate while room status, offers, and future move data update around it.

## Milestone 2: Draft960 Complete Game

Goal: complete timed Draft960 game with replay.

- [ ] Integrate legal move validation.
- [ ] Define append-only game events.
- [ ] Apply moves through server-owned game state only.
- [ ] Reconstruct replay from event history.
- [ ] Add server-side clocks.
- [ ] Record clock changes in event history.

Checkpoint: complete a timed Draft960 game from link creation through replay.

## Milestone 3: Fog of War Kernel

Goal: server-owned truth and tested player-specific views.

- [ ] Define exact Fog rules.
- [ ] Implement legal-move-derived visibility.
- [ ] Implement `getPlayerView` from canonical server state.
- [ ] Add visibility tests from known positions.
- [ ] Add server outbound payload tests proving hidden information is absent.
- [ ] Define spectator/replay behavior.

Checkpoint: player-view tests pass and no outbound live payload contains hidden truth.

## Milestone 4: Fog of War Playable

Goal: two players can complete a Fog game online.

- [ ] Render fogged board UI.
- [ ] Implement Fog move application and game-over handling.
- [ ] Add White view, Black view, and full-truth postgame replay.

Checkpoint: complete a Fog game without hidden-state leaks in network payloads.
