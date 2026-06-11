/**
 * Generic WebSocket live-room runtime over a VariantTenant.
 *
 * createTenantWsRuntime(tenant) binds the event writer, lifecycle timers,
 * broadcast fan-out, and connection/message handling into one per-tenant
 * bundle (the callback-injection init pattern: the writer re-arms lifecycle
 * timers after every append, and the timers append through the writer).
 * Adapters instantiate the bundle once at module scope and re-export the
 * bound functions under their existing per-variant names.
 *
 * Per-seat redaction on the wire happens in exactly two places, both tenant
 * hooks: visibility.clientEventFor for event-appended deltas and
 * visibility.viewForClient inside the snapshot payload. Terminal positions
 * fall back to full snapshots so endgame reveals stay tenant policy.
 */

import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import { currentAccountUser } from '../account-session.js';
import { wsCounters } from '../obs.js';
import { recordMessageTimestamp, seatTokenFromProtocolHeader } from '../server-policy.js';
import { parseClientMessage } from '../server-ws-messages.js';
import {
  appendTenantEvent,
  appendTenantSeatAssigned,
  recordTenantPersistenceError,
  type TenantEventWriterContext,
} from './events.js';
import {
  clearTenantRuntimeTimers,
  scheduleTenantLifecycleTimers,
  type TenantLifecycleContext,
} from './lifecycle.js';
import {
  cancelTenantRematch,
  declineTenantRematch,
  finalizeTenantRematchIfReady,
  maybeReplayTenantRematchRedirect,
  offerTenantRematch,
  type TenantRematchContext,
} from './rematch.js';
import {
  type TenantSnapshotPayload,
  tenantPlyAtEventIndex,
  tenantSnapshotPayload,
} from './runtime.js';
import {
  assignTenantSeat,
  displaceOlderTenantSeatClients,
  rollbackTenantSeatAssignment,
} from './seat-session.js';
import type {
  TenantGameStateLike,
  TenantRoomEvent,
  TenantRuntimeRoom,
  VariantTenant,
} from './tenant.js';

export type TenantLiveClient<C extends string> = {
  debugRequested: false;
  displaced: boolean;
  id: string;
  messageTimestamps: number[];
  roomId: string;
  seat: C;
  seatTokenHash?: string;
  socket: WebSocket;
  solo: false;
  userId?: string | null;
};

export type TenantLiveRoom<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  Spec extends string = string,
> = Omit<TenantRuntimeRoom<Kind, C, M, State, Spec>, 'clients'> & {
  clients: Set<TenantLiveClient<C>>;
};

export type TenantWebSocketContext<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  Spec extends string = string,
> = {
  wsMessageLimit: number;
  wsMessageWindowMs: number;
  rematch: TenantRematchContext<Kind, C, M, State, Spec, TenantLiveClient<C>>;
};

export type TenantWsRuntime<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  View,
  Spec extends string = string,
> = {
  handleConnection(
    ctx: TenantWebSocketContext<Kind, C, M, State, Spec>,
    socket: WebSocket,
    request: IncomingMessage,
    room: TenantLiveRoom<Kind, C, M, State, Spec>,
  ): Promise<void>;
  broadcastEventAppended(
    room: TenantLiveRoom<Kind, C, M, State, Spec>,
    event: TenantRoomEvent<C, M, Spec>,
    seq: number,
  ): void;
  broadcastSnapshot(room: TenantLiveRoom<Kind, C, M, State, Spec>): void;
  sendPayload(client: Pick<TenantLiveClient<C>, 'displaced' | 'socket'>, payload: unknown): void;
  scheduleLifecycleTimers(room: TenantLiveRoom<Kind, C, M, State, Spec>): void;
  transportSnapshotPayload(
    room: TenantLiveRoom<Kind, C, M, State, Spec>,
    client: TenantLiveClient<C>,
  ): TenantSnapshotPayload<C, M, View, Spec>;
  lifecycleCtx: TenantLifecycleContext<C, M, State, Spec, TenantLiveRoom<Kind, C, M, State, Spec>>;
};

export function createTenantWsRuntime<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  View,
  Spec extends string,
>(
  tenant: VariantTenant<Kind, C, M, State, View, Spec>,
  options: {
    // PvE: invoked after connection joins and after every human move, with the
    // bundle's lifecycle ctx, so the engine's move flows through the same
    // append+broadcast path as a human move. No-op when omitted.
    scheduleEngineMove?: (
      ctx: TenantLifecycleContext<C, M, State, Spec, TenantLiveRoom<Kind, C, M, State, Spec>>,
      room: TenantLiveRoom<Kind, C, M, State, Spec>,
    ) => void;
  } = {},
): TenantWsRuntime<Kind, C, M, State, View, Spec> {
  type LiveRoom = TenantLiveRoom<Kind, C, M, State, Spec>;
  type LiveClient = TenantLiveClient<C>;

  const eventWriterCtx: TenantEventWriterContext<Kind, C, M, State, Spec> = {
    scheduleLifecycleTimers: (room) => scheduleLifecycleTimers(room as LiveRoom),
  };

  const lifecycleCtx: TenantLifecycleContext<C, M, State, Spec, LiveRoom> = {
    appendEvent: (room, event) => appendTenantEvent(tenant, room, event, eventWriterCtx),
    broadcastEventAppended,
  };

  function scheduleLifecycleTimers(room: LiveRoom): void {
    scheduleTenantLifecycleTimers(tenant, room, lifecycleCtx);
  }

  function scheduleEngineMove(room: LiveRoom): void {
    options.scheduleEngineMove?.(lifecycleCtx, room);
  }

  async function handleConnection(
    ctx: TenantWebSocketContext<Kind, C, M, State, Spec>,
    socket: WebSocket,
    request: IncomingMessage,
    room: LiveRoom,
  ): Promise<void> {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    const clientId = parseClientId(url.searchParams.get('client')) ?? randomUUID();
    const accountUser = await currentAccountUser(request);
    const seatToken = seatTokenFromProtocolHeader(request.headers['sec-websocket-protocol']);
    const assignment = assignTenantSeat(tenant, room, clientId, seatToken, accountUser);
    if (!assignment.ok) {
      socket.close(1008, assignment.reason);
      return;
    }

    try {
      await appendTenantSeatAssigned(
        tenant,
        room,
        {
          event: {
            type: 'seat-assigned',
            at: Date.now(),
            roomId: room.id,
            clientId,
            seat: assignment.seat,
          },
          tokenState: assignment.tokenState,
        },
        eventWriterCtx,
      );
    } catch (err) {
      rollbackTenantSeatAssignment(room, assignment);
      recordTenantPersistenceError(
        tenant,
        room.id,
        room.events.length,
        'seat-assigned',
        err as Error,
      );
      socket.close(1011, 'persistence failure');
      return;
    }

    const client: LiveClient = {
      debugRequested: false,
      displaced: false,
      id: clientId,
      messageTimestamps: [],
      roomId: room.id,
      seat: assignment.seat,
      seatTokenHash: assignment.seatTokenHash,
      socket,
      solo: false,
      userId: accountUser?.id ?? null,
    };
    room.clients.add(client);
    displaceOlderTenantSeatClients(room, client);
    scheduleLifecycleTimers(room);

    sendPayload(client, {
      ...transportSnapshotPayload(room, client),
      type: 'hello',
      clientId: client.id,
      ...(assignment.seatToken ? { seatToken: assignment.seatToken } : {}),
    });
    broadcastSnapshot(room);
    // PvE: once the human takes the empty seat, the engine (if it holds the
    // first-mover seat / the side to move) plays its move. No-op for PvP or
    // when it's the human's turn.
    scheduleEngineMove(room);
    // A player reconnecting after a rematch was finalized (while they were
    // offline) still gets routed to the new swapped-color room.
    maybeReplayTenantRematchRedirect(ctx.rematch, room, client);

    socket.on('message', (raw) => {
      if (
        !recordMessageTimestamp(
          client.messageTimestamps,
          Date.now(),
          ctx.wsMessageLimit,
          ctx.wsMessageWindowMs,
        )
      ) {
        socket.close(1008, 'rate limit');
        return;
      }
      void handleMessage(ctx, room, client, raw.toString());
    });

    socket.on('close', () => {
      room.clients.delete(client);
      if (!client.displaced) {
        scheduleLifecycleTimers(room);
        broadcastSnapshot(room);
      }
    });
  }

  async function handleMessage(
    ctx: TenantWebSocketContext<Kind, C, M, State, Spec>,
    room: LiveRoom,
    client: LiveClient,
    raw: string,
  ): Promise<void> {
    const message = parseClientMessage(raw);
    if (!message) {
      wsCounters.recordParseFailure();
      return;
    }
    if (message.type === 'ping') {
      sendPayload(client, {
        type: 'pong',
        at: typeof message.at === 'number' ? message.at : Date.now(),
        serverAt: Date.now(),
      });
      return;
    }
    if (message.type === 'snapshot:request') {
      wsCounters.recordSnapshotRequest();
      sendPayload(client, transportSnapshotPayload(room, client));
      return;
    }
    if (message.type === 'resign') {
      await handleResign(room, client);
      return;
    }
    if (message.type === 'abort') {
      await handleAbort(room, client);
      return;
    }
    if (message.type === 'rematch:offer') {
      offerTenantRematch(tenant, ctx.rematch, room, client);
      await finalizeTenantRematchIfReady(tenant, ctx.rematch, room);
      return;
    }
    if (message.type === 'rematch:cancel') {
      cancelTenantRematch(tenant, ctx.rematch, room, client);
      return;
    }
    if (message.type === 'rematch:decline') {
      declineTenantRematch(tenant, ctx.rematch, room, client);
      return;
    }
    if (message.type !== 'move') return;
    const move = tenant.rules.moveFromMessage(message);
    if (move === null) return;
    const status = room.projection.state.status;
    if (status.type !== 'playing') return;
    // No moves until both seats are filled (a fresh room starts in `playing`, so
    // a seated player could otherwise move before the opponent/engine joined).
    for (const color of tenant.colors) {
      if (!room.projection.seats[color]) return;
    }
    if (status.turn !== client.seat) return;
    // State-dependent canonicalization (when the tenant defines it) resolves
    // the parsed move to the exact legal-move object to append — e.g.
    // Crossroads re-attaches `promotion` from the legal-move list. It doubles
    // as the legality check: null rejects.
    const canonical = tenant.rules.canonicalMove
      ? tenant.rules.canonicalMove(room.projection.state, move)
      : tenant.rules.isLegalMove(room.projection.state, move)
        ? move
        : null;
    if (canonical === null) return;
    const event: TenantRoomEvent<C, M, Spec> = {
      type: 'move-played',
      at: Date.now(),
      roomId: room.id,
      color: client.seat,
      move: canonical,
    };
    let seq: number;
    try {
      seq = await appendTenantEvent(tenant, room, event, eventWriterCtx);
    } catch (err) {
      recordTenantPersistenceError(tenant, room.id, room.events.length, event.type, err as Error);
      client.socket.close(1011, 'persistence failure');
      return;
    }
    broadcastEventAppended(room, event, seq);
    // PvE: it may now be the engine's turn (no-op for PvP / engine not to move).
    scheduleEngineMove(room);
  }

  async function handleResign(room: LiveRoom, client: LiveClient): Promise<void> {
    if (room.projection.state.status.type !== 'playing') return;
    if (room.projection.state.moveNumber < 2) return;
    const event: TenantRoomEvent<C, M, Spec> = {
      type: 'seat-resigned',
      at: Date.now(),
      roomId: room.id,
      color: client.seat,
    };
    let seq: number;
    try {
      seq = await appendTenantEvent(tenant, room, event, eventWriterCtx);
    } catch (err) {
      recordTenantPersistenceError(tenant, room.id, room.events.length, event.type, err as Error);
      client.socket.close(1011, 'persistence failure');
      return;
    }
    broadcastEventAppended(room, event, seq);
  }

  async function handleAbort(room: LiveRoom, client: LiveClient): Promise<void> {
    const status = room.projection.state.status;
    if (status.type !== 'playing') return;
    if (room.projection.state.moveNumber >= 2) return;
    if (status.turn !== client.seat) return;
    const event: TenantRoomEvent<C, M, Spec> = {
      type: 'game-aborted',
      at: Date.now(),
      roomId: room.id,
      reason: 'user-abort',
    };
    let seq: number;
    try {
      seq = await appendTenantEvent(tenant, room, event, eventWriterCtx);
    } catch (err) {
      recordTenantPersistenceError(tenant, room.id, room.events.length, event.type, err as Error);
      client.socket.close(1011, 'persistence failure');
      return;
    }
    broadcastEventAppended(room, event, seq);
  }

  function broadcastEventAppended(
    room: LiveRoom,
    event: TenantRoomEvent<C, M, Spec>,
    seq: number,
  ): void {
    for (const client of room.clients) {
      if (client.displaced) continue;
      if (room.projection.state.status.type !== 'playing') {
        sendPayload(client, transportSnapshotPayload(room, client));
        continue;
      }
      const snapshot = transportSnapshotPayload(room, client);
      const { events: _events, ...base } = snapshot;
      const clientEvent = tenant.visibility.clientEventFor(
        event,
        client.seat,
        tenantPlyAtEventIndex(room.events, seq),
      );
      sendPayload(client, {
        ...base,
        type: 'event-appended',
        seq,
        ...(clientEvent ? { event: clientEvent } : {}),
      });
    }
  }

  function sendPayload(client: Pick<LiveClient, 'displaced' | 'socket'>, payload: unknown): void {
    if (client.displaced) return;
    try {
      client.socket.send(JSON.stringify(payload));
    } catch {
      /* socket closed */
    }
  }

  function broadcastSnapshot(room: LiveRoom): void {
    for (const client of room.clients) {
      if (client.displaced) continue;
      sendPayload(client, transportSnapshotPayload(room, client));
    }
  }

  function transportSnapshotPayload(room: LiveRoom, client: LiveClient) {
    return tenantSnapshotPayload(tenant, room, {
      id: client.id,
      seat: client.seat,
      solo: false,
    });
  }

  return {
    handleConnection,
    broadcastEventAppended,
    broadcastSnapshot,
    sendPayload,
    scheduleLifecycleTimers,
    transportSnapshotPayload,
    lifecycleCtx,
  };
}

export { clearTenantRuntimeTimers };

function parseClientId(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : null;
}
