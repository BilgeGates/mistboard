import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { type DualChessMove, getDualChessOpenLegalMoves } from '@mistboard/game';
import type { WebSocket } from 'ws';
import { currentAccountUser } from './account-session.js';
import {
  type DualChessClientEvent,
  type DualChessEvent,
  dualChessPlyAtEventIndex,
  dualChessSnapshotPayload,
  isDualChessSquare,
} from './dual-chess-runtime.js';
import { wsCounters } from './obs.js';
import {
  appendDualChessEvent,
  appendDualChessSeatAssigned,
  type DualChessEventWriterContext,
  recordDualChessPersistenceError,
} from './server-dual-chess-events.js';
import {
  clearDualChessRuntimeTimers,
  type DualChessLifecycleContext,
  scheduleDualChessLifecycleTimers as scheduleDualChessLifecycleTimersWithContext,
} from './server-dual-chess-lifecycle.js';
import type { DualChessLiveClient, DualChessLiveRoom } from './server-dual-chess-live-room.js';
import {
  assignDualChessSeat,
  displaceOlderDualChessSeatClients,
  rollbackDualChessSeatAssignment,
} from './server-dual-chess-seat-session.js';
import { recordMessageTimestamp, seatTokenFromProtocolHeader } from './server-policy.js';
import { parseClientMessage } from './server-ws-messages.js';

export type { DualChessLiveClient, DualChessLiveRoom };

export type DualChessWebSocketContext = {
  wsMessageLimit: number;
  wsMessageWindowMs: number;
};

let dualChessEventWriterCtx: DualChessEventWriterContext;

const dualChessLifecycleCtx: DualChessLifecycleContext<DualChessLiveRoom> = {
  appendEvent: (room, event) => appendDualChessEvent(room, event, dualChessEventWriterCtx),
  broadcastEventAppended: broadcastDualChessEventAppended,
};

dualChessEventWriterCtx = {
  scheduleLifecycleTimers: (room) => scheduleDualChessLifecycleTimers(room as DualChessLiveRoom),
};

export function scheduleDualChessLifecycleTimers(room: DualChessLiveRoom): void {
  scheduleDualChessLifecycleTimersWithContext(room, dualChessLifecycleCtx);
}

export { clearDualChessRuntimeTimers };

export async function handleDualChessWebSocketConnection(
  ctx: DualChessWebSocketContext,
  socket: WebSocket,
  request: IncomingMessage,
  room: DualChessLiveRoom,
): Promise<void> {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const clientId = parseClientId(url.searchParams.get('client')) ?? randomUUID();
  const accountUser = await currentAccountUser(request);
  const seatToken = seatTokenFromProtocolHeader(request.headers['sec-websocket-protocol']);
  const assignment = assignDualChessSeat(room, clientId, seatToken, accountUser);
  if (!assignment.ok) {
    socket.close(1008, assignment.reason);
    return;
  }

  try {
    await appendDualChessSeatAssigned(
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
      dualChessEventWriterCtx,
    );
  } catch (err) {
    rollbackDualChessSeatAssignment(room, assignment);
    recordDualChessPersistenceError(room.id, room.events.length, 'seat-assigned', err as Error);
    socket.close(1011, 'persistence failure');
    return;
  }

  const client: DualChessLiveClient = {
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
  displaceOlderDualChessSeatClients(room, client);
  scheduleDualChessLifecycleTimers(room);

  sendDualChessPayload(client, {
    ...dualChessTransportSnapshotPayload(room, client),
    type: 'hello',
    clientId: client.id,
    ...(assignment.seatToken ? { seatToken: assignment.seatToken } : {}),
  });
  broadcastDualChessSnapshot(room);

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
    void handleDualChessMessage(room, client, raw.toString());
  });

  socket.on('close', () => {
    room.clients.delete(client);
    if (!client.displaced) {
      scheduleDualChessLifecycleTimers(room);
      broadcastDualChessSnapshot(room);
    }
  });
}

async function handleDualChessMessage(
  room: DualChessLiveRoom,
  client: DualChessLiveClient,
  raw: string,
): Promise<void> {
  const message = parseClientMessage(raw);
  if (!message) {
    wsCounters.recordParseFailure();
    return;
  }
  if (message.type === 'ping') {
    sendDualChessPayload(client, {
      type: 'pong',
      at: typeof message.at === 'number' ? message.at : Date.now(),
      serverAt: Date.now(),
    });
    return;
  }
  if (message.type === 'snapshot:request') {
    wsCounters.recordSnapshotRequest();
    sendDualChessPayload(client, dualChessTransportSnapshotPayload(room, client));
    return;
  }
  if (message.type === 'resign') {
    await handleDualChessResign(room, client);
    return;
  }
  if (message.type === 'abort') {
    await handleDualChessAbort(room, client);
    return;
  }
  if (message.type !== 'move') return;
  if (!isDualChessSquare(message.from) || !isDualChessSquare(message.to)) return;
  if (room.projection.state.status.type !== 'playing') return;
  // No moves until both seats are filled.
  if (!(room.projection.seats.white && room.projection.seats.red)) return;
  if (room.projection.state.status.turn !== client.seat) return;
  const move: DualChessMove = { from: message.from, to: message.to };
  const canonicalMove = getDualChessOpenLegalMoves(room.projection.state).find(
    (legalMove) => legalMove.from === move.from && legalMove.to === move.to,
  );
  if (!canonicalMove) return;
  await appendAndBroadcast(room, client, {
    type: 'move-played',
    at: Date.now(),
    roomId: room.id,
    color: client.seat,
    move: canonicalMove,
  });
}

async function handleDualChessResign(
  room: DualChessLiveRoom,
  client: DualChessLiveClient,
): Promise<void> {
  if (room.projection.state.status.type !== 'playing') return;
  if (room.projection.state.moveNumber < 2) return;
  await appendAndBroadcast(room, client, {
    type: 'seat-resigned',
    at: Date.now(),
    roomId: room.id,
    color: client.seat,
  });
}

async function handleDualChessAbort(
  room: DualChessLiveRoom,
  client: DualChessLiveClient,
): Promise<void> {
  const status = room.projection.state.status;
  if (status.type !== 'playing') return;
  if (room.projection.state.moveNumber >= 2) return;
  if (status.turn !== client.seat) return;
  await appendAndBroadcast(room, client, {
    type: 'game-aborted',
    at: Date.now(),
    roomId: room.id,
    reason: 'user-abort',
  });
}

async function appendAndBroadcast(
  room: DualChessLiveRoom,
  client: DualChessLiveClient,
  event: DualChessEvent,
): Promise<void> {
  let seq: number;
  try {
    seq = await appendDualChessEvent(room, event, dualChessEventWriterCtx);
  } catch (err) {
    recordDualChessPersistenceError(room.id, room.events.length, event.type, err as Error);
    client.socket.close(1011, 'persistence failure');
    return;
  }
  broadcastDualChessEventAppended(room, event, seq);
}

// Perfect-information: every client gets the same event (no per-seat redaction).
export function broadcastDualChessEventAppended(
  room: DualChessLiveRoom,
  event: DualChessEvent,
  seq: number,
): void {
  for (const client of room.clients) {
    if (client.displaced) continue;
    if (room.projection.state.status.type !== 'playing') {
      sendDualChessPayload(client, dualChessTransportSnapshotPayload(room, client));
      continue;
    }
    const snapshot = dualChessTransportSnapshotPayload(room, client);
    const { events: _events, ...base } = snapshot;
    const clientEvent: DualChessClientEvent =
      event.type === 'move-played'
        ? { ...event, ply: dualChessPlyAtEventIndex(room.events, seq) }
        : event;
    sendDualChessPayload(client, { ...base, type: 'event-appended', seq, event: clientEvent });
  }
}

export function sendDualChessPayload(
  client: Pick<DualChessLiveClient, 'displaced' | 'socket'>,
  payload: unknown,
): void {
  if (client.displaced) return;
  try {
    client.socket.send(JSON.stringify(payload));
  } catch {
    /* socket closed */
  }
}

export function broadcastDualChessSnapshot(room: DualChessLiveRoom): void {
  for (const client of room.clients) {
    if (client.displaced) continue;
    sendDualChessPayload(client, dualChessTransportSnapshotPayload(room, client));
  }
}

export function dualChessTransportSnapshotPayload(
  room: DualChessLiveRoom,
  client: DualChessLiveClient,
) {
  return dualChessSnapshotPayload(room, { id: client.id, seat: client.seat, solo: false });
}

function parseClientId(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : null;
}
