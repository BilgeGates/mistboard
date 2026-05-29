import {
  DARK_XIANGQI_SPEC_ID,
  type XiangqiColor,
  type XiangqiGameEndReason,
} from '@mistboard/game';
import {
  appendDarkXiangqiRuntimeEvent,
  type DarkXiangqiEvent,
  type DarkXiangqiRuntimeRoom,
  type DarkXiangqiSeatTokenState,
} from './dark-xiangqi-runtime.js';
import { logger } from './obs.js';
import * as persistence from './persistence.js';

export type DarkXiangqiEventRoom = DarkXiangqiRuntimeRoom;

export type DarkXiangqiEventWriterPersistence = {
  appendRoomEvent(roomId: string, seq: number, event: DarkXiangqiEvent): Promise<void>;
  isInitialized(): boolean;
  recordGameEnd(roomId: string, summary: persistence.GameSummary): Promise<void>;
  upsertRoomSeatToken(
    roomId: string,
    token: persistence.RoomSeatTokenRecord<XiangqiColor>,
  ): Promise<void>;
};

export type DarkXiangqiEventWriterContext = {
  logGameEndRecordFailure?(roomId: string, err: Error): void;
  persistence?: DarkXiangqiEventWriterPersistence;
  scheduleLifecycleTimers(room: DarkXiangqiEventRoom): void;
};

export async function appendDarkXiangqiEvent(
  room: DarkXiangqiEventRoom,
  event: DarkXiangqiEvent,
  ctx: DarkXiangqiEventWriterContext,
): Promise<number> {
  const writer = contextWithDefaults(ctx);
  const write = room.pendingWrites.then(async () => {
    const seq = room.events.length;
    if (writer.persistence.isInitialized()) {
      await writer.persistence.appendRoomEvent(room.id, seq, event);
    }
    const appendedSeq = appendDarkXiangqiRuntimeEvent(room, event);
    writer.scheduleLifecycleTimers(room);
    if (
      writer.persistence.isInitialized() &&
      room.projection.state.status.type === 'finished' &&
      !room.gameEndRecorded
    ) {
      room.gameEndRecorded = true;
      try {
        await writer.persistence.recordGameEnd(room.id, buildDarkXiangqiGameSummary(room));
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

export async function appendDarkXiangqiSeatAssigned(
  room: DarkXiangqiEventRoom,
  args: {
    event: Extract<DarkXiangqiEvent, { type: 'seat-assigned' }>;
    tokenState: DarkXiangqiSeatTokenState;
  },
  ctx: DarkXiangqiEventWriterContext,
): Promise<number> {
  const writer = contextWithDefaults(ctx);
  const write = room.pendingWrites.then(async () => {
    const seq = room.events.length;
    if (writer.persistence.isInitialized()) {
      await writer.persistence.appendRoomEvent(room.id, seq, args.event);
      await writer.persistence.upsertRoomSeatToken(
        room.id,
        persistenceRecordForDarkXiangqiSeatToken(args.tokenState),
      );
    }
    const appendedSeq = appendDarkXiangqiRuntimeEvent(room, args.event);
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

export function buildDarkXiangqiGameSummary(room: DarkXiangqiEventRoom): persistence.GameSummary {
  const status = room.projection.state.status;
  if (status.type !== 'finished') {
    throw new Error('buildDarkXiangqiGameSummary called on non-terminal state');
  }
  const moveEvents = room.events.filter((event) => event.type === 'move-played');
  const firstAt = room.events[0]?.at ?? Date.now();
  const lastAt = room.events[room.events.length - 1]?.at ?? Date.now();
  return {
    variant: DARK_XIANGQI_SPEC_ID,
    mode: 'pvp',
    result: darkXiangqiResult(status.winner),
    termination: darkXiangqiTermination(status.reason),
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
    participants: [darkXiangqiParticipant('red', room), darkXiangqiParticipant('black', room)],
  };
}

export function recordDarkXiangqiPersistenceError(
  roomId: string,
  seq: number,
  eventType: string,
  err: Error,
): void {
  logger.error(
    {
      kind: 'dark_xiangqi_persistence_failure',
      room_id: roomId,
      seq,
      event_type: eventType,
      error: err.message,
    },
    'Dark Xiangqi persistence failure',
  );
}

function contextWithDefaults(
  ctx: DarkXiangqiEventWriterContext,
): Required<DarkXiangqiEventWriterContext> {
  return {
    logGameEndRecordFailure: logDarkXiangqiGameEndRecordFailure,
    persistence,
    ...ctx,
  };
}

function logDarkXiangqiGameEndRecordFailure(roomId: string, err: Error): void {
  logger.error(
    {
      kind: 'dark_xiangqi_game_end_record_failure',
      room_id: roomId,
      error: err.message,
      at: Date.now(),
    },
    'Dark Xiangqi game end record failure',
  );
}

function darkXiangqiResult(winner: XiangqiColor | null): persistence.GameResult {
  if (winner === 'red') return 'red-wins';
  if (winner === 'black') return 'black-wins';
  return 'draw';
}

function darkXiangqiTermination(reason: XiangqiGameEndReason): persistence.GameTermination {
  return reason;
}

function darkXiangqiParticipant(
  color: XiangqiColor,
  room: DarkXiangqiEventRoom,
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
    displayName: color === 'red' ? 'Red' : 'Black',
    subjectType: 'guest',
    subjectId: null,
    visibility: 'private',
  };
}

function persistenceRecordForDarkXiangqiSeatToken(
  token: DarkXiangqiSeatTokenState,
): persistence.RoomSeatTokenRecord<XiangqiColor> {
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
