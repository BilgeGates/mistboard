# Dark Mini Xiangqi Plan

> Status: historical integration record plus current public-alpha state.
> Canonical source: [`../ROADMAP.md`](../ROADMAP.md) for rated, distribution,
> and launch sequencing.
> Last reviewed: 2026-06-12.

_Last updated: 2026-06-09_

Summary: **public alpha, casual-only.** Dark Mini Xiangqi (DMX) is a real
`GameSpec` with a working PvP live runtime, replay/postgame, family-aware
appearance, variant-aware lobby, a Misty/EngineV2-backed PvE engine, public
rules, public entry, and a watch channel for public PvE games. Production still
uses explicit runtime/render/public-entry flags, but the launch ladder has moved
from build integration to distribution, content mining, regional access, and
future rated-gate decisions.

### Milestone status (2026-06-09)

| #  | Milestone               | Status |
|----|-------------------------|--------|
| 1  | Product Spec            | done |
| 2  | Pure Rules Kernel       | done |
| 3  | Fog Kernel              | done |
| 4  | Local Play Lab          | done |
| 5  | Hidden Live Runtime     | done |
| 6  | Private Replay/Postgame | done |
| 7  | UX Hardening            | done (W1–W6 + post-W6 polish, parity with Dark chess) |
| 8  | Engine Track            | **PvE built** (`python-dmx-v1.0`: EngineV2 with `MiniXiangqiRules`, variant-aware protocol, redaction-tested perspective contract, PvE move loop). |
| 9  | Soft Launch             | done: public entry, PvP/PvE/lobby, analytics, and rules/article surfaces are live |
| 10 | Public Launch           | alpha: public casual play is live; broader distribution, regional readiness, and rated ladder are separate gates |

Deferred (not on the launch ladder): DMX **rated pool / lobby ranking** (casual
PvP only today; `dark_mini_xiangqi` rating base exists in the spec but is not
wired to a ladder). Distribution/content planning is tracked privately so public
docs stay contributor-safe.

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

### 8. Engine Track: PvE built (2026-06-04/05)

Engine support landed after live PvP stabilized. DMX PvE is served by the
first-party Misty/EngineV2 path registered as `python-dmx-v1.0`. That worker
uses `MiniXiangqiRules` and the variant-aware engine protocol; Fairy-Stockfish is
only the optional Mini Xiangqi leaf evaluator when the binary is available, with
a material leaf fallback otherwise.

Deliverables:

- ~~random/legal baseline~~ / ~~capture-seeking baseline~~, superseded by the
  first-party `python-dmx-v1.0` engine-worker path,
- **done**: Mini Xiangqi extension to the hidden-information engine protocol
  (`gameSpecId`, `shrouded`, mini piece letters; `f23b4b2`), engine registry +
  variant-aware worker spawn (`ded93a1`), request builder (`3abefe1`), PvE
  runtime move loop (`10f8b90`), engine-seat reservation lifecycle (`28c81b6`,
  `e28dcf6`, `785247b`),
- **done**: DMX-specific worker spawn (`--game dark-mini-xiangqi`) and boot
  warmup path, without exposing the DMX engine in the generic dark-chess PvE
  picker,
- self-play mining: deferred (perspective contract is tested; mining is not on
  the launch ladder).

Gate:

- **met**: engine requests never include hidden truth outside the engine's
  legal perspective (redaction test in `3abefe1`),
- **met for soft launch**: current `python-dmx-v1.0` strength is acceptable for
  plumbing validation; strength tuning can continue after real soft-launch data.

### 9. Soft Launch

Expose narrowly before adding durable public surfaces.

**Telemetry scope (decided 2026-06-06): system-health, not game-quality.** The
soft-launch question is "does the plumbing work end to end?", not "is the game
fun?". The funnel is queue -> match -> start -> finish, sliceable by game spec:

- `lobby_queue_joined` / `lobby_match_found`: already fire for DMX (shared
  `landing-play.ts`, tagged via `gameSpecAnalyticsPropsForId`).
- `game_started` / `game_finished`: now emitted by the DMX live stack via the
  shared `createGameLifecycleTracker()` in `analytics.ts` (done 2026-06-06).
  `game_finished` carries `winner`, `reason`, `moveNumber`, `durationMs`;
  `reason` doubles as a health signal (a `timeout`/`abandonment` spike = clock or
  reconnect plumbing failing, not a quality issue).
- Engine health (PvE): already covered, game-agnostic, by `EngineCounters` in
  `apps/server/src/obs.ts` (turns started/completed/failed, timeouts, fallbacks,
  python-pool errors) with `engineAlertFields` thresholds.
- Client crashes: covered for free by PostHog `capture_exceptions: true`
  (`main.ts`); `$exception` events surface a broken DMX page.

Deliverables:

- deep-link entry behind the base runtime/render flags
  (`/?play=friend&gameSpecId=dark-mini-xiangqi`, plus PvE/lobby equivalents),
- PvP and PvE enabled through the DMX room route,
- public discovery still gated by `VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED`,
- the system-health funnel above (DMX inherits all of it now; no additional
  instrumentation is required before soft launch).

**Deferred to post-soft-launch (game-quality, only pays off at volume):** average
ply count, resignation/repeat-play rates read as fun-signals, and cannon/blocker
rules-confusion instrumentation. These are product questions, not "did it work"
questions; revisit once the plumbing is proven and there's real game volume.

Gate:

- the funnel shows games reliably reaching `game_finished` with clean terminal
  reasons (capture/resign), not stalling between match and start or dying on
  `timeout`/`abandonment`.

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
