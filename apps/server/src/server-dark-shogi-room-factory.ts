/**
 * Thin adapter over the generic tenant room factory
 * (variant-tenant/room-factory.ts) for hidden Dark Shogi. No running-game
 * record and no PvE/rated options — PvP-only casual rooms.
 */

import type { RoomTimeControl } from '@mistboard/game';
import type {
  DarkShogiCreatorPreference,
  DarkShogiEvent,
  DarkShogiRuntimeRoom,
} from './dark-shogi-runtime.js';
import { darkShogiTenant } from './dark-shogi-tenant.js';
import type { DarkShogiLiveRoom } from './server-ws-dark-shogi.js';
import { createTenantLiveRoom } from './variant-tenant/room-factory.js';

export type DarkShogiLiveRoomCreation =
  | { ok: true; room: DarkShogiLiveRoom }
  | { ok: false; error: 'dark_shogi_disabled' | 'persistence_failure' | 'room_id_collision' };

export type DarkShogiLiveRoomFactoryContext = {
  darkShogiRooms: Map<string, DarkShogiLiveRoom>;
  isRoomIdTaken(roomId: string): boolean;
  appendRoomEvent(roomId: string, seq: number, event: DarkShogiEvent): Promise<void>;
  createRoomId?: () => string;
  isPersistenceEnabled(): boolean;
  recordPersistenceError(roomId: string, seq: number, eventType: string, err: Error): void;
};

export async function createDarkShogiLiveRoom(
  ctx: DarkShogiLiveRoomFactoryContext,
  timeControl?: RoomTimeControl,
  creatorPreference?: DarkShogiCreatorPreference,
): Promise<DarkShogiLiveRoomCreation> {
  const created = await createTenantLiveRoom(
    darkShogiTenant,
    {
      rooms: ctx.darkShogiRooms as unknown as Map<string, DarkShogiRuntimeRoom>,
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
      ? { ok: false, error: 'dark_shogi_disabled' }
      : { ok: false, error: created.error };
  }
  return { ok: true, room: created.room as DarkShogiLiveRoom };
}
