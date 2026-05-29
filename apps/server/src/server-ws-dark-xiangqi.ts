import { randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import {
  DARK_XIANGQI_SPEC_ID,
  isLegalMove,
  type XiangqiColor,
  type XiangqiGameEndReason,
  type XiangqiMove,
  type XiangqiSquare,
} from '@mistboard/game';
import type { WebSocket } from 'ws';
import { currentAccountUser } from './account-session.js';
import {
  appendDarkXiangqiRuntimeEvent,
  type DarkXiangqiEvent,
  type DarkXiangqiRuntimeRoom,
  type DarkXiangqiSeatTokenState,
  darkXiangqiSnapshotPayload,
} from './dark-xiangqi-runtime.js';
import { logger, wsCounters } from './obs.js';
import * as persistence from './persistence.js';
import { ABORT_WINDOW_MS, FORFEIT_WINDOW_MS } from './room-manager.js';
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
  | {
      ok: true;
      seat: XiangqiColor;
      seatToken?: string;
      seatTokenHash: string;
      tokenState: DarkXiangqiSeatTokenState;
      previousTokenState?: DarkXiangqiSeatTokenState;
    }
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
  const assignment = assignDarkXiangqiSeat(room, clientId, seatToken, accountUser);
  if (!assignment.ok) {
    socket.close(1008, assignment.reason);
    return;
  }
  try {
    await appendDarkXiangqiSeatAssigned(room, {
      event: {
        type: 'seat-assigned',
        at: Date.now(),
        roomId: room.id,
        clientId,
        seat: assignment.seat,
      },
      tokenState: assignment.tokenState,
    });
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
    if (!client.displaced) {
      scheduleDarkXiangqiLifecycleTimers(room);
      broadcastDarkXiangqiSnapshot(room);
    }
  });
}

function assignDarkXiangqiSeat(
  room: DarkXiangqiLiveRoom,
  clientId: string,
  rawToken: string | undefined,
  accountUser: persistence.UserAccount | null,
): DarkXiangqiSeatAssignment {
  const tokenHash = rawToken ? hashSeatToken(rawToken) : undefined;
  if (tokenHash) {
    for (const color of ['red', 'black'] as const) {
      const state = room.seatTokens[color];
      if (state && state.revokedAt === null && state.tokenHash === tokenHash) {
        if (state.userId !== null && state.userId !== accountUser?.id) {
          return { ok: false, reason: 'private room' };
        }
        const tokenState = { ...state, clientId, lastSeenAt: new Date() };
        room.seatTokens[color] = tokenState;
        return {
          ok: true,
          seat: color,
          seatTokenHash: tokenHash,
          tokenState,
          previousTokenState: state,
        };
      }
    }
  }

  if (accountUser) {
    for (const color of ['red', 'black'] as const) {
      const state = room.seatTokens[color];
      if (state && state.revokedAt === null && state.userId === accountUser.id) {
        const tokenState = { ...state, clientId, lastSeenAt: new Date() };
        room.seatTokens[color] = tokenState;
        return {
          ok: true,
          seat: color,
          seatTokenHash: state.tokenHash,
          tokenState,
          previousTokenState: state,
        };
      }
    }
  }

  const occupiedSeats = new Set<XiangqiColor>(
    [...room.clients].filter((client) => !client.displaced).map((client) => client.seat),
  );
  for (const color of ['red', 'black'] as const) {
    if (room.projection.seats[color] || room.seatTokens[color]) occupiedSeats.add(color);
  }
  const seat: XiangqiColor | null = !occupiedSeats.has('red')
    ? 'red'
    : !occupiedSeats.has('black')
      ? 'black'
      : null;
  if (!seat) return { ok: false, reason: 'private room' };

  const seatToken = randomBytes(32).toString('base64url');
  const seatTokenHash = hashSeatToken(seatToken);
  const now = new Date();
  const tokenState: DarkXiangqiSeatTokenState = {
    clientId,
    seat,
    tokenHash: seatTokenHash,
    userId: accountUser?.id ?? null,
    userHandle: accountUser?.handle ?? null,
    userDisplayName: accountUser?.displayName ?? null,
    issuedAt: now,
    lastSeenAt: now,
    revokedAt: null,
  };
  room.seatTokens[seat] = tokenState;
  return { ok: true, seat, seatToken, seatTokenHash, tokenState };
}

function rollbackDarkXiangqiSeatAssignment(
  room: DarkXiangqiLiveRoom,
  assignment: Extract<DarkXiangqiSeatAssignment, { ok: true }>,
): void {
  const current = room.seatTokens[assignment.seat];
  if (
    !current ||
    current.clientId !== assignment.tokenState.clientId ||
    current.tokenHash !== assignment.tokenState.tokenHash
  ) {
    return;
  }
  if (assignment.previousTokenState) {
    room.seatTokens[assignment.seat] = assignment.previousTokenState;
    return;
  }
  delete room.seatTokens[assignment.seat];
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
    seq = await appendDarkXiangqiEvent(room, event);
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
    seq = await appendDarkXiangqiEvent(room, event);
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
    seq = await appendDarkXiangqiEvent(room, event);
  } catch (err) {
    recordDarkXiangqiPersistenceError(room.id, room.events.length, event.type, err as Error);
    client.socket.close(1011, 'persistence failure');
    return;
  }
  broadcastDarkXiangqiEventAppended(room, event, seq);
}

type DarkXiangqiAbortPhase = 'red-1' | 'black-1';

export function clearDarkXiangqiRuntimeTimers(room: DarkXiangqiLiveRoom): void {
  clearDarkXiangqiAbortTimer(room);
  clearDarkXiangqiForfeitTimer(room);
}

export function clearDarkXiangqiAbortTimer(room: DarkXiangqiLiveRoom): void {
  if (room.abortTimer) clearTimeout(room.abortTimer);
  room.abortTimer = null;
}

export function clearDarkXiangqiForfeitTimer(room: DarkXiangqiLiveRoom): void {
  if (room.forfeitTimer) clearTimeout(room.forfeitTimer);
  room.forfeitTimer = null;
}

export function scheduleDarkXiangqiLifecycleTimers(room: DarkXiangqiLiveRoom): void {
  scheduleDarkXiangqiAbortTimeout(room);
  scheduleDarkXiangqiForfeitTimeout(room);
}

function scheduleDarkXiangqiAbortTimeout(room: DarkXiangqiLiveRoom): void {
  clearDarkXiangqiAbortTimer(room);
  const phase = darkXiangqiAbortPhaseFor(room);
  if (phase === null) {
    room.abortDeadline = null;
    room.abortPhase = null;
    return;
  }
  if (room.abortPhase !== phase || room.abortDeadline === null) {
    room.abortPhase = phase;
    room.abortDeadline = Date.now() + ABORT_WINDOW_MS;
  }
  const delay = Math.max(0, room.abortDeadline - Date.now());
  room.abortTimer = setTimeout(() => {
    if (darkXiangqiAbortPhaseFor(room) === null) return;
    void appendDarkXiangqiEvent(room, {
      type: 'game-aborted',
      at: Date.now(),
      roomId: room.id,
      reason: 'pregame-timeout',
    })
      .then((seq) => {
        const event = room.events[seq];
        if (event) broadcastDarkXiangqiEventAppended(room, event, seq);
      })
      .catch((err) => {
        logger.error(
          {
            kind: 'dark_xiangqi_abort_window_failure',
            room_id: room.id,
            error: (err as Error).message,
            at: Date.now(),
          },
          'Dark Xiangqi abort window failure',
        );
      });
  }, delay + 25);
  room.abortTimer.unref();
}

function scheduleDarkXiangqiForfeitTimeout(room: DarkXiangqiLiveRoom): void {
  clearDarkXiangqiForfeitTimer(room);
  const seat = darkXiangqiForfeitingSeat(room);
  if (seat === null) {
    room.forfeitSeat = null;
    room.forfeitDeadline = null;
    return;
  }
  if (room.forfeitSeat !== seat || room.forfeitDeadline === null) {
    room.forfeitSeat = seat;
    room.forfeitDeadline = Date.now() + FORFEIT_WINDOW_MS;
  }
  const delay = Math.max(0, room.forfeitDeadline - Date.now());
  room.forfeitTimer = setTimeout(() => {
    if (darkXiangqiForfeitingSeat(room) !== seat) return;
    void appendDarkXiangqiEvent(room, {
      type: 'seat-forfeited',
      at: Date.now(),
      roomId: room.id,
      color: seat,
    })
      .then((seq) => {
        const event = room.events[seq];
        if (event) broadcastDarkXiangqiEventAppended(room, event, seq);
      })
      .catch((err) => {
        logger.error(
          {
            kind: 'dark_xiangqi_forfeit_window_failure',
            room_id: room.id,
            error: (err as Error).message,
            at: Date.now(),
          },
          'Dark Xiangqi forfeit window failure',
        );
      });
  }, delay + 25);
  room.forfeitTimer.unref();
}

function darkXiangqiAbortPhaseFor(room: DarkXiangqiLiveRoom): DarkXiangqiAbortPhase | null {
  const { status, moveNumber, lastMove } = room.projection.state;
  if (status.type !== 'playing' || moveNumber >= 2) return null;
  if (!room.projection.seats.red || !room.projection.seats.black) return null;
  return lastMove === undefined ? 'red-1' : 'black-1';
}

function darkXiangqiForfeitingSeat(room: DarkXiangqiLiveRoom): XiangqiColor | null {
  const { status, moveNumber } = room.projection.state;
  if (status.type !== 'playing' || moveNumber < 2) return null;
  const connected = darkXiangqiConnectedSeats(room.clients);
  if (connected.red && !connected.black) return 'black';
  if (!connected.red && connected.black) return 'red';
  return null;
}

async function appendDarkXiangqiEvent(
  room: DarkXiangqiLiveRoom,
  event: DarkXiangqiEvent,
): Promise<number> {
  const write = room.pendingWrites.then(async () => {
    const seq = room.events.length;
    if (persistence.isInitialized()) {
      await persistence.appendRoomEvent(room.id, seq, event);
    }
    const appendedSeq = appendDarkXiangqiRuntimeEvent(room, event);
    scheduleDarkXiangqiLifecycleTimers(room);
    if (
      persistence.isInitialized() &&
      room.projection.state.status.type === 'finished' &&
      !room.gameEndRecorded
    ) {
      room.gameEndRecorded = true;
      try {
        await persistence.recordGameEnd(room.id, buildDarkXiangqiGameSummary(room));
      } catch (err) {
        logger.error(
          {
            kind: 'dark_xiangqi_game_end_record_failure',
            room_id: room.id,
            error: (err as Error).message,
            at: Date.now(),
          },
          'Dark Xiangqi game end record failure',
        );
      }
    }
    if (room.projection.state.status.type === 'aborted') {
      room.gameEndRecorded = true;
    }
    return appendedSeq;
  });
  room.pendingWrites = write.then(
    () => undefined,
    () => undefined,
  );
  return write;
}

function buildDarkXiangqiGameSummary(room: DarkXiangqiLiveRoom): persistence.GameSummary {
  const status = room.projection.state.status;
  if (status.type !== 'finished') {
    throw new Error('buildDarkXiangqiGameSummary called on non-terminal state');
  }
  const moveEvents = room.events.filter((event) => event.type === 'move-played');
  const firstAt = room.events[0]?.at ?? Date.now();
  const lastAt = room.events[room.events.length - 1]?.at ?? Date.now();
  return {
    variant: DARK_XIANGQI_SPEC_ID,
    mode: 'pvp',
    result: darkXiangqiResult(status.winner),
    termination: darkXiangqiTermination(status.reason),
    plyCount: moveEvents.length,
    startedAt: new Date(firstAt),
    endedAt: new Date(lastAt),
    whiteClient: null,
    blackClient: null,
    whiteName: null,
    blackName: null,
    corpusId: null,
    rated: false,
    visibility: 'private',
    participants: [darkXiangqiParticipant('red', room), darkXiangqiParticipant('black', room)],
  };
}

function darkXiangqiResult(winner: XiangqiColor | null): persistence.GameResult {
  if (winner === 'red') return 'red-wins';
  if (winner === 'black') return 'black-wins';
  return 'draw';
}

function darkXiangqiTermination(reason: XiangqiGameEndReason): persistence.GameTermination {
  return reason;
}

function darkXiangqiParticipant(
  color: XiangqiColor,
  room: DarkXiangqiLiveRoom,
): persistence.GameParticipant {
  const token = room.seatTokens[color];
  if (token?.userId) {
    return {
      color,
      displayName: token.userDisplayName ?? token.userHandle ?? 'Player',
      subjectType: 'user',
      subjectId: token.userId,
      visibility: 'private',
    };
  }
  return {
    color,
    displayName: color === 'red' ? 'Red' : 'Black',
    subjectType: 'guest',
    subjectId: null,
    visibility: 'private',
  };
}

async function appendDarkXiangqiSeatAssigned(
  room: DarkXiangqiLiveRoom,
  args: {
    event: Extract<DarkXiangqiEvent, { type: 'seat-assigned' }>;
    tokenState: DarkXiangqiSeatTokenState;
  },
): Promise<number> {
  const write = room.pendingWrites.then(async () => {
    const seq = room.events.length;
    if (persistence.isInitialized()) {
      await persistence.appendRoomEvent(room.id, seq, args.event);
      await persistence.upsertRoomSeatToken(
        room.id,
        persistenceRecordForDarkXiangqiSeatToken(args.tokenState),
      );
    }
    const appendedSeq = appendDarkXiangqiRuntimeEvent(room, args.event);
    room.seatTokens[args.event.seat] = args.tokenState;
    scheduleDarkXiangqiLifecycleTimers(room);
    return appendedSeq;
  });
  room.pendingWrites = write.then(
    () => undefined,
    () => undefined,
  );
  return write;
}

function persistenceRecordForDarkXiangqiSeatToken(
  token: DarkXiangqiSeatTokenState,
): persistence.RoomSeatTokenRecord<XiangqiColor> {
  return {
    seat: token.seat,
    clientId: token.clientId,
    tokenHash: token.tokenHash,
    userId: token.userId,
    userHandle: token.userHandle,
    userDisplayName: token.userDisplayName,
    issuedAt: token.issuedAt,
    lastSeenAt: token.lastSeenAt,
    revokedAt: token.revokedAt,
  };
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
    if (room.projection.state.status.type !== 'playing') {
      sendDarkXiangqiPayload(client, darkXiangqiSnapshotPayload(room, snapshotClientFor(client)));
      continue;
    }
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

function darkXiangqiConnectedSeats(
  clients: Iterable<DarkXiangqiLiveClient>,
): Record<XiangqiColor, boolean> {
  const connected = { red: false, black: false };
  for (const client of clients) {
    if (client.displaced) continue;
    connected[client.seat] = true;
  }
  return connected;
}

function recordDarkXiangqiPersistenceError(
  roomId: string,
  seq: number,
  eventType: string,
  err: Error,
): void {
  logger.error(
    {
      kind: 'dark_xiangqi_persistence_failure',
      room_id: roomId,
      seq,
      event_type: eventType,
      error: err.message,
    },
    'Dark Xiangqi persistence failure',
  );
}
