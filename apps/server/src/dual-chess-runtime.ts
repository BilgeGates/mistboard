// Live-room runtime for perfect-information Dual Chess.
//
// A parallel sibling of the Dark Mini Xiangqi runtime (own types, not generalized).
// The room is event-sourced: the GameEvent log is the single source of truth for
// replay + reconnect, and the projection is rebuilt from it. Because this is
// perfect-information (no fog), the per-seat view filtering that DMX needs
// collapses away — every client (players AND spectators) sees the full board and
// every move. Moves are adjudicated by the perfect-info referee
// (applyDualChessOpenMove): real legality, checkmate / stalemate / race terminals.

import {
  type AbortReason,
  applyDualChessOpenMove,
  createInitialDualChessState,
  DUAL_CHESS_SPEC_ID,
  type DualChessColor,
  type DualChessGameState,
  type DualChessGameStatus,
  type DualChessMove,
  type DualChessPlayerView,
  getDualChessOpenView,
  isAbortReason,
  oppositeDualChessColor,
  type RoomTimeControl,
} from '@mistboard/game';
import { dualChessEnabled } from './feature-flags.js';

export const DUAL_CHESS_ROOM_ID_PREFIX = 'dchess_';

export type DualChessSeat = DualChessColor | 'spectator';
export type DualChessCreatorPreference = DualChessColor | 'random';

export type DualChessClockState = {
  activeColor: DualChessColor | null;
  incrementMs: number;
  initialMs: number;
  remainingMs: Record<DualChessColor, number>;
  runningSince: number | null;
};

export type DualChessEvent =
  | {
      type: 'room-created';
      at: number;
      roomId: string;
      gameSpecId: typeof DUAL_CHESS_SPEC_ID;
      creatorPreference?: DualChessCreatorPreference;
      timeControl?: RoomTimeControl;
    }
  | { type: 'seat-assigned'; at: number; roomId: string; clientId: string; seat: DualChessColor }
  | { type: 'clock-started'; at: number; roomId: string; clock: DualChessClockState }
  | {
      type: 'clock-expired';
      at: number;
      roomId: string;
      color: DualChessColor;
      clock: DualChessClockState;
    }
  | {
      type: 'move-played';
      at: number;
      roomId: string;
      color: DualChessColor;
      move: DualChessMove;
      clock?: DualChessClockState;
    }
  | {
      type: 'seat-resigned';
      at: number;
      roomId: string;
      color: DualChessColor;
      clock?: DualChessClockState;
    }
  | {
      type: 'game-aborted';
      at: number;
      roomId: string;
      reason: AbortReason;
      clock?: DualChessClockState;
    }
  | {
      type: 'seat-forfeited';
      at: number;
      roomId: string;
      color: DualChessColor;
      clock?: DualChessClockState;
    };

// Wire shape sent to clients: move events carry their ply for the move list.
export type DualChessClientEvent =
  | Exclude<DualChessEvent, { type: 'move-played' }>
  | (Extract<DualChessEvent, { type: 'move-played' }> & { ply: number });

export type DualChessProjection = {
  roomId: string;
  creatorPreference?: DualChessCreatorPreference;
  gameSpecId: typeof DUAL_CHESS_SPEC_ID;
  state: DualChessGameState;
  seats: Partial<Record<DualChessColor, string>>;
  clock?: DualChessClockState;
  timeControl?: RoomTimeControl;
};

export type DualChessClientRef = { id?: string; seat: DualChessSeat; displaced: boolean };

export type DualChessSeatTokenState = {
  clientId: string;
  seat: DualChessColor;
  tokenHash: string;
  userId: string | null;
  userHandle: string | null;
  userDisplayName: string | null;
  issuedAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
};

export type DualChessRematchOffer = { tokenHash: string; userId: string | null; at: number };
export type DualChessRematchPendingRedirect = {
  roomId: string;
  seat: DualChessColor;
  rawToken: string;
  url: string;
};
export type DualChessRematchState = {
  offers: Partial<Record<DualChessColor, DualChessRematchOffer>>;
  finalizedRoomId?: string;
  pendingRedirects?: Partial<Record<DualChessColor, DualChessRematchPendingRedirect>>;
};

export type DualChessRuntimeRoom = {
  kind: 'dual-chess';
  id: string;
  clients: Set<DualChessClientRef>;
  events: DualChessEvent[];
  projection: DualChessProjection;
  gameSpecId: typeof DUAL_CHESS_SPEC_ID;
  abortTimer: ReturnType<typeof setTimeout> | null;
  abortDeadline: number | null;
  abortPhase: 'white-1' | 'red-1' | null;
  clockTimer: ReturnType<typeof setTimeout> | null;
  forfeitTimer: ReturnType<typeof setTimeout> | null;
  forfeitDeadline: number | null;
  forfeitSeat: DualChessColor | null;
  gameEndRecorded: boolean;
  pendingWrites: Promise<void>;
  seatTokens: Partial<Record<DualChessColor, DualChessSeatTokenState>>;
  rematch: DualChessRematchState;
};

export type DualChessSnapshotClient = { id: string; seat: DualChessSeat; solo: boolean };

export type DualChessRoomCreation =
  | { ok: true; room: DualChessRuntimeRoom }
  | { ok: false; error: 'dual_chess_disabled' };
export type DualChessRoomHydration =
  | { ok: true; room: DualChessRuntimeRoom }
  | { ok: false; error: 'empty_event_log' | 'invalid_event_log' };

export function isDualChessRoomId(roomId: string): boolean {
  return roomId.startsWith(DUAL_CHESS_ROOM_ID_PREFIX);
}

// ── Clocks ──────────────────────────────────────────────────────────────────

export function createDualChessClock(
  _at: number,
  initialMs: number,
  incrementMs: number,
): DualChessClockState {
  return {
    activeColor: null,
    incrementMs,
    initialMs,
    remainingMs: { white: initialMs, red: initialMs },
    runningSince: null,
  };
}

export function nextDualChessClockForMove(
  clock: DualChessClockState | undefined,
  at: number,
  movedColor: DualChessColor,
  prevMoveNumber: number,
  nextStatus: DualChessGameStatus,
): DualChessClockState | undefined {
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
  const remaining = Math.max(0, dualChessClockRemainingMs(clock, movedColor, at));
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

export function expireDualChessClock(
  clock: DualChessClockState | undefined,
  at: number,
  color: DualChessColor,
): DualChessClockState | undefined {
  if (!clock) return clock;
  return {
    ...clock,
    activeColor: null,
    remainingMs: {
      ...clock.remainingMs,
      [color]: Math.max(0, dualChessClockRemainingMs(clock, color, at)),
    },
    runningSince: null,
  };
}

export function freezeDualChessClock(
  clock: DualChessClockState | undefined,
  at: number,
): DualChessClockState | undefined {
  if (!clock) return clock;
  if (clock.activeColor === null && clock.runningSince === null) return clock;
  const active = clock.activeColor;
  const remainingMs = { ...clock.remainingMs };
  if (active) remainingMs[active] = Math.max(0, dualChessClockRemainingMs(clock, active, at));
  return { ...clock, activeColor: null, remainingMs, runningSince: null };
}

export function dualChessClockRemainingMs(
  clock: DualChessClockState,
  color: DualChessColor,
  at: number,
): number {
  const remaining = clock.remainingMs[color];
  if (clock.activeColor !== color || clock.runningSince === null) return remaining;
  return Math.max(0, remaining - Math.max(0, at - clock.runningSince));
}

// ── Room creation + replay ──────────────────────────────────────────────────

export function createDualChessRuntimeRoom(
  roomId: string,
  options: {
    creatorPreference?: DualChessCreatorPreference;
    now?: number;
    timeControl?: RoomTimeControl;
  } = {},
): DualChessRoomCreation {
  if (!dualChessEnabled()) return { ok: false, error: 'dual_chess_disabled' };
  const now = options.now ?? Date.now();
  const events: DualChessEvent[] = [
    {
      type: 'room-created',
      at: now,
      roomId,
      gameSpecId: DUAL_CHESS_SPEC_ID,
      ...(options.creatorPreference ? { creatorPreference: options.creatorPreference } : {}),
      ...(options.timeControl ? { timeControl: options.timeControl } : {}),
    },
  ];
  if (options.timeControl) {
    events.push({
      type: 'clock-started',
      at: now,
      roomId,
      clock: createDualChessClock(
        now,
        options.timeControl.initialMs,
        options.timeControl.incrementMs,
      ),
    });
  }
  const hydrated = createDualChessRuntimeRoomFromEvents(events);
  if (!hydrated.ok) throw new Error(`failed to create Dual Chess room: ${hydrated.error}`);
  return { ok: true, room: hydrated.room };
}

export function createDualChessRuntimeRoomFromEvents(
  events: readonly DualChessEvent[],
  projection = replayDualChessEvents(events),
): DualChessRoomHydration {
  if (events.length === 0) return { ok: false, error: 'empty_event_log' };
  if (!isDualChessEventLog(events)) return { ok: false, error: 'invalid_event_log' };
  const first = events[0]!;
  return {
    ok: true,
    room: {
      kind: 'dual-chess',
      id: first.roomId,
      clients: new Set(),
      events: [...events],
      projection,
      gameSpecId: DUAL_CHESS_SPEC_ID,
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

export function appendDualChessRuntimeEvent(
  room: DualChessRuntimeRoom,
  event: DualChessEvent,
): number {
  room.events.push(event);
  room.projection = applyDualChessEvent(room.projection, event);
  return room.events.length - 1;
}

export function replayDualChessEvents(events: readonly DualChessEvent[]): DualChessProjection {
  const firstRoomId = events[0]?.roomId ?? 'unknown-room';
  return events.reduce(
    (projection, event) => applyDualChessEvent(projection, event),
    initialDualChessProjection(firstRoomId),
  );
}

export function applyDualChessEvent(
  projection: DualChessProjection,
  event: DualChessEvent,
): DualChessProjection {
  if (event.roomId !== projection.roomId) return projection;
  if (event.type === 'room-created') {
    return initialDualChessProjection(event.roomId, event.timeControl, event.creatorPreference);
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
    const nextState = applyDualChessOpenMove(projection.state, event.move);
    return {
      ...projection,
      clock:
        event.clock ??
        nextDualChessClockForMove(
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
          winner: oppositeDualChessColor(event.color),
          reason: 'timeout',
        },
      },
    };
  }
  if (event.type === 'seat-resigned') {
    if (projection.state.status.type !== 'playing') return projection;
    return {
      ...projection,
      clock: event.clock ?? freezeDualChessClock(projection.clock, event.at),
      state: {
        ...projection.state,
        status: {
          type: 'finished',
          winner: oppositeDualChessColor(event.color),
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
      clock: event.clock ?? freezeDualChessClock(projection.clock, event.at),
      state: { ...projection.state, status: { type: 'aborted', reason: event.reason } },
    };
  }
  if (event.type === 'seat-forfeited') {
    if (projection.state.status.type !== 'playing') return projection;
    return {
      ...projection,
      clock: event.clock ?? freezeDualChessClock(projection.clock, event.at),
      state: {
        ...projection.state,
        status: {
          type: 'finished',
          winner: oppositeDualChessColor(event.color),
          reason: 'abandonment',
        },
      },
    };
  }
  return projection;
}

// ── Client view / snapshot (perfect-info: everyone sees everything) ──────────

export function getDualChessClientView(
  state: DualChessGameState,
  seat: DualChessSeat,
): DualChessPlayerView {
  const perspective: DualChessColor = seat === 'red' ? 'red' : 'white';
  return getDualChessOpenView(state, perspective);
}

// No redaction: all events are visible to all clients, move events numbered.
export function dualChessEventsForClient(room: DualChessRuntimeRoom): DualChessClientEvent[] {
  const out: DualChessClientEvent[] = [];
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

export function dualChessSnapshotPayload(
  room: DualChessRuntimeRoom,
  client: DualChessSnapshotClient,
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
      room.forfeitSeat !== null && client.seat === oppositeDualChessColor(room.forfeitSeat)
        ? room.forfeitDeadline
        : null,
    clock: room.projection.clock,
    connectedSeats: computeDualChessConnectedSeats(room.clients),
    events: dualChessEventsForClient(room),
    seats: room.projection.seats,
    state: getDualChessClientView(room.projection.state, client.seat),
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

export function dualChessPlyAtEventIndex(
  events: readonly DualChessEvent[],
  eventIndex: number,
): number {
  let ply = 0;
  for (let index = 0; index <= eventIndex && index < events.length; index += 1) {
    if (events[index]?.type === 'move-played') ply += 1;
  }
  return ply;
}

// ── Validators (for hydrating an untrusted event log from the DB) ────────────

export function isDualChessEventLog(
  events: readonly unknown[],
  roomId?: string,
): events is readonly DualChessEvent[] {
  const firstRoomId = roomId ?? roomIdFromUnknownEvent(events[0]);
  if (!firstRoomId) return false;
  const [created, ...rest] = events;
  if (
    !isDualChessEvent(created, firstRoomId) ||
    created.type !== 'room-created' ||
    created.gameSpecId !== DUAL_CHESS_SPEC_ID ||
    !isFiniteTimestamp(created.at)
  ) {
    return false;
  }
  return rest.every((event) => isDualChessEvent(event, firstRoomId));
}

export function isDualChessEvent(value: unknown, roomId?: string): value is DualChessEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  if (typeof event.roomId !== 'string') return false;
  if (roomId !== undefined && event.roomId !== roomId) return false;
  if (!isFiniteTimestamp(event.at)) return false;
  if (event.type === 'room-created') {
    return (
      event.gameSpecId === DUAL_CHESS_SPEC_ID &&
      (event.creatorPreference === undefined ||
        event.creatorPreference === 'white' ||
        event.creatorPreference === 'red' ||
        event.creatorPreference === 'random') &&
      (event.timeControl === undefined || isRoomTimeControl(event.timeControl))
    );
  }
  if (event.type === 'seat-assigned') {
    return typeof event.clientId === 'string' && isDualChessColor(event.seat);
  }
  if (event.type === 'clock-started') return isDualChessClockState(event.clock);
  if (event.type === 'clock-expired') {
    return isDualChessColor(event.color) && isDualChessClockState(event.clock);
  }
  if (event.type === 'move-played') {
    return (
      isDualChessColor(event.color) &&
      isDualChessMove(event.move) &&
      (event.clock === undefined || isDualChessClockState(event.clock))
    );
  }
  if (event.type === 'seat-resigned') {
    return (
      isDualChessColor(event.color) &&
      (event.clock === undefined || isDualChessClockState(event.clock))
    );
  }
  if (event.type === 'game-aborted') {
    return (
      isAbortReason(event.reason) &&
      (event.clock === undefined || isDualChessClockState(event.clock))
    );
  }
  if (event.type === 'seat-forfeited') {
    return (
      isDualChessColor(event.color) &&
      (event.clock === undefined || isDualChessClockState(event.clock))
    );
  }
  return false;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function initialDualChessProjection(
  roomId: string,
  timeControl?: RoomTimeControl,
  creatorPreference?: DualChessCreatorPreference,
): DualChessProjection {
  return {
    roomId,
    ...(creatorPreference ? { creatorPreference } : {}),
    gameSpecId: DUAL_CHESS_SPEC_ID,
    state: createInitialDualChessState(roomId),
    seats: {},
    ...(timeControl ? { timeControl } : {}),
  };
}

function computeDualChessConnectedSeats(
  clients: Iterable<DualChessClientRef>,
): Record<DualChessColor, boolean> {
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

function isDualChessColor(value: unknown): value is DualChessColor {
  return value === 'white' || value === 'red';
}

export function isDualChessSquare(value: unknown): value is DualChessMove['from'] {
  return typeof value === 'string' && /^[a-f][1-8]$/.test(value);
}

function isDualChessMove(value: unknown): value is DualChessMove {
  if (typeof value !== 'object' || value === null) return false;
  const move = value as Record<string, unknown>;
  if (!isDualChessSquare(move.from) || !isDualChessSquare(move.to)) return false;
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

function isDualChessClockState(value: unknown): value is DualChessClockState {
  if (typeof value !== 'object' || value === null) return false;
  const clock = value as Partial<DualChessClockState>;
  return (
    (clock.activeColor === null || isDualChessColor(clock.activeColor)) &&
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
