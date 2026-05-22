# Milestones

_This is a historical milestone record. For current planning see [ROADMAP.md](ROADMAP.md)._

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

Goal: make the game surface feel closer to mature chess-interface interaction and visual quality.

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

## Note On Draft960 Framing (2026-05-05)

Milestones 1, 1.5, and 2 describe Draft960 work that originally shipped as a peer mode alongside Fog of War. As of 2026-05-05 Mistboard is sharpened to **Fog of War only** as the product, with Draft960 reframed as a Fog of War **pregame feature** (optional hidden start-position draft inside a Fog game). The historical Draft960 work above is preserved as completed scaffolding — it built the shared play surface and pregame state machine that Fog of War depends on.

## Milestone 5: Bid For White Experimental (Removed)

Bid For White existed briefly as an experimental lab mode (private clock-time bidding for the White pieces). Removed 2026-05-22 along with its events, projection fields, and UI. The variant ID and `bid-submitted` / `bid-resolved` events are no longer recognized. Historical games with `variant='bid-for-white'` may persist in the `games` table.

## Milestone 6: Fog of War Private Alpha

Goal: turn Fog of War into a reliable private alpha that two people can share, play, finish, and understand.

- [x] Run the manual QA checklist for Fog of War.
- [x] Improve Fog identity in the header and side panel.
- [x] Add copy/share room-link affordance.
- [x] Polish Fog board visuals, hidden-square styling, and mobile spacing.
- [x] Polish postgame reveal, replay controls, and move-list behavior.
- [x] Decide persistence strategy for event logs and room recovery.
- [x] Define the Fog engine/analysis direction.
- [ ] Add visibility-history affordances that help players understand what each side could see.

Checkpoint: Fog of War can be shared with private testers with known limitations documented.

## Milestone 7: Fog of War Learning And Analysis

Goal: make Fog of War understandable after the game, not just playable during the game.

- [x] Show a clean postgame transition from player view to full truth.
- [x] Let replay switch between White view, Black view, and full-truth view.
- [ ] Mark moments where visibility changed materially.
- [ ] Identify king exposure, missed king-capture chances, and high-risk scouting moves.
- [ ] Add a basic legal-move bot that only consumes `PlayerView`.
- [ ] Add a heuristic Fog bot that beats random play without hidden-state access.
- [ ] Define the self-play data format for future model training.

Checkpoint: players can review a Fog game and understand the hidden-information decisions that shaped the result.

## Milestone 8: Fog of War + Draft960 Pregame Integration

Goal: Draft960 pregame becomes an optional hidden start-position draft inside Fog of War.

- [x] Generate independent per-player Chess960 start offers (hidden from opponent).
- [x] Run the pregame selection state machine; resolve into a Fog of War game.
- [x] Verify visibility tests cover non-mirrored Chess960 starts.
- [x] Postgame reveal exposes both players' chosen back-ranks.
- [ ] Draft960 lobby and article published and linked from landing.

Checkpoint: a Fog of War game with Draft960 starts plays through to a clean reveal.
