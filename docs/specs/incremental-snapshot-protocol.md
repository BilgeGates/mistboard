# Incremental snapshot protocol

**Status:** SHIPPED. This snapshot→delta migration was implemented across three phases and is live; this spec is retained as the original design record. Note: the `apps/server/src/privacy-ws.test.ts` referenced below was renamed/split into `delta-ws.test.ts` + `payloads.test.ts` during implementation, and the "picking-up agent" brief at the end is historical. _(Originally: approved 2026-05-22, implementation pending.)_
**Author:** initial draft 2026-05-22; review pass + lock-ins 2026-05-22
**Owner:** unassigned

## TL;DR

Mistboard's WebSocket server currently broadcasts a full snapshot frame to every connected client after every state-changing event. The snapshot contains the entire event log (filtered per recipient for fog games), the full `PlayerView`, and a fan-out of room metadata. The bytes a client receives grow linearly with game length: ~50KB of incremental change information generates ~2-3MB of total client ingress over a 100-move game.

The proposal is to switch the steady-state wire format to incremental delta frames, and use full snapshots only for first-connect, reconnect, and periodic resync.

## Current design (as of 2026-05-22)

- **Single broadcast path.** `broadcastSnapshot` in `apps/server/src/room-manager.ts` calls `snapshotPayload` once per connected client and sends the result over each socket. Called after every `appendEvent`.
- **Snapshot shape.** Type `SnapshotMessage` in `apps/server/src/payloads.ts` and `apps/web/src/live-socket.ts`. Contains `state: PlayerView`, `events: GameEvent[]` (full history, filtered for fog), plus ~20 room-level fields (mode, seats, clocks, rematch state, etc.).
- **No incremental wire messages.** The protocol has `hello` (first-connect), `snapshot` (every update thereafter), and a handful of small messages (`rematch:state`, `server_restart_scheduled`, `pong`). There is no `event-appended` or `delta` message.

The current design was a deliberate v1 simplification: one wire format to implement and test, no client-side reconciliation state machine, trivial recovery from missed messages.

## The problem

Bandwidth and frame size grow linearly with game length, so cumulative ingress per side grows quadratically. Measured numbers (see "Verification" below):

| Game length (plies) | Per-side ingress | Combined ingress | Last-frame size (per side) |
|---|---|---|---|
| 20 (~10 moves)       | ~82 KB  | ~165 KB | ~5 KB  |
| 60 (~30 moves)       | ~400 KB | ~800 KB | ~11 KB |
| 100 (projected)      | ~940 KB | ~1.9 MB | ~17 KB |

Per-ply frame size grows ~150 bytes per ply (linear), driven by the re-sent event log.

This is **not currently breaking anything.** Even on the high end, a 60-ply dark chess game costs ~400KB per side — a fraction of a single image asset. The migration is justified by three forward-looking pressures, not present pain:

1. **Engine analysis broadcasts.** Adding engine-move overlays, belief-state pushes, or post-game annotation traces will fan out additional snapshot triggers. The quadratic cost compounds with the number of broadcast triggers, not just game length.
2. **Mobile / low-bandwidth play.** Per-side ingress of 400KB+ per game is tolerable on broadband but starts to matter on metered mobile data, especially with multiple games per session.
3. **Architectural ceiling.** The "snapshot on every event" model is correct but doesn't scale to features that add broadcast triggers. Better to migrate the wire format before the surface area widens, not after.

The original draft of this spec projected "1-3MB per side for typical games; potentially >10MB for very long games." The measurement showed those numbers were 3-5× too high. The shape (quadratic) is confirmed; the urgency is lower than the draft implied. **Read the rest of this spec with that recalibration in mind: this is a deliberate-pace architectural improvement, not a fire to put out.**

## Goals

1. **Steady-state bandwidth proportional to incremental change**, not to game length. After move 80, sending move 81 should ship ~200 bytes per recipient, not ~16KB.
2. **No regression in correctness.** All current fog-enforcement guarantees must hold. The article `server-enforced-fog` and the `privacy-ws.test.ts` regression suite remain authoritative.
3. **Reconnect and first-connect still work.** Clients can recover from any state by requesting a full snapshot. This is the fallback when deltas are missed.
4. **Backward-compatible rollout.** Server can run with old clients during deploy; new clients can talk to old servers gracefully (or fail loudly with a clear message).

## Non-goals

- Reducing the in-memory event log on the server. The event log remains canonical and is persisted in full to Postgres.
- Changing the fog-enforcement model. Per-recipient filtering still happens; the delta format must respect it.
- Compression. Worth measuring separately; out of scope for this spec.

## Proposed protocol

Add one new message type and one new request type. Snapshots continue to exist but are sent only at well-defined moments.

### `event-appended` (server → client)

Sent after each `appendEvent` succeeds. One message per recipient, with the same per-recipient filtering as today's `events` array in snapshot.

```ts
{
  type: 'event-appended';
  roomId: string;
  seq: number;          // monotonic sequence; matches room.events.length - 1
  event: GameEvent;     // already filtered per recipient (see fog rules)
  state: PlayerView;    // post-event view for THIS recipient
  // optional: room-level field diffs (clock tick, rematch offers, etc.)
  // sketch: clientsCount?, paused?, connectedSeats?, seatDisplayNames?, ...
}
```

`state` is included in full because it is small (~1-3KB depending on legal-move count) and because computing a `PlayerView` delta is more error-prone than recomputing the view from canonical state. This is the explicit non-optimization in the proposal.

### `snapshot:request` (client → server)

Sent by the client if `seq` ever skips, on first WebSocket open, or on reconnect. Server responds with the existing `snapshot` message.

```ts
{ type: 'snapshot:request' }
```

### When the server sends `snapshot`

- First-connect / reclaim (today's `hello` flow).
- On `snapshot:request` from any connected client.
- Periodically (configurable; consider every Nth event or every M minutes) as a self-healing measure.
- On structural changes that don't map cleanly to a single event (rematch redirect, server restart hydration).

For all other state changes — moves, clock ticks, offers, presence — `event-appended` is the wire message.

## Server changes

1. New helper alongside `broadcastSnapshot`: `broadcastEventAppended(ctx, room, event, seq)`. Computes the per-recipient filtered event and `PlayerView`, sends one `event-appended` per client. **Must reuse `eventsForClient` / `getClientView` from `payloads.ts`** — do not reimplement filtering. The new payload is a thin projection of the same per-recipient logic the snapshot path uses. (See "Privacy safety" below.)
2. **Wording fix vs original draft.** `appendEvent` does *not* broadcast today — its callers (`playMove`, `expireActiveClock` timer callback, presence/offer handlers, etc.) call `broadcastSnapshot(ctx, room)` themselves after the event is appended. The migration pattern is therefore: **wherever a caller follows `appendEvent` with `broadcastSnapshot`, switch the latter to `broadcastEventAppended(ctx, room, event, seq)`.** Sites that broadcast snapshots without a paired event-append (rare, but they exist — e.g. presence-only state hydration) keep calling `broadcastSnapshot` directly. Grep `broadcastSnapshot` and categorize each call site as "paired with appendEvent" or "standalone."
3. Handle the new `snapshot:request` message in the WS message handler. **Inherit the existing per-room auth from the WS connect path** — do not write a fresh auth check. A malicious client must not be able to request snapshots for rooms it isn't authorized to observe.

## Client changes

1. New message handler: on `event-appended`, append to local `events`, replace `state` with the new view, run the same hooks the snapshot handler runs.
2. Sequence check: if `seq` ever skips (`seq !== events.length`), discard the message, send `snapshot:request`, and resync from the resulting snapshot.
3. The legacy `snapshot` handler stays as-is. It is now the recovery path.

## Persistence considerations

No schema changes. The event log in Postgres is already the canonical record; the delta wire format is a thin projection of an event append. Pause/resume across server restart continues to rehydrate via the existing replay path.

## Migration / backward compatibility

Two-phase:

1. **Phase 1 (server first).** Server starts sending `event-appended` only when the client has opted in via a hello-time capability flag (e.g. `clientCapabilities: ['delta']`). Clients without the flag continue to receive full snapshots. Ship server.
2. **Phase 2 (client opt-in).** Web client advertises the `delta` capability and implements the new handler. Ship client. Verify in prod that delta-mode clients are healthy. After a soak period, server defaults to delta-mode for clients that don't advertise (no-flag = treated as delta-capable) and the legacy path is kept only for explicit `snapshot:request`.

A protocol version field on the hello message is the more disciplined alternative; capability flags are lighter weight for a single feature.

## Decisions locked in review (2026-05-22)

The original draft listed three open questions; two are now decided. Implementer should not relitigate without surfacing a specific objection.

- **Clock ticks: sibling `clock-tick` message, NOT part of `event-appended`.**
  Rationale: clock ticks are not in the event log today; the server derives the clock from `clock-started` + `move-played` events plus server time. Forcing them into `event-appended` would either pollute the `seq` stream with non-events (now `seq !== events.length - 1`) or require `event` to be optional (now every client handler has to branch). A separate `clock-tick` message keeps the invariant "one `event-appended` = one canonical event-log entry" intact.
- **Capability flag, not protocol version — for THIS rollout.**
  A `clientCapabilities: ['delta']` field on hello is right for a single-feature migration. **But the next wire-format change (engine-analysis broadcasts is the likely candidate) should add a `protocolVersion: number` to the hello handshake to avoid capability-flag soup.** Open an issue for that follow-up when this PR ships; don't bundle it into this migration.
- **`event-appended` carries `roomId`: yes, belt-and-suspenders.** Sockets are bound to one room today, but the field is cheap, makes message logs self-describing, and protects against future multi-room socket designs.

## Open questions (still open)

- How often should periodic snapshots fire? Bandwidth math suggests every ~30-60 minutes of game time, or never if `event-appended` is reliable enough. Cost of one wasted full snapshot is low; benefit is bounded recovery time on bug. **Implementer recommendation: skip the periodic snapshot in v1.** Reconnect already triggers a snapshot, and TCP guarantees in-order delivery on the open socket — there's no concrete bug class the periodic fallback protects against beyond client implementation errors. Add it later if a real drift bug appears.

## Privacy safety

This migration creates a second wire path that carries fog-filtered data. Any drift between the snapshot path and the delta path is a privacy bug.

**Required:**

1. **Shared filter functions.** `broadcastEventAppended` must call the existing `eventsForClient` / `getClientView` from `payloads.ts`. Do not reimplement per-recipient filtering for the delta path. The single source of truth for "what does seat X see" is shared between snapshot and delta payload builders.
2. **Sibling test suite.** Add `apps/server/src/delta-ws.test.ts` mirroring every assertion in `privacy-ws.test.ts`, run against the delta path. The two suites should be the same assertions over two payload generators. Keep `privacy-ws.test.ts` unchanged so the snapshot recovery path stays under contract.
3. **No tempo regression.** Today's snapshot system broadcasts on every event, so a delta migration does not widen the existing "opponent moved" tempo signal. Verify this by checking that delta frame timing for a given recipient matches snapshot frame timing on the same trace. If a recipient receives a delta when they wouldn't have received a snapshot (or vice versa), that's a new signal and a bug.
4. **`snapshot:request` auth.** Inherit room-access checks from the existing WS connect path. Do not write a new auth path.

## Parallel cleanups (re-evaluated 2026-05-22)

Three were identified during the spec review. Re-evaluating each:

- **~~Target `legalMoves` to the player-to-move.~~ Already in place.**
  `packages/game/src/variants.ts:158-160` — the FoW variant's `getPlayerView` already returns `legalMoves: []` when `state.status.turn !== player`. Confirmed by the bandwidth measurement: at ply 1 after white moves, white's off-turn frame is 2459 bytes, black's on-turn frame is 2641 bytes — the ~180-byte delta is the legalMoves payload going only to the player who needs it. No work needed at the variant layer. The wire frame still carries an empty `legalMoves: []` field, but stripping that ~10-byte field is not worth the type-signature churn standalone.

- **Encode `visibleSquares` as a 64-bit bitmask.** Deferred. ~30× compression on that field, but the client uses array semantics (`Set`, `includes`) throughout — refactoring is not worth doing standalone. Reconsider if post-delta frame size is uncomfortable.

- **Drop default-valued lobby fields from the payload.** Folded into the main migration, not done standalone. Estimated savings ~125 bytes per snapshot at default (`rematch`, `seatDisplayNames`, `selections`, `resolvedStartIds`, `offers` — most are empty for the entire game in regular PvP fog). Over a 60-ply game that's ~15KB combined. The delta migration drops these fields naturally because the `event-appended` payload only carries fields that actually changed. Doing the cleanup standalone would require the same server payload + client handler changes as Phase 1, for ~5% of Phase 1's savings. Skip.

**Conclusion:** no parallel cleanups should ship before Phase 1. Go straight to the main migration.

## Verification

The pre-flight measurement script is at `apps/server/scripts/measure-snapshot-bandwidth.mjs`. It spawns the production server entrypoint with in-memory persistence, opens two seated WS clients to a fog-of-war PvP room, plays N plies of legal moves (deterministic first-legal-move per ply, so the run is reproducible), and records the raw JSON byte size of every WS frame received per client.

Baseline result captured 2026-05-22 (commit on `main` at the time):

- 20-ply game: 82 KB / 80 KB per side, 165 KB combined.
- 60-ply game: 407 KB / 393 KB per side, 800 KB combined.
- Per-ply frame growth: ~150 bytes per ply per side (linear).
- Last-frame size at ply 60: ~11 KB per side, ~21 KB combined.

**Delta result captured 2026-05-22 after Phase 1** (reproduce with `DELTA=1 MOVES=60 node apps/server/scripts/measure-snapshot-bandwidth.mjs`):

- 60-ply game: 138 KB / 133 KB per side, **271 KB combined** (was 800 KB — 66% reduction).
- Per-ply frame size: ~2.0 to ~2.7 KB per side, **roughly constant in ply count**. Variation across plies comes from changing `legalMoves.length`, not from cumulative event-log growth.
- Last-frame size at ply 60: ~4.9 KB combined (was ~21 KB — 77% reduction).
- O(n²) shape eliminated; acceptance criterion #1 satisfied.

## Acceptance criteria

1. After implementation, a 60-move PvP game sends approximately `60 × (event + view + room delta)` bytes per client over the full game, not `O(n²)` bytes. Concretely: steady-state per-ply `event-appended` frame size should be roughly constant in ply count (probably ~3-5 KB, dominated by the full `PlayerView` payload), so a 60-move game's per-side ingress should drop from ~400 KB to ~50-100 KB combined-direction including reconnects.
2. `privacy-ws.test.ts` continues to pass with no relaxations. New tests cover: delta filtering matches snapshot filtering for fog games, `snapshot:request` recovery from synthetic seq skip, capability-flag handshake.
3. The captured artifact in `apps/web/src/article-snapshot-fog.json` and the `server-enforced-fog` article are updated to reflect whichever wire format is canonical post-migration (or to show both, with a note that one is the hydration path and the other is the steady-state path).
4. No reduction in reconnect/resume correctness. The pause/resume harness in `room-manager.ts` continues to drive clean rehydration on server restart.

## References

- Current broadcast path: `apps/server/src/room-manager.ts` `broadcastSnapshot`, `appendEvent`.
- Current payload shape: `apps/server/src/payloads.ts` `snapshotPayload`.
- Current client handler: `apps/web/src/live-socket.ts`, `apps/web/src/live-state.ts`.
- Regression coverage: `apps/server/src/privacy-ws.test.ts`.
- Article that depends on the wire format: `apps/web/src/articles-data.ts` (slug `server-enforced-fog`).

---

## Brief for the picking-up agent

You're picking up the implementation of the proposal above. The previous
session wrote the spec but did not start the implementation. Treat the
sections above as the design, not as a finished plan — push back on any
piece you think is wrong before coding it.

**Before you write any code, do these in order:**

1. Read this file end-to-end.
2. Verify the current behavior the spec is reacting to. Skim
   `apps/server/src/room-manager.ts` (`broadcastSnapshot`, `appendEvent`,
   `playMove`) and `apps/server/src/payloads.ts` (`snapshotPayload`,
   `eventsForClient`). Confirm for yourself that the snapshot path runs
   after every state-changing event and that the events array is the full
   filtered history. If reality has drifted from the spec, update the spec
   first.
3. Read `apps/server/src/privacy-ws.test.ts`. The new wire format must
   preserve every assertion in this file. Decide whether you'll extend
   this suite or add a sibling file (`delta-ws.test.ts` is probably
   cleaner — keep the existing privacy assertions stable).
4. Measure something. Stand up a local game (PvP, in-memory persistence
   is fine — see how `apps/server/scripts/capture-snapshot.mjs` does it),
   record a 20-move sequence, and dump per-client ingress. Confirm the
   O(n²) claim is roughly right and bandwidth scales the way the spec
   says. If it doesn't, the motivation needs to be rewritten before any
   wire-format change.

**Sketch the implementation order before starting:**

A reasonable order is server-first under a feature flag, then client, then
flip the default. Specifically:

- Phase 1 server-only changes (in one PR):
  - Add the `event-appended` message type to `apps/server/src/payloads.ts`
    alongside the existing snapshot payload. Build a sibling `eventAppendedPayload(room, client, event, seq)` that reuses the
    per-recipient filtering logic from `eventsForClient` and the same
    `PlayerView` derivation `snapshotPayload` uses.
  - Add `broadcastEventAppended` in `room-manager.ts` next to
    `broadcastSnapshot`. Wire `appendEvent` to call it instead of
    `broadcastSnapshot` only when a client has opted into the `delta`
    capability (read from the per-client state populated at hello time).
  - Add a `snapshot:request` handler that replies with a full snapshot.
  - Tests: a delta-capable client sees `event-appended` per event; a
    non-delta-capable client sees snapshots as today; both see the same
    filtered event sequence; the privacy assertions all still hold.
- Phase 2 client-only changes (a separate PR):
  - Declare the `delta` capability in the hello handshake.
  - Add the `event-appended` handler in `live-socket.ts`: append the
    event, replace `state`, run existing hooks (sound, render,
    interaction reconcile).
  - Sequence check: if `seq !== events.length`, discard, send
    `snapshot:request`, resync.
- Phase 3 (later):
  - Server defaults to delta for any client (or any client without the
    legacy capability flag). Legacy snapshot-per-event becomes the
    recovery path only.

**Tradeoffs already decided in spec review (don't relitigate without a specific objection):**

- Clock ticks: sibling `clock-tick` message, not part of `event-appended`. See "Decisions locked in review" in the main spec.
- Capability flag (not protocol version) for this rollout, with a follow-up issue to add `protocolVersion` for the next wire change.
- `event-appended` carries full `PlayerView`, not a diff. The spec calls this an explicit non-optimization; the privacy-bug risk of a clever diff is not worth ~1KB per move. **Don't try to be clever here.** If you genuinely find a clean diff with no new surface area, raise it as a separate proposal — don't bundle it into this migration.

**When you're done:**

1. Re-run the capture script — `node apps/server/scripts/capture-snapshot.mjs` will need a
   matching `capture-delta.mjs` (or a flag) that captures one
   `event-appended` frame to disk. Commit the new artifact alongside
   the existing hydration snapshot.
2. Update the `server-enforced-fog` article (slug in
   `apps/web/src/articles-data.ts`). The "Full snapshot on every event"
   sub-section in the tradeoffs needs to be rewritten — it currently
   says "this is what we do, here's the cost." After you ship, it
   becomes "this is what we used to do; here's the delta protocol we
   moved to; here's what we kept full snapshots for." Show both the
   hydration snapshot and an event-appended frame.
3. Memory: there is a `server_fog_article_parked` memory note that
   says the article is waiting on this work. Update it to reflect the
   delta protocol shipping.

**What is explicitly out of scope:**

- Compression. Worth measuring separately.
- Shrinking the in-memory event log or changing persistence. The full
  event log stays canonical in Postgres.
- Changing the fog-enforcement model in any way. The privacy regression
  suite is the contract.
- Engine analysis features that may layer additional broadcast triggers
  on top of `broadcastSnapshot`. They'll need to be updated to call the
  delta path too, but as a follow-on PR, not as part of this one.

**One bias to fight:** the existing snapshot-on-every-event design is
not stupid. It was a deliberate v1 simplification. Read the spec's
"Current design" section before you bring all the design discipline of
your training to bear on a piece of code that was correct for its
moment. The migration is justified by bandwidth growth, not by
architectural offense.
