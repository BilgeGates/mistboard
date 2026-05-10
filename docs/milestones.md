# Milestones

## Active Planning Tracks

Use this section as the current planning index. Historical milestones below
remain useful context, but private-alpha work should be driven by these tracks.
See [`docs/private-alpha-priority-0-tech-scope.md`](private-alpha-priority-0-tech-scope.md)
for the technical scope behind the Priority 0 gate.
See [`docs/private-alpha-priority-1-tech-scope.md`](private-alpha-priority-1-tech-scope.md)
for the technical scope behind Priority 1 usefulness work.

### Already In Flight

- Engine / EvE pipeline: queue, worker, engine versions, review surfaces.
- Clocks: live clock correctness, persistence, timeout behavior, and UI.
- Persistence for guest and signed-in players: room/event durability and identity-backed recovery.

### Priority 0: Private-Alpha Safety

These tracks block broader private-alpha use. They should be resolved before
inviting more testers because mistakes here can leak hidden information or make
live games unreliable.

#### Live Privacy / Access Policy

Outcome: every live-room and replay endpoint has an explicit policy for PvP,
PvE, and EvE, and tests prove live Fog truth is not exposed to the wrong client.

Decisions to lock:

- PvP live rooms are private to the seated players until terminal state.
- PvE live rooms may be observable only from the human player's public perspective.
- EvE live rooms may expose full truth because both sides are server engines.
- Admin-debug truth is a separate capability, not authorized by room id, query params, or normal spectator status.

Work:

- Centralize PvP/PvE/EvE mode detection and observer policy.
- Gate live spectators before they receive any room snapshot.
- Redact live Fog event streams consistently for WebSocket snapshots and replay APIs.
- Add regression tests for seated players, spectators, replay APIs, and finished-game reveal.

Verification gate: targeted server policy and payload tests pass, and a manual
three-room smoke confirms PvP spectator rejection, PvE human-perspective
observation, and EvE full-truth observation.

#### Reconnect / Session Continuity

Outcome: a player can lose the socket, refresh, or reconnect and recover the
same live room state without silently changing seats or needing a new link.

Decisions to lock:

- Reconnect identity is based on the stable client id already known to the room.
- A reconnecting seated client should recover its original seat when possible.
- Duplicate tabs with the same client id should have deterministic behavior and clear UI.
- Socket retry should not create extra seats or leak a private room to spectators.

Work:

- Audit client id storage and reuse across refresh and reconnect.
- Add or tighten server tests for seat recovery and spectator overflow.
- Keep client reconnect messaging concise and actionable.
- Manually smoke socket close, refresh, duplicate tab, and postgame reconnect.

Verification gate: manual two-tab Fog game survives refresh and socket close for
both colors, and no reconnect path creates a third live observer in PvP.

#### QA / Release Readiness

Outcome: private-alpha deploys have a small, repeatable gate that catches hidden
information leaks, broken live play, and broken review handoff.

Decisions to lock:

- The release gate is small enough to run before every private-alpha push.
- New bugs from manual QA become focused regression tests when they affect rules, privacy, persistence, or reconnect behavior.
- Exact private operational checklists stay outside the public repo.

Work:

- Turn the Fog section of `docs/qa-checklist.md` into a private-alpha smoke path.
- Add explicit PvP, PvE, EvE, reconnect, and postgame review checks.
- Keep browser/manual checks separate from low-level unit tests.
- Record known limitations in public-safe language when they affect testers.

Verification gate: one complete manual smoke is run against a production-like
build, with follow-up issues either fixed or documented as known limitations.

### Priority 1: Private-Alpha Usefulness

These tracks make the safe live game experience easier to share, finish, and
review. They should follow Priority 0 work unless a small UX fix directly helps
verify Priority 0.

#### Replay / Review Experience

Outcome: when a Fog game ends, players understand that the truth is now revealed
and can review the game without confusion.

Work:

- Make the live-to-review transition clear after terminal state.
- Preserve White view, Black view, and full-truth review modes.
- Make move-list behavior match the selected review perspective.
- Keep review URLs stable and shareable for finished games.

Verification gate: finish a Fog game, open the review URL, switch perspectives,
and confirm the board and move list match the selected perspective.

#### Private-Alpha Play UX

Outcome: two invited testers can create or open a room link, understand their
seat/status, play on desktop or mobile, and recover from basic connection issues.

Work:

- Keep room creation focused on Fog of War.
- Make copy/share link available where players naturally need it.
- Tighten seat, turn, reconnect, and game-over status text.
- Polish hidden-square styling, mobile spacing, and board-first layout.

Verification gate: run a two-human Fog game on desktop and mobile-width layout
without horizontal overflow or ambiguous status.

#### Fog Rules Regression Coverage

Outcome: the implemented Fog rules have enough focused regression coverage that
private-alpha testers can stress ordinary play and known edge cases without
rediscovering already-understood rules bugs.

Work:

- Expand visibility tests for pawn diagonals, blockers, en passant, captures, and king exposure.
- Keep legal destinations derived from the server-owned player view.
- Confirm king-capture termination and postgame truth reveal.
- Convert any manual QA rules bug into a minimal `packages/game` or payload regression test.

Verification gate: game-kernel tests pass and manual QA finds no unresolved
rules mismatch in the private-alpha smoke path.

### Backlog: Understanding And Expansion

These tracks matter, but should not compete with Priority 0 or Priority 1 until
private-alpha safety and usefulness are stable.

- Visibility history / learning layer: visibility timeline, missed king-capture chances, scouting markers, and explanatory review affordances.
- Draft960-as-Fog-pregame: start-position choice inside Fog of War, Chess960 visibility coverage, and replay labeling.
- Fairness / transparency contract: public explanation of hidden-information safety, engine isolation, benchmark verifiability, game-design rationale, and public/private artifact boundaries.
- Tournament track: engine events first, then private PvP events, then account-backed and Arena-style events only after live Fog safety and identity primitives are stable.
- Operational safety / observability: health checks, structured logs, rate limits, payload limits, and failure visibility.
- Public docs / positioning: contributor-safe docs, public/private documentation hygiene, and clear alpha-scope messaging.

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

Milestones 1, 1.5, and 2 below describe Draft960 work that originally shipped as a peer mode alongside Fog of War. As of 2026-05-05 Mistboard is sharpened to **Fog of War only** as the product, with Draft960 reframed as a Fog of War **pregame feature** (optional start-position draft inside a FOW game). The historical Draft960 work below is preserved as completed scaffolding — it built the shared play surface and pregame state machine that Fog of War depends on. New Draft960 work happens as part of Fog of War milestones, not as standalone Draft960 polish.

## Milestone 5: Bid For White Experimental

Goal: two players can privately bid clock time for the White pieces, then play a normal timed game.

- [x] Define Bid For White rules.
- [x] Add bid submission and resolution events.
- [x] Replay resolved bids into swapped color seats and adjusted clocks.
- [x] Keep unrevealed opponent bids out of live pregame payloads.
- [x] Add a minimal bid submission UI.
- [x] Add browser smoke coverage for bid resolution and first move.

Checkpoint: two browser tabs submit bids, the higher bidder receives White with the bid deducted from their clock, and play starts.

Product status: implemented as an experimental/lab mode and kept out of the primary Create Room picker. Fog of War is the only flagship; Bid For White stays in the lab.

## Milestone 6: Fog of War Private Alpha

Goal: turn Fog of War into a reliable private alpha that two people can share, play, finish, and understand.

- [ ] Run the manual QA checklist for Fog of War.
- [ ] Convert Fog QA issues into focused regression tests.
- [ ] Improve Fog identity in the header and side panel.
- [ ] Add copy/share room-link affordance.
- [ ] Polish Fog board visuals, hidden-square styling, and mobile spacing.
- [ ] Polish postgame reveal, replay controls, and move-list behavior.
- [ ] Add visibility-history affordances that help players understand what each side could see.
- [ ] Decide persistence strategy for event logs and room recovery.
- [ ] Define the Fog engine/analysis direction.

Checkpoint: Fog of War can be shared with private testers with known limitations documented.

## Milestone 7: Fog of War Learning And Analysis

Goal: make Fog of War understandable after the game, not just playable during the game.

- [ ] Show a clean postgame transition from player view to full truth.
- [ ] Let replay switch between White view, Black view, and full-truth view.
- [ ] Mark moments where visibility changed materially.
- [ ] Identify king exposure, missed king-capture chances, and high-risk scouting moves.
- [ ] Add a basic legal-move bot that only consumes `PlayerView`.
- [ ] Add a heuristic Fog bot that beats random play without hidden-state access.
- [ ] Define the self-play data format for future model training.

Checkpoint: players can review a Fog game and understand the hidden-information decisions that shaped the result.

## Milestone 8: Fog of War + Draft960 Pregame Integration

Goal: Draft960 pregame becomes an optional starting-position picker inside Fog of War, replacing the standalone Draft960 mode as a primary product surface.

- [ ] Add a "starting position" choice on Fog of War room creation: standard start (default) or Draft960 draft.
- [ ] When Draft960 is chosen, generate three legal Chess960 starts and run the existing pregame selection state machine; resolve into a Fog of War game on the selected start.
- [ ] Verify visibility tests cover non-mirrored Chess960 starts (asymmetric vision from non-classical positions).
- [ ] Update the postgame reveal and replay flows to label and replay Draft960-start FOW games correctly.
- [ ] Demote standalone Draft960 mode from the primary Create Room flow; keep the URL accessible during the transition for existing tests but stop investing in standalone Draft960 polish.

Checkpoint: a single Create Room flow lets two players choose Fog of War with either standard or Draft960 start, and both paths play through to a clean reveal.
