import { randomUUID } from 'node:crypto';
import type { RoomTimeControl } from '@mistboard/game';
import {
  createDarkXiangqiRuntimeRoom,
  DARK_XIANGQI_ROOM_ID_PREFIX,
  type DarkXiangqiCreatorPreference,
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
  timeControl?: RoomTimeControl,
  creatorPreference?: DarkXiangqiCreatorPreference,
): Promise<DarkXiangqiLiveRoomCreation> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomId = ctx.createRoomId?.() ?? `${DARK_XIANGQI_ROOM_ID_PREFIX}${randomUUID()}`;
    if (ctx.chessRooms.has(roomId) || ctx.darkXiangqiRooms.has(roomId)) continue;
    const created = createDarkXiangqiRuntimeRoom(roomId, { creatorPreference, timeControl });
    if (!created.ok) return created;
    const room = created.room as DarkXiangqiLiveRoom;
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
    ctx.darkXiangqiRooms.set(roomId, room);
    return { ok: true, room };
  }
  return { ok: false, error: 'room_id_collision' };
}
