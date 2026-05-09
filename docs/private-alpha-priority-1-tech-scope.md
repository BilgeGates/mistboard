# Private Alpha Priority 1 Tech Scope

Priority 1 work makes the safe live game experience useful enough for testers to
play, finish, and review without operator coaching. It should follow Priority 0
safety work unless a small UX or review fix directly helps verify Priority 0.

## Track 1: Replay / Review Experience

Status: ready for audit and small implementation slices.

Builder readiness: ready to pick up now.

Outcome: when a Fog game ends, players understand that hidden truth is now
revealed and can review the game from White, Black, or full-truth perspectives.

### Invariants

- Live player views must stay seat-scoped until terminal state.
- Finished games may expose full truth.
- Review URLs should be stable and shareable for finished games.
- The selected review perspective should control board rendering and any move
  list or timeline affordance that could otherwise contradict the board.
- Replay should be useful for debugging Priority 0 and rules issues.

### Technical Scope

- Audit the live terminal-state transition and `/game/:id` review path.
- Verify White view, Black view, and full-truth modes are preserved after game end.
- Verify replay data is loaded from persisted events when available.
- Align move-list behavior with the selected perspective.
- Make the "review game" handoff clear without adding a broad analysis feature.

### Builder-Sized Tasks

1. Replay audit: document current live-to-review flow, data sources, and gaps.
2. Perspective consistency: ensure board and move-list state follow the selected
   White/Black/full-truth perspective.
3. Review handoff polish: make terminal live rooms clearly offer review without
   obscuring the final board state.
4. Regression coverage: add focused tests for finished-game event exposure and
   review payload behavior where server coverage is practical.

### Verification

- Finish a Fog game.
- Open the review URL.
- Switch White, Black, and full-truth perspectives.
- Confirm board state, move list, and terminal result match the selected mode.
- Confirm live pre-terminal replay APIs remain protected by Priority 0 policy.

## Track 2: Private-Alpha Play UX

Status: ready for audit; implementation should stay narrow until Priority 0
reconnect and access behavior is stable.

Builder readiness: ready for audit now, ready for implementation after any
reconnect/token UI states are known.

Outcome: two invited testers can create or open a Fog room link, understand
their seat and game status, play on desktop or mobile, and recover from basic
connection states.

### Invariants

- The play surface should be board-first.
- Room creation should stay focused on Fog of War.
- Share-link affordances should not leak authority tokens.
- Status text should make seat, turn, reconnect, rejection, and game-over states
  unambiguous.
- Mobile layout should avoid horizontal overflow and preserve board usability.

### Technical Scope

- Audit create-room and share-link surfaces.
- Audit seat, turn, spectator/rejected, reconnect, duplicate-tab, and game-over messaging.
- Polish hidden-square styling only where it improves play clarity.
- Check desktop and mobile-width layouts.
- Coordinate duplicate-tab UI with Priority 0's locked "newest valid socket wins" behavior.

### Builder-Sized Tasks

1. UX audit: capture the current create/join/play/reconnect/game-over path and
   list confusing states.
2. Share-link pass: make room link copying easy while keeping seat tokens out of
   URLs and visible text.
3. Status pass: tighten seat, turn, reconnect, rejected, duplicate-tab, and
   terminal copy.
4. Mobile smoke pass: fix obvious board/sidebar overflow and spacing issues.

### Verification

- Create a Fog room and copy/share the room link.
- Join from a second browser context.
- Confirm both players understand their seat and turn.
- Trigger reconnect and duplicate-tab states after Priority 0 support lands.
- Finish the game and confirm the transition to review is clear.
- Check desktop and mobile-width layout.

## Track 3: Fog Rules Regression Coverage

Status: ready to pick up now. This is not a rules rewrite; it is a regression
net around implemented Fog behavior and high-cost edge cases.

Builder readiness: ready to pick up now.

Outcome: the implemented Fog rules have enough focused regression coverage that
private-alpha testers can stress ordinary play and known edge cases without
rediscovering already-understood rules bugs.

### Invariants

- The server owns canonical board truth.
- Player views expose only the squares visible to that player.
- Legal move destinations are derived by the server and scoped to the player view.
- Hidden opponent moves should not reveal more than the rules allow.
- Terminal state reveals full truth consistently.

### Technical Scope

- Expand `packages/game` visibility and move-application tests for alpha-stress edge cases.
- Keep payload tests for hidden move/board exposure aligned with rules tests.
- Prefer small position-specific tests over broad scenario fixtures.
- Document known limitations only if a rule edge case is intentionally deferred.

### Builder-Sized Tasks

1. Pawn visibility tests: empty diagonals, capturable diagonals, forward moves,
   and blocked pawns.
2. Special-move tests: en passant visibility and capture handling.
3. Terminal tests: king capture, draw termination, and full-truth postgame reveal.
4. Last-move visibility tests: confirm players only receive last-move information
   they are allowed to infer.
5. Chess960/Fog prep: add coverage for non-standard starts only when Draft960
   pregame returns to active scope.

### Verification

- `npm test --workspace @bichess/game`
- `npm run test --workspace @bichess/server` when payload behavior is touched
- Manual QA finds no unresolved rules mismatch in the private-alpha smoke path
