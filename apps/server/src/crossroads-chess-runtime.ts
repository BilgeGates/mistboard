// Live-room runtime for perfect-information Crossroads Chess.
//
// A parallel sibling of the Dark Mini Xiangqi runtime (own types, not generalized).
// The room is event-sourced: the GameEvent log is the single source of truth for
// replay + reconnect, and the projection is rebuilt from it. Because this is
// perfect-information (no fog), the per-seat view filtering that DMX needs
// collapses away — every client (players AND spectators) sees the full board and
// every move. Moves are adjudicated by the perfect-info referee
// (applyCrossroadsChessOpenMove): real legality, checkmate / stalemate / race terminals.

import {
  type AbortReason,
  applyCrossroadsChessOpenMove,
  CROSSROADS_CHESS_SPEC_ID,
  type CrossroadsChessColor,
  type CrossroadsChessGameState,
  type CrossroadsChessGameStatus,
  type CrossroadsChessMove,
  type CrossroadsChessPlayerView,
  createInitialCrossroadsChessState,
  DUAL_CHESS_SPEC_ID,
  getCrossroadsChessOpenView,
  isAbortReason,
  oppositeCrossroadsChessColor,
  type RoomTimeControl,
} from '@mistboard/game';
import { crossroadsChessEnabled } from './feature-flags.js';

export const CROSSROADS_CHESS_ROOM_ID_PREFIX = 'dchess_';

export type CrossroadsChessSeat = CrossroadsChessColor | 'spectator';
export type CrossroadsChessCreatorPreference = CrossroadsChessColor | 'random';

export type CrossroadsChessClockState = {
  activeColor: CrossroadsChessColor | null;
  incrementMs: number;
  initialMs: number;
  remainingMs: Record<CrossroadsChessColor, number>;
  runningSince: number | null;
};

export type CrossroadsChessEvent =
  | {
      type: 'room-created';
      at: number;
      roomId: string;
      gameSpecId: typeof CROSSROADS_CHESS_SPEC_ID | typeof DUAL_CHESS_SPEC_ID;
      creatorPreference?: CrossroadsChessCreatorPreference;
      timeControl?: RoomTimeControl;
    }
  | {
      type: 'seat-assigned';
      at: number;
      roomId: string;
      clientId: string;
      seat: CrossroadsChessColor;
    }
  | { type: 'clock-started'; at: number; roomId: string; clock: CrossroadsChessClockState }
  | {
      type: 'clock-expired';
      at: number;
      roomId: string;
      color: CrossroadsChessColor;
      clock: CrossroadsChessClockState;
    }
  | {
      type: 'move-played';
      at: number;
      roomId: string;
      color: CrossroadsChessColor;
      move: CrossroadsChessMove;
      clock?: CrossroadsChessClockState;
    }
  | {
      type: 'seat-resigned';
      at: number;
      roomId: string;
      color: CrossroadsChessColor;
      clock?: CrossroadsChessClockState;
    }
  | {
      type: 'game-aborted';
      at: number;
      roomId: string;
      reason: AbortReason;
      clock?: CrossroadsChessClockState;
    }
  | {
      type: 'seat-forfeited';
      at: number;
      roomId: string;
      color: CrossroadsChessColor;
      clock?: CrossroadsChessClockState;
    };

// Wire shape sent to clients: move events carry their ply for the move list.
export type CrossroadsChessClientEvent =
  | Exclude<CrossroadsChessEvent, { type: 'move-played' }>
  | (Extract<CrossroadsChessEvent, { type: 'move-played' }> & { ply: number });

export type CrossroadsChessProjection = {
  roomId: string;
  creatorPreference?: CrossroadsChessCreatorPreference;
  gameSpecId: typeof CROSSROADS_CHESS_SPEC_ID;
  state: CrossroadsChessGameState;
  seats: Partial<Record<CrossroadsChessColor, string>>;
  clock?: CrossroadsChessClockState;
  timeControl?: RoomTimeControl;
};

export type CrossroadsChessClientRef = {
  id?: string;
  seat: CrossroadsChessSeat;
  displaced: boolean;
};

export type CrossroadsChessSeatTokenState = {
  clientId: string;
  seat: CrossroadsChessColor;
  tokenHash: string;
  userId: string | null;
  userHandle: string | null;
  userDisplayName: string | null;
  issuedAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
};

export type CrossroadsChessRematchOffer = { tokenHash: string; userId: string | null; at: number };
export type CrossroadsChessRematchPendingRedirect = {
  roomId: string;
  seat: CrossroadsChessColor;
  rawToken: string;
  url: string;
};
export type CrossroadsChessRematchState = {
  offers: Partial<Record<CrossroadsChessColor, CrossroadsChessRematchOffer>>;
  finalizedRoomId?: string;
  pendingRedirects?: Partial<Record<CrossroadsChessColor, CrossroadsChessRematchPendingRedirect>>;
};

export type CrossroadsChessRuntimeRoom = {
  kind: 'crossroads-chess';
  id: string;
  clients: Set<CrossroadsChessClientRef>;
  events: CrossroadsChessEvent[];
  projection: CrossroadsChessProjection;
  gameSpecId: typeof CROSSROADS_CHESS_SPEC_ID;
  abortTimer: ReturnType<typeof setTimeout> | null;
  abortDeadline: number | null;
  abortPhase: 'white-1' | 'red-1' | null;
  clockTimer: ReturnType<typeof setTimeout> | null;
  forfeitTimer: ReturnType<typeof setTimeout> | null;
  forfeitDeadline: number | null;
  forfeitSeat: CrossroadsChessColor | null;
  gameEndRecorded: boolean;
  pendingWrites: Promise<void>;
  seatTokens: Partial<Record<CrossroadsChessColor, CrossroadsChessSeatTokenState>>;
  rematch: CrossroadsChessRematchState;
};

export type CrossroadsChessSnapshotClient = {
  id: string;
  seat: CrossroadsChessSeat;
  solo: boolean;
};

export type CrossroadsChessRoomCreation =
  | { ok: true; room: CrossroadsChessRuntimeRoom }
  | { ok: false; error: 'crossroads_chess_disabled' };
export type CrossroadsChessRoomHydration =
  | { ok: true; room: CrossroadsChessRuntimeRoom }
  | { ok: false; error: 'empty_event_log' | 'invalid_event_log' };

export function isCrossroadsChessRoomId(roomId: string): boolean {
  return roomId.startsWith(CROSSROADS_CHESS_ROOM_ID_PREFIX);
}

// ── Clocks ──────────────────────────────────────────────────────────────────

export function createCrossroadsChessClock(
  _at: number,
  initialMs: number,
  incrementMs: number,
): CrossroadsChessClockState {
  return {
    activeColor: null,
    incrementMs,
    initialMs,
    remainingMs: { white: initialMs, red: initialMs },
    runningSince: null,
  };
}

export function nextCrossroadsChessClockForMove(
  clock: CrossroadsChessClockState | undefined,
  at: number,
  movedColor: CrossroadsChessColor,
  prevMoveNumber: number,
  nextStatus: CrossroadsChessGameStatus,
): CrossroadsChessClockState | undefined {
  if (!clock) return clock;
  if (clock.activeColor === null && clock.runningSince === null) {
    const remainingMs = {
      ...clock.remainingMs,
      [movedColor]: clock.remainingMs[movedColor] + clock.incrementMs,
    };
    // Lichess-style: clocks start after both sides have moved once. Red is the
    // second player, so they arm on Red's first move.
    const armsNow = movedColor === 'red' && prevMoveNumber === 1;
    if (armsNow && nextStatus.type === 'playing') {
      return { ...clock, activeColor: nextStatus.turn, remainingMs, runningSince: at };
    }
    return { ...clock, remainingMs };
  }
  if (clock.activeColor !== movedColor || clock.runningSince === null) return clock;
  const remaining = Math.max(0, crossroadsChessClockRemainingMs(clock, movedColor, at));
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

export function expireCrossroadsChessClock(
  clock: CrossroadsChessClockState | undefined,
  at: number,
  color: CrossroadsChessColor,
): CrossroadsChessClockState | undefined {
  if (!clock) return clock;
  return {
    ...clock,
    activeColor: null,
    remainingMs: {
      ...clock.remainingMs,
      [color]: Math.max(0, crossroadsChessClockRemainingMs(clock, color, at)),
    },
    runningSince: null,
  };
}

export function freezeCrossroadsChessClock(
  clock: CrossroadsChessClockState | undefined,
  at: number,
): CrossroadsChessClockState | undefined {
  if (!clock) return clock;
  if (clock.activeColor === null && clock.runningSince === null) return clock;
  const active = clock.activeColor;
  const remainingMs = { ...clock.remainingMs };
  if (active) remainingMs[active] = Math.max(0, crossroadsChessClockRemainingMs(clock, active, at));
  return { ...clock, activeColor: null, remainingMs, runningSince: null };
}

export function crossroadsChessClockRemainingMs(
  clock: CrossroadsChessClockState,
  color: CrossroadsChessColor,
  at: number,
): number {
  const remaining = clock.remainingMs[color];
  if (clock.activeColor !== color || clock.runningSince === null) return remaining;
  return Math.max(0, remaining - Math.max(0, at - clock.runningSince));
}

// ── Room creation + replay ──────────────────────────────────────────────────

export function createCrossroadsChessRuntimeRoom(
  roomId: string,
  options: {
    creatorPreference?: CrossroadsChessCreatorPreference;
    now?: number;
    timeControl?: RoomTimeControl;
  } = {},
): CrossroadsChessRoomCreation {
  if (!crossroadsChessEnabled()) return { ok: false, error: 'crossroads_chess_disabled' };
  const now = options.now ?? Date.now();
  const events: CrossroadsChessEvent[] = [
    {
      type: 'room-created',
      at: now,
      roomId,
      gameSpecId: CROSSROADS_CHESS_SPEC_ID,
      ...(options.creatorPreference ? { creatorPreference: options.creatorPreference } : {}),
      ...(options.timeControl ? { timeControl: options.timeControl } : {}),
    },
  ];
  if (options.timeControl) {
    events.push({
      type: 'clock-started',
      at: now,
      roomId,
      clock: createCrossroadsChessClock(
        now,
        options.timeControl.initialMs,
        options.timeControl.incrementMs,
      ),
    });
  }
  const hydrated = createCrossroadsChessRuntimeRoomFromEvents(events);
  if (!hydrated.ok) throw new Error(`failed to create Crossroads Chess room: ${hydrated.error}`);
  return { ok: true, room: hydrated.room };
}

export function createCrossroadsChessRuntimeRoomFromEvents(
  events: readonly CrossroadsChessEvent[],
  projection = replayCrossroadsChessEvents(events),
): CrossroadsChessRoomHydration {
  if (events.length === 0) return { ok: false, error: 'empty_event_log' };
  if (!isCrossroadsChessEventLog(events)) return { ok: false, error: 'invalid_event_log' };
  const first = events[0]!;
  return {
    ok: true,
    room: {
      kind: 'crossroads-chess',
      id: first.roomId,
      clients: new Set(),
      events: [...events],
      projection,
      gameSpecId: CROSSROADS_CHESS_SPEC_ID,
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
    },
  };
}

export function appendCrossroadsChessRuntimeEvent(
  room: CrossroadsChessRuntimeRoom,
  event: CrossroadsChessEvent,
): number {
  room.events.push(event);
  room.projection = applyCrossroadsChessEvent(room.projection, event);
  return room.events.length - 1;
}

export function replayCrossroadsChessEvents(
  events: readonly CrossroadsChessEvent[],
): CrossroadsChessProjection {
  const firstRoomId = events[0]?.roomId ?? 'unknown-room';
  return events.reduce(
    (projection, event) => applyCrossroadsChessEvent(projection, event),
    initialCrossroadsChessProjection(firstRoomId),
  );
}

export function applyCrossroadsChessEvent(
  projection: CrossroadsChessProjection,
  event: CrossroadsChessEvent,
): CrossroadsChessProjection {
  if (event.roomId !== projection.roomId) return projection;
  if (event.type === 'room-created') {
    return initialCrossroadsChessProjection(
      event.roomId,
      event.timeControl,
      event.creatorPreference,
    );
  }
  if (event.type === 'seat-assigned') {
    return { ...projection, seats: { ...projection.seats, [event.seat]: event.clientId } };
  }
  if (event.type === 'clock-started') {
    if (projection.state.status.type !== 'playing' || projection.clock) return projection;
    return { ...projection, clock: event.clock };
  }
  if (event.type === 'move-played') {
    if (projection.state.status.type !== 'playing') return projection;
    if (projection.state.status.turn !== event.color) return projection;
    const prevMoveNumber = projection.state.moveNumber;
    const nextState = applyCrossroadsChessOpenMove(projection.state, event.move);
    return {
      ...projection,
      clock:
        event.clock ??
        nextCrossroadsChessClockForMove(
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
          winner: oppositeCrossroadsChessColor(event.color),
          reason: 'timeout',
        },
      },
    };
  }
  if (event.type === 'seat-resigned') {
    if (projection.state.status.type !== 'playing') return projection;
    return {
      ...projection,
      clock: event.clock ?? freezeCrossroadsChessClock(projection.clock, event.at),
      state: {
        ...projection.state,
        status: {
          type: 'finished',
          winner: oppositeCrossroadsChessColor(event.color),
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
      clock: event.clock ?? freezeCrossroadsChessClock(projection.clock, event.at),
      state: { ...projection.state, status: { type: 'aborted', reason: event.reason } },
    };
  }
  if (event.type === 'seat-forfeited') {
    if (projection.state.status.type !== 'playing') return projection;
    return {
      ...projection,
      clock: event.clock ?? freezeCrossroadsChessClock(projection.clock, event.at),
      state: {
        ...projection.state,
        status: {
          type: 'finished',
          winner: oppositeCrossroadsChessColor(event.color),
          reason: 'abandonment',
        },
      },
    };
  }
  return projection;
}

// ── Client view / snapshot (perfect-info: everyone sees everything) ──────────

export function getCrossroadsChessClientView(
  state: CrossroadsChessGameState,
  seat: CrossroadsChessSeat,
): CrossroadsChessPlayerView {
  const perspective: CrossroadsChessColor = seat === 'red' ? 'red' : 'white';
  return getCrossroadsChessOpenView(state, perspective);
}

// No redaction: all events are visible to all clients, move events numbered.
export function crossroadsChessEventsForClient(
  room: CrossroadsChessRuntimeRoom,
): CrossroadsChessClientEvent[] {
  const out: CrossroadsChessClientEvent[] = [];
  let ply = 0;
  for (const event of room.events) {
    if (event.type === 'move-played') {
      ply += 1;
      out.push({ ...event, ply });
    } else {
      out.push(event);
    }
  }
  return out;
}

export function crossroadsChessSnapshotPayload(
  room: CrossroadsChessRuntimeRoom,
  client: CrossroadsChessSnapshotClient,
) {
  return {
    type: 'snapshot' as const,
    roomId: room.id,
    gameSpecId: room.gameSpecId,
    serverAt: Date.now(),
    clients: room.clients.size,
    seat: client.seat,
    solo: client.solo,
    abortDeadline: room.abortDeadline,
    forfeitDeadline:
      room.forfeitSeat !== null && client.seat === oppositeCrossroadsChessColor(room.forfeitSeat)
        ? room.forfeitDeadline
        : null,
    clock: room.projection.clock,
    connectedSeats: computeCrossroadsChessConnectedSeats(room.clients),
    events: crossroadsChessEventsForClient(room),
    seats: room.projection.seats,
    state: getCrossroadsChessClientView(room.projection.state, client.seat),
    timeControl: room.projection.timeControl,
    rematch: {
      offers: {
        white: room.rematch.offers.white !== undefined,
        red: room.rematch.offers.red !== undefined,
      },
      finalizedRoomId: room.rematch.finalizedRoomId ?? null,
    },
  };
}

export function crossroadsChessPlyAtEventIndex(
  events: readonly CrossroadsChessEvent[],
  eventIndex: number,
): number {
  let ply = 0;
  for (let index = 0; index <= eventIndex && index < events.length; index += 1) {
    if (events[index]?.type === 'move-played') ply += 1;
  }
  return ply;
}

// ── Validators (for hydrating an untrusted event log from the DB) ────────────

export function isCrossroadsChessEventLog(
  events: readonly unknown[],
  roomId?: string,
): events is readonly CrossroadsChessEvent[] {
  const firstRoomId = roomId ?? roomIdFromUnknownEvent(events[0]);
  if (!firstRoomId) return false;
  const [created, ...rest] = events;
  if (
    !isCrossroadsChessEvent(created, firstRoomId) ||
    created.type !== 'room-created' ||
    !isCrossroadsChessGameSpecId(created.gameSpecId) ||
    !isFiniteTimestamp(created.at)
  ) {
    return false;
  }
  return rest.every((event) => isCrossroadsChessEvent(event, firstRoomId));
}

export function isCrossroadsChessEvent(
  value: unknown,
  roomId?: string,
): value is CrossroadsChessEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  if (typeof event.roomId !== 'string') return false;
  if (roomId !== undefined && event.roomId !== roomId) return false;
  if (!isFiniteTimestamp(event.at)) return false;
  if (event.type === 'room-created') {
    return (
      isCrossroadsChessGameSpecId(event.gameSpecId) &&
      (event.creatorPreference === undefined ||
        event.creatorPreference === 'white' ||
        event.creatorPreference === 'red' ||
        event.creatorPreference === 'random') &&
      (event.timeControl === undefined || isRoomTimeControl(event.timeControl))
    );
  }
  if (event.type === 'seat-assigned') {
    return typeof event.clientId === 'string' && isCrossroadsChessColor(event.seat);
  }
  if (event.type === 'clock-started') return isCrossroadsChessClockState(event.clock);
  if (event.type === 'clock-expired') {
    return isCrossroadsChessColor(event.color) && isCrossroadsChessClockState(event.clock);
  }
  if (event.type === 'move-played') {
    return (
      isCrossroadsChessColor(event.color) &&
      isCrossroadsChessMove(event.move) &&
      (event.clock === undefined || isCrossroadsChessClockState(event.clock))
    );
  }
  if (event.type === 'seat-resigned') {
    return (
      isCrossroadsChessColor(event.color) &&
      (event.clock === undefined || isCrossroadsChessClockState(event.clock))
    );
  }
  if (event.type === 'game-aborted') {
    return (
      isAbortReason(event.reason) &&
      (event.clock === undefined || isCrossroadsChessClockState(event.clock))
    );
  }
  if (event.type === 'seat-forfeited') {
    return (
      isCrossroadsChessColor(event.color) &&
      (event.clock === undefined || isCrossroadsChessClockState(event.clock))
    );
  }
  return false;
}

function isCrossroadsChessGameSpecId(value: unknown): boolean {
  return value === CROSSROADS_CHESS_SPEC_ID || value === DUAL_CHESS_SPEC_ID;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function initialCrossroadsChessProjection(
  roomId: string,
  timeControl?: RoomTimeControl,
  creatorPreference?: CrossroadsChessCreatorPreference,
): CrossroadsChessProjection {
  return {
    roomId,
    ...(creatorPreference ? { creatorPreference } : {}),
    gameSpecId: CROSSROADS_CHESS_SPEC_ID,
    state: createInitialCrossroadsChessState(roomId),
    seats: {},
    ...(timeControl ? { timeControl } : {}),
  };
}

function computeCrossroadsChessConnectedSeats(
  clients: Iterable<CrossroadsChessClientRef>,
): Record<CrossroadsChessColor, boolean> {
  const connected = { white: false, red: false };
  for (const client of clients) {
    if (client.displaced) continue;
    if (client.seat === 'white') connected.white = true;
    else if (client.seat === 'red') connected.red = true;
  }
  return connected;
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isCrossroadsChessColor(value: unknown): value is CrossroadsChessColor {
  return value === 'white' || value === 'red';
}

export function isCrossroadsChessSquare(value: unknown): value is CrossroadsChessMove['from'] {
  return typeof value === 'string' && /^[a-f][1-8]$/.test(value);
}

function isCrossroadsChessMove(value: unknown): value is CrossroadsChessMove {
  if (typeof value !== 'object' || value === null) return false;
  const move = value as Record<string, unknown>;
  if (!isCrossroadsChessSquare(move.from) || !isCrossroadsChessSquare(move.to)) return false;
  return move.promotion === undefined || move.promotion === 'queen';
}

function isRoomTimeControl(value: unknown): value is RoomTimeControl {
  if (typeof value !== 'object' || value === null) return false;
  const tc = value as Partial<Record<keyof RoomTimeControl, unknown>>;
  return (
    typeof tc.initialMs === 'number' &&
    Number.isInteger(tc.initialMs) &&
    typeof tc.incrementMs === 'number' &&
    Number.isInteger(tc.incrementMs)
  );
}

function isCrossroadsChessClockState(value: unknown): value is CrossroadsChessClockState {
  if (typeof value !== 'object' || value === null) return false;
  const clock = value as Partial<CrossroadsChessClockState>;
  return (
    (clock.activeColor === null || isCrossroadsChessColor(clock.activeColor)) &&
    typeof clock.initialMs === 'number' &&
    Number.isFinite(clock.initialMs) &&
    typeof clock.incrementMs === 'number' &&
    Number.isFinite(clock.incrementMs) &&
    (typeof clock.runningSince === 'number' || clock.runningSince === null) &&
    typeof clock.remainingMs === 'object' &&
    clock.remainingMs !== null &&
    typeof clock.remainingMs.white === 'number' &&
    Number.isFinite(clock.remainingMs.white) &&
    typeof clock.remainingMs.red === 'number' &&
    Number.isFinite(clock.remainingMs.red)
  );
}

function roomIdFromUnknownEvent(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const roomId = (value as Record<string, unknown>).roomId;
  return typeof roomId === 'string' ? roomId : undefined;
}
