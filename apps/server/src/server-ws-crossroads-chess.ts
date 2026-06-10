import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { type CrossroadsChessMove, getCrossroadsChessOpenLegalMoves } from '@mistboard/game';
import type { WebSocket } from 'ws';
import { currentAccountUser } from './account-session.js';
import { isCrossroadsChessEngineClientId } from './crossroads-chess-engine.js';
import {
  type CrossroadsChessClientEvent,
  type CrossroadsChessEvent,
  crossroadsChessPlyAtEventIndex,
  crossroadsChessSnapshotPayload,
  isCrossroadsChessSquare,
} from './crossroads-chess-runtime.js';
import { wsCounters } from './obs.js';
import {
  type CrossroadsChessEngineContext,
  scheduleCrossroadsChessEngineMove,
} from './server-crossroads-chess-engine.js';
import {
  appendCrossroadsChessEvent,
  appendCrossroadsChessSeatAssigned,
  type CrossroadsChessEventWriterContext,
  recordCrossroadsChessPersistenceError,
} from './server-crossroads-chess-events.js';
import {
  type CrossroadsChessLifecycleContext,
  clearCrossroadsChessRuntimeTimers,
  scheduleCrossroadsChessLifecycleTimers as scheduleCrossroadsChessLifecycleTimersWithContext,
} from './server-crossroads-chess-lifecycle.js';
import type {
  CrossroadsChessLiveClient,
  CrossroadsChessLiveRoom,
} from './server-crossroads-chess-live-room.js';
import {
  type CrossroadsChessRematchContext,
  cancelCrossroadsChessRematch,
  declineCrossroadsChessRematch,
  finalizeCrossroadsChessRematchIfReady,
  maybeReplayCrossroadsChessRematchRedirect,
  offerCrossroadsChessRematch,
} from './server-crossroads-chess-rematch.js';
import {
  assignCrossroadsChessSeat,
  displaceOlderCrossroadsChessSeatClients,
  rollbackCrossroadsChessSeatAssignment,
} from './server-crossroads-chess-seat-session.js';
import { recordMessageTimestamp, seatTokenFromProtocolHeader } from './server-policy.js';
import { parseClientMessage } from './server-ws-messages.js';

export type { CrossroadsChessLiveClient, CrossroadsChessLiveRoom };

export type CrossroadsChessWebSocketContext = {
  crossroadsChessRematch: CrossroadsChessRematchContext;
  wsMessageLimit: number;
  wsMessageWindowMs: number;
};

let crossroadsChessEventWriterCtx: CrossroadsChessEventWriterContext;

const crossroadsChessLifecycleCtx: CrossroadsChessLifecycleContext<CrossroadsChessLiveRoom> = {
  appendEvent: (room, event) =>
    appendCrossroadsChessEvent(room, event, crossroadsChessEventWriterCtx),
  broadcastEventAppended: broadcastCrossroadsChessEventAppended,
};
const crossroadsChessEngineCtx: CrossroadsChessEngineContext = crossroadsChessLifecycleCtx;

crossroadsChessEventWriterCtx = {
  scheduleLifecycleTimers: (room) =>
    scheduleCrossroadsChessLifecycleTimers(room as CrossroadsChessLiveRoom),
};

export function scheduleCrossroadsChessLifecycleTimers(room: CrossroadsChessLiveRoom): void {
  scheduleCrossroadsChessLifecycleTimersWithContext(room, crossroadsChessLifecycleCtx);
}

export { clearCrossroadsChessRuntimeTimers };

export async function handleCrossroadsChessWebSocketConnection(
  ctx: CrossroadsChessWebSocketContext,
  socket: WebSocket,
  request: IncomingMessage,
  room: CrossroadsChessLiveRoom,
): Promise<void> {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const clientId = parseClientId(url.searchParams.get('client')) ?? randomUUID();
  const accountUser = await currentAccountUser(request);
  const seatToken = seatTokenFromProtocolHeader(request.headers['sec-websocket-protocol']);
  const assignment = assignCrossroadsChessSeat(room, clientId, seatToken, accountUser);
  if (!assignment.ok) {
    socket.close(1008, assignment.reason);
    return;
  }

  try {
    await appendCrossroadsChessSeatAssigned(
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
      crossroadsChessEventWriterCtx,
    );
  } catch (err) {
    rollbackCrossroadsChessSeatAssignment(room, assignment);
    recordCrossroadsChessPersistenceError(
      room.id,
      room.events.length,
      'seat-assigned',
      err as Error,
    );
    socket.close(1011, 'persistence failure');
    return;
  }

  const client: CrossroadsChessLiveClient = {
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
  displaceOlderCrossroadsChessSeatClients(room, client);
  scheduleCrossroadsChessLifecycleTimers(room);

  sendCrossroadsChessPayload(client, {
    ...crossroadsChessTransportSnapshotPayload(room, client),
    type: 'hello',
    clientId: client.id,
    ...(assignment.seatToken ? { seatToken: assignment.seatToken } : {}),
  });
  broadcastCrossroadsChessSnapshot(room);
  scheduleCrossroadsChessEngineMove(crossroadsChessEngineCtx, room);
  maybeReplayCrossroadsChessRematchRedirect(ctx.crossroadsChessRematch, room, client);

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
    void handleCrossroadsChessMessage(ctx, room, client, raw.toString());
  });

  socket.on('close', () => {
    room.clients.delete(client);
    if (!client.displaced) {
      scheduleCrossroadsChessLifecycleTimers(room);
      broadcastCrossroadsChessSnapshot(room);
    }
  });
}

async function handleCrossroadsChessMessage(
  ctx: CrossroadsChessWebSocketContext,
  room: CrossroadsChessLiveRoom,
  client: CrossroadsChessLiveClient,
  raw: string,
): Promise<void> {
  const message = parseClientMessage(raw);
  if (!message) {
    wsCounters.recordParseFailure();
    return;
  }
  if (message.type === 'ping') {
    sendCrossroadsChessPayload(client, {
      type: 'pong',
      at: typeof message.at === 'number' ? message.at : Date.now(),
      serverAt: Date.now(),
    });
    return;
  }
  if (message.type === 'snapshot:request') {
    wsCounters.recordSnapshotRequest();
    sendCrossroadsChessPayload(client, crossroadsChessTransportSnapshotPayload(room, client));
    return;
  }
  if (message.type === 'resign') {
    await handleCrossroadsChessResign(room, client);
    return;
  }
  if (message.type === 'abort') {
    await handleCrossroadsChessAbort(room, client);
    return;
  }
  if (message.type === 'rematch:offer') {
    offerCrossroadsChessRematch(ctx.crossroadsChessRematch, room, client);
    await finalizeCrossroadsChessRematchIfReady(ctx.crossroadsChessRematch, room);
    return;
  }
  if (message.type === 'rematch:cancel') {
    cancelCrossroadsChessRematch(ctx.crossroadsChessRematch, room, client);
    return;
  }
  if (message.type === 'rematch:decline') {
    declineCrossroadsChessRematch(ctx.crossroadsChessRematch, room, client);
    return;
  }
  if (message.type !== 'move') return;
  if (!isCrossroadsChessSquare(message.from) || !isCrossroadsChessSquare(message.to)) return;
  if (room.projection.state.status.type !== 'playing') return;
  // No moves until both seats are filled.
  if (!(room.projection.seats.white && room.projection.seats.red)) return;
  if (room.projection.state.status.turn !== client.seat) return;
  const move: CrossroadsChessMove = { from: message.from, to: message.to };
  const canonicalMove = getCrossroadsChessOpenLegalMoves(room.projection.state).find(
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

async function handleCrossroadsChessResign(
  room: CrossroadsChessLiveRoom,
  client: CrossroadsChessLiveClient,
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

async function handleCrossroadsChessAbort(
  room: CrossroadsChessLiveRoom,
  client: CrossroadsChessLiveClient,
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
  room: CrossroadsChessLiveRoom,
  client: CrossroadsChessLiveClient,
  event: CrossroadsChessEvent,
): Promise<void> {
  let seq: number;
  try {
    seq = await appendCrossroadsChessEvent(room, event, crossroadsChessEventWriterCtx);
  } catch (err) {
    recordCrossroadsChessPersistenceError(room.id, room.events.length, event.type, err as Error);
    client.socket.close(1011, 'persistence failure');
    return;
  }
  broadcastCrossroadsChessEventAppended(room, event, seq);
  scheduleCrossroadsChessEngineMove(crossroadsChessEngineCtx, room);
}

// Perfect-information: every client gets the same event (no per-seat redaction).
export function broadcastCrossroadsChessEventAppended(
  room: CrossroadsChessLiveRoom,
  event: CrossroadsChessEvent,
  seq: number,
): void {
  for (const client of room.clients) {
    if (client.displaced) continue;
    if (room.projection.state.status.type !== 'playing') {
      sendCrossroadsChessPayload(client, crossroadsChessTransportSnapshotPayload(room, client));
      continue;
    }
    const snapshot = crossroadsChessTransportSnapshotPayload(room, client);
    const { events: _events, ...base } = snapshot;
    const clientEvent: CrossroadsChessClientEvent =
      event.type === 'move-played'
        ? { ...event, ply: crossroadsChessPlyAtEventIndex(room.events, seq) }
        : event;
    sendCrossroadsChessPayload(client, {
      ...base,
      type: 'event-appended',
      seq,
      event: clientEvent,
    });
  }
}

export function sendCrossroadsChessPayload(
  client: Pick<CrossroadsChessLiveClient, 'displaced' | 'socket'>,
  payload: unknown,
): void {
  if (client.displaced) return;
  try {
    client.socket.send(JSON.stringify(payload));
  } catch {
    /* socket closed */
  }
}

export function broadcastCrossroadsChessSnapshot(room: CrossroadsChessLiveRoom): void {
  for (const client of room.clients) {
    if (client.displaced) continue;
    sendCrossroadsChessPayload(client, crossroadsChessTransportSnapshotPayload(room, client));
  }
}

export function crossroadsChessTransportSnapshotPayload(
  room: CrossroadsChessLiveRoom,
  client: CrossroadsChessLiveClient,
) {
  const snapshot = crossroadsChessSnapshotPayload(room, {
    id: client.id,
    seat: client.seat,
    solo: false,
  });
  const engineSeat = crossroadsChessEngineSeat(room);
  if (engineSeat === null) return { ...snapshot, roomMode: 'pvp' as const };
  return {
    ...snapshot,
    connectedSeats: { ...snapshot.connectedSeats, [engineSeat.seat]: true },
    pveEngineId: engineSeat.engineId,
    roomMode: 'pve' as const,
  };
}

function parseClientId(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : null;
}

function crossroadsChessEngineSeat(
  room: CrossroadsChessLiveRoom,
): { engineId: string; seat: 'white' | 'red' } | null {
  for (const seat of ['white', 'red'] as const) {
    const clientId = room.projection.seats[seat];
    if (clientId && isCrossroadsChessEngineClientId(clientId)) {
      return { engineId: clientId, seat };
    }
  }
  return null;
}
