/**
 * Thin adapter over the generic tenant room factory
 * (variant-tenant/room-factory.ts) for hidden Dark Xiangqi. No running-game
 * record (recordGameStart omitted) and no PvE/rated options, matching the
 * pre-migration factory.
 */

import type { RoomTimeControl } from '@mistboard/game';
import type {
  DarkXiangqiCreatorPreference,
  DarkXiangqiEvent,
  DarkXiangqiRuntimeRoom,
} from './dark-xiangqi-runtime.js';
import { darkXiangqiTenant } from './dark-xiangqi-tenant.js';
import type { DarkXiangqiLiveRoom } from './server-ws-dark-xiangqi.js';
import { createTenantLiveRoom } from './variant-tenant/room-factory.js';

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
  const created = await createTenantLiveRoom(
    darkXiangqiTenant,
    {
      // The live map stores rooms with connected-client sets; the factory only
      // ever inserts freshly created rooms (empty client set), same as the
      // pre-migration cast.
      rooms: ctx.darkXiangqiRooms as unknown as Map<string, DarkXiangqiRuntimeRoom>,
      isRoomIdTaken: (roomId) => ctx.chessRooms.has(roomId),
      appendRoomEvent: ctx.appendRoomEvent,
      createRoomId: ctx.createRoomId,
      isPersistenceEnabled: ctx.isPersistenceEnabled,
      recordPersistenceError: ctx.recordPersistenceError,
    },
    { timeControl, creatorPreference },
  );
  if (!created.ok) {
    return created.error === 'disabled'
      ? { ok: false, error: 'dark_xiangqi_disabled' }
      : { ok: false, error: created.error };
  }
  return { ok: true, room: created.room as DarkXiangqiLiveRoom };
}
