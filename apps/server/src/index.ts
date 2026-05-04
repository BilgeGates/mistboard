import { createServer } from 'node:http';
import { randomInt, randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import {
  advanceClock,
  clockRemainingMs,
  createClock,
  defaultClockInitialMs,
  expireClock,
  replayGameEvents,
  pickDraft960Offer,
  variantForId,
  type Color,
  type GameEvent,
  type GameProjection,
  type Move,
  type PieceRole,
  type Square,
  type VariantId,
} from '@bichess/game';
import { snapshotPayload, type Seat } from './payloads.js';

type Client = {
  devViews: boolean;
  id: string;
  socket: WebSocket;
  roomId: string;
  seat: Seat;
  solo: boolean;
};

type Room = {
  id: string;
  clients: Set<Client>;
  events: GameEvent[];
  projection: GameProjection;
  clockTimer: ReturnType<typeof setTimeout> | null;
  randomEngine: boolean;
};

const rooms = new Map<string, Room>();
const port = Number(process.env.PORT ?? 3001);

const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ ok: true, service: 'bichess-server' }));
});

const wss = new WebSocketServer({ server });

wss.on('connection', (socket, request) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const roomId = url.searchParams.get('room') ?? 'dev-room';
  if (url.searchParams.get('reset') === '1') resetRoom(roomId);
  const devMode = url.searchParams.get('dev');
  const solo = devMode === 'solo';
  const randomEngine = devMode === 'engine' || url.searchParams.get('engine') === 'random';
  const devViews = randomEngine || url.searchParams.get('views') === 'all';
  const room = getOrCreateRoom(roomId, parseVariantId(url.searchParams.get('variant')));
  if (randomEngine) enableRandomEngine(room);
  const clientId = randomUUID();
  const client: Client = {
    devViews,
    id: clientId,
    socket,
    roomId,
    seat: solo ? 'spectator' : assignSeat(room, clientId),
    solo,
  };
  room.clients.add(client);

  const snapshot = snapshotPayload(room, client);
  send(client, {
    ...snapshot,
    type: 'hello',
    clientId: client.id,
    offer: room.projection.offer,
  });
  broadcastSnapshot(room);

  socket.on('message', (raw) => {
    const message = parseMessage(raw.toString());
    if (!message) return;
    if (message.type === 'ping') send(client, { type: 'pong', at: Date.now() });
    if (message.type === 'select-start') {
      selectStart(room, client, message.startId, message.color);
    }
    if (message.type === 'submit-bid') {
      submitBid(room, client, message.bidMs, message.color);
    }
    if (message.type === 'move' && typeof message.from === 'string' && typeof message.to === 'string') {
      playMove(room, client, {
        type: 'move',
        from: message.from,
        to: message.to,
        promotion: message.promotion,
      });
    }
  });

  socket.on('close', () => {
    room.clients.delete(client);
    if (
      room.projection.state.status.type === 'pregame'
      && client.seat !== 'spectator'
      && room.projection.seats[client.seat] === client.id
    ) {
      appendEvent(room, {
        type: 'seat-vacated',
        at: Date.now(),
        roomId,
        clientId: client.id,
        seat: client.seat,
      });
    }
    broadcastSnapshot(room);
  });
});

server.listen(port, () => {
  console.log(`bichess server listening on http://localhost:${port}`);
});

function getOrCreateRoom(roomId: string, variant: VariantId): Room {
  const existing = rooms.get(roomId);
  if (existing) return existing;
  const events: GameEvent[] = [{
    type: 'room-created',
    at: Date.now(),
    roomId,
    variant,
    offer: variant === 'draft960' ? pickDraft960Offer(roomIdToSeed(roomId)) : [],
  }];
  const room: Room = {
    id: roomId,
    clients: new Set(),
    events,
    projection: replayGameEvents(events),
    clockTimer: null,
    randomEngine: false,
  };
  rooms.set(roomId, room);
  return room;
}

function assignSeat(room: Room, clientId: string): Seat {
  if (!room.projection.seats.white) {
    appendEvent(room, {
      type: 'seat-assigned',
      at: Date.now(),
      roomId: room.id,
      clientId,
      seat: 'white',
    });
    return 'white';
  }
  if (!room.projection.seats.black) {
    appendEvent(room, {
      type: 'seat-assigned',
      at: Date.now(),
      roomId: room.id,
      clientId,
      seat: 'black',
    });
    return 'black';
  }
  return 'spectator';
}

function enableRandomEngine(room: Room): void {
  room.randomEngine = true;
  if (room.projection.variant !== 'fog-of-war') return;
  if (room.projection.seats.black) return;
  appendEvent(room, {
    type: 'seat-assigned',
    at: Date.now(),
    roomId: room.id,
    clientId: 'random-engine',
    seat: 'black',
  });
}

function selectStart(room: Room, client: Client, startId: number | undefined, color: string | undefined): void {
  const selectionColor = client.solo && isColor(color) ? color : client.seat;
  if (selectionColor === 'spectator') return;
  if (room.projection.state.status.type !== 'pregame') return;
  if (!room.projection.offer.some((start) => start.id === startId)) return;
  if (startId === undefined) return;

  appendEvent(room, {
    type: 'draft-start-selected',
    at: Date.now(),
    roomId: room.id,
    color: selectionColor,
    startId,
  });
  resolveStartIfReady(room);
  broadcastSnapshot(room);
}

function submitBid(room: Room, client: Client, bidMs: number | undefined, color: string | undefined): void {
  if (room.projection.variant !== 'bid-for-white') return;
  if (room.projection.state.status.type !== 'pregame') return;

  const biddingSeat = client.solo && isColor(color) ? color : client.seat;
  if (biddingSeat === 'spectator') return;
  if (typeof bidMs !== 'number' || !Number.isInteger(bidMs)) return;

  const requestedBidMs = bidMs;
  const boundedBidMs = Math.max(0, Math.min(requestedBidMs, defaultClockInitialMs - 1000));
  appendEvent(room, {
    type: 'bid-submitted',
    at: Date.now(),
    roomId: room.id,
    color: biddingSeat,
    bidMs: boundedBidMs,
  });
  resolveBidIfReady(room);
  broadcastSnapshot(room);
}

function playMove(room: Room, client: Client, move: ClientMoveMessage): void {
  if (room.projection.state.status.type !== 'playing') return;
  const now = Date.now();
  const moveColor = room.projection.state.status.turn;
  if (!client.solo && (client.seat === 'spectator' || moveColor !== client.seat)) return;
  if (room.projection.state.clock && clockRemainingMs(room.projection.state.clock, moveColor, now) <= 0) {
    expireActiveClock(room, moveColor, now);
    broadcastSnapshot(room);
    return;
  }

  const requestedMove: Move = {
    from: move.from as Square,
    to: move.to as Square,
    promotion: isPromotionRole(move.promotion) ? move.promotion : undefined,
  };
  const nextState = variantForId(room.projection.variant).applyMove(room.projection.state, requestedMove);
  if (nextState === room.projection.state) return;
  const nextClock = advanceClock(room.projection.state.clock, now, moveColor, nextState.status);

  appendEvent(room, {
    type: 'move-played',
    at: now,
    roomId: room.id,
    clock: nextClock,
    color: moveColor,
    move: requestedMove,
  });
  playRandomEngineMoveIfReady(room);
  broadcastSnapshot(room);
}

function playRandomEngineMoveIfReady(room: Room): void {
  if (!room.randomEngine) return;
  if (room.projection.variant !== 'fog-of-war') return;
  if (room.projection.state.status.type !== 'playing') return;
  if (room.projection.state.status.turn !== 'black') return;

  const moves = variantForId(room.projection.variant).getLegalMoves(room.projection.state, 'black');
  if (moves.length === 0) return;
  const move = moves[randomInt(moves.length)];
  if (!move) return;
  appendEvent(room, {
    type: 'move-played',
    at: Date.now(),
    roomId: room.id,
    color: 'black',
    move,
  });
}

function resolveStartIfReady(room: Room): void {
  if (room.projection.resolvedStartId !== null) return;

  const whiteSelection = room.projection.selections.white;
  const blackSelection = room.projection.selections.black;
  if (whiteSelection === undefined || blackSelection === undefined) return;

  const resolvedStartId = whiteSelection === blackSelection
    ? whiteSelection
    : [whiteSelection, blackSelection][randomInt(2)];
  const resolvedStart = room.projection.offer.find((start) => start.id === resolvedStartId);
  if (!resolvedStart) return;
  const now = Date.now();

  appendEvent(room, {
    type: 'draft-start-resolved',
    at: now,
    roomId: room.id,
    clock: createClock(now),
    startId: resolvedStart.id,
  });
}

function resolveBidIfReady(room: Room): void {
  if (room.projection.variant !== 'bid-for-white') return;
  if (room.projection.state.status.type !== 'pregame') return;

  const whiteBid = room.projection.bids.white;
  const blackBid = room.projection.bids.black;
  if (whiteBid === undefined || blackBid === undefined) return;

  const whiteSeat: Color = whiteBid === blackBid
    ? (randomInt(2) === 0 ? 'white' : 'black')
    : (whiteBid > blackBid ? 'white' : 'black');
  const blackSeat: Color = whiteSeat === 'white' ? 'black' : 'white';
  const winningBidMs = whiteSeat === 'white' ? whiteBid : blackBid;
  const now = Date.now();
  const clock = createClock(now);
  const adjustedClock = {
    ...clock,
    remainingMs: {
      ...clock.remainingMs,
      white: Math.max(0, clock.remainingMs.white - winningBidMs),
    },
  };

  appendEvent(room, {
    type: 'bid-resolved',
    at: now,
    roomId: room.id,
    bids: { white: whiteBid, black: blackBid },
    blackSeat,
    clock: adjustedClock,
    winner: whiteBid === blackBid ? null : whiteSeat,
    whiteSeat,
    winningBidMs,
  });
  reconcileClientSeats(room);
}

function reconcileClientSeats(room: Room): void {
  for (const client of room.clients) {
    if (room.projection.seats.white === client.id) client.seat = 'white';
    if (room.projection.seats.black === client.id) client.seat = 'black';
  }
}

function broadcastSnapshot(room: Room): void {
  for (const client of room.clients) {
    send(client, snapshotPayload(room, client));
  }
}

function appendEvent(room: Room, event: GameEvent): void {
  room.events.push(event);
  room.projection = replayGameEvents(room.events);
  scheduleClockTimeout(room);
}

function resetRoom(roomId: string): void {
  const room = rooms.get(roomId);
  if (room?.clockTimer) clearTimeout(room.clockTimer);
  rooms.delete(roomId);
}

function scheduleClockTimeout(room: Room): void {
  if (room.clockTimer) clearTimeout(room.clockTimer);
  room.clockTimer = null;

  const { clock, status } = room.projection.state;
  if (!clock || status.type !== 'playing' || !clock.activeColor) return;

  const activeColor = clock.activeColor;
  const delay = clockRemainingMs(clock, activeColor, Date.now());
  room.clockTimer = setTimeout(() => {
    if (room.projection.state.status.type !== 'playing') return;
    if (room.projection.state.status.turn !== activeColor) return;
    expireActiveClock(room, activeColor, Date.now());
    broadcastSnapshot(room);
  }, delay + 25);
}

function expireActiveClock(room: Room, color: Color, at: number): void {
  const clock = expireClock(room.projection.state.clock, at, color);
  if (!clock) return;
  appendEvent(room, {
    type: 'clock-expired',
    at,
    roomId: room.id,
    color,
    clock,
  });
}

function send(client: Client, payload: unknown): void {
  client.socket.send(JSON.stringify(payload));
}

function broadcast(room: Room, payload: unknown): void {
  const body = JSON.stringify(payload);
  for (const client of room.clients) {
    client.socket.send(body);
  }
}

type ClientMoveMessage = {
  type: 'move';
  from: string;
  to: string;
  promotion?: string;
};

function parseMessage(raw: string): { type: string; bidMs?: number; startId?: number; color?: string; from?: string; to?: string; promotion?: string } | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value === 'object' && value !== null && 'type' in value) {
      return value as { type: string; startId?: number };
    }
  } catch {
    return null;
  }
  return null;
}

function isPromotionRole(value: string | undefined): value is Exclude<PieceRole, 'king' | 'pawn'> {
  return value === 'queen' || value === 'rook' || value === 'bishop' || value === 'knight';
}

function isColor(value: string | undefined): value is Color {
  return value === 'white' || value === 'black';
}

function parseVariantId(value: string | null): VariantId {
  if (value === 'draft960') return 'draft960';
  if (value === 'bid-for-white') return 'bid-for-white';
  return 'fog-of-war';
}

function roomIdToSeed(roomId: string): number {
  let hash = 0;
  for (const char of roomId) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return hash;
}
