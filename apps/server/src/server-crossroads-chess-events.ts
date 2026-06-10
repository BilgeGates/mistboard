import {
  CROSSROADS_CHESS_SPEC_ID,
  type CrossroadsChessColor,
  type CrossroadsChessGameEndReason,
} from '@mistboard/game';
import {
  appendCrossroadsChessRuntimeEvent,
  type CrossroadsChessEvent,
  type CrossroadsChessRuntimeRoom,
  type CrossroadsChessSeatTokenState,
} from './crossroads-chess-runtime.js';
import { logger } from './obs.js';
import * as persistence from './persistence.js';

export type CrossroadsChessEventRoom = CrossroadsChessRuntimeRoom;

export type CrossroadsChessEventWriterPersistence = {
  appendRoomEvent(roomId: string, seq: number, event: CrossroadsChessEvent): Promise<void>;
  isInitialized(): boolean;
  recordGameEnd(roomId: string, summary: persistence.GameSummary): Promise<void>;
  upsertRoomSeatToken(
    roomId: string,
    token: persistence.RoomSeatTokenRecord<CrossroadsChessColor>,
  ): Promise<void>;
};

export type CrossroadsChessEventWriterContext = {
  logGameEndRecordFailure?(roomId: string, err: Error): void;
  persistence?: CrossroadsChessEventWriterPersistence;
  scheduleLifecycleTimers?(room: CrossroadsChessEventRoom): void;
};

// Serialize an event onto the room: persist (if enabled), apply to the
// projection, re-arm lifecycle timers, and record the game-end summary the first
// time the projection becomes terminal. Writes are chained on room.pendingWrites
// so concurrent appends keep the DB sequence + projection consistent.
export async function appendCrossroadsChessEvent(
  room: CrossroadsChessEventRoom,
  event: CrossroadsChessEvent,
  ctx: CrossroadsChessEventWriterContext = {},
): Promise<number> {
  const writer = contextWithDefaults(ctx);
  const write = room.pendingWrites.then(async () => {
    const seq = room.events.length;
    if (writer.persistence.isInitialized()) {
      await writer.persistence.appendRoomEvent(room.id, seq, event);
    }
    const appendedSeq = appendCrossroadsChessRuntimeEvent(room, event);
    writer.scheduleLifecycleTimers(room);
    if (
      writer.persistence.isInitialized() &&
      room.projection.state.status.type === 'finished' &&
      !room.gameEndRecorded
    ) {
      room.gameEndRecorded = true;
      try {
        await writer.persistence.recordGameEnd(room.id, buildCrossroadsChessGameSummary(room));
      } catch (err) {
        writer.logGameEndRecordFailure(room.id, err as Error);
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

export async function appendCrossroadsChessSeatAssigned(
  room: CrossroadsChessEventRoom,
  args: {
    event: Extract<CrossroadsChessEvent, { type: 'seat-assigned' }>;
    tokenState: CrossroadsChessSeatTokenState;
  },
  ctx: CrossroadsChessEventWriterContext = {},
): Promise<number> {
  const writer = contextWithDefaults(ctx);
  const write = room.pendingWrites.then(async () => {
    const seq = room.events.length;
    if (writer.persistence.isInitialized()) {
      await writer.persistence.appendRoomEvent(room.id, seq, args.event);
      await writer.persistence.upsertRoomSeatToken(
        room.id,
        persistenceRecordForCrossroadsChessSeatToken(args.tokenState),
      );
    }
    const appendedSeq = appendCrossroadsChessRuntimeEvent(room, args.event);
    room.seatTokens[args.event.seat] = args.tokenState;
    writer.scheduleLifecycleTimers(room);
    return appendedSeq;
  });
  room.pendingWrites = write.then(
    () => undefined,
    () => undefined,
  );
  return write;
}

export function buildCrossroadsChessGameSummary(
  room: CrossroadsChessEventRoom,
): persistence.GameSummary {
  const status = room.projection.state.status;
  if (status.type !== 'finished') {
    throw new Error('buildCrossroadsChessGameSummary called on non-terminal state');
  }
  const moveEvents = room.events.filter((event) => event.type === 'move-played');
  const firstAt = room.events[0]?.at ?? Date.now();
  const lastAt = room.events[room.events.length - 1]?.at ?? Date.now();
  return {
    variant: CROSSROADS_CHESS_SPEC_ID,
    mode: 'pvp',
    result: crossroadsChessResult(status.winner),
    termination: crossroadsChessTermination(status.reason),
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
    initialMs: room.projection.timeControl?.initialMs ?? null,
    incrementMs: room.projection.timeControl?.incrementMs ?? null,
    participants: [
      crossroadsChessParticipant('white', room),
      crossroadsChessParticipant('red', room),
    ],
  };
}

export function recordCrossroadsChessPersistenceError(
  roomId: string,
  seq: number,
  eventType: string,
  err: Error,
): void {
  logger.error(
    {
      kind: 'crossroads_chess_persistence_failure',
      room_id: roomId,
      seq,
      event_type: eventType,
      error: err.message,
    },
    'Crossroads Chess persistence failure',
  );
}

function contextWithDefaults(
  ctx: CrossroadsChessEventWriterContext,
): Required<CrossroadsChessEventWriterContext> {
  return {
    logGameEndRecordFailure: logCrossroadsChessGameEndRecordFailure,
    persistence,
    scheduleLifecycleTimers: () => {},
    ...ctx,
  };
}

function logCrossroadsChessGameEndRecordFailure(roomId: string, err: Error): void {
  logger.error(
    {
      kind: 'crossroads_chess_game_end_record_failure',
      room_id: roomId,
      error: err.message,
      at: Date.now(),
    },
    'Crossroads Chess game end record failure',
  );
}

function crossroadsChessResult(winner: CrossroadsChessColor | null): persistence.GameResult {
  if (winner === 'white') return 'white-wins';
  if (winner === 'red') return 'red-wins';
  return 'draw';
}

function crossroadsChessTermination(
  reason: CrossroadsChessGameEndReason,
): persistence.GameTermination {
  return reason;
}

function crossroadsChessParticipant(
  color: CrossroadsChessColor,
  room: CrossroadsChessEventRoom,
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
    displayName: color === 'white' ? 'White' : 'Red',
    subjectType: 'guest',
    subjectId: null,
    visibility: 'private',
  };
}

export function persistenceRecordForCrossroadsChessSeatToken(
  token: CrossroadsChessSeatTokenState,
): persistence.RoomSeatTokenRecord<CrossroadsChessColor> {
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
