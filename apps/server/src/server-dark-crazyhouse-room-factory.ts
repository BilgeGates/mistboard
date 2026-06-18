/**
 * Thin adapter over the generic tenant room factory
 * (variant-tenant/room-factory.ts) for hidden Dark Crazyhouse. No running-game
 * record and no PvE/rated options — PvP-only casual rooms.
 */

import type { RoomTimeControl } from '@mistboard/game';
import type {
  DarkCrazyhouseCreatorPreference,
  DarkCrazyhouseEvent,
  DarkCrazyhouseRuntimeRoom,
} from './dark-crazyhouse-runtime.js';
import { darkCrazyhouseTenant } from './dark-crazyhouse-tenant.js';
import type { DarkCrazyhouseLiveRoom } from './server-ws-dark-crazyhouse.js';
import { createTenantLiveRoom } from './variant-tenant/room-factory.js';

export type DarkCrazyhouseLiveRoomCreation =
  | { ok: true; room: DarkCrazyhouseLiveRoom }
  | {
      ok: false;
      error: 'dark_crazyhouse_disabled' | 'persistence_failure' | 'room_id_collision';
    };

export type DarkCrazyhouseLiveRoomFactoryContext = {
  darkCrazyhouseRooms: Map<string, DarkCrazyhouseLiveRoom>;
  isRoomIdTaken(roomId: string): boolean;
  appendRoomEvent(roomId: string, seq: number, event: DarkCrazyhouseEvent): Promise<void>;
  createRoomId?: () => string;
  isPersistenceEnabled(): boolean;
  recordPersistenceError(roomId: string, seq: number, eventType: string, err: Error): void;
};

export async function createDarkCrazyhouseLiveRoom(
  ctx: DarkCrazyhouseLiveRoomFactoryContext,
  timeControl?: RoomTimeControl,
  creatorPreference?: DarkCrazyhouseCreatorPreference,
): Promise<DarkCrazyhouseLiveRoomCreation> {
  const created = await createTenantLiveRoom(
    darkCrazyhouseTenant,
    {
      rooms: ctx.darkCrazyhouseRooms as unknown as Map<string, DarkCrazyhouseRuntimeRoom>,
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
      ? { ok: false, error: 'dark_crazyhouse_disabled' }
      : { ok: false, error: created.error };
  }
  return { ok: true, room: created.room as DarkCrazyhouseLiveRoom };
}
