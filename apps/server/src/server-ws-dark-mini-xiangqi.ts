import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import {
  isMiniXiangqiLegalMove,
  type MiniXiangqiColor,
  type MiniXiangqiMove,
} from '@mistboard/game';
import type { WebSocket } from 'ws';
import { currentAccountUser } from './account-session.js';
import {
  type DarkMiniXiangqiEvent,
  type DarkMiniXiangqiRuntimeRoom,
  darkMiniXiangqiClientEventFor,
  darkMiniXiangqiPlyAtEventIndex,
  darkMiniXiangqiSnapshotPayload,
  isMiniXiangqiSquare,
} from './dark-mini-xiangqi-runtime.js';
import { wsCounters } from './obs.js';
import {
  appendDarkMiniXiangqiEvent,
  appendDarkMiniXiangqiSeatAssigned,
  type DarkMiniXiangqiEventWriterContext,
  recordDarkMiniXiangqiPersistenceError,
} from './server-dark-mini-xiangqi-events.js';
import {
  clearDarkMiniXiangqiRuntimeTimers,
  type DarkMiniXiangqiLifecycleContext,
  scheduleDarkMiniXiangqiLifecycleTimers as scheduleDarkMiniXiangqiLifecycleTimersWithContext,
} from './server-dark-mini-xiangqi-lifecycle.js';
import {
  assignDarkMiniXiangqiSeat,
  displaceOlderDarkMiniXiangqiSeatClients,
  rollbackDarkMiniXiangqiSeatAssignment,
} from './server-dark-mini-xiangqi-seat-session.js';
import {
  cancelDarkMiniXiangqiRematch,
  type DarkMiniXiangqiRematchContext,
  declineDarkMiniXiangqiRematch,
  finalizeDarkMiniXiangqiRematchIfReady,
  maybeReplayDarkMiniXiangqiRematchRedirect,
  offerDarkMiniXiangqiRematch,
} from './server-dark-mini-xiangqi-rematch.js';
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
  darkMiniXiangqiRematch: DarkMiniXiangqiRematchContext;
};

let darkMiniXiangqiEventWriterCtx: DarkMiniXiangqiEventWriterContext;

const darkMiniXiangqiLifecycleCtx: DarkMiniXiangqiLifecycleContext<DarkMiniXiangqiLiveRoom> = {
  appendEvent: (room, event) =>
    appendDarkMiniXiangqiEvent(room, event, darkMiniXiangqiEventWriterCtx),
  broadcastEventAppended: broadcastDarkMiniXiangqiEventAppended,
};

darkMiniXiangqiEventWriterCtx = {
  scheduleLifecycleTimers: (room) =>
    scheduleDarkMiniXiangqiLifecycleTimers(room as DarkMiniXiangqiLiveRoom),
};

export function scheduleDarkMiniXiangqiLifecycleTimers(room: DarkMiniXiangqiLiveRoom): void {
  scheduleDarkMiniXiangqiLifecycleTimersWithContext(room, darkMiniXiangqiLifecycleCtx);
}

export { clearDarkMiniXiangqiRuntimeTimers };

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

  try {
    await appendDarkMiniXiangqiSeatAssigned(
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
      darkMiniXiangqiEventWriterCtx,
    );
  } catch (err) {
    rollbackDarkMiniXiangqiSeatAssignment(room, assignment);
    recordDarkMiniXiangqiPersistenceError(
      room.id,
      room.events.length,
      'seat-assigned',
      err as Error,
    );
    socket.close(1011, 'persistence failure');
    return;
  }

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
  scheduleDarkMiniXiangqiLifecycleTimers(room);

  sendDarkMiniXiangqiPayload(client, {
    ...darkMiniXiangqiTransportSnapshotPayload(room, client),
    type: 'hello',
    clientId: client.id,
    ...(assignment.seatToken ? { seatToken: assignment.seatToken } : {}),
  });
  broadcastDarkMiniXiangqiSnapshot(room);
  // A player reconnecting after a rematch was finalized (while they were
  // offline) still gets routed to the new swapped-color room.
  maybeReplayDarkMiniXiangqiRematchRedirect(ctx.darkMiniXiangqiRematch, room, client);

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
    void handleDarkMiniXiangqiMessage(ctx, room, client, raw.toString());
  });

  socket.on('close', () => {
    room.clients.delete(client);
    if (!client.displaced) {
      scheduleDarkMiniXiangqiLifecycleTimers(room);
      broadcastDarkMiniXiangqiSnapshot(room);
    }
  });
}

async function handleDarkMiniXiangqiMessage(
  ctx: DarkMiniXiangqiWebSocketContext,
  room: DarkMiniXiangqiLiveRoom,
  client: DarkMiniXiangqiLiveClient,
  raw: string,
): Promise<void> {
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
    return;
  }
  if (message.type === 'resign') {
    await handleDarkMiniXiangqiResign(room, client);
    return;
  }
  if (message.type === 'abort') {
    await handleDarkMiniXiangqiAbort(room, client);
    return;
  }
  if (message.type === 'rematch:offer') {
    offerDarkMiniXiangqiRematch(ctx.darkMiniXiangqiRematch, room, client);
    await finalizeDarkMiniXiangqiRematchIfReady(ctx.darkMiniXiangqiRematch, room);
    return;
  }
  if (message.type === 'rematch:cancel') {
    cancelDarkMiniXiangqiRematch(ctx.darkMiniXiangqiRematch, room, client);
    return;
  }
  if (message.type === 'rematch:decline') {
    declineDarkMiniXiangqiRematch(ctx.darkMiniXiangqiRematch, room, client);
    return;
  }
  if (message.type !== 'move') return;
  if (!isMiniXiangqiSquare(message.from) || !isMiniXiangqiSquare(message.to)) return;
  if (room.projection.state.status.type !== 'playing') return;
  if (room.projection.state.status.turn !== client.seat) return;
  const move: MiniXiangqiMove = { from: message.from, to: message.to };
  if (!isMiniXiangqiLegalMove(room.projection.state, move)) return;
  const event: DarkMiniXiangqiEvent = {
    type: 'move-played',
    at: Date.now(),
    roomId: room.id,
    color: client.seat,
    move,
  };
  let seq: number;
  try {
    seq = await appendDarkMiniXiangqiEvent(room, event, darkMiniXiangqiEventWriterCtx);
  } catch (err) {
    recordDarkMiniXiangqiPersistenceError(room.id, room.events.length, event.type, err as Error);
    client.socket.close(1011, 'persistence failure');
    return;
  }
  broadcastDarkMiniXiangqiEventAppended(room, event, seq);
}

async function handleDarkMiniXiangqiResign(
  room: DarkMiniXiangqiLiveRoom,
  client: DarkMiniXiangqiLiveClient,
): Promise<void> {
  if (room.projection.state.status.type !== 'playing') return;
  if (room.projection.state.moveNumber < 2) return;
  const event: DarkMiniXiangqiEvent = {
    type: 'seat-resigned',
    at: Date.now(),
    roomId: room.id,
    color: client.seat,
  };
  let seq: number;
  try {
    seq = await appendDarkMiniXiangqiEvent(room, event, darkMiniXiangqiEventWriterCtx);
  } catch (err) {
    recordDarkMiniXiangqiPersistenceError(room.id, room.events.length, event.type, err as Error);
    client.socket.close(1011, 'persistence failure');
    return;
  }
  broadcastDarkMiniXiangqiEventAppended(room, event, seq);
}

async function handleDarkMiniXiangqiAbort(
  room: DarkMiniXiangqiLiveRoom,
  client: DarkMiniXiangqiLiveClient,
): Promise<void> {
  const status = room.projection.state.status;
  if (status.type !== 'playing') return;
  if (room.projection.state.moveNumber >= 2) return;
  if (status.turn !== client.seat) return;
  const event: DarkMiniXiangqiEvent = {
    type: 'game-aborted',
    at: Date.now(),
    roomId: room.id,
    reason: 'user-abort',
  };
  let seq: number;
  try {
    seq = await appendDarkMiniXiangqiEvent(room, event, darkMiniXiangqiEventWriterCtx);
  } catch (err) {
    recordDarkMiniXiangqiPersistenceError(room.id, room.events.length, event.type, err as Error);
    client.socket.close(1011, 'persistence failure');
    return;
  }
  broadcastDarkMiniXiangqiEventAppended(room, event, seq);
}

export function broadcastDarkMiniXiangqiEventAppended(
  room: DarkMiniXiangqiLiveRoom,
  event: DarkMiniXiangqiEvent,
  seq: number,
): void {
  for (const client of room.clients) {
    if (client.displaced) continue;
    if (room.projection.state.status.type !== 'playing') {
      sendDarkMiniXiangqiPayload(client, darkMiniXiangqiTransportSnapshotPayload(room, client));
      continue;
    }
    const snapshot = darkMiniXiangqiTransportSnapshotPayload(room, client);
    const { events: _events, ...base } = snapshot;
    const clientEvent = darkMiniXiangqiClientEventFor(
      event,
      client.seat,
      darkMiniXiangqiPlyAtEventIndex(room.events, seq),
    );
    sendDarkMiniXiangqiPayload(client, {
      ...base,
      type: 'event-appended',
      seq,
      ...(clientEvent ? { event: clientEvent } : {}),
    });
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
