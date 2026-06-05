import {
  type AbortReason,
  applyMiniXiangqiMove,
  createInitialMiniXiangqiState,
  DARK_MINI_XIANGQI_SPEC_ID,
  getMiniXiangqiPlayerView,
  isAbortReason,
  type MiniXiangqiColor,
  type MiniXiangqiGameState,
  type MiniXiangqiGameStatus,
  type MiniXiangqiMove,
  type MiniXiangqiPlayerView,
  oppositeMiniXiangqiColor,
  type RoomTimeControl,
} from '@mistboard/game';
import { darkMiniXiangqiEnabled } from './feature-flags.js';

export const DARK_MINI_XIANGQI_ROOM_ID_PREFIX = 'dmxq_';

export type DarkMiniXiangqiSeat = MiniXiangqiColor | 'spectator';
export type DarkMiniXiangqiCreatorPreference = MiniXiangqiColor | 'random';

export type DarkMiniXiangqiClockState = {
  activeColor: MiniXiangqiColor | null;
  incrementMs: number;
  initialMs: number;
  remainingMs: Record<MiniXiangqiColor, number>;
  runningSince: number | null;
};

export type DarkMiniXiangqiEvent =
  | {
      type: 'room-created';
      at: number;
      roomId: string;
      gameSpecId: typeof DARK_MINI_XIANGQI_SPEC_ID;
      creatorPreference?: DarkMiniXiangqiCreatorPreference;
      timeControl?: RoomTimeControl;
    }
  | {
      type: 'seat-assigned';
      at: number;
      roomId: string;
      clientId: string;
      seat: MiniXiangqiColor;
    }
  | {
      type: 'clock-started';
      at: number;
      roomId: string;
      clock: DarkMiniXiangqiClockState;
    }
  | {
      type: 'clock-expired';
      at: number;
      roomId: string;
      color: MiniXiangqiColor;
      clock: DarkMiniXiangqiClockState;
    }
  | {
      type: 'move-played';
      at: number;
      roomId: string;
      color: MiniXiangqiColor;
      move: MiniXiangqiMove;
      clock?: DarkMiniXiangqiClockState;
    }
  | {
      type: 'seat-resigned';
      at: number;
      roomId: string;
      color: MiniXiangqiColor;
      clock?: DarkMiniXiangqiClockState;
    }
  | {
      type: 'game-aborted';
      at: number;
      roomId: string;
      reason: AbortReason;
      clock?: DarkMiniXiangqiClockState;
    }
  | {
      type: 'seat-forfeited';
      at: number;
      roomId: string;
      color: MiniXiangqiColor;
      clock?: DarkMiniXiangqiClockState;
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
  clock?: DarkMiniXiangqiClockState;
  timeControl?: RoomTimeControl;
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

// Mutual-confirm rematch state, mirroring the chess RematchState (server-types)
// but over red/black seats. An offer records the offering seat's token hash +
// account so finalize can verify the same players still hold the seats; once
// both seats have offered, a swapped-color room is created and each side gets a
// pre-issued seat token + redirect. pendingRedirects is keyed by OLD-room seat
// so a player who reconnects after finalize still gets routed forward.
export type DarkMiniXiangqiRematchOffer = {
  tokenHash: string;
  userId: string | null;
  at: number;
};

export type DarkMiniXiangqiRematchPendingRedirect = {
  roomId: string;
  seat: MiniXiangqiColor;
  rawToken: string;
  url: string;
};

export type DarkMiniXiangqiRematchState = {
  offers: Partial<Record<MiniXiangqiColor, DarkMiniXiangqiRematchOffer>>;
  finalizedRoomId?: string;
  pendingRedirects?: Partial<Record<MiniXiangqiColor, DarkMiniXiangqiRematchPendingRedirect>>;
};

export type DarkMiniXiangqiRuntimeRoom = {
  kind: 'dark-mini-xiangqi';
  id: string;
  clients: Set<DarkMiniXiangqiClientRef>;
  events: DarkMiniXiangqiEvent[];
  projection: DarkMiniXiangqiProjection;
  gameSpecId: typeof DARK_MINI_XIANGQI_SPEC_ID;
  abortTimer: ReturnType<typeof setTimeout> | null;
  abortDeadline: number | null;
  abortPhase: 'red-1' | 'black-1' | null;
  clockTimer: ReturnType<typeof setTimeout> | null;
  forfeitTimer: ReturnType<typeof setTimeout> | null;
  forfeitDeadline: number | null;
  forfeitSeat: MiniXiangqiColor | null;
  gameEndRecorded: boolean;
  pendingWrites: Promise<void>;
  seatTokens: Partial<Record<MiniXiangqiColor, DarkMiniXiangqiSeatTokenState>>;
  rematch: DarkMiniXiangqiRematchState;
  // PvE: setTimeout handle for the pending engine move (debounces the scheduler
  // so an engine seat schedules at most one move at a time). The engine SEAT
  // itself is derived from projection.seats (its slot holds an engine clientId),
  // so it survives hydration without a dedicated field.
  engineTimer: ReturnType<typeof setTimeout> | null;
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

export function createDarkMiniXiangqiClock(
  _at: number,
  initialMs: number,
  incrementMs: number,
): DarkMiniXiangqiClockState {
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

export function nextDarkMiniXiangqiClockForMove(
  clock: DarkMiniXiangqiClockState | undefined,
  at: number,
  movedColor: MiniXiangqiColor,
  prevMoveNumber: number,
  nextStatus: MiniXiangqiGameStatus,
): DarkMiniXiangqiClockState | undefined {
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
  const remaining = Math.max(0, darkMiniXiangqiClockRemainingMs(clock, movedColor, at));
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

export function expireDarkMiniXiangqiClock(
  clock: DarkMiniXiangqiClockState | undefined,
  at: number,
  color: MiniXiangqiColor,
): DarkMiniXiangqiClockState | undefined {
  if (!clock) return clock;
  return {
    ...clock,
    activeColor: null,
    remainingMs: {
      ...clock.remainingMs,
      [color]: Math.max(0, darkMiniXiangqiClockRemainingMs(clock, color, at)),
    },
    runningSince: null,
  };
}

export function freezeDarkMiniXiangqiClock(
  clock: DarkMiniXiangqiClockState | undefined,
  at: number,
): DarkMiniXiangqiClockState | undefined {
  if (!clock) return clock;
  if (clock.activeColor === null && clock.runningSince === null) return clock;
  const active = clock.activeColor;
  const remainingMs = { ...clock.remainingMs };
  if (active) remainingMs[active] = Math.max(0, darkMiniXiangqiClockRemainingMs(clock, active, at));
  return {
    ...clock,
    activeColor: null,
    remainingMs,
    runningSince: null,
  };
}

export function darkMiniXiangqiClockRemainingMs(
  clock: DarkMiniXiangqiClockState,
  color: MiniXiangqiColor,
  at: number,
): number {
  const remaining = clock.remainingMs[color];
  if (clock.activeColor !== color || clock.runningSince === null) return remaining;
  return Math.max(0, remaining - Math.max(0, at - clock.runningSince));
}

export function createDarkMiniXiangqiRuntimeRoom(
  roomId: string,
  options: {
    creatorPreference?: DarkMiniXiangqiCreatorPreference;
    now?: number;
    timeControl?: RoomTimeControl;
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
      ...(options.timeControl ? { timeControl: options.timeControl } : {}),
    },
  ];
  if (options.timeControl) {
    events.push({
      type: 'clock-started',
      at: now,
      roomId,
      clock: createDarkMiniXiangqiClock(
        now,
        options.timeControl.initialMs,
        options.timeControl.incrementMs,
      ),
    });
  }
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
      rematch: { offers: {} },
      engineTimer: null,
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
    return initialDarkMiniXiangqiProjection(
      event.roomId,
      event.timeControl,
      event.creatorPreference,
    );
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
  if (event.type === 'clock-started') {
    if (projection.state.status.type !== 'playing' || projection.clock) return projection;
    return { ...projection, clock: event.clock };
  }
  if (event.type === 'move-played') {
    if (projection.state.status.type !== 'playing') return projection;
    if (projection.state.status.turn !== event.color) return projection;
    const prevMoveNumber = projection.state.moveNumber;
    const nextState = applyMiniXiangqiMove(projection.state, event.move);
    return {
      ...projection,
      clock:
        event.clock ??
        nextDarkMiniXiangqiClockForMove(
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
          winner: oppositeMiniXiangqiColor(event.color),
          reason: 'timeout',
        },
      },
    };
  }
  if (event.type === 'seat-resigned') {
    if (projection.state.status.type !== 'playing') return projection;
    return {
      ...projection,
      clock: event.clock ?? freezeDarkMiniXiangqiClock(projection.clock, event.at),
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
      clock: event.clock ?? freezeDarkMiniXiangqiClock(projection.clock, event.at),
      state: {
        ...projection.state,
        status: { type: 'aborted', reason: event.reason },
      },
    };
  }
  if (event.type === 'seat-forfeited') {
    if (projection.state.status.type !== 'playing') return projection;
    return {
      ...projection,
      clock: event.clock ?? freezeDarkMiniXiangqiClock(projection.clock, event.at),
      state: {
        ...projection.state,
        status: {
          type: 'finished',
          winner: oppositeMiniXiangqiColor(event.color),
          reason: 'abandonment',
        },
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
    abortDeadline: room.abortDeadline,
    // Only the present winning seat (opposite the forfeiting seat) learns the
    // forfeit deadline, so the "you win in Ns" banner never leaks to the leaver.
    forfeitDeadline:
      room.forfeitSeat !== null && client.seat === oppositeMiniXiangqiColor(room.forfeitSeat)
        ? room.forfeitDeadline
        : null,
    clock: room.projection.clock,
    connectedSeats: computeDarkMiniXiangqiConnectedSeats(room.clients),
    events: darkMiniXiangqiEventsForClient(room, client),
    seats: room.projection.seats,
    state,
    timeControl: room.projection.timeControl,
    rematch: {
      offers: {
        red: room.rematch.offers.red !== undefined,
        black: room.rematch.offers.black !== undefined,
      },
      finalizedRoomId: room.rematch.finalizedRoomId ?? null,
    },
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
        event.creatorPreference === 'random') &&
      (event.timeControl === undefined || isRoomTimeControl(event.timeControl))
    );
  }
  if (event.type === 'seat-assigned') {
    return typeof event.clientId === 'string' && isMiniXiangqiColor(event.seat);
  }
  if (event.type === 'clock-started') {
    return isDarkMiniXiangqiClockState(event.clock);
  }
  if (event.type === 'clock-expired') {
    return isMiniXiangqiColor(event.color) && isDarkMiniXiangqiClockState(event.clock);
  }
  if (event.type === 'move-played') {
    return (
      isMiniXiangqiColor(event.color) &&
      isMiniXiangqiMove(event.move) &&
      (event.clock === undefined || isDarkMiniXiangqiClockState(event.clock))
    );
  }
  if (event.type === 'seat-resigned') {
    return (
      isMiniXiangqiColor(event.color) &&
      (event.clock === undefined || isDarkMiniXiangqiClockState(event.clock))
    );
  }
  if (event.type === 'game-aborted') {
    return (
      isAbortReason(event.reason) &&
      (event.clock === undefined || isDarkMiniXiangqiClockState(event.clock))
    );
  }
  if (event.type === 'seat-forfeited') {
    return (
      isMiniXiangqiColor(event.color) &&
      (event.clock === undefined || isDarkMiniXiangqiClockState(event.clock))
    );
  }
  return false;
}

function initialDarkMiniXiangqiProjection(
  roomId: string,
  timeControl?: RoomTimeControl,
  creatorPreference?: DarkMiniXiangqiCreatorPreference,
): DarkMiniXiangqiProjection {
  return {
    roomId,
    ...(creatorPreference ? { creatorPreference } : {}),
    gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
    state: createInitialMiniXiangqiState(roomId),
    seats: {},
    ...(timeControl ? { timeControl } : {}),
  };
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isMiniXiangqiColor(value: unknown): value is MiniXiangqiColor {
  return value === 'red' || value === 'black';
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

function isDarkMiniXiangqiClockState(value: unknown): value is DarkMiniXiangqiClockState {
  if (typeof value !== 'object' || value === null) return false;
  const clock = value as Partial<DarkMiniXiangqiClockState>;
  return (
    (clock.activeColor === null || isMiniXiangqiColor(clock.activeColor)) &&
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
