import {
  type AbortReason,
  applyMiniXiangqiMove,
  createInitialMiniXiangqiState,
  DARK_MINI_XIANGQI_SPEC_ID,
  getMiniXiangqiPlayerView,
  isAbortReason,
  type MiniXiangqiColor,
  type MiniXiangqiGameState,
  type MiniXiangqiMove,
  type MiniXiangqiPlayerView,
  oppositeMiniXiangqiColor,
} from '@mistboard/game';
import { darkMiniXiangqiEnabled } from './feature-flags.js';

export const DARK_MINI_XIANGQI_ROOM_ID_PREFIX = 'dmxq_';

export type DarkMiniXiangqiSeat = MiniXiangqiColor | 'spectator';
export type DarkMiniXiangqiCreatorPreference = MiniXiangqiColor | 'random';

export type DarkMiniXiangqiEvent =
  | {
      type: 'room-created';
      at: number;
      roomId: string;
      gameSpecId: typeof DARK_MINI_XIANGQI_SPEC_ID;
      creatorPreference?: DarkMiniXiangqiCreatorPreference;
    }
  | {
      type: 'seat-assigned';
      at: number;
      roomId: string;
      clientId: string;
      seat: MiniXiangqiColor;
    }
  | {
      type: 'move-played';
      at: number;
      roomId: string;
      color: MiniXiangqiColor;
      move: MiniXiangqiMove;
    }
  | {
      type: 'seat-resigned';
      at: number;
      roomId: string;
      color: MiniXiangqiColor;
    }
  | {
      type: 'game-aborted';
      at: number;
      roomId: string;
      reason: AbortReason;
    };

export type DarkMiniXiangqiClientEvent =
  | Exclude<DarkMiniXiangqiEvent, { type: 'move-played' }>
  | (Extract<DarkMiniXiangqiEvent, { type: 'move-played' }> & { ply: number });

export type DarkMiniXiangqiProjection = {
  roomId: string;
  creatorPreference?: DarkMiniXiangqiCreatorPreference;
  gameSpecId: typeof DARK_MINI_XIANGQI_SPEC_ID;
  state: MiniXiangqiGameState;
  seats: Partial<Record<MiniXiangqiColor, string>>;
};

export type DarkMiniXiangqiClientRef = {
  id?: string;
  seat: DarkMiniXiangqiSeat;
  displaced: boolean;
};

export type DarkMiniXiangqiSeatTokenState = {
  clientId: string;
  seat: MiniXiangqiColor;
  tokenHash: string;
  userId: string | null;
  userHandle: string | null;
  userDisplayName: string | null;
  issuedAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
};

export type DarkMiniXiangqiRuntimeRoom = {
  kind: 'dark-mini-xiangqi';
  id: string;
  clients: Set<DarkMiniXiangqiClientRef>;
  events: DarkMiniXiangqiEvent[];
  projection: DarkMiniXiangqiProjection;
  gameSpecId: typeof DARK_MINI_XIANGQI_SPEC_ID;
  gameEndRecorded: boolean;
  pendingWrites: Promise<void>;
  seatTokens: Partial<Record<MiniXiangqiColor, DarkMiniXiangqiSeatTokenState>>;
};

export type DarkMiniXiangqiSnapshotClient = {
  id: string;
  seat: DarkMiniXiangqiSeat;
  solo: boolean;
};

export type DarkMiniXiangqiRoomCreation =
  | { ok: true; room: DarkMiniXiangqiRuntimeRoom }
  | { ok: false; error: 'dark_mini_xiangqi_disabled' };

export type DarkMiniXiangqiRoomHydration =
  | { ok: true; room: DarkMiniXiangqiRuntimeRoom }
  | { ok: false; error: 'empty_event_log' | 'invalid_event_log' };

export function isDarkMiniXiangqiRoomId(roomId: string): boolean {
  return roomId.startsWith(DARK_MINI_XIANGQI_ROOM_ID_PREFIX);
}

export function createDarkMiniXiangqiRuntimeRoom(
  roomId: string,
  options: {
    creatorPreference?: DarkMiniXiangqiCreatorPreference;
    now?: number;
  } = {},
): DarkMiniXiangqiRoomCreation {
  if (!darkMiniXiangqiEnabled()) return { ok: false, error: 'dark_mini_xiangqi_disabled' };

  const now = options.now ?? Date.now();
  const events: DarkMiniXiangqiEvent[] = [
    {
      type: 'room-created',
      at: now,
      roomId,
      gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
      ...(options.creatorPreference ? { creatorPreference: options.creatorPreference } : {}),
    },
  ];
  const hydrated = createDarkMiniXiangqiRuntimeRoomFromEvents(events);
  if (!hydrated.ok) throw new Error(`failed to create Dark Mini Xiangqi room: ${hydrated.error}`);
  return { ok: true, room: hydrated.room };
}

export function createDarkMiniXiangqiRuntimeRoomFromEvents(
  events: readonly DarkMiniXiangqiEvent[],
  projection = replayDarkMiniXiangqiEvents(events),
): DarkMiniXiangqiRoomHydration {
  if (events.length === 0) return { ok: false, error: 'empty_event_log' };
  if (!isDarkMiniXiangqiEventLog(events)) return { ok: false, error: 'invalid_event_log' };
  const first = events[0]!;
  return {
    ok: true,
    room: {
      kind: 'dark-mini-xiangqi',
      id: first.roomId,
      clients: new Set(),
      events: [...events],
      projection,
      gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
      gameEndRecorded: projection.state.status.type !== 'playing',
      pendingWrites: Promise.resolve(),
      seatTokens: {},
    },
  };
}

export function appendDarkMiniXiangqiRuntimeEvent(
  room: DarkMiniXiangqiRuntimeRoom,
  event: DarkMiniXiangqiEvent,
): number {
  room.events.push(event);
  room.projection = applyDarkMiniXiangqiEvent(room.projection, event);
  return room.events.length - 1;
}

export function replayDarkMiniXiangqiEvents(
  events: readonly DarkMiniXiangqiEvent[],
): DarkMiniXiangqiProjection {
  const firstRoomId = events[0]?.roomId ?? 'unknown-room';
  return events.reduce(
    (projection, event) => applyDarkMiniXiangqiEvent(projection, event),
    initialDarkMiniXiangqiProjection(firstRoomId),
  );
}

export function applyDarkMiniXiangqiEvent(
  projection: DarkMiniXiangqiProjection,
  event: DarkMiniXiangqiEvent,
): DarkMiniXiangqiProjection {
  if (event.roomId !== projection.roomId) return projection;
  if (event.type === 'room-created') {
    return initialDarkMiniXiangqiProjection(event.roomId, event.creatorPreference);
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
  if (event.type === 'move-played') {
    if (projection.state.status.type !== 'playing') return projection;
    if (projection.state.status.turn !== event.color) return projection;
    return {
      ...projection,
      state: applyMiniXiangqiMove(projection.state, event.move),
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
          winner: oppositeMiniXiangqiColor(event.color),
          reason: 'resignation',
        },
      },
    };
  }
  if (event.type === 'game-aborted') {
    if (projection.state.status.type !== 'playing') return projection;
    if (projection.state.moveNumber !== 1) return projection;
    return {
      ...projection,
      state: {
        ...projection.state,
        status: { type: 'aborted', reason: event.reason },
      },
    };
  }
  return projection;
}

export function darkMiniXiangqiSnapshotPayload(
  room: DarkMiniXiangqiRuntimeRoom,
  client: DarkMiniXiangqiSnapshotClient,
) {
  const state = getDarkMiniXiangqiClientView(
    room.projection.state,
    client,
    latestVisibleMiniXiangqiMoveColor(room.events, client),
  );
  return {
    type: 'snapshot' as const,
    roomId: room.id,
    gameSpecId: room.gameSpecId,
    serverAt: Date.now(),
    clients: room.clients.size,
    seat: client.seat,
    solo: client.solo,
    connectedSeats: computeDarkMiniXiangqiConnectedSeats(room.clients),
    events: darkMiniXiangqiEventsForClient(room, client),
    seats: room.projection.seats,
    state,
  };
}

export function darkMiniXiangqiEventsForClient(
  room: DarkMiniXiangqiRuntimeRoom,
  client: DarkMiniXiangqiSnapshotClient,
): DarkMiniXiangqiClientEvent[] {
  const out: DarkMiniXiangqiClientEvent[] = [];
  let ply = 0;
  for (const event of room.events) {
    if (event.type === 'move-played') ply += 1;
    const visible = darkMiniXiangqiClientEventFor(event, client.seat, ply);
    if (visible) out.push(visible);
  }
  return out;
}

export function darkMiniXiangqiClientEventFor(
  event: DarkMiniXiangqiEvent,
  seat: DarkMiniXiangqiSeat,
  ply: number,
): DarkMiniXiangqiClientEvent | null {
  if (seat === 'spectator') return null;
  if (event.type === 'seat-assigned') return event.seat === seat ? event : null;
  if (event.type === 'move-played') {
    if (event.color !== seat) return null;
    return { ...event, ply };
  }
  return event;
}

export function darkMiniXiangqiPlyAtEventIndex(
  events: readonly DarkMiniXiangqiEvent[],
  eventIndex: number,
): number {
  let ply = 0;
  for (let index = 0; index <= eventIndex && index < events.length; index += 1) {
    if (events[index]?.type === 'move-played') ply += 1;
  }
  return ply;
}

export function getDarkMiniXiangqiClientView(
  state: MiniXiangqiGameState,
  client: DarkMiniXiangqiSnapshotClient,
  latestVisibleMoveColor?: MiniXiangqiColor,
): MiniXiangqiPlayerView {
  const perspective = client.seat === 'black' ? 'black' : 'red';
  if (client.seat === 'spectator') return emptyDarkMiniXiangqiView(state, perspective);
  const view = getMiniXiangqiPlayerView(state, perspective);
  if (latestVisibleMoveColor !== client.seat) return { ...view, lastMove: undefined };
  return view;
}

export function isDarkMiniXiangqiEventLog(
  events: readonly unknown[],
  roomId?: string,
): events is readonly DarkMiniXiangqiEvent[] {
  const firstRoomId = roomId ?? roomIdFromUnknownEvent(events[0]);
  if (!firstRoomId) return false;
  const [created, ...rest] = events;
  if (
    !isDarkMiniXiangqiEvent(created, firstRoomId) ||
    created.type !== 'room-created' ||
    created.gameSpecId !== DARK_MINI_XIANGQI_SPEC_ID ||
    !isFiniteTimestamp(created.at)
  ) {
    return false;
  }
  return rest.every((event) => isDarkMiniXiangqiEvent(event, firstRoomId));
}

export function isDarkMiniXiangqiEvent(
  value: unknown,
  roomId?: string,
): value is DarkMiniXiangqiEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  if (typeof event.roomId !== 'string') return false;
  if (roomId !== undefined && event.roomId !== roomId) return false;
  if (!isFiniteTimestamp(event.at)) return false;
  if (event.type === 'room-created') {
    return (
      event.gameSpecId === DARK_MINI_XIANGQI_SPEC_ID &&
      (event.creatorPreference === undefined ||
        event.creatorPreference === 'red' ||
        event.creatorPreference === 'black' ||
        event.creatorPreference === 'random')
    );
  }
  if (event.type === 'seat-assigned') {
    return typeof event.clientId === 'string' && isMiniXiangqiColor(event.seat);
  }
  if (event.type === 'move-played') {
    return isMiniXiangqiColor(event.color) && isMiniXiangqiMove(event.move);
  }
  if (event.type === 'seat-resigned') {
    return isMiniXiangqiColor(event.color);
  }
  if (event.type === 'game-aborted') {
    return isAbortReason(event.reason);
  }
  return false;
}

function initialDarkMiniXiangqiProjection(
  roomId: string,
  creatorPreference?: DarkMiniXiangqiCreatorPreference,
): DarkMiniXiangqiProjection {
  return {
    roomId,
    ...(creatorPreference ? { creatorPreference } : {}),
    gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
    state: createInitialMiniXiangqiState(roomId),
    seats: {},
  };
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isMiniXiangqiColor(value: unknown): value is MiniXiangqiColor {
  return value === 'red' || value === 'black';
}

export function isMiniXiangqiSquare(value: unknown): value is MiniXiangqiMove['from'] {
  return typeof value === 'string' && /^[a-g][1-7]$/.test(value);
}

function isMiniXiangqiMove(value: unknown): value is MiniXiangqiMove {
  if (typeof value !== 'object' || value === null) return false;
  const move = value as Record<string, unknown>;
  return isMiniXiangqiSquare(move.from) && isMiniXiangqiSquare(move.to);
}

function latestVisibleMiniXiangqiMoveColor(
  events: readonly DarkMiniXiangqiEvent[],
  client: DarkMiniXiangqiSnapshotClient,
): MiniXiangqiColor | undefined {
  if (client.seat === 'spectator') return undefined;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === 'move-played') return event.color === client.seat ? event.color : undefined;
  }
  return undefined;
}

function computeDarkMiniXiangqiConnectedSeats(
  clients: Iterable<DarkMiniXiangqiClientRef>,
): Record<MiniXiangqiColor, boolean> {
  const connected = { red: false, black: false };
  for (const client of clients) {
    if (client.displaced) continue;
    if (client.seat === 'red') connected.red = true;
    else if (client.seat === 'black') connected.black = true;
  }
  return connected;
}

function emptyDarkMiniXiangqiView(
  state: MiniXiangqiGameState,
  perspective: MiniXiangqiColor,
): MiniXiangqiPlayerView {
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

function roomIdFromUnknownEvent(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const roomId = (value as Record<string, unknown>).roomId;
  return typeof roomId === 'string' ? roomId : undefined;
}
