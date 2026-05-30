import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { MiniXiangqiColor } from '@mistboard/game';
import type { WebSocket } from 'ws';
import { currentAccountUser } from './account-session.js';
import {
  appendDarkMiniXiangqiRuntimeEvent,
  type DarkMiniXiangqiRuntimeRoom,
  darkMiniXiangqiSnapshotPayload,
} from './dark-mini-xiangqi-runtime.js';
import { wsCounters } from './obs.js';
import {
  assignDarkMiniXiangqiSeat,
  displaceOlderDarkMiniXiangqiSeatClients,
} from './server-dark-mini-xiangqi-seat-session.js';
import { recordMessageTimestamp, seatTokenFromProtocolHeader } from './server-policy.js';
import { parseClientMessage } from './server-ws-messages.js';

export type DarkMiniXiangqiLiveClient = {
  debugRequested: false;
  displaced: boolean;
  id: string;
  messageTimestamps: number[];
  roomId: string;
  seat: MiniXiangqiColor;
  seatTokenHash?: string;
  socket: WebSocket;
  solo: false;
  userId?: string | null;
};

export type DarkMiniXiangqiLiveRoom = Omit<DarkMiniXiangqiRuntimeRoom, 'clients'> & {
  clients: Set<DarkMiniXiangqiLiveClient>;
};

export type DarkMiniXiangqiWebSocketContext = {
  wsMessageLimit: number;
  wsMessageWindowMs: number;
};

export async function handleDarkMiniXiangqiWebSocketConnection(
  ctx: DarkMiniXiangqiWebSocketContext,
  socket: WebSocket,
  request: IncomingMessage,
  room: DarkMiniXiangqiLiveRoom,
): Promise<void> {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const clientId = parseClientId(url.searchParams.get('client')) ?? randomUUID();
  const accountUser = await currentAccountUser(request);
  const seatToken = seatTokenFromProtocolHeader(request.headers['sec-websocket-protocol']);
  const assignment = assignDarkMiniXiangqiSeat(room, clientId, seatToken, accountUser);
  if (!assignment.ok) {
    socket.close(1008, assignment.reason);
    return;
  }

  appendDarkMiniXiangqiRuntimeEvent(room, {
    type: 'seat-assigned',
    at: Date.now(),
    roomId: room.id,
    clientId,
    seat: assignment.seat,
  });

  const client: DarkMiniXiangqiLiveClient = {
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
  displaceOlderDarkMiniXiangqiSeatClients(room, client);

  sendDarkMiniXiangqiPayload(client, {
    ...darkMiniXiangqiTransportSnapshotPayload(room, client),
    type: 'hello',
    clientId: client.id,
    ...(assignment.seatToken ? { seatToken: assignment.seatToken } : {}),
  });
  broadcastDarkMiniXiangqiSnapshot(room);

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
    handleDarkMiniXiangqiMessage(room, client, raw.toString());
  });

  socket.on('close', () => {
    room.clients.delete(client);
    if (!client.displaced) broadcastDarkMiniXiangqiSnapshot(room);
  });
}

function handleDarkMiniXiangqiMessage(
  room: DarkMiniXiangqiLiveRoom,
  client: DarkMiniXiangqiLiveClient,
  raw: string,
): void {
  const message = parseClientMessage(raw);
  if (!message) {
    wsCounters.recordParseFailure();
    return;
  }
  if (message.type === 'ping') {
    sendDarkMiniXiangqiPayload(client, {
      type: 'pong',
      at: typeof message.at === 'number' ? message.at : Date.now(),
      serverAt: Date.now(),
    });
    return;
  }
  if (message.type === 'snapshot:request') {
    wsCounters.recordSnapshotRequest();
    sendDarkMiniXiangqiPayload(client, darkMiniXiangqiTransportSnapshotPayload(room, client));
  }
}

export function sendDarkMiniXiangqiPayload(
  client: Pick<DarkMiniXiangqiLiveClient, 'displaced' | 'socket'>,
  payload: unknown,
): void {
  if (client.displaced) return;
  try {
    client.socket.send(JSON.stringify(payload));
  } catch {
    /* socket closed */
  }
}

export function broadcastDarkMiniXiangqiSnapshot(room: DarkMiniXiangqiLiveRoom): void {
  for (const client of room.clients) {
    if (client.displaced) continue;
    sendDarkMiniXiangqiPayload(client, darkMiniXiangqiTransportSnapshotPayload(room, client));
  }
}

export function darkMiniXiangqiTransportSnapshotPayload(
  room: DarkMiniXiangqiLiveRoom,
  client: DarkMiniXiangqiLiveClient,
) {
  return darkMiniXiangqiSnapshotPayload(room, {
    id: client.id,
    seat: client.seat,
    solo: false,
  });
}

function parseClientId(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : null;
}
