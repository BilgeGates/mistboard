/**
 * Thin adapter over the generic tenant room factory
 * (variant-tenant/room-factory.ts) for banqi. PvP only — no PvE/rated options
 * and no running-game record (recordGameStart omitted), matching the jieqi factory.
 */

import type { RoomTimeControl } from '@mistboard/game';
import type { BanqiCreatorPreference, BanqiEvent, BanqiRuntimeRoom } from './banqi-runtime.js';
import { banqiTenant } from './banqi-tenant.js';
import type { BanqiLiveRoom } from './server-ws-banqi.js';
import { createTenantLiveRoom } from './variant-tenant/room-factory.js';

export type BanqiLiveRoomCreation =
  | { ok: true; room: BanqiLiveRoom }
  | { ok: false; error: 'banqi_disabled' | 'persistence_failure' | 'room_id_collision' };

export type BanqiLiveRoomFactoryContext = {
  banqiRooms: Map<string, BanqiLiveRoom>;
  isRoomIdTaken(roomId: string): boolean;
  appendRoomEvent(roomId: string, seq: number, event: BanqiEvent): Promise<void>;
  createRoomId?: () => string;
  isPersistenceEnabled(): boolean;
  recordPersistenceError(roomId: string, seq: number, eventType: string, err: Error): void;
};

export async function createBanqiLiveRoom(
  ctx: BanqiLiveRoomFactoryContext,
  timeControl?: RoomTimeControl,
  creatorPreference?: BanqiCreatorPreference,
): Promise<BanqiLiveRoomCreation> {
  const created = await createTenantLiveRoom(
    banqiTenant,
    {
      rooms: ctx.banqiRooms as unknown as Map<string, BanqiRuntimeRoom>,
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
      ? { ok: false, error: 'banqi_disabled' }
      : { ok: false, error: created.error };
  }
  return { ok: true, room: created.room as BanqiLiveRoom };
}
