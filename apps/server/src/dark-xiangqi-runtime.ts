import {
  applyMove as applyXiangqiMove,
  createInitialXiangqiState,
  DARK_XIANGQI_SPEC_ID,
  getPlayerView as getXiangqiPlayerView,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiMove,
  type XiangqiPiece,
  type XiangqiPlayerView,
  type XiangqiSquare,
} from '@mistboard/game';
import { darkXiangqiEnabled } from './feature-flags.js';

export const DARK_XIANGQI_ROOM_ID_PREFIX = 'dxq_';

export type DarkXiangqiSeat = XiangqiColor | 'spectator';

export type DarkXiangqiEvent =
  | {
      type: 'room-created';
      at: number;
      roomId: string;
      gameSpecId: typeof DARK_XIANGQI_SPEC_ID;
    }
  | {
      type: 'seat-assigned';
      at: number;
      roomId: string;
      clientId: string;
      seat: XiangqiColor;
    }
  | {
      type: 'seat-vacated';
      at: number;
      roomId: string;
      clientId: string;
      seat: XiangqiColor;
    }
  | {
      type: 'move-played';
      at: number;
      roomId: string;
      color: XiangqiColor;
      move: XiangqiMove;
    }
  | {
      type: 'seat-resigned';
      at: number;
      roomId: string;
      color: XiangqiColor;
    };

export type DarkXiangqiProjection = {
  roomId: string;
  gameSpecId: typeof DARK_XIANGQI_SPEC_ID;
  state: XiangqiGameState;
  seats: Partial<Record<XiangqiColor, string>>;
};

export type DarkXiangqiClientRef = {
  id?: string;
  seat: DarkXiangqiSeat;
  displaced: boolean;
};

export type DarkXiangqiSeatTokenState = {
  clientId: string;
  seat: XiangqiColor;
  tokenHash: string;
  userId: string | null;
  userHandle: string | null;
  userDisplayName: string | null;
  issuedAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
};

export type DarkXiangqiRuntimeRoom = {
  kind: 'dark-xiangqi';
  id: string;
  clients: Set<DarkXiangqiClientRef>;
  events: DarkXiangqiEvent[];
  projection: DarkXiangqiProjection;
  gameSpecId: typeof DARK_XIANGQI_SPEC_ID;
  pendingWrites: Promise<void>;
  seatTokens: Partial<Record<XiangqiColor, DarkXiangqiSeatTokenState>>;
};

export type DarkXiangqiRoomCreation =
  | { ok: true; room: DarkXiangqiRuntimeRoom }
  | { ok: false; error: 'dark_xiangqi_disabled' };

export type DarkXiangqiRoomHydration =
  | { ok: true; room: DarkXiangqiRuntimeRoom }
  | { ok: false; error: 'empty_event_log' | 'invalid_event_log' };

export type DarkXiangqiSnapshotClient = {
  id: string;
  seat: DarkXiangqiSeat;
  solo: boolean;
};

export function isDarkXiangqiRoomId(roomId: string): boolean {
  return roomId.startsWith(DARK_XIANGQI_ROOM_ID_PREFIX);
}

type DarkXiangqiWireBoardEntry =
  | { piece: XiangqiPiece; shrouded: false }
  | { color: XiangqiColor; shrouded: true };

export type DarkXiangqiWirePlayerView = Omit<XiangqiPlayerView, 'board'> & {
  board: Partial<Record<XiangqiSquare, DarkXiangqiWireBoardEntry>>;
};

export function createDarkXiangqiRuntimeRoom(
  roomId: string,
  options: { now?: number } = {},
): DarkXiangqiRoomCreation {
  if (!darkXiangqiEnabled()) return { ok: false, error: 'dark_xiangqi_disabled' };

  const events: DarkXiangqiEvent[] = [
    {
      type: 'room-created',
      at: options.now ?? Date.now(),
      roomId,
      gameSpecId: DARK_XIANGQI_SPEC_ID,
    },
  ];
  const projection = replayDarkXiangqiEvents(events);
  const room = createDarkXiangqiRuntimeRoomFromEvents(events, projection);
  if (!room.ok) throw new Error(`failed to create Dark Xiangqi runtime room: ${room.error}`);
  return { ok: true, room: room.room };
}

export function createDarkXiangqiRuntimeRoomFromEvents(
  events: readonly DarkXiangqiEvent[],
  projection = replayDarkXiangqiEvents(events),
): DarkXiangqiRoomHydration {
  if (events.length === 0) return { ok: false, error: 'empty_event_log' };
  if (!isDarkXiangqiEventLog(events)) return { ok: false, error: 'invalid_event_log' };
  const first = events[0]!;
  return {
    ok: true,
    room: {
      kind: 'dark-xiangqi',
      id: first.roomId,
      clients: new Set(),
      events: [...events],
      projection,
      gameSpecId: DARK_XIANGQI_SPEC_ID,
      pendingWrites: Promise.resolve(),
      seatTokens: {},
    },
  };
}

export function appendDarkXiangqiRuntimeEvent(
  room: DarkXiangqiRuntimeRoom,
  event: DarkXiangqiEvent,
): number {
  room.events.push(event);
  room.projection = applyDarkXiangqiEvent(room.projection, event);
  return room.events.length - 1;
}

export function isDarkXiangqiEventLog(
  events: readonly unknown[],
  roomId?: string,
): events is readonly DarkXiangqiEvent[] {
  const firstRoomId = roomId ?? roomIdFromUnknownEvent(events[0]);
  if (!firstRoomId) return false;
  const [created, ...rest] = events;
  if (
    !isDarkXiangqiEvent(created, firstRoomId) ||
    created.type !== 'room-created' ||
    created.gameSpecId !== DARK_XIANGQI_SPEC_ID ||
    !isFiniteTimestamp(created.at)
  ) {
    return false;
  }
  return rest.every((event) => isDarkXiangqiEvent(event, firstRoomId));
}

export function isDarkXiangqiEvent(value: unknown, roomId?: string): value is DarkXiangqiEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  if (typeof event.type !== 'string') return false;
  if (typeof event.roomId !== 'string') return false;
  if (roomId !== undefined && event.roomId !== roomId) return false;
  if (!isFiniteTimestamp(event.at)) return false;

  if (event.type === 'room-created') {
    return event.gameSpecId === DARK_XIANGQI_SPEC_ID;
  }
  if (event.type === 'seat-assigned' || event.type === 'seat-vacated') {
    return typeof event.clientId === 'string' && isXiangqiColor(event.seat);
  }
  if (event.type === 'move-played') {
    return isXiangqiColor(event.color) && isXiangqiMove(event.move);
  }
  if (event.type === 'seat-resigned') {
    return isXiangqiColor(event.color);
  }
  return false;
}

export function replayDarkXiangqiEvents(
  events: readonly DarkXiangqiEvent[],
): DarkXiangqiProjection {
  const firstRoomId = events[0]?.roomId ?? 'unknown-room';
  return events.reduce(
    (projection, event) => applyDarkXiangqiEvent(projection, event),
    initialDarkXiangqiProjection(firstRoomId),
  );
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isXiangqiColor(value: unknown): value is XiangqiColor {
  return value === 'red' || value === 'black';
}

function isXiangqiMove(value: unknown): value is XiangqiMove {
  if (typeof value !== 'object' || value === null) return false;
  const move = value as Partial<Record<keyof XiangqiMove, unknown>>;
  return typeof move.from === 'string' && typeof move.to === 'string';
}

function roomIdFromUnknownEvent(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const roomId = (value as Record<string, unknown>).roomId;
  return typeof roomId === 'string' ? roomId : undefined;
}

export function applyDarkXiangqiEvent(
  projection: DarkXiangqiProjection,
  event: DarkXiangqiEvent,
): DarkXiangqiProjection {
  if (event.roomId !== projection.roomId) return projection;

  if (event.type === 'room-created') {
    return initialDarkXiangqiProjection(event.roomId);
  }

  if (event.type === 'seat-assigned') {
    return {
      ...projection,
      seats: {
        ...projection.seats,
        [event.seat]: event.clientId,
      },
    };
  }

  if (event.type === 'seat-vacated') {
    if (projection.seats[event.seat] !== event.clientId) return projection;
    const seats = { ...projection.seats };
    delete seats[event.seat];
    return { ...projection, seats };
  }

  if (event.type === 'move-played') {
    if (projection.state.status.type !== 'playing') return projection;
    if (projection.state.status.turn !== event.color) return projection;
    return {
      ...projection,
      state: applyXiangqiMove(projection.state, event.move),
    };
  }

  if (event.type === 'seat-resigned') {
    if (projection.state.status.type !== 'playing') return projection;
    return {
      ...projection,
      state: {
        ...projection.state,
        status: {
          type: 'finished',
          winner: oppositeXiangqiColor(event.color),
          reason: 'resignation',
        },
      },
    };
  }

  return projection;
}

function oppositeXiangqiColor(color: XiangqiColor): XiangqiColor {
  return color === 'red' ? 'black' : 'red';
}

export function darkXiangqiSnapshotPayload(
  room: DarkXiangqiRuntimeRoom,
  client: DarkXiangqiSnapshotClient,
) {
  return {
    type: 'snapshot' as const,
    roomId: room.id,
    gameSpecId: room.gameSpecId,
    serverAt: Date.now(),
    clients: room.clients.size,
    seat: client.seat,
    solo: client.solo,
    seats: room.projection.seats,
    state: getDarkXiangqiClientView(room.projection.state, client),
    events: darkXiangqiEventsForClient(room, client),
    connectedSeats: computeDarkXiangqiConnectedSeats(room.clients),
  };
}

export function darkXiangqiEventsForClient(
  room: DarkXiangqiRuntimeRoom,
  client: DarkXiangqiSnapshotClient,
): DarkXiangqiEvent[] {
  const out: DarkXiangqiEvent[] = [];
  for (const event of room.events) {
    if (isDarkXiangqiEventVisible(client, event)) out.push(event);
  }
  return out;
}

export function getDarkXiangqiClientView(
  state: XiangqiGameState,
  client: DarkXiangqiSnapshotClient,
): DarkXiangqiWirePlayerView {
  const perspective = client.seat === 'black' ? 'black' : 'red';
  if (client.seat === 'spectator') return emptyDarkXiangqiView(state, perspective);
  return redactShroudedXiangqiView(getXiangqiPlayerView(state, perspective));
}

function initialDarkXiangqiProjection(roomId: string): DarkXiangqiProjection {
  return {
    roomId,
    gameSpecId: DARK_XIANGQI_SPEC_ID,
    state: createInitialXiangqiState(roomId),
    seats: {},
  };
}

function isDarkXiangqiEventVisible(
  client: DarkXiangqiSnapshotClient,
  event: DarkXiangqiEvent,
): boolean {
  if (event.type !== 'move-played') return true;
  return client.seat !== 'spectator' && event.color === client.seat;
}

function redactShroudedXiangqiView(view: XiangqiPlayerView): DarkXiangqiWirePlayerView {
  const board: DarkXiangqiWirePlayerView['board'] = {};
  for (const [square, entry] of Object.entries(view.board)) {
    if (!entry) continue;
    board[square as XiangqiSquare] = entry.shrouded
      ? { color: entry.piece.color, shrouded: true }
      : { piece: entry.piece, shrouded: false };
  }
  return { ...view, board };
}

function emptyDarkXiangqiView(
  state: XiangqiGameState,
  perspective: XiangqiColor,
): DarkXiangqiWirePlayerView {
  return {
    id: state.id,
    perspective,
    board: {},
    visibleSquares: [],
    legalMoves: [],
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: undefined,
  };
}

function computeDarkXiangqiConnectedSeats(
  clients: Iterable<DarkXiangqiClientRef>,
): Record<XiangqiColor, boolean> {
  const connected = { red: false, black: false };
  for (const client of clients) {
    if (client.displaced) continue;
    if (client.seat === 'red') connected.red = true;
    else if (client.seat === 'black') connected.black = true;
  }
  return connected;
}
