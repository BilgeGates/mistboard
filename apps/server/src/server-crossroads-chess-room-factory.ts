import { randomUUID } from 'node:crypto';
import type { RoomTimeControl } from '@mistboard/game';
import {
  CROSSROADS_CHESS_ROOM_ID_PREFIX,
  type CrossroadsChessCreatorPreference,
  type CrossroadsChessEvent,
  type CrossroadsChessRuntimeRoom,
  createCrossroadsChessRuntimeRoom,
} from './crossroads-chess-runtime.js';

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
  recordPersistenceError(roomId: string, seq: number, eventType: string, err: Error): void;
};

export async function createCrossroadsChessLiveRoom(
  ctx: CrossroadsChessLiveRoomFactoryContext,
  timeControl?: RoomTimeControl,
  creatorPreference?: CrossroadsChessCreatorPreference,
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
    if (ctx.isPersistenceEnabled()) {
      let writingSeq = 0;
      let writingEventType = 'room-created';
      try {
        for (const [seq, event] of room.events.entries()) {
          writingSeq = seq;
          writingEventType = event.type;
          await ctx.appendRoomEvent(roomId, seq, event);
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
