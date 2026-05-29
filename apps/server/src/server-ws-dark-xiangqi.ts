import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import {
  isLegalMove,
  type XiangqiColor,
  type XiangqiMove,
  type XiangqiSquare,
} from '@mistboard/game';
import type { WebSocket } from 'ws';
import { currentAccountUser } from './account-session.js';
import type { DarkXiangqiEvent, DarkXiangqiRuntimeRoom } from './dark-xiangqi-runtime.js';
import { logger, wsCounters } from './obs.js';
import {
  appendDarkXiangqiEvent,
  appendDarkXiangqiSeatAssigned,
  type DarkXiangqiEventWriterContext,
  recordDarkXiangqiPersistenceError,
} from './server-dark-xiangqi-events.js';
import {
  clearDarkXiangqiRuntimeTimers,
  type DarkXiangqiLifecycleContext,
  scheduleDarkXiangqiLifecycleTimers as scheduleDarkXiangqiLifecycleTimersWithContext,
} from './server-dark-xiangqi-lifecycle.js';
import {
  assignDarkXiangqiSeat,
  displaceOlderDarkXiangqiSeatClients,
  rollbackDarkXiangqiSeatAssignment,
} from './server-dark-xiangqi-seat-session.js';
import {
  broadcastDarkXiangqiEventAppended,
  broadcastDarkXiangqiSnapshot,
  darkXiangqiTransportSnapshotPayload,
  sendDarkXiangqiPayload,
} from './server-dark-xiangqi-transport.js';
import { recordMessageTimestamp, seatTokenFromProtocolHeader } from './server-policy.js';
import { isKnownClientMessageType, parseClientMessage } from './server-ws-messages.js';

export type DarkXiangqiLiveClient = {
  debugRequested: false;
  displaced: boolean;
  id: string;
  messageTimestamps: number[];
  roomId: string;
  seat: XiangqiColor;
  seatTokenHash?: string;
  socket: WebSocket;
  solo: false;
  userId?: string | null;
};

export type DarkXiangqiLiveRoom = Omit<DarkXiangqiRuntimeRoom, 'clients'> & {
  clients: Set<DarkXiangqiLiveClient>;
};

export type DarkXiangqiWebSocketContext = {
  defaultRoomRegion: string;
  wsMessageLimit: number;
  wsMessageWindowMs: number;
};

let darkXiangqiEventWriterCtx: DarkXiangqiEventWriterContext;

const darkXiangqiLifecycleCtx: DarkXiangqiLifecycleContext<DarkXiangqiLiveRoom> = {
  appendEvent: (room, event) => appendDarkXiangqiEvent(room, event, darkXiangqiEventWriterCtx),
  broadcastEventAppended: broadcastDarkXiangqiEventAppended,
};

darkXiangqiEventWriterCtx = {
  scheduleLifecycleTimers: (room) =>
    scheduleDarkXiangqiLifecycleTimers(room as DarkXiangqiLiveRoom),
};

export function scheduleDarkXiangqiLifecycleTimers(room: DarkXiangqiLiveRoom): void {
  scheduleDarkXiangqiLifecycleTimersWithContext(room, darkXiangqiLifecycleCtx);
}

export async function handleDarkXiangqiWebSocketConnection(
  ctx: DarkXiangqiWebSocketContext,
  socket: WebSocket,
  request: IncomingMessage,
  room: DarkXiangqiLiveRoom,
): Promise<void> {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const clientId = parseClientId(url.searchParams.get('client')) ?? randomUUID();
  const accountUser = await currentAccountUser(request);
  const seatToken = seatTokenFromProtocolHeader(request.headers['sec-websocket-protocol']);
  const assignment = assignDarkXiangqiSeat(room, clientId, seatToken, accountUser);
  if (!assignment.ok) {
    socket.close(1008, assignment.reason);
    return;
  }
  try {
    await appendDarkXiangqiSeatAssigned(
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
      darkXiangqiEventWriterCtx,
    );
  } catch (err) {
    rollbackDarkXiangqiSeatAssignment(room, assignment);
    recordDarkXiangqiPersistenceError(room.id, room.events.length, 'seat-assigned', err as Error);
    socket.close(1011, 'persistence failure');
    return;
  }

  const client: DarkXiangqiLiveClient = {
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
  displaceOlderDarkXiangqiSeatClients(room, client);
  scheduleDarkXiangqiLifecycleTimers(room);

  sendDarkXiangqiPayload(client, {
    ...darkXiangqiTransportSnapshotPayload(room, client),
    type: 'hello',
    clientId: client.id,
    ...(assignment.seatToken ? { seatToken: assignment.seatToken } : {}),
  });
  broadcastDarkXiangqiSnapshot(room);

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
    void handleDarkXiangqiMessage(ctx, room, client, raw.toString());
  });

  socket.on('close', () => {
    room.clients.delete(client);
    if (!client.displaced) {
      scheduleDarkXiangqiLifecycleTimers(room);
      broadcastDarkXiangqiSnapshot(room);
    }
  });
}

async function handleDarkXiangqiMessage(
  ctx: DarkXiangqiWebSocketContext,
  room: DarkXiangqiLiveRoom,
  client: DarkXiangqiLiveClient,
  raw: string,
): Promise<void> {
  const message = parseClientMessage(raw);
  if (!message) {
    wsCounters.recordParseFailure();
    return;
  }
  if (!isKnownClientMessageType(message.type)) {
    wsCounters.recordUnknownMessage();
    logger.warn(
      {
        kind: 'ws_unknown_message',
        room_id: room.id,
        client_id: client.id,
        message_type: message.type,
      },
      'ws unknown message',
    );
    return;
  }

  if (message.type === 'ping') {
    sendDarkXiangqiPayload(client, {
      type: 'pong',
      at: typeof message.at === 'number' ? message.at : Date.now(),
      serverAt: Date.now(),
    });
    return;
  }
  if (message.type === 'latency-sample') {
    if (typeof message.rttMs === 'number' && Number.isFinite(message.rttMs)) {
      const rttMs = Math.max(0, Math.min(60_000, Math.round(message.rttMs)));
      wsCounters.recordLatencySample(ctx.defaultRoomRegion, rttMs);
    }
    return;
  }
  if (message.type === 'snapshot:request') {
    wsCounters.recordSnapshotRequest();
    sendDarkXiangqiPayload(client, darkXiangqiTransportSnapshotPayload(room, client));
    return;
  }
  if (message.type === 'resign') {
    await handleDarkXiangqiResign(room, client);
    return;
  }
  if (message.type === 'abort') {
    await handleDarkXiangqiAbort(room, client);
    return;
  }
  if (message.type !== 'move') return;
  if (typeof message.from !== 'string' || typeof message.to !== 'string') return;
  if (client.seat !== 'red' && client.seat !== 'black') return;
  if (room.projection.state.status.type !== 'playing') return;
  if (room.projection.state.status.turn !== client.seat) return;

  const move: XiangqiMove = {
    from: message.from as XiangqiSquare,
    to: message.to as XiangqiSquare,
  };
  if (!isLegalMove(room.projection.state, move)) return;
  const event: DarkXiangqiEvent = {
    type: 'move-played',
    at: Date.now(),
    roomId: room.id,
    color: client.seat,
    move,
  };
  let seq: number;
  try {
    seq = await appendDarkXiangqiEvent(room, event, darkXiangqiEventWriterCtx);
  } catch (err) {
    recordDarkXiangqiPersistenceError(room.id, room.events.length, event.type, err as Error);
    client.socket.close(1011, 'persistence failure');
    return;
  }
  broadcastDarkXiangqiEventAppended(room, event, seq);
}

async function handleDarkXiangqiAbort(
  room: DarkXiangqiLiveRoom,
  client: DarkXiangqiLiveClient,
): Promise<void> {
  if (client.seat !== 'red' && client.seat !== 'black') return;
  if (room.projection.state.status.type !== 'playing') return;
  if (room.projection.state.moveNumber >= 2) return;
  if (room.projection.state.status.turn !== client.seat) return;
  const event: DarkXiangqiEvent = {
    type: 'game-aborted',
    at: Date.now(),
    roomId: room.id,
    reason: 'user-abort',
  };
  let seq: number;
  try {
    seq = await appendDarkXiangqiEvent(room, event, darkXiangqiEventWriterCtx);
  } catch (err) {
    recordDarkXiangqiPersistenceError(room.id, room.events.length, event.type, err as Error);
    client.socket.close(1011, 'persistence failure');
    return;
  }
  broadcastDarkXiangqiEventAppended(room, event, seq);
}

async function handleDarkXiangqiResign(
  room: DarkXiangqiLiveRoom,
  client: DarkXiangqiLiveClient,
): Promise<void> {
  if (client.seat !== 'red' && client.seat !== 'black') return;
  if (room.projection.state.status.type !== 'playing') return;
  if (room.projection.state.moveNumber < 2) return;
  const event: DarkXiangqiEvent = {
    type: 'seat-resigned',
    at: Date.now(),
    roomId: room.id,
    color: client.seat,
  };
  let seq: number;
  try {
    seq = await appendDarkXiangqiEvent(room, event, darkXiangqiEventWriterCtx);
  } catch (err) {
    recordDarkXiangqiPersistenceError(room.id, room.events.length, event.type, err as Error);
    client.socket.close(1011, 'persistence failure');
    return;
  }
  broadcastDarkXiangqiEventAppended(room, event, seq);
}

function parseClientId(value: string | null): string | null {
  if (!value) return null;
  return /^[a-zA-Z0-9:_-]{8,80}$/.test(value) ? value : null;
}

export { clearDarkXiangqiRuntimeTimers };
