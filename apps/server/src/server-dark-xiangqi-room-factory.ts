import { randomUUID } from 'node:crypto';
import {
  createDarkXiangqiRuntimeRoom,
  DARK_XIANGQI_ROOM_ID_PREFIX,
  type DarkXiangqiEvent,
} from './dark-xiangqi-runtime.js';
import type { DarkXiangqiLiveRoom } from './server-ws-dark-xiangqi.js';

export type DarkXiangqiLiveRoomCreation =
  | { ok: true; room: DarkXiangqiLiveRoom }
  | { ok: false; error: 'dark_xiangqi_disabled' | 'persistence_failure' | 'room_id_collision' };

export type DarkXiangqiLiveRoomFactoryContext = {
  chessRooms: ReadonlyMap<string, unknown>;
  darkXiangqiRooms: Map<string, DarkXiangqiLiveRoom>;
  appendRoomEvent(roomId: string, seq: number, event: DarkXiangqiEvent): Promise<void>;
  createRoomId?: () => string;
  isPersistenceEnabled(): boolean;
  recordPersistenceError(roomId: string, seq: number, eventType: string, err: Error): void;
};

export async function createDarkXiangqiLiveRoom(
  ctx: DarkXiangqiLiveRoomFactoryContext,
): Promise<DarkXiangqiLiveRoomCreation> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomId = ctx.createRoomId?.() ?? `${DARK_XIANGQI_ROOM_ID_PREFIX}${randomUUID()}`;
    if (ctx.chessRooms.has(roomId) || ctx.darkXiangqiRooms.has(roomId)) continue;
    const created = createDarkXiangqiRuntimeRoom(roomId);
    if (!created.ok) return created;
    const room = created.room as DarkXiangqiLiveRoom;
    if (ctx.isPersistenceEnabled()) {
      const event = room.events[0]!;
      try {
        await ctx.appendRoomEvent(roomId, 0, event);
      } catch (err) {
        ctx.recordPersistenceError(roomId, 0, event.type, err as Error);
        return { ok: false, error: 'persistence_failure' };
      }
    }
    ctx.darkXiangqiRooms.set(roomId, room);
    return { ok: true, room };
  }
  return { ok: false, error: 'room_id_collision' };
}
