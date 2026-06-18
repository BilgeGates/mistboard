/**
 * Thin adapter over the generic tenant room factory
 * (variant-tenant/room-factory.ts) for hidden Dark Crossroads Chess. No
 * running-game record (recordGameStart omitted) and no PvE/rated options —
 * PvP-only casual rooms, like Dark Xiangqi.
 */

import type { RoomTimeControl } from '@mistboard/game';
import type {
  DarkCrossroadsChessCreatorPreference,
  DarkCrossroadsChessEvent,
  DarkCrossroadsChessRuntimeRoom,
} from './dark-crossroads-chess-runtime.js';
import { darkCrossroadsChessTenant } from './dark-crossroads-chess-tenant.js';
import type { DarkCrossroadsChessLiveRoom } from './server-ws-dark-crossroads-chess.js';
import { createTenantLiveRoom } from './variant-tenant/room-factory.js';

export type DarkCrossroadsChessLiveRoomCreation =
  | { ok: true; room: DarkCrossroadsChessLiveRoom }
  | {
      ok: false;
      error: 'dark_crossroads_chess_disabled' | 'persistence_failure' | 'room_id_collision';
    };

export type DarkCrossroadsChessLiveRoomFactoryContext = {
  darkCrossroadsChessRooms: Map<string, DarkCrossroadsChessLiveRoom>;
  // Collision check across rooms living outside this tenant's own map.
  isRoomIdTaken(roomId: string): boolean;
  appendRoomEvent(roomId: string, seq: number, event: DarkCrossroadsChessEvent): Promise<void>;
  createRoomId?: () => string;
  isPersistenceEnabled(): boolean;
  recordPersistenceError(roomId: string, seq: number, eventType: string, err: Error): void;
};

export async function createDarkCrossroadsChessLiveRoom(
  ctx: DarkCrossroadsChessLiveRoomFactoryContext,
  timeControl?: RoomTimeControl,
  creatorPreference?: DarkCrossroadsChessCreatorPreference,
): Promise<DarkCrossroadsChessLiveRoomCreation> {
  const created = await createTenantLiveRoom(
    darkCrossroadsChessTenant,
    {
      // The live map stores rooms with connected-client sets; the factory only
      // ever inserts freshly created rooms (empty client set), same as the
      // Dark Xiangqi cast.
      rooms: ctx.darkCrossroadsChessRooms as unknown as Map<string, DarkCrossroadsChessRuntimeRoom>,
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
      ? { ok: false, error: 'dark_crossroads_chess_disabled' }
      : { ok: false, error: created.error };
  }
  return { ok: true, room: created.room as DarkCrossroadsChessLiveRoom };
}
