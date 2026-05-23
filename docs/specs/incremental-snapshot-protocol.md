# Incremental snapshot protocol

**Status:** proposal — not implemented
**Author:** initial draft 2026-05-22
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

Bandwidth and frame size grow linearly with game length. Concretely:

- An average `move-played` event is ~180 bytes JSON.
- A 60-move dark chess game has 60 such events plus ~6 lifecycle events (`room-created`, `seat-assigned` × 2, `clock-started`, finalization).
- Each post-move snapshot contains all of them, sent to each connected client.
- Total client ingress per game: roughly `O(n²)` bytes where `n` is the number of moves. ~1-3MB per side for typical games; potentially >10MB for very long games or games with frequent presence churn (each reconnect triggers a fresh snapshot).

This is not currently breaking anything. It is wasteful, will get worse with engine analysis features (which fan out additional snapshot triggers), and constrains future mobile/low-bandwidth play.

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

1. New helper alongside `broadcastSnapshot`: `broadcastEventAppended(ctx, room, event, seq)`. Computes the per-recipient filtered event and `PlayerView`, sends one `event-appended` per client.
2. `appendEvent` calls `broadcastEventAppended` instead of `broadcastSnapshot` for the common case. The few sites that need to push a full snapshot (e.g. presence/state hydration not tied to a single event) keep calling `broadcastSnapshot` directly.
3. Handle the new `snapshot:request` message in the WS message handler.

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

## Open questions

- Should clock ticks ship as `event-appended` or as a smaller `clock-tick` message? Today the clock is computed from `clock-started`/`move-played` events plus server time; ticks are not events. A `clock-tick` message that's not part of the event log might be cleaner.
- How often should periodic snapshots fire? Bandwidth math suggests every ~30-60 minutes of game time, or never if `event-appended` is reliable enough. Cost of one wasted full snapshot is low; benefit is bounded recovery time on bug.
- Does `event-appended` need to carry `roomId` if the socket is already bound to one room? Probably belt-and-suspenders yes.

## Acceptance criteria

1. After implementation, a 60-move PvP game sends approximately `60 × (event + view + room delta)` bytes per client over the full game, not `O(n²)` bytes.
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

**Tradeoffs to actively decide, not just inherit from the spec:**

- The spec proposes shipping a full `PlayerView` with every
  `event-appended`. This is the explicit non-optimization. If you find a
  clean way to ship a diff against the prior view that doesn't blow up
  the surface area, that's a legitimate win — but only if the diff
  computation is cheaper and not more bug-prone than recomputing the
  view. Default to the spec's choice; don't rebuild the world to save
  ~1KB per move.
- The "clock ticks as event-appended vs as their own message" question
  in Open Questions matters. Pick one before you start; don't punt.
- Capability flag vs protocol version field. Pick one. Lean toward
  capability flag for now (lighter weight, single-feature) but explain
  the choice in the PR.

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
