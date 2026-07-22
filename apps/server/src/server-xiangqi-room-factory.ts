/**
 * Thin adapter over the generic tenant room factory
 * (variant-tenant/room-factory.ts) for open-information Standard Xiangqi. No
 * running-game record (recordGameStart omitted), matching the Dark Xiangqi
 * factory this was copied from; the finished-games row written at game end is
 * the record, and it carries the rated flag (#151 rated flip).
 */

import type { RoomTimeControl, XiangqiColor } from '@mistboard/game';
import type { XiangqiLiveRoom } from './server-ws-xiangqi.js';
import { createTenantLiveRoom, type TenantRoomEngineSeat } from './variant-tenant/room-factory.js';
import type {
  XiangqiCreatorPreference,
  XiangqiEvent,
  XiangqiRuntimeRoom,
} from './xiangqi-runtime.js';
import { xiangqiTenant } from './xiangqi-tenant.js';

export type XiangqiRoomEngineSeat = TenantRoomEngineSeat<XiangqiColor>;

export type XiangqiLiveRoomCreation =
  | { ok: true; room: XiangqiLiveRoom }
  | { ok: false; error: 'xiangqi_disabled' | 'persistence_failure' | 'room_id_collision' };

export type XiangqiLiveRoomFactoryContext = {
  xiangqiRooms: Map<string, XiangqiLiveRoom>;
  // Collision check across rooms living outside this tenant's own map.
  isRoomIdTaken(roomId: string): boolean;
  appendRoomEvent(roomId: string, seq: number, event: XiangqiEvent): Promise<void>;
  createRoomId?: () => string;
  isPersistenceEnabled(): boolean;
  recordPersistenceError(roomId: string, seq: number, eventType: string, err: Error): void;
};

export async function createXiangqiLiveRoom(
  ctx: XiangqiLiveRoomFactoryContext,
  timeControl?: RoomTimeControl,
  creatorPreference?: XiangqiCreatorPreference,
  rated = false,
  engine?: XiangqiRoomEngineSeat,
): Promise<XiangqiLiveRoomCreation> {
  const created = await createTenantLiveRoom(
    xiangqiTenant,
    {
      // The live map stores rooms with connected-client sets; the factory only
      // ever inserts freshly created rooms (empty client set).
      rooms: ctx.xiangqiRooms as unknown as Map<string, XiangqiRuntimeRoom>,
      isRoomIdTaken: ctx.isRoomIdTaken,
      appendRoomEvent: ctx.appendRoomEvent,
      createRoomId: ctx.createRoomId,
      isPersistenceEnabled: ctx.isPersistenceEnabled,
      recordPersistenceError: ctx.recordPersistenceError,
    },
    { timeControl, creatorPreference, rated, engine },
  );
  if (!created.ok) {
    return created.error === 'disabled'
      ? { ok: false, error: 'xiangqi_disabled' }
      : { ok: false, error: created.error };
  }
  return { ok: true, room: created.room as XiangqiLiveRoom };
}
