import { randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import {
  isLegalMove,
  type XiangqiColor,
  type XiangqiMove,
  type XiangqiSquare,
} from '@mistboard/game';
import type { WebSocket } from 'ws';
import { currentAccountUser } from './account-session.js';
import {
  applyDarkXiangqiEvent,
  type DarkXiangqiEvent,
  type DarkXiangqiRuntimeRoom,
  darkXiangqiSnapshotPayload,
} from './dark-xiangqi-runtime.js';
import { logger, wsCounters } from './obs.js';
import { recordMessageTimestamp, seatTokenFromProtocolHeader } from './server-policy.js';
import { hashSeatToken } from './server-seat-session.js';
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

type DarkXiangqiSeatAssignment =
  | { ok: true; seat: XiangqiColor; seatToken?: string; seatTokenHash?: string }
  | { ok: false; reason: 'private room' };

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
  const assignment = assignDarkXiangqiSeat(room, clientId, seatToken);
  if (!assignment.ok) {
    socket.close(1008, assignment.reason);
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
  appendDarkXiangqiEvent(room, {
    type: 'seat-assigned',
    at: Date.now(),
    roomId: room.id,
    clientId: client.id,
    seat: client.seat,
  });

  sendDarkXiangqiPayload(client, {
    ...darkXiangqiSnapshotPayload(room, snapshotClientFor(client)),
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
    if (!client.displaced) broadcastDarkXiangqiSnapshot(room);
  });
}

function assignDarkXiangqiSeat(
  room: DarkXiangqiLiveRoom,
  clientId: string,
  rawToken: string | undefined,
): DarkXiangqiSeatAssignment {
  const tokenHash = rawToken ? hashSeatToken(rawToken) : undefined;
  if (tokenHash) {
    for (const color of ['red', 'black'] as const) {
      const state = room.seatTokens[color];
      if (state && state.revokedAt === null && state.tokenHash === tokenHash) {
        state.clientId = clientId;
        state.lastSeenAt = new Date();
        return { ok: true, seat: color, seatTokenHash: tokenHash };
      }
    }
  }

  const activeSeats = new Set(
    [...room.clients].filter((client) => !client.displaced).map((client) => client.seat),
  );
  const seat: XiangqiColor | null = !activeSeats.has('red')
    ? 'red'
    : !activeSeats.has('black')
      ? 'black'
      : null;
  if (!seat) return { ok: false, reason: 'private room' };

  const seatToken = randomBytes(32).toString('base64url');
  const seatTokenHash = hashSeatToken(seatToken);
  const now = new Date();
  room.seatTokens[seat] = {
    clientId,
    seat,
    tokenHash: seatTokenHash,
    issuedAt: now,
    lastSeenAt: now,
    revokedAt: null,
  };
  return { ok: true, seat, seatToken, seatTokenHash };
}

function displaceOlderDarkXiangqiSeatClients(
  room: DarkXiangqiLiveRoom,
  newest: DarkXiangqiLiveClient,
): void {
  for (const client of room.clients) {
    if (client === newest) continue;
    if (client.displaced) continue;
    if (client.seat !== newest.seat) continue;
    client.displaced = true;
    try {
      client.socket.close(4000, 'duplicate session');
    } catch {
      /* socket already closed */
    }
  }
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
    sendDarkXiangqiPayload(client, darkXiangqiSnapshotPayload(room, snapshotClientFor(client)));
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
  const seq = appendDarkXiangqiEvent(room, event);
  broadcastDarkXiangqiEventAppended(room, event, seq);
}

function appendDarkXiangqiEvent(room: DarkXiangqiLiveRoom, event: DarkXiangqiEvent): number {
  room.events.push(event);
  room.projection = applyDarkXiangqiEvent(room.projection, event);
  return room.events.length - 1;
}

function broadcastDarkXiangqiSnapshot(room: DarkXiangqiLiveRoom): void {
  for (const client of room.clients) {
    if (client.displaced) continue;
    sendDarkXiangqiPayload(client, darkXiangqiSnapshotPayload(room, snapshotClientFor(client)));
  }
}

function broadcastDarkXiangqiEventAppended(
  room: DarkXiangqiLiveRoom,
  event: DarkXiangqiEvent,
  seq: number,
): void {
  for (const client of room.clients) {
    if (client.displaced) continue;
    const snapshot = darkXiangqiSnapshotPayload(room, snapshotClientFor(client));
    const { events: _events, ...base } = snapshot;
    const eventVisible = event.type !== 'move-played' || event.color === client.seat;
    sendDarkXiangqiPayload(client, {
      ...base,
      type: 'event-appended',
      seq,
      ...(eventVisible ? { event } : {}),
    });
  }
}

function snapshotClientFor(client: DarkXiangqiLiveClient) {
  return {
    id: client.id,
    seat: client.seat,
    solo: false,
  };
}

function sendDarkXiangqiPayload(client: DarkXiangqiLiveClient, payload: unknown): void {
  if (client.displaced) return;
  try {
    client.socket.send(JSON.stringify(payload));
  } catch {
    /* socket closed */
  }
}

function parseClientId(value: string | null): string | null {
  if (!value) return null;
  return /^[a-zA-Z0-9:_-]{8,80}$/.test(value) ? value : null;
}
