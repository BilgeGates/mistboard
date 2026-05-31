import {
  DARK_MINI_XIANGQI_SPEC_ID,
  type MiniXiangqiColor,
  type MiniXiangqiGameEndReason,
} from '@mistboard/game';
import {
  appendDarkMiniXiangqiRuntimeEvent,
  type DarkMiniXiangqiEvent,
  type DarkMiniXiangqiRuntimeRoom,
  type DarkMiniXiangqiSeatTokenState,
} from './dark-mini-xiangqi-runtime.js';
import { logger } from './obs.js';
import * as persistence from './persistence.js';

export type DarkMiniXiangqiEventRoom = DarkMiniXiangqiRuntimeRoom;

export type DarkMiniXiangqiEventWriterPersistence = {
  appendRoomEvent(roomId: string, seq: number, event: DarkMiniXiangqiEvent): Promise<void>;
  isInitialized(): boolean;
  recordGameEnd(roomId: string, summary: persistence.GameSummary): Promise<void>;
  upsertRoomSeatToken(
    roomId: string,
    token: persistence.RoomSeatTokenRecord<MiniXiangqiColor>,
  ): Promise<void>;
};

export type DarkMiniXiangqiEventWriterContext = {
  logGameEndRecordFailure?(roomId: string, err: Error): void;
  persistence?: DarkMiniXiangqiEventWriterPersistence;
  scheduleLifecycleTimers?(room: DarkMiniXiangqiEventRoom): void;
};

export async function appendDarkMiniXiangqiEvent(
  room: DarkMiniXiangqiEventRoom,
  event: DarkMiniXiangqiEvent,
  ctx: DarkMiniXiangqiEventWriterContext = {},
): Promise<number> {
  const writer = contextWithDefaults(ctx);
  const write = room.pendingWrites.then(async () => {
    const seq = room.events.length;
    if (writer.persistence.isInitialized()) {
      await writer.persistence.appendRoomEvent(room.id, seq, event);
    }
    const appendedSeq = appendDarkMiniXiangqiRuntimeEvent(room, event);
    writer.scheduleLifecycleTimers(room);
    if (
      writer.persistence.isInitialized() &&
      room.projection.state.status.type === 'finished' &&
      !room.gameEndRecorded
    ) {
      room.gameEndRecorded = true;
      try {
        await writer.persistence.recordGameEnd(room.id, buildDarkMiniXiangqiGameSummary(room));
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

export async function appendDarkMiniXiangqiSeatAssigned(
  room: DarkMiniXiangqiEventRoom,
  args: {
    event: Extract<DarkMiniXiangqiEvent, { type: 'seat-assigned' }>;
    tokenState: DarkMiniXiangqiSeatTokenState;
  },
  ctx: DarkMiniXiangqiEventWriterContext = {},
): Promise<number> {
  const writer = contextWithDefaults(ctx);
  const write = room.pendingWrites.then(async () => {
    const seq = room.events.length;
    if (writer.persistence.isInitialized()) {
      await writer.persistence.appendRoomEvent(room.id, seq, args.event);
      await writer.persistence.upsertRoomSeatToken(
        room.id,
        persistenceRecordForDarkMiniXiangqiSeatToken(args.tokenState),
      );
    }
    const appendedSeq = appendDarkMiniXiangqiRuntimeEvent(room, args.event);
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

export function buildDarkMiniXiangqiGameSummary(
  room: DarkMiniXiangqiEventRoom,
): persistence.GameSummary {
  const status = room.projection.state.status;
  if (status.type !== 'finished') {
    throw new Error('buildDarkMiniXiangqiGameSummary called on non-terminal state');
  }
  const moveEvents = room.events.filter((event) => event.type === 'move-played');
  const firstAt = room.events[0]?.at ?? Date.now();
  const lastAt = room.events[room.events.length - 1]?.at ?? Date.now();
  return {
    variant: DARK_MINI_XIANGQI_SPEC_ID,
    mode: 'pvp',
    result: darkMiniXiangqiResult(status.winner),
    termination: darkMiniXiangqiTermination(status.reason),
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
    participants: [
      darkMiniXiangqiParticipant('red', room),
      darkMiniXiangqiParticipant('black', room),
    ],
  };
}

export function recordDarkMiniXiangqiPersistenceError(
  roomId: string,
  seq: number,
  eventType: string,
  err: Error,
): void {
  logger.error(
    {
      kind: 'dark_mini_xiangqi_persistence_failure',
      room_id: roomId,
      seq,
      event_type: eventType,
      error: err.message,
    },
    'Dark Mini Xiangqi persistence failure',
  );
}

function contextWithDefaults(
  ctx: DarkMiniXiangqiEventWriterContext,
): Required<DarkMiniXiangqiEventWriterContext> {
  return {
    logGameEndRecordFailure: logDarkMiniXiangqiGameEndRecordFailure,
    persistence,
    scheduleLifecycleTimers: () => {},
    ...ctx,
  };
}

function logDarkMiniXiangqiGameEndRecordFailure(roomId: string, err: Error): void {
  logger.error(
    {
      kind: 'dark_mini_xiangqi_game_end_record_failure',
      room_id: roomId,
      error: err.message,
      at: Date.now(),
    },
    'Dark Mini Xiangqi game end record failure',
  );
}

function darkMiniXiangqiResult(winner: MiniXiangqiColor | null): persistence.GameResult {
  if (winner === 'red') return 'red-wins';
  if (winner === 'black') return 'black-wins';
  return 'draw';
}

function darkMiniXiangqiTermination(reason: MiniXiangqiGameEndReason): persistence.GameTermination {
  return reason;
}

function darkMiniXiangqiParticipant(
  color: MiniXiangqiColor,
  room: DarkMiniXiangqiEventRoom,
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

function persistenceRecordForDarkMiniXiangqiSeatToken(
  token: DarkMiniXiangqiSeatTokenState,
): persistence.RoomSeatTokenRecord<MiniXiangqiColor> {
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
