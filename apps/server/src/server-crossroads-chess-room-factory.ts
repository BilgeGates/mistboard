import { randomUUID } from 'node:crypto';
import type { RoomTimeControl } from '@mistboard/game';
import {
  appendCrossroadsChessRuntimeEvent,
  CROSSROADS_CHESS_ROOM_ID_PREFIX,
  type CrossroadsChessCreatorPreference,
  type CrossroadsChessEvent,
  type CrossroadsChessRuntimeRoom,
  createCrossroadsChessRuntimeRoom,
} from './crossroads-chess-runtime.js';
import type * as persistence from './persistence.js';

export type CrossroadsChessRoomEngineSeat = {
  engineId: string;
  seat: 'white' | 'red';
};

export type CrossroadsChessLiveRoomCreation =
  | { ok: true; room: CrossroadsChessRuntimeRoom }
  | { ok: false; error: 'crossroads_chess_disabled' | 'persistence_failure' | 'room_id_collision' };

export type CrossroadsChessLiveRoomFactoryContext = {
  chessRooms: ReadonlyMap<string, unknown>;
  darkMiniXiangqiRooms: ReadonlyMap<string, unknown>;
  darkXiangqiRooms: ReadonlyMap<string, unknown>;
  crossroadsChessRooms: Map<string, CrossroadsChessRuntimeRoom>;
  appendRoomEvent(roomId: string, seq: number, event: CrossroadsChessEvent): Promise<void>;
  createRoomId?: () => string;
  isPersistenceEnabled(): boolean;
  recordGameStart(roomId: string, summary: persistence.RunningGameSummary): Promise<void>;
  recordPersistenceError(roomId: string, seq: number, eventType: string, err: Error): void;
};

export async function createCrossroadsChessLiveRoom(
  ctx: CrossroadsChessLiveRoomFactoryContext,
  timeControl?: RoomTimeControl,
  creatorPreference?: CrossroadsChessCreatorPreference,
  engine?: CrossroadsChessRoomEngineSeat,
): Promise<CrossroadsChessLiveRoomCreation> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomId = ctx.createRoomId?.() ?? `${CROSSROADS_CHESS_ROOM_ID_PREFIX}${randomUUID()}`;
    if (
      ctx.chessRooms.has(roomId) ||
      ctx.darkXiangqiRooms.has(roomId) ||
      ctx.darkMiniXiangqiRooms.has(roomId) ||
      ctx.crossroadsChessRooms.has(roomId)
    ) {
      continue;
    }
    const created = createCrossroadsChessRuntimeRoom(roomId, { creatorPreference, timeControl });
    if (!created.ok) return created;
    const room = created.room;
    if (engine) {
      appendCrossroadsChessRuntimeEvent(room, {
        type: 'seat-assigned',
        at: Date.now(),
        roomId,
        clientId: engine.engineId,
        seat: engine.seat,
      });
    }
    if (ctx.isPersistenceEnabled()) {
      let writingSeq = 0;
      let writingEventType = 'room-created';
      try {
        for (const [seq, event] of room.events.entries()) {
          writingSeq = seq;
          writingEventType = event.type;
          await ctx.appendRoomEvent(roomId, seq, event);
        }
        if (engine) {
          writingSeq = room.events.length;
          writingEventType = 'game-start';
          await ctx.recordGameStart(roomId, {
            variant: room.gameSpecId,
            mode: 'pve',
            startedAt: new Date(room.events[0]?.at ?? Date.now()),
            whiteClient: null,
            blackClient: null,
            whiteName: null,
            blackName: null,
            corpusId: null,
            visibility: 'public',
          });
        }
      } catch (err) {
        ctx.recordPersistenceError(roomId, writingSeq, writingEventType, err as Error);
        return { ok: false, error: 'persistence_failure' };
      }
    }
    ctx.crossroadsChessRooms.set(roomId, room);
    return { ok: true, room };
  }
  return { ok: false, error: 'room_id_collision' };
}
