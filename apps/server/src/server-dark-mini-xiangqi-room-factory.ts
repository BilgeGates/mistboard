import { randomUUID } from 'node:crypto';
import {
  createDarkMiniXiangqiRuntimeRoom,
  DARK_MINI_XIANGQI_ROOM_ID_PREFIX,
  type DarkMiniXiangqiCreatorPreference,
  type DarkMiniXiangqiEvent,
  type DarkMiniXiangqiRuntimeRoom,
} from './dark-mini-xiangqi-runtime.js';

export type DarkMiniXiangqiLiveRoomCreation =
  | { ok: true; room: DarkMiniXiangqiRuntimeRoom }
  | {
      ok: false;
      error: 'dark_mini_xiangqi_disabled' | 'persistence_failure' | 'room_id_collision';
    };

export type DarkMiniXiangqiLiveRoomFactoryContext = {
  chessRooms: ReadonlyMap<string, unknown>;
  darkMiniXiangqiRooms: Map<string, DarkMiniXiangqiRuntimeRoom>;
  darkXiangqiRooms: ReadonlyMap<string, unknown>;
  appendRoomEvent(roomId: string, seq: number, event: DarkMiniXiangqiEvent): Promise<void>;
  createRoomId?: () => string;
  isPersistenceEnabled(): boolean;
  recordPersistenceError(roomId: string, seq: number, eventType: string, err: Error): void;
};

export async function createDarkMiniXiangqiLiveRoom(
  ctx: DarkMiniXiangqiLiveRoomFactoryContext,
  creatorPreference?: DarkMiniXiangqiCreatorPreference,
): Promise<DarkMiniXiangqiLiveRoomCreation> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomId = ctx.createRoomId?.() ?? `${DARK_MINI_XIANGQI_ROOM_ID_PREFIX}${randomUUID()}`;
    if (
      ctx.chessRooms.has(roomId) ||
      ctx.darkXiangqiRooms.has(roomId) ||
      ctx.darkMiniXiangqiRooms.has(roomId)
    ) {
      continue;
    }
    const created = createDarkMiniXiangqiRuntimeRoom(roomId, { creatorPreference });
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
    ctx.darkMiniXiangqiRooms.set(roomId, room);
    return { ok: true, room };
  }
  return { ok: false, error: 'room_id_collision' };
}
