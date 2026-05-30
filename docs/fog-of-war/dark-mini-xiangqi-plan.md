# Dark Mini Xiangqi Plan

_Last updated: 2026-05-30_

Status: launch plan for a candidate future Mistboard game spec. Dark Mini
Xiangqi is not implemented and is not a public Mistboard game mode yet.

## Purpose

Dark Mini Xiangqi is a candidate second flagship hidden-information game for
Mistboard. It tests whether a smaller xiangqi-family game can carry the same
serious play, study, ranking, and engine-building loop as Dark chess while
remaining more approachable than full 9x10 Dark Xiangqi.

Mini Xiangqi is attractive for Fog of War because it keeps the most distinctive
xiangqi mechanics--palace generals, horses, cannons, chariots, and sideways
soldiers--on a 7x7 board with fewer pieces. The smaller board should reduce
engine complexity and avoid the excessive opacity risk of full-size Xiangqi
under fog.

Reference baseline:

- PlayStrategy Mini Xiangqi rules: https://playstrategy.org/variant/minixiangqi
- Fairy-Stockfish supported variants: https://fairy-stockfish.github.io/variants/

These references are useful for orthodox Mini Xiangqi behavior and engine
comparison. Mistboard still needs its own explicit hidden-information rules.

## Product Scope

Dark Mini Xiangqi should be modeled as its own `GameSpec`, not as a chess
`VariantId` and not as a sub-option of `dark-xiangqi`.

Candidate taxonomy:

```ts
id: 'dark-mini-xiangqi'
publicName: 'Dark Mini Xiangqi'
family: 'xiangqi'
board: 'xiangqi-7x7'
movement: 'mini-xiangqi'
objective: 'general-capture'
visibility: 'dark'
setup: 'mini-standard'
reserves: 'none'
dropPolicy: 'none'
ratingPoolBase: 'dark_mini_xiangqi'
publicSurface: 'hidden'
runtimeStatus: 'future'
```

Required taxonomy additions:

- `BoardGeometryId`: `xiangqi-7x7`
- `MovementRulesId`: `mini-xiangqi`
- `SetupRulesId`: `mini-standard`
- `RatingPoolBaseId`: `dark_mini_xiangqi`
- `GameSpecId`: `dark-mini-xiangqi`

The first playable slice should be direct PvP only. Ratings, lobby matchmaking,
public watch, public replay, rematch, PvE, and engine-vs-engine should remain
unsupported until each surface has explicit Dark chess, Dark Xiangqi, and Dark
Mini Xiangqi regression coverage.

## Candidate Rules

The initial ruleset should follow Mini Xiangqi's board and material while
adopting Mistboard's hidden-information conventions.

- Board: 7 files by 7 ranks.
- Seats: red and black.
- Pieces: general, horse, cannon, chariot, and soldier.
- Palace: each general is confined to a 3x3 palace.
- No advisors, elephants, river, promotion, castling, reserves, or drops.
- Soldiers move and capture one square forward or sideways from the start.
- Legal moves use true-board Mini Xiangqi geometry.
- The game ends when a general is captured.
- If the side to move has no legal move, that side loses by immobilization.
- Repetition and progress-clock draws should start simple and server-owned.
- Full xiangqi perpetual-check and chasing rules should be deferred until
  playtesting shows they are necessary.

Open rule decision:

- Whether the hidden-information version ignores check and facing-general
  illegality like current Dark Xiangqi, or preserves some orthodox restrictions.

The default recommendation is to mirror Dark Xiangqi: no check warnings, no
checkmate adjudication, and general capture decides the game. This avoids
server-generated warning information that a player could not necessarily infer
from their view.

## Fog Rules

The first candidate should reuse the current Dark Xiangqi visibility policy
where it applies.

A player sees:

- all of their own pieces,
- all squares their own pieces see under Dark Mini Xiangqi visibility,
- opponent pieces on visible unshrouded squares,
- shrouded occupancy for hidden blockers and cannon screens when the rules call
  for it.

A player must not see:

- opponent pieces outside visible squares,
- whether a hidden square is empty or occupied,
- roles for shrouded blockers or screens,
- empty cannon gap squares between a screen and target.

Piece visibility:

- General: palace orthogonal destinations, plus any explicit facing-general
  rule chosen for the variant.
- Horse: legal L-shaped destinations; a blocked leg appears as occupied but
  unidentified.
- Chariot: orthogonal rays through empty squares, stopping at the first piece.
- Cannon: quiet rook-like destinations before the screen; screen shrouded;
  capturable target revealed; gap squares fogged.
- Soldier: forward and sideways destinations from the start.

The cannon rule should start as **screen shrouded, target revealed**. This
preserves the actionable fact that a cannon can capture while avoiding the
stronger leak of revealing the screen's identity.

## Milestones

### 1. Product Spec

Write the canonical rules doc before implementation spreads.

Deliverables:

- public rules page or contributor-facing rules doc,
- explicit answers for cannon visibility, blocked horses, facing generals,
  repetition, immobilization, and terminal reveal,
- `GameSpec` placeholder and tests,
- no room creation or public UI.

Gate:

- reviewers can explain every rule without reading implementation code.

### 2. Pure Rules Kernel

Create a pure package-level rules module, likely
`packages/game/src/variants-mini-xiangqi.ts`.

Deliverables:

- board helpers for 7x7 coordinates,
- initial setup,
- move generation,
- move application,
- general-capture termination,
- immobilization termination,
- simple repetition/progress-clock handling,
- unit tests for every piece and terminal condition.

Gate:

- deterministic rules tests pass,
- orthodox non-fog behavior matches the selected references where relevant.

### 3. Fog Kernel

Add player-view generation and privacy tests.

Deliverables:

- recipient-scoped player view,
- shrouded board entry type that omits hidden roles,
- cannon screen/target/gap behavior,
- horse-leg blocker behavior,
- hidden-move and hidden-piece regression tests.

Gate:

- tests prove no hidden piece role, hidden empty square, cannon gap, or
  opponent-only move leaks through the view.

### 4. Local Play Lab

Build a hidden local development surface.

Deliverables:

- `/mini-xiangqi-spike` or equivalent hidden route,
- 7x7 board renderer,
- red/black orientation,
- legal move highlighting,
- move list,
- random/legal bot,
- dev-only true-board diagnostics.

Gate:

- the game is playable locally on desktop and mobile-sized viewports,
- manual play shows fog is tactically legible rather than mostly random.

### 5. Hidden Live Runtime

Integrate as a separate non-chess runtime, using the Dark Xiangqi live boundary
as the precedent.

Deliverables:

- feature flag, for example `MISTBOARD_DARK_MINI_XIANGQI_ENABLED`,
- reserved room prefix, for example `dmxq_`,
- direct PvP room creation only,
- red/black seat tokens,
- reconnect and duplicate-seat displacement,
- recipient-scoped snapshots,
- move event privacy filtering,
- abort, resign, timeout, and disconnect-forfeit handling.

Gate:

- two-client integration tests pass for move play, reconnect, displacement,
  hidden opponent moves, terminal events, and flag-off behavior.

### 6. Private Replay And Postgame

Add enough review support to debug real games without exposing hidden truth.

Deliverables:

- private postgame endpoint,
- fogged replay by player perspective,
- basic persisted game summary,
- internal JSON export for debugging.

Gate:

- completed games can be reviewed from each seat without exposing the wrong
  perspective.

### 7. UX Hardening

Make the game feel deliberate rather than experimental.

Deliverables:

- responsive 7x7 board,
- clear piece glyphs,
- cannon target affordance,
- touch move/cancel behavior,
- share/invite flow,
- rules surface,
- loading, empty, and error states,
- accessibility pass for red/black and shrouded pieces.

Gate:

- desktop and mobile visual checks pass for first load, midgame, terminal,
  reconnect, and narrow viewport states.

### 8. Engine Track

Add engine support only after live PvP is stable.

Deliverables:

- random/legal baseline,
- capture-seeking baseline,
- Mini Xiangqi extension to the hidden-information engine protocol,
- beginner engine calibration,
- self-play mining only after the perspective contract is tested.

Gate:

- engine requests never include hidden truth outside the engine's legal
  perspective,
- beginner play strength is stable enough for onboarding.

### 9. Soft Launch

Expose narrowly before adding durable public surfaces.

Deliverables:

- hidden or invite-only entry point,
- direct PvP only,
- instrumentation for average ply count, resignation rate, timeout rate, repeat
  play, and rules confusion,
- feedback loop focused on cannon and blocker comprehension.

Gate:

- observed games show that fog produces useful tension rather than excessive
  guessing.

### 10. Public Launch

Promote only after the game earns a public slot.

Deliverables:

- homepage variant selector entry,
- public rules/explainer page,
- beginner engine option if ready,
- announcement card,
- optional article explaining why Mini Xiangqi works under fog.

Gate:

- privacy tests, mobile UX, live reliability, and onboarding all meet the same
  bar expected for Dark chess.

## Non-Goals For The First Launch Track

- Do not add Dark Mini Xiangqi to chess `VariantId`.
- Do not make it a sub-option of `dark-xiangqi`.
- Do not surface it in the homepage selector before hidden live tests pass.
- Do not implement full perpetual-chase rules before playtesting.
- Do not add ratings, public leaderboard, tournaments, or matchmaking before the
  integrity gates are cleared.
- Do not start with a strong engine; start with correctness and onboarding.

## Relationship To Dark Xiangqi

Dark Mini Xiangqi can reuse the architectural lessons from Dark Xiangqi:

- `GameSpec` is the canonical cross-family selector.
- Non-chess games should not be forced through chess `VariantId`.
- Server-owned canonical state and recipient-scoped views are mandatory.
- Shrouded blockers and cannon screens must not leak roles.
- Live runtime boundaries are safer than widening chess room types.

It should not blindly share implementation. A narrow duplicate spike is
acceptable until the Mini rules feel good. Generalizing the Xiangqi-family
runtime should happen only after both full Dark Xiangqi and Dark Mini Xiangqi
have stable contracts.
