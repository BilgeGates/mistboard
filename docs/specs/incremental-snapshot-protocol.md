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
