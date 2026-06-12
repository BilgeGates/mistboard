# Dark Mini Xiangqi Runtime Design

> Status: historical implementation note. Dark Mini Xiangqi is now public alpha.
> Canonical source: [`dark-mini-xiangqi-plan.md`](dark-mini-xiangqi-plan.md) for
> current public-alpha status.
> Last reviewed: 2026-06-12.

Summary: historical implementation note for the hidden Dark Mini Xiangqi spike.
Dark Mini Xiangqi is now public alpha; use
[`dark-mini-xiangqi-plan.md`](dark-mini-xiangqi-plan.md) for current launch
status. This file remains useful for the runtime-boundary decisions that got
the spike into production.

Dark Mini Xiangqi should use the same platform boundary that Dark Xiangqi
proved: the server owns canonical truth, clients receive only recipient-scoped
views, and event history is the replay and reconnect source of truth. It should
not be threaded through the chess `Room`, `Color`, `VariantId`, or `PlayerView`
types.

## Scope

The first runtime slice is deliberately narrow:

- `dark-mini-xiangqi` has its own feature flag:
  `MISTBOARD_DARK_MINI_XIANGQI_ENABLED`.
- Mini room ids use a separate prefix, `dmxq_`.
- Direct PvP room creation and WebSocket play should remain hidden until each
  integration step has explicit regression tests.
- Lobby, rated play, PvE, engines, public watch, and chess replay/export
  surfaces stay rejected until individually integrated.

## Runtime Direction

Dark Mini Xiangqi should be the second data point for a small hidden-game
runtime adapter. The shared layer should own room infrastructure, not rules.

Shared platform responsibilities:

- exact feature-gated request resolution,
- room id allocation and cross-runtime collision checks,
- red/black seat tokens for fixed-seat two-player games,
- duplicate-seat displacement,
- ordered event appends and persistence failure behavior,
- per-recipient snapshot delivery,
- platform outcomes: abort, resignation, timeout, abandonment,
- unsupported-surface rejection.

Adapter-owned responsibilities:

- canonical state shape,
- move payload and validation,
- event union and event-log validation,
- replay reducer,
- player-view construction,
- hidden-information redaction,
- board geometry and browser rendering,
- postgame truth/spectator views.

This keeps future games viable without pretending they are chess. Dark Shogi
can own drops and hands; Dark Crazyhouse can own reserves; Dark Omega can own
geometry; Mini Xiangqi can own its 7x7 rules.

## Current Skeleton

Implemented:

- `packages/game/src/game-specs.ts` registers `dark-mini-xiangqi` as hidden
  `dev-spike` with no legacy live-room mapping.
- `packages/game/src/variants-mini-xiangqi.ts` owns the pure 7x7 rules and fog
  kernel.
- `apps/web/src/mini-xiangqi-spike.ts` mounts a DEV-only local board.
- `apps/server/src/game-spec-request-gate.ts` rejects `dark-mini-xiangqi`
  requests while the flag is off and still rejects them as not integrated while
  the flag is on.
- `apps/server/src/dark-mini-xiangqi-runtime.ts` defines the mini room id
  prefix, initial event log, hidden runtime room shape, and replay/hydration
  skeleton.

## Next Slices

1. Add a mini room factory and direct `POST /api/rooms` branch only for
   `mode=pvp`, behind `MISTBOARD_DARK_MINI_XIANGQI_ENABLED`.
2. Add WebSocket runtime resolution for `dmxq_` rooms.
3. Add red/black seat-token authority, duplicate displacement, and hello
   snapshots.
4. Add move validation and per-recipient event filtering.
5. Add clocks and lifecycle outcomes.
6. Add persistence, hydration, and a separate mini postgame route.

Each slice should preserve the Dark chess and Dark Xiangqi regression tests.
