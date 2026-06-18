/**
 * Thin adapter over the generic tenant room factory
 * (variant-tenant/room-factory.ts) for hidden Kriegspiel. No running-game
 * record and no PvE/rated options — PvP-only casual rooms.
 */

import type { RoomTimeControl } from '@mistboard/game';
import type {
  KriegspielCreatorPreference,
  KriegspielEvent,
  KriegspielRuntimeRoom,
} from './kriegspiel-runtime.js';
import { kriegspielTenant } from './kriegspiel-tenant.js';
import type { KriegspielLiveRoom } from './server-ws-kriegspiel.js';
import { createTenantLiveRoom } from './variant-tenant/room-factory.js';

export type KriegspielLiveRoomCreation =
  | { ok: true; room: KriegspielLiveRoom }
  | { ok: false; error: 'kriegspiel_disabled' | 'persistence_failure' | 'room_id_collision' };

export type KriegspielLiveRoomFactoryContext = {
  kriegspielRooms: Map<string, KriegspielLiveRoom>;
  isRoomIdTaken(roomId: string): boolean;
  appendRoomEvent(roomId: string, seq: number, event: KriegspielEvent): Promise<void>;
  createRoomId?: () => string;
  isPersistenceEnabled(): boolean;
  recordPersistenceError(roomId: string, seq: number, eventType: string, err: Error): void;
};

export async function createKriegspielLiveRoom(
  ctx: KriegspielLiveRoomFactoryContext,
  timeControl?: RoomTimeControl,
  creatorPreference?: KriegspielCreatorPreference,
): Promise<KriegspielLiveRoomCreation> {
  const created = await createTenantLiveRoom(
    kriegspielTenant,
    {
      rooms: ctx.kriegspielRooms as unknown as Map<string, KriegspielRuntimeRoom>,
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
      ? { ok: false, error: 'kriegspiel_disabled' }
      : { ok: false, error: created.error };
  }
  return { ok: true, room: created.room as KriegspielLiveRoom };
}
