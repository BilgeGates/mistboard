import { randomUUID } from 'node:crypto';
import type { RoomTimeControl } from '@mistboard/game';
import {
  createDualChessRuntimeRoom,
  DUAL_CHESS_ROOM_ID_PREFIX,
  type DualChessCreatorPreference,
  type DualChessEvent,
  type DualChessRuntimeRoom,
} from './dual-chess-runtime.js';

export type DualChessLiveRoomCreation =
  | { ok: true; room: DualChessRuntimeRoom }
  | { ok: false; error: 'dual_chess_disabled' | 'persistence_failure' | 'room_id_collision' };

export type DualChessLiveRoomFactoryContext = {
  chessRooms: ReadonlyMap<string, unknown>;
  darkMiniXiangqiRooms: ReadonlyMap<string, unknown>;
  darkXiangqiRooms: ReadonlyMap<string, unknown>;
  dualChessRooms: Map<string, DualChessRuntimeRoom>;
  appendRoomEvent(roomId: string, seq: number, event: DualChessEvent): Promise<void>;
  createRoomId?: () => string;
  isPersistenceEnabled(): boolean;
  recordPersistenceError(roomId: string, seq: number, eventType: string, err: Error): void;
};

export async function createDualChessLiveRoom(
  ctx: DualChessLiveRoomFactoryContext,
  timeControl?: RoomTimeControl,
  creatorPreference?: DualChessCreatorPreference,
): Promise<DualChessLiveRoomCreation> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomId = ctx.createRoomId?.() ?? `${DUAL_CHESS_ROOM_ID_PREFIX}${randomUUID()}`;
    if (
      ctx.chessRooms.has(roomId) ||
      ctx.darkXiangqiRooms.has(roomId) ||
      ctx.darkMiniXiangqiRooms.has(roomId) ||
      ctx.dualChessRooms.has(roomId)
    ) {
      continue;
    }
    const created = createDualChessRuntimeRoom(roomId, { creatorPreference, timeControl });
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
    ctx.dualChessRooms.set(roomId, room);
    return { ok: true, room };
  }
  return { ok: false, error: 'room_id_collision' };
}
