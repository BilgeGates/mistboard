import { createServer } from 'node:http';
import { randomInt, randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import {
  createChess960InitialBoard,
  draft960Variant,
  pickDraft960Offer,
  type Color,
  type PlayerView,
} from '@bichess/game';

type Seat = Color | 'spectator';

type Client = {
  id: string;
  socket: WebSocket;
  roomId: string;
  seat: Seat;
};

type Room = {
  id: string;
  clients: Set<Client>;
  offer: ReturnType<typeof pickDraft960Offer>;
  state: ReturnType<typeof draft960Variant.createInitialState>;
  seats: Partial<Record<Color, string>>;
  selections: Partial<Record<Color, number>>;
  resolvedStartId: number | null;
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
  const room = getOrCreateRoom(roomId);
  const clientId = randomUUID();
  const client: Client = { id: clientId, socket, roomId, seat: assignSeat(room, clientId) };
  room.clients.add(client);

  send(client, {
    type: 'hello',
    clientId: client.id,
    roomId,
    seat: client.seat,
    offer: room.offer,
    state: getClientView(room, client),
  });
  broadcastSnapshot(room);

  socket.on('message', (raw) => {
    const message = parseMessage(raw.toString());
    if (!message) return;
    if (message.type === 'ping') send(client, { type: 'pong', at: Date.now() });
    if (message.type === 'select-start') {
      selectStart(room, client, message.startId);
    }
  });

  socket.on('close', () => {
    room.clients.delete(client);
    if (
      room.state.status.type === 'pregame'
      && client.seat !== 'spectator'
      && room.seats[client.seat] === client.id
    ) {
      delete room.seats[client.seat];
      delete room.selections[client.seat];
    }
    broadcastSnapshot(room);
  });
});

server.listen(port, () => {
  console.log(`bichess server listening on http://localhost:${port}`);
});

function getOrCreateRoom(roomId: string): Room {
  const existing = rooms.get(roomId);
  if (existing) return existing;
  const room: Room = {
    id: roomId,
    clients: new Set(),
    offer: pickDraft960Offer(roomIdToSeed(roomId)),
    state: draft960Variant.createInitialState(roomId),
    seats: {},
    selections: {},
    resolvedStartId: null,
  };
  rooms.set(roomId, room);
  return room;
}

function assignSeat(room: Room, clientId: string): Seat {
  if (!room.seats.white) {
    room.seats.white = clientId;
    return 'white';
  }
  if (!room.seats.black) {
    room.seats.black = clientId;
    return 'black';
  }
  return 'spectator';
}

function selectStart(room: Room, client: Client, startId: number | undefined): void {
  if (client.seat === 'spectator') return;
  if (room.state.status.type !== 'pregame') return;
  if (!room.offer.some((start) => start.id === startId)) return;

  room.selections[client.seat] = startId;
  resolveStartIfReady(room);
  broadcastSnapshot(room);
}

function resolveStartIfReady(room: Room): void {
  const whiteSelection = room.selections.white;
  const blackSelection = room.selections.black;
  if (whiteSelection === undefined || blackSelection === undefined) return;

  const resolvedStartId = whiteSelection === blackSelection
    ? whiteSelection
    : [whiteSelection, blackSelection][randomInt(2)];
  const resolvedStart = room.offer.find((start) => start.id === resolvedStartId);
  if (!resolvedStart) return;

  room.resolvedStartId = resolvedStart.id;
  room.state = {
    ...room.state,
    board: createChess960InitialBoard(resolvedStart),
    status: { type: 'playing', turn: 'white' },
  };
}

function broadcastSnapshot(room: Room): void {
  for (const client of room.clients) {
    send(client, {
      type: 'snapshot',
      roomId: room.id,
      clients: room.clients.size,
      seat: client.seat,
      seats: room.seats,
      selections: room.selections,
      resolvedStartId: room.resolvedStartId,
      state: getClientView(room, client),
    });
  }
}

function getClientView(room: Room, client: Client): PlayerView {
  const perspective = client.seat === 'black' ? 'black' : 'white';
  return draft960Variant.getPlayerView(room.state, perspective);
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

function parseMessage(raw: string): { type: string; startId?: number } | null {
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

function roomIdToSeed(roomId: string): number {
  let hash = 0;
  for (const char of roomId) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return hash;
}
