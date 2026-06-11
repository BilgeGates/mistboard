/**
 * Thin adapter over the generic tenant room factory
 * (variant-tenant/room-factory.ts) for Dark Mini Xiangqi. Keeps the
 * pre-migration context shape (explicit sibling room maps for the
 * cross-variant id-collision check) and error codes.
 */

import type { MiniXiangqiColor, RoomTimeControl } from '@mistboard/game';
import type {
  DarkMiniXiangqiCreatorPreference,
  DarkMiniXiangqiEvent,
  DarkMiniXiangqiRuntimeRoom,
} from './dark-mini-xiangqi-runtime.js';
import { darkMiniXiangqiTenant } from './dark-mini-xiangqi-tenant.js';
import type * as persistence from './persistence.js';
import { createTenantLiveRoom, type TenantRoomEngineSeat } from './variant-tenant/room-factory.js';

/** PvE: seat an engine in `seat` at creation (its clientId is the engine id),
 * holding the given engine-service seat reservation for the game. */
export type DarkMiniXiangqiRoomEngineSeat = TenantRoomEngineSeat<MiniXiangqiColor>;

export type DarkMiniXiangqiLiveRoomCreation =
  | { ok: true; room: DarkMiniXiangqiRuntimeRoom }
  | {
      ok: false;
      error: 'dark_mini_xiangqi_disabled' | 'persistence_failure' | 'room_id_collision';
    };

export type DarkMiniXiangqiLiveRoomFactoryContext = {
  chessRooms: ReadonlyMap<string, unknown>;
  darkMiniXiangqiRooms: Map<string, DarkMiniXiangqiRuntimeRoom>;
  darkXiangqiRooms: ReadonlyMap<string, unknown>;
  appendRoomEvent(roomId: string, seq: number, event: DarkMiniXiangqiEvent): Promise<void>;
  createRoomId?: () => string;
  isPersistenceEnabled(): boolean;
  recordGameStart(roomId: string, summary: persistence.RunningGameSummary): Promise<void>;
  recordPersistenceError(roomId: string, seq: number, eventType: string, err: Error): void;
};

export async function createDarkMiniXiangqiLiveRoom(
  ctx: DarkMiniXiangqiLiveRoomFactoryContext,
  timeControl?: RoomTimeControl,
  creatorPreference?: DarkMiniXiangqiCreatorPreference,
  engine?: DarkMiniXiangqiRoomEngineSeat,
  rated = false,
): Promise<DarkMiniXiangqiLiveRoomCreation> {
  const created = await createTenantLiveRoom(
    darkMiniXiangqiTenant,
    {
      rooms: ctx.darkMiniXiangqiRooms,
      isRoomIdTaken: (roomId) => ctx.chessRooms.has(roomId) || ctx.darkXiangqiRooms.has(roomId),
      appendRoomEvent: ctx.appendRoomEvent,
      createRoomId: ctx.createRoomId,
      isPersistenceEnabled: ctx.isPersistenceEnabled,
      recordGameStart: ctx.recordGameStart,
      recordPersistenceError: ctx.recordPersistenceError,
    },
    { timeControl, creatorPreference, engine, rated },
  );
  if (!created.ok) {
    return created.error === 'disabled'
      ? { ok: false, error: 'dark_mini_xiangqi_disabled' }
      : { ok: false, error: created.error };
  }
  return created;
}
