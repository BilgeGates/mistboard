import {
  applyBughouseDrop,
  applyBughouseEvent,
  applyBughouseMove,
  applyBughouseTimeout,
  BUGHOUSE_SEAT_ASSIGNMENTS,
  type BughouseBoardAction,
  type BughouseBoardId,
  type BughouseClockState,
  type BughouseEvent,
  type BughouseMatchState,
  type BughousePartnerRequest,
  type BughouseSeatId,
  type BughouseTeamSignal,
  bughouseClockRemainingMs,
  bughouseLegalActions,
  buildBughousePartnerRequest,
  createBughouseClock,
  createInitialBughouseMatch,
  type RoomTimeControl,
  startBughouseClocks,
} from '@mistboard/game';
import type { BughouseSeatTokenState } from './bughouse-seat-session.js';

export const BUGHOUSE_ROOM_ID_PREFIX = 'bugh_';

export type BughouseRuntimeRoom = {
  kind: 'bughouse';
  id: string;
  clients: Set<unknown>;
  events: BughouseEvent[];
  match: BughouseMatchState;
  seats: Partial<Record<BughouseSeatId, string>>;
  seatTokens: Partial<Record<BughouseSeatId, BughouseSeatTokenState>>;
  timeControl?: RoomTimeControl;
  rated: boolean;
  clockTimer: ReturnType<typeof setTimeout> | null;
  pendingWrites: Promise<void>;
};

export type BughouseRuntimeActionResult =
  | { ok: true; eventIndex: number; event: BughouseEvent; match: BughouseMatchState }
  | { ok: false; error: 'not_playing' | 'illegal_action' };

export type BughouseRuntimeTimeoutResult =
  | { ok: true; eventIndex: number; event: BughouseEvent; match: BughouseMatchState }
  | { ok: false; error: 'not_playing' | 'clock_not_active' };

export type BughouseClockDeadline = {
  board: BughouseBoardId;
  seat: BughouseSeatId;
  remainingMs: number;
  deadlineAt: number;
};

export function createBughouseRuntimeRoom(
  roomId: string,
  options: {
    now?: number;
    rated?: boolean;
    timeControl?: RoomTimeControl;
    deferClockStart?: boolean;
  } = {},
): BughouseRuntimeRoom {
  const now = options.now ?? Date.now();
  const events: BughouseEvent[] = [{ type: 'match-created', at: now, matchId: roomId }];
  let match = createInitialBughouseMatch(roomId);
  if (options.timeControl && !options.deferClockStart) {
    const clock = startBughouseClocks(
      match,
      createBughouseClock(now, options.timeControl.initialMs, options.timeControl.incrementMs),
      now,
    );
    events.push({ type: 'clock-started', at: now, matchId: roomId, clock });
    match = applyBughouseEvent(match, events[1]!);
  }
  return {
    kind: 'bughouse',
    id: roomId,
    clients: new Set(),
    events,
    match,
    seats: seatsFromEvents(events),
    seatTokens: {},
    timeControl: options.timeControl,
    rated: options.rated ?? false,
    clockTimer: null,
    pendingWrites: Promise.resolve(),
  };
}

export function createBughouseRuntimeRoomFromEvents(
  events: readonly BughouseEvent[],
  options: { timeControl?: RoomTimeControl } = {},
): BughouseRuntimeRoom {
  if (events.length === 0) throw new Error('cannot hydrate bughouse room from empty event log');
  const match = replayBughouseRuntimeEvents(events);
  return {
    kind: 'bughouse',
    id: events[0]!.matchId,
    clients: new Set(),
    events: [...events],
    match,
    seats: seatsFromEvents(events),
    seatTokens: {},
    timeControl: options.timeControl,
    rated: false,
    clockTimer: null,
    pendingWrites: Promise.resolve(),
  };
}

export function replayBughouseRuntimeEvents(events: readonly BughouseEvent[]): BughouseMatchState {
  return events.reduce(
    (match, event) => applyBughouseEvent(match, event),
    createInitialBughouseMatch(events[0]?.matchId ?? 'unknown-bughouse-room'),
  );
}

export function appendBughouseRuntimeEvent(
  room: BughouseRuntimeRoom,
  event: BughouseEvent,
): number {
  if (event.matchId !== room.id) throw new Error('bughouse event room mismatch');
  room.events.push(event);
  if (event.type === 'seat-assigned') room.seats[event.seat] = event.clientId;
  room.match = applyBughouseEvent(room.match, event);
  return room.events.length - 1;
}

export function maybeStartBughouseRuntimeClock(
  room: BughouseRuntimeRoom,
  at: number,
): { started: true; eventIndex: number; event: BughouseEvent } | { started: false } {
  if (!room.timeControl || room.match.clock || !bughouseSeatsAreFull(room)) {
    return { started: false };
  }
  const clock = startBughouseClocks(
    room.match,
    createBughouseClock(at, room.timeControl.initialMs, room.timeControl.incrementMs),
    at,
  );
  const event: BughouseEvent = { type: 'clock-started', at, matchId: room.id, clock };
  const eventIndex = appendBughouseRuntimeEvent(room, event);
  return { started: true, eventIndex, event };
}

export function playBughouseRuntimeAction(
  room: BughouseRuntimeRoom,
  seat: BughouseSeatId,
  actionId: string,
  at: number,
): BughouseRuntimeActionResult {
  if (room.match.status.type !== 'playing') return { ok: false, error: 'not_playing' };
  const action = bughouseLegalActions(room.match, seat).find(
    (candidate) => candidate.id === actionId,
  );
  if (!action) return { ok: false, error: 'illegal_action' };

  const nextMatch = applyBughouseAction(room.match, action, at);
  const event: BughouseEvent =
    action.kind === 'move'
      ? {
          type: 'board-move',
          at,
          matchId: room.id,
          seat,
          move: action.move,
          ...(nextMatch.clock ? { clock: nextMatch.clock } : {}),
        }
      : {
          type: 'board-drop',
          at,
          matchId: room.id,
          seat,
          drop: action.drop,
          ...(nextMatch.clock ? { clock: nextMatch.clock } : {}),
        };
  const eventIndex = appendBughouseRuntimeEvent(room, event);
  return { ok: true, eventIndex, event, match: room.match };
}

export function expireBughouseRuntimeClock(
  room: BughouseRuntimeRoom,
  seat: BughouseSeatId,
  at: number,
): BughouseRuntimeTimeoutResult {
  if (room.match.status.type !== 'playing') return { ok: false, error: 'not_playing' };
  const assignment = BUGHOUSE_SEAT_ASSIGNMENTS[seat];
  const boardClock = room.match.clock?.boards[assignment.board];
  if (!boardClock || boardClock.activeSeat !== seat)
    return { ok: false, error: 'clock_not_active' };

  const nextMatch = applyBughouseTimeout(room.match, seat, at);
  const event: BughouseEvent = {
    type: 'clock-expired',
    at,
    matchId: room.id,
    seat,
    ...(nextMatch.clock ? { clock: nextMatch.clock } : {}),
  };
  const eventIndex = appendBughouseRuntimeEvent(room, event);
  return { ok: true, eventIndex, event, match: room.match };
}

export function nextBughouseClockDeadline(
  match: BughouseMatchState,
  now: number,
): BughouseClockDeadline | null {
  if (match.status.type !== 'playing' || !match.clock) return null;
  const deadlines: BughouseClockDeadline[] = [];
  for (const [board, boardClock] of Object.entries(match.clock.boards) as Array<
    [BughouseBoardId, BughouseClockState['boards'][BughouseBoardId]]
  >) {
    if (!boardClock.activeSeat) continue;
    const remainingMs = bughouseClockRemainingMs(match.clock, boardClock.activeSeat, now);
    deadlines.push({
      board,
      seat: boardClock.activeSeat,
      remainingMs,
      deadlineAt: now + remainingMs,
    });
  }
  return (
    deadlines.sort((a, b) => a.deadlineAt - b.deadlineAt || a.board.localeCompare(b.board))[0] ??
    null
  );
}

export function buildBughouseRuntimePartnerRequest(
  room: BughouseRuntimeRoom,
  options: {
    seat: BughouseSeatId;
    engineId: string;
    engineSeed: number;
    serverNowEpochMs: number;
    sessionId?: string;
    teamSignals?: BughouseTeamSignal[];
  },
): BughousePartnerRequest {
  return buildBughousePartnerRequest({ match: room.match, ...options });
}

function applyBughouseAction(
  match: BughouseMatchState,
  action: BughouseBoardAction,
  at: number,
): BughouseMatchState {
  return action.kind === 'move'
    ? applyBughouseMove(match, action.seat, action.move, at)
    : applyBughouseDrop(match, action.seat, action.drop, at);
}

function bughouseSeatsAreFull(room: Pick<BughouseRuntimeRoom, 'seats'>): boolean {
  return Object.keys(BUGHOUSE_SEAT_ASSIGNMENTS).every(
    (seat) => !!room.seats[seat as BughouseSeatId],
  );
}

function seatsFromEvents(
  events: readonly BughouseEvent[],
): Partial<Record<BughouseSeatId, string>> {
  const seats: Partial<Record<BughouseSeatId, string>> = {};
  for (const event of events) {
    if (event.type === 'seat-assigned') seats[event.seat] = event.clientId;
  }
  return seats;
}
