import type { RoomTimeControl } from '@mistboard/game';
import { luzhanqiTenant } from './luzhanqi-tenant.js';
import type {
  LuzhanqiCreatorPreference,
  LuzhanqiEvent,
  LuzhanqiRuntimeRoom,
} from './luzhanqi-runtime.js';
import type { LuzhanqiLiveRoom } from './server-ws-luzhanqi.js';
import { createTenantLiveRoom } from './variant-tenant/room-factory.js';

export type LuzhanqiLiveRoomCreation =
  | { ok: true; room: LuzhanqiLiveRoom }
  | { ok: false; error: 'luzhanqi_disabled' | 'persistence_failure' | 'room_id_collision' };

export type LuzhanqiLiveRoomFactoryContext = {
  luzhanqiRooms: Map<string, LuzhanqiLiveRoom>;
  isRoomIdTaken(roomId: string): boolean;
  appendRoomEvent(roomId: string, seq: number, event: LuzhanqiEvent): Promise<void>;
  createRoomId?: () => string;
  isPersistenceEnabled(): boolean;
  recordPersistenceError(roomId: string, seq: number, eventType: string, err: Error): void;
};

export async function createLuzhanqiLiveRoom(
  ctx: LuzhanqiLiveRoomFactoryContext,
  timeControl?: RoomTimeControl,
  creatorPreference?: LuzhanqiCreatorPreference,
): Promise<LuzhanqiLiveRoomCreation> {
  const created = await createTenantLiveRoom(
    luzhanqiTenant,
    {
      rooms: ctx.luzhanqiRooms as unknown as Map<string, LuzhanqiRuntimeRoom>,
      isRoomIdTaken: ctx.isRoomIdTaken,
      appendRoomEvent: ctx.appendRoomEvent,
      createRoomId: ctx.createRoomId,
      isPersistenceEnabled: ctx.isPersistenceEnabled,
      recordPersistenceError: ctx.recordPersistenceError,
    },
    { timeControl, creatorPreference },
  );
  if (!created.ok) {
    return created.error === 'disabled'
      ? { ok: false, error: 'luzhanqi_disabled' }
      : { ok: false, error: created.error };
  }
  return { ok: true, room: created.room as LuzhanqiLiveRoom };
}
