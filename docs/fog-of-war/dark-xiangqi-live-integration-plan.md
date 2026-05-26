# Dark Xiangqi Live Integration Plan

_Last updated: 2026-05-26_

Status: architecture plan for a hidden, flag-gated integration. Dark Xiangqi is
not a public Mistboard game mode yet.

## Purpose

Dark Xiangqi should exercise Mistboard's long-term platform shape without
weakening the existing Dark chess product. The integration should prove that a
non-chess hidden-information game can use the same platform principles:

- the server owns canonical state,
- clients receive only player views,
- event history is the reconnect and replay source of truth,
- public surfaces remain deliberate and flag-gated.

This work is foundational. It should not be treated as "add another
`VariantId`" or as a quick UI toggle.

## Non-Negotiable Invariants

- Dark Xiangqi requests must never fall through to Dark chess.
- Chess `VariantId` stays chess-only until the platform has a deliberate
  cross-family runtime boundary.
- Xiangqi canonical state is never serialized to clients.
- Shrouded Xiangqi blockers and cannon screens must not include piece roles in
  outbound payloads.
- Cannon gap squares between screen and target stay fogged.
- Live seated players see their own move events only; opponent move coordinates
  remain hidden.
- Live spectators are rejected. If a spectator payload path is ever reached, it
  returns an empty view.
- The public room, lobby, rating, persistence, replay, and engine surfaces stay
  unchanged until each one has explicit tests for Dark chess, Draft960, and Dark
  Xiangqi.

## Current State

Implemented pieces:

- `packages/game/src/game-specs.ts` defines `dark-xiangqi` as a separate
  `GameSpecId` with family `xiangqi` and no legacy live-room mapping.
- `packages/game/src/variants-xiangqi.ts` owns the pure Xiangqi rules and
  visibility kernel.
- `apps/web/src/xiangqi-spike.ts` is a hidden local sandbox with local bot
  self-play.
- `apps/server/src/game-spec-request-gate.ts` prevents `dark-xiangqi` requests
  from silently normalizing to Dark chess.
- `apps/server/src/dark-xiangqi-runtime.ts` starts a separate hidden server
  runtime core for replay-derived Xiangqi state and redacted Xiangqi snapshots.

The existing live-room stack is chess-shaped:

- server `Room` stores chess `GameEvent`, `GameProjection`, `VariantId`, and
  white/black seat-token state,
- `snapshotPayload()` returns chess `PlayerView`,
- clocks, abort windows, forfeits, rematch, persistence, ratings, and engine
  scheduling all assume chess `Color`.

Forcing Xiangqi through that shape would create hidden-information risk and make
future non-chess games harder.

## Core Design Decision

Introduce an explicit live runtime boundary:

```ts
type LiveRuntime =
  | { kind: 'chess'; room: ChessRoom }
  | { kind: 'dark-xiangqi'; room: DarkXiangqiRoom };
```

The boundary should expose operations, not shared canonical types:

- create room,
- connect or reclaim a seat,
- append a validated event,
- apply a move,
- build a recipient-scoped snapshot,
- filter event history for a recipient,
- report connected seats,
- close or clean up a room.

The shared WebSocket envelope can stay familiar, but the inner `state`,
`events`, and `seat` types are runtime-specific. Chess clients render chess
`PlayerView`; Xiangqi clients render a Xiangqi wire view.

## Request Resolution

`gameSpecId` is the canonical selector for non-chess runtimes.

- `variant` remains a legacy chess selector.
- `variant=dark-xiangqi` may be rejected for compatibility diagnostics, but new
  code should use `gameSpecId=dark-xiangqi`.
- With `MISTBOARD_DARK_XIANGQI_ENABLED` unset, all Dark Xiangqi entry points
  return hidden/not-found behavior.
- With the flag set, only explicitly integrated entry points may create or join
  Dark Xiangqi rooms.

First live slice:

- `POST /api/rooms` may create a Dark Xiangqi room only when
  `body.gameSpecId === 'dark-xiangqi'`, `mode === 'pvp'`, and the server flag is
  enabled.
- Lobby, rated play, PvE, rematch, persistence, and public replay remain
  rejected for Dark Xiangqi.
- WebSocket-only room creation should not create Dark Xiangqi rooms in the first
  slice. A Dark Xiangqi room should be created by the HTTP path first, then
  joined by room id.

Room ids must be unique across chess and Xiangqi room maps. Either use one id
allocator that checks both maps or reserve a hidden Xiangqi prefix.

## Seat Model

Dark Xiangqi seats are `red` and `black`, plus the defensive internal
`spectator` case.

The first live slice should implement red/black seat tokens before any browser
route is exposed. Reconnect and device-displacement bugs are hidden-information
bugs in practice; a hidden experimental mode can skip persistence, but it should
not skip seat authority.

Recommended behavior:

- first connector gets red unless the room creation request stores a creator
  preference,
- second connector gets black,
- third connector is rejected for live play,
- a valid red/black seat token reclaims that seat,
- copied client ids without a matching token do not reclaim a seat,
- existing chess seat-token tests remain unchanged.

## Wire Payload Shape

Dark Xiangqi should not reuse chess `PlayerView`. Use a Xiangqi wire view whose
board entries make redaction explicit:

```ts
type DarkXiangqiWireBoardEntry =
  | { piece: XiangqiPiece; shrouded: false }
  | { color: XiangqiColor; shrouded: true };
```

That means a shrouded enemy screen can communicate "black occupancy" without
leaking `advisor`, `horse`, `cannon`, or any other role.

Required payload behavior:

- own pieces include full piece identity,
- visible unshrouded enemy pieces include full piece identity,
- shrouded blockers/screens include color and `shrouded: true`, no role,
- hidden pieces are absent,
- hidden empty squares are absent,
- cannon gap squares are absent from both `board` and `visibleSquares`,
- live terminal snapshots stay fogged; full-truth reveal, if added, belongs to
  a later replay/export surface with its own tests.

## Event Model

Dark Xiangqi should have its own event union until a generic event envelope is
proved useful. The initial set is enough:

- `room-created`,
- `seat-assigned`,
- `seat-vacated`,
- `move-played`.

Clock, resignation, abandonment, pause/resume, and replay-export events should
be added one at a time with tests. Do not reuse chess terminal event payloads
until the color and reason semantics are explicit for Xiangqi.

Move events in live snapshots are filtered like Dark chess:

- red sees red move events,
- black sees black move events,
- spectators see no move events,
- every client still receives a fresh player view after any move.

## Unsupported Until Explicitly Added

The first hidden live integration should reject:

- lobby matchmaking,
- rated games,
- PvE/bot games,
- engine requests,
- clocks and time controls,
- rematch,
- persistence/hydration,
- public replay,
- public leaderboard and recent-games surfaces.

This is not a product limitation; it is a safety boundary. Each item above
touches hidden-information correctness or platform integrity and should be
integrated behind its own regression tests.

## Implementation Slices

### Slice 0 - Current Foundation

Already present or in progress:

- GameSpec taxonomy includes Dark Xiangqi.
- Pure Xiangqi rules and fog tests exist.
- Client spike is hidden behind a build flag.
- Server request gate prevents fallthrough to Dark chess.
- Hidden server Xiangqi runtime core can replay events and build redacted
  snapshots.

Exit criteria:

- game package tests pass,
- server flag/gate/runtime tests pass,
- web flag tests pass,
- Dark chess payload tests still pass.

### Slice 1 - Runtime Resolver And Direct Room Creation

Add a server resolver that maps a request to a live runtime:

- chess specs resolve to the existing chess room code,
- `dark-xiangqi` resolves to the Xiangqi runtime only when the server flag is on,
- unsupported specs reject before room creation.

Wire `POST /api/rooms` for hidden Dark Xiangqi PvP direct rooms only.

Exit criteria:

- flag-off `dark-xiangqi` returns the current hidden response,
- flag-on `gameSpecId=dark-xiangqi` creates a Xiangqi room,
- `variant=dark-xiangqi` does not create a chess room,
- lobby/rated/PvE/time-control requests still reject,
- chess Dark chess and Draft960 room creation behavior is unchanged.

### Slice 2 - WebSocket Join And Move Loop

Add a separate WebSocket branch for existing Dark Xiangqi rooms:

- red/black seat assignment,
- seat-token reclaim,
- initial snapshot,
- move validation through `variants-xiangqi.ts`,
- event append and per-recipient snapshot broadcast,
- third-client rejection.

Do not introduce persistence or clocks in this slice.

Exit criteria:

- two-client integration test can create, join, move, and reconnect,
- red and black receive seat-scoped views,
- opponent moves are filtered,
- shrouded roles and cannon gap squares are absent from wire payloads,
- existing chess WebSocket integration tests still pass.

### Slice 3 - Hidden Browser Adapter

Add a flagged client route or mode that renders the Xiangqi wire payload.

The safest first client surface is an extension of the Xiangqi spike, not the
main chess live renderer. The chess live renderer assumes chess board geometry,
piece roles, move notation, captures, and clocks.

Exit criteria:

- local hidden route can create/join a server-owned Dark Xiangqi room,
- board renders red and black perspectives,
- shrouded entries render without role identity,
- replay scrub for the local session still uses player views, not truth,
- public nav and variant selectors remain unchanged.

### Slice 4 - Clocks And Platform Results

Generalize clock/result handling for runtime seats or add Xiangqi-specific
clock handling behind the runtime boundary.

Exit criteria:

- timeout result works for red/black,
- resignation and abandonment work for red/black,
- abort/forfeit windows are tested or intentionally excluded,
- Dark chess clock tests remain unchanged.

### Slice 5 - Persistence And Public Replay

Persist Xiangqi events only after the event schema and postgame reveal policy
are decided.

Open decision:

- Should public Dark Xiangqi replay reveal full truth after terminal state, or
  should it preserve player-view history by default?

Exit criteria:

- persistence migration stores runtime kind or game spec safely,
- replay reconstructs from events,
- live games are not publicly observable before terminal state,
- postgame API behavior is tested for both seated and public consumers,
- existing chess game export and replay behavior is unchanged.

### Slice 6 - Bot And Engine Work

Do this after human-vs-human live play is correct.

Required decisions:

- whether the first bot is server-local and god-view, or goes through a
  redacted Xiangqi engine protocol,
- whether bot games are labeled as training/casual only,
- how engine requests represent Xiangqi board geometry and shrouded occupancy.

Exit criteria:

- bot receives only the information policy it is supposed to receive,
- engine protocol cannot request canonical truth by accident,
- PvE games cannot enter rated pools,
- existing Dark chess engine fallback remains unchanged.

## Regression Matrix

Run these while developing:

- `npm run test:unit --workspace @mistboard/game`
- `npm run test:unit --workspace @mistboard/server`
- `npm run test:integration --workspace @mistboard/server` once WebSocket wiring
  starts,
- `npm run test:unit --workspace @mistboard/web`
- `npm run typecheck`

Targeted assertions to keep:

- Dark Xiangqi flag is exact-string opt-in.
- Dark Xiangqi request with flag off is hidden.
- Dark Xiangqi request with unsupported surface rejects.
- `variant=dark-xiangqi` cannot normalize to Dark chess.
- Dark chess seated payload hides hidden opponent pieces and opponent moves.
- Dark chess spectator payload is empty or rejected as designed.
- Draft960 hidden draft data remains redacted.
- Dark Xiangqi cannon gap squares are absent.
- Dark Xiangqi shrouded entries do not serialize piece roles.
- Dark Xiangqi opponent move coordinates are absent.
- All runtime branches report `gameSpecId` correctly.

## Manual Local Checks

Before any public exposure:

- flag off: direct Dark Xiangqi HTTP create returns hidden/not-found behavior,
- flag on: direct Dark Xiangqi HTTP create returns a room only for the supported
  surface,
- two browser windows can join red and black,
- third browser window is rejected,
- refresh/reconnect preserves the same seat with a token,
- copied URL without token cannot steal a seat,
- red and black perspectives do not show the same hidden information,
- a known cannon screen/target position keeps gap squares fogged.

## Keep Out Of Scope

Do not combine Dark Xiangqi integration with:

- public launch copy,
- rated leaderboard work,
- Draft960 surfacing,
- engine protocol expansion,
- persistence migrations,
- broad live-render refactors.

Those may become important later, but combining them with the runtime boundary
would make hidden-information regressions harder to isolate.
