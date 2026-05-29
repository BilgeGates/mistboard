import {
  type AbortReason,
  applyMove as applyXiangqiMove,
  createInitialXiangqiState,
  DARK_XIANGQI_SPEC_ID,
  getPlayerView as getXiangqiPlayerView,
  type RoomTimeControl,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiGameStatus,
  type XiangqiMove,
  type XiangqiPiece,
  type XiangqiPlayerView,
  type XiangqiSquare,
} from '@mistboard/game';
import { darkXiangqiEnabled } from './feature-flags.js';

export const DARK_XIANGQI_ROOM_ID_PREFIX = 'dxq_';

export type DarkXiangqiSeat = XiangqiColor | 'spectator';
export type DarkXiangqiCreatorPreference = XiangqiColor | 'random';

export type DarkXiangqiClockState = {
  activeColor: XiangqiColor | null;
  incrementMs: number;
  initialMs: number;
  remainingMs: Record<XiangqiColor, number>;
  runningSince: number | null;
};

export type DarkXiangqiEvent =
  | {
      type: 'room-created';
      at: number;
      roomId: string;
      gameSpecId: typeof DARK_XIANGQI_SPEC_ID;
      creatorPreference?: DarkXiangqiCreatorPreference;
      timeControl?: RoomTimeControl;
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
      type: 'clock-started';
      at: number;
      roomId: string;
      clock: DarkXiangqiClockState;
    }
  | {
      type: 'clock-expired';
      at: number;
      roomId: string;
      color: XiangqiColor;
      clock: DarkXiangqiClockState;
    }
  | {
      type: 'move-played';
      at: number;
      roomId: string;
      color: XiangqiColor;
      move: XiangqiMove;
      clock?: DarkXiangqiClockState;
    }
  | {
      type: 'seat-resigned';
      at: number;
      roomId: string;
      color: XiangqiColor;
      clock?: DarkXiangqiClockState;
    }
  | {
      type: 'game-aborted';
      at: number;
      roomId: string;
      reason: AbortReason;
      clock?: DarkXiangqiClockState;
    }
  | {
      type: 'seat-forfeited';
      at: number;
      roomId: string;
      color: XiangqiColor;
      clock?: DarkXiangqiClockState;
    };

type DarkXiangqiMovePlayedEvent = Extract<DarkXiangqiEvent, { type: 'move-played' }>;

export type DarkXiangqiClientEvent =
  | Exclude<DarkXiangqiEvent, DarkXiangqiMovePlayedEvent>
  | (DarkXiangqiMovePlayedEvent & { ply: number });

export type DarkXiangqiProjection = {
  roomId: string;
  creatorPreference?: DarkXiangqiCreatorPreference;
  gameSpecId: typeof DARK_XIANGQI_SPEC_ID;
  state: XiangqiGameState;
  seats: Partial<Record<XiangqiColor, string>>;
  clock?: DarkXiangqiClockState;
  timeControl?: RoomTimeControl;
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
  abortTimer: ReturnType<typeof setTimeout> | null;
  abortDeadline: number | null;
  abortPhase: 'red-1' | 'black-1' | null;
  clockTimer: ReturnType<typeof setTimeout> | null;
  forfeitTimer: ReturnType<typeof setTimeout> | null;
  forfeitDeadline: number | null;
  forfeitSeat: XiangqiColor | null;
  gameEndRecorded: boolean;
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

type DarkXiangqiWireBoardEntry =
  | { piece: XiangqiPiece; shrouded: false }
  | { color: XiangqiColor; shrouded: true };

export type DarkXiangqiWirePlayerView = Omit<XiangqiPlayerView, 'board'> & {
  board: Partial<Record<XiangqiSquare, DarkXiangqiWireBoardEntry>>;
};

export function isDarkXiangqiRoomId(roomId: string): boolean {
  return roomId.startsWith(DARK_XIANGQI_ROOM_ID_PREFIX);
}

export function createDarkXiangqiClock(
  _at: number,
  initialMs: number,
  incrementMs: number,
): DarkXiangqiClockState {
  return {
    activeColor: null,
    incrementMs,
    initialMs,
    remainingMs: {
      black: initialMs,
      red: initialMs,
    },
    runningSince: null,
  };
}

export function nextDarkXiangqiClockForMove(
  clock: DarkXiangqiClockState | undefined,
  at: number,
  movedColor: XiangqiColor,
  prevMoveNumber: number,
  nextStatus: XiangqiGameStatus,
): DarkXiangqiClockState | undefined {
  if (!clock) return clock;
  if (clock.activeColor === null && clock.runningSince === null) {
    const remainingMs = {
      ...clock.remainingMs,
      [movedColor]: clock.remainingMs[movedColor] + clock.incrementMs,
    };
    const armsNow = movedColor === 'black' && prevMoveNumber === 1;
    if (armsNow && nextStatus.type === 'playing') {
      return { ...clock, activeColor: nextStatus.turn, remainingMs, runningSince: at };
    }
    return { ...clock, remainingMs };
  }
  if (clock.activeColor !== movedColor || clock.runningSince === null) return clock;
  const remaining = Math.max(0, darkXiangqiClockRemainingMs(clock, movedColor, at));
  const nextActiveColor = nextStatus.type === 'playing' ? nextStatus.turn : null;
  return {
    ...clock,
    activeColor: nextActiveColor,
    remainingMs: {
      ...clock.remainingMs,
      [movedColor]: nextStatus.type === 'playing' ? remaining + clock.incrementMs : remaining,
    },
    runningSince: nextActiveColor ? at : null,
  };
}

export function expireDarkXiangqiClock(
  clock: DarkXiangqiClockState | undefined,
  at: number,
  color: XiangqiColor,
): DarkXiangqiClockState | undefined {
  if (!clock) return clock;
  return {
    ...clock,
    activeColor: null,
    remainingMs: {
      ...clock.remainingMs,
      [color]: Math.max(0, darkXiangqiClockRemainingMs(clock, color, at)),
    },
    runningSince: null,
  };
}

export function freezeDarkXiangqiClock(
  clock: DarkXiangqiClockState | undefined,
  at: number,
): DarkXiangqiClockState | undefined {
  if (!clock) return clock;
  if (clock.activeColor === null && clock.runningSince === null) return clock;
  const active = clock.activeColor;
  const remainingMs = { ...clock.remainingMs };
  if (active) remainingMs[active] = Math.max(0, darkXiangqiClockRemainingMs(clock, active, at));
  return {
    ...clock,
    activeColor: null,
    remainingMs,
    runningSince: null,
  };
}

export function darkXiangqiClockRemainingMs(
  clock: DarkXiangqiClockState,
  color: XiangqiColor,
  at: number,
): number {
  const remaining = clock.remainingMs[color];
  if (clock.activeColor !== color || clock.runningSince === null) return remaining;
  return Math.max(0, remaining - Math.max(0, at - clock.runningSince));
}

export function createDarkXiangqiRuntimeRoom(
  roomId: string,
  options: {
    creatorPreference?: DarkXiangqiCreatorPreference;
    now?: number;
    timeControl?: RoomTimeControl;
  } = {},
): DarkXiangqiRoomCreation {
  if (!darkXiangqiEnabled()) return { ok: false, error: 'dark_xiangqi_disabled' };

  const now = options.now ?? Date.now();
  const events: DarkXiangqiEvent[] = [
    {
      type: 'room-created',
      at: now,
      roomId,
      gameSpecId: DARK_XIANGQI_SPEC_ID,
      ...(options.creatorPreference ? { creatorPreference: options.creatorPreference } : {}),
      ...(options.timeControl ? { timeControl: options.timeControl } : {}),
    },
  ];
  if (options.timeControl) {
    events.push({
      type: 'clock-started',
      at: now,
      roomId,
      clock: createDarkXiangqiClock(
        now,
        options.timeControl.initialMs,
        options.timeControl.incrementMs,
      ),
    });
  }
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
      abortTimer: null,
      abortDeadline: null,
      abortPhase: null,
      clockTimer: null,
      forfeitTimer: null,
      forfeitDeadline: null,
      forfeitSeat: null,
      gameEndRecorded: projection.state.status.type !== 'playing',
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
    return (
      event.gameSpecId === DARK_XIANGQI_SPEC_ID &&
      (event.creatorPreference === undefined ||
        isDarkXiangqiCreatorPreference(event.creatorPreference)) &&
      (event.timeControl === undefined || isRoomTimeControl(event.timeControl))
    );
  }
  if (event.type === 'seat-assigned' || event.type === 'seat-vacated') {
    return typeof event.clientId === 'string' && isXiangqiColor(event.seat);
  }
  if (event.type === 'clock-started') {
    return isDarkXiangqiClockState(event.clock);
  }
  if (event.type === 'clock-expired') {
    return isXiangqiColor(event.color) && isDarkXiangqiClockState(event.clock);
  }
  if (event.type === 'move-played') {
    return (
      isXiangqiColor(event.color) &&
      isXiangqiMove(event.move) &&
      (event.clock === undefined || isDarkXiangqiClockState(event.clock))
    );
  }
  if (event.type === 'seat-resigned') {
    return (
      isXiangqiColor(event.color) &&
      (event.clock === undefined || isDarkXiangqiClockState(event.clock))
    );
  }
  if (event.type === 'game-aborted') {
    return (
      isAbortReason(event.reason) &&
      (event.clock === undefined || isDarkXiangqiClockState(event.clock))
    );
  }
  if (event.type === 'seat-forfeited') {
    return (
      isXiangqiColor(event.color) &&
      (event.clock === undefined || isDarkXiangqiClockState(event.clock))
    );
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

export function applyDarkXiangqiEvent(
  projection: DarkXiangqiProjection,
  event: DarkXiangqiEvent,
): DarkXiangqiProjection {
  if (event.roomId !== projection.roomId) return projection;

  if (event.type === 'room-created') {
    return initialDarkXiangqiProjection(event.roomId, event.timeControl, event.creatorPreference);
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

  if (event.type === 'clock-started') {
    if (projection.state.status.type !== 'playing' || projection.clock) return projection;
    return { ...projection, clock: event.clock };
  }

  if (event.type === 'move-played') {
    if (projection.state.status.type !== 'playing') return projection;
    if (projection.state.status.turn !== event.color) return projection;
    const prevMoveNumber = projection.state.moveNumber;
    const nextState = applyXiangqiMove(projection.state, event.move);
    return {
      ...projection,
      clock:
        event.clock ??
        nextDarkXiangqiClockForMove(
          projection.clock,
          event.at,
          event.color,
          prevMoveNumber,
          nextState.status,
        ),
      state: nextState,
    };
  }

  if (event.type === 'clock-expired') {
    if (projection.state.status.type !== 'playing') return projection;
    return {
      ...projection,
      clock: event.clock,
      state: {
        ...projection.state,
        status: {
          type: 'finished',
          winner: oppositeXiangqiColor(event.color),
          reason: 'timeout',
        },
      },
    };
  }

  if (event.type === 'seat-resigned') {
    if (projection.state.status.type !== 'playing') return projection;
    return {
      ...projection,
      clock: event.clock ?? freezeDarkXiangqiClock(projection.clock, event.at),
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

  if (event.type === 'seat-forfeited') {
    if (projection.state.status.type !== 'playing') return projection;
    return {
      ...projection,
      clock: event.clock ?? freezeDarkXiangqiClock(projection.clock, event.at),
      state: {
        ...projection.state,
        status: {
          type: 'finished',
          winner: oppositeXiangqiColor(event.color),
          reason: 'abandonment',
        },
      },
    };
  }

  if (event.type === 'game-aborted') {
    if (projection.state.status.type !== 'playing') return projection;
    if (projection.state.moveNumber !== 1) return projection;
    return {
      ...projection,
      clock: event.clock ?? freezeDarkXiangqiClock(projection.clock, event.at),
      state: {
        ...projection.state,
        status: { type: 'aborted', reason: event.reason },
      },
    };
  }

  return projection;
}

export function darkXiangqiSnapshotPayload(
  room: DarkXiangqiRuntimeRoom,
  client: DarkXiangqiSnapshotClient,
) {
  const state = getDarkXiangqiClientView(
    room.projection.state,
    client,
    latestVisibleMoveColor(room.events, client),
  );
  return {
    type: 'snapshot' as const,
    roomId: room.id,
    gameSpecId: room.gameSpecId,
    serverAt: Date.now(),
    clients: room.clients.size,
    seat: client.seat,
    solo: client.solo,
    abortDeadline: room.abortDeadline,
    clock: room.projection.clock,
    connectedSeats: computeDarkXiangqiConnectedSeats(room.clients),
    events: darkXiangqiEventsForClient(room, client),
    seats: room.projection.seats,
    state,
    timeControl: room.projection.timeControl,
  };
}

export function darkXiangqiEventsForClient(
  room: DarkXiangqiRuntimeRoom,
  client: DarkXiangqiSnapshotClient,
): DarkXiangqiClientEvent[] {
  const out: DarkXiangqiClientEvent[] = [];
  let ply = 0;
  for (const event of room.events) {
    if (event.type === 'move-played') ply += 1;
    const visible = darkXiangqiClientEventFor(event, client.seat, ply);
    if (visible) out.push(visible);
  }
  return out;
}

export function darkXiangqiClientEventFor(
  event: DarkXiangqiEvent,
  seat: DarkXiangqiSeat,
  ply: number,
): DarkXiangqiClientEvent | null {
  if (event.type !== 'move-played') return event;
  if (seat === 'spectator' || event.color !== seat) return null;
  return { ...event, ply };
}

export function darkXiangqiPlyAtEventIndex(
  events: readonly DarkXiangqiEvent[],
  eventIndex: number,
): number {
  let ply = 0;
  for (let index = 0; index <= eventIndex && index < events.length; index += 1) {
    if (events[index]?.type === 'move-played') ply += 1;
  }
  return ply;
}

export function getDarkXiangqiClientView(
  state: XiangqiGameState,
  client: DarkXiangqiSnapshotClient,
  latestVisibleMoveColor?: XiangqiColor,
): DarkXiangqiWirePlayerView {
  const perspective = client.seat === 'black' ? 'black' : 'red';
  if (client.seat === 'spectator') return emptyDarkXiangqiView(state, perspective);
  const view = redactShroudedXiangqiView(getXiangqiPlayerView(state, perspective));
  if (latestVisibleMoveColor !== client.seat) return { ...view, lastMove: undefined };
  return view;
}

function initialDarkXiangqiProjection(
  roomId: string,
  timeControl?: RoomTimeControl,
  creatorPreference?: DarkXiangqiCreatorPreference,
): DarkXiangqiProjection {
  return {
    roomId,
    ...(creatorPreference ? { creatorPreference } : {}),
    gameSpecId: DARK_XIANGQI_SPEC_ID,
    state: createInitialXiangqiState(roomId),
    seats: {},
    ...(timeControl ? { timeControl } : {}),
  };
}

function latestVisibleMoveColor(
  events: readonly DarkXiangqiEvent[],
  client: DarkXiangqiSnapshotClient,
): XiangqiColor | undefined {
  if (client.seat === 'spectator') return undefined;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === 'move-played') return event.color === client.seat ? event.color : undefined;
  }
  return undefined;
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

function oppositeXiangqiColor(color: XiangqiColor): XiangqiColor {
  return color === 'red' ? 'black' : 'red';
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isXiangqiColor(value: unknown): value is XiangqiColor {
  return value === 'red' || value === 'black';
}

function isDarkXiangqiCreatorPreference(value: unknown): value is DarkXiangqiCreatorPreference {
  return value === 'red' || value === 'black' || value === 'random';
}

function isAbortReason(value: unknown): value is AbortReason {
  return value === 'pregame-timeout' || value === 'user-abort';
}

function isRoomTimeControl(value: unknown): value is RoomTimeControl {
  if (typeof value !== 'object' || value === null) return false;
  const timeControl = value as Partial<Record<keyof RoomTimeControl, unknown>>;
  return (
    typeof timeControl.initialMs === 'number' &&
    Number.isInteger(timeControl.initialMs) &&
    typeof timeControl.incrementMs === 'number' &&
    Number.isInteger(timeControl.incrementMs)
  );
}

function isDarkXiangqiClockState(value: unknown): value is DarkXiangqiClockState {
  if (typeof value !== 'object' || value === null) return false;
  const clock = value as Partial<DarkXiangqiClockState>;
  return (
    (clock.activeColor === null || isXiangqiColor(clock.activeColor)) &&
    typeof clock.initialMs === 'number' &&
    Number.isFinite(clock.initialMs) &&
    typeof clock.incrementMs === 'number' &&
    Number.isFinite(clock.incrementMs) &&
    (typeof clock.runningSince === 'number' || clock.runningSince === null) &&
    typeof clock.remainingMs === 'object' &&
    clock.remainingMs !== null &&
    typeof clock.remainingMs.red === 'number' &&
    Number.isFinite(clock.remainingMs.red) &&
    typeof clock.remainingMs.black === 'number' &&
    Number.isFinite(clock.remainingMs.black)
  );
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
