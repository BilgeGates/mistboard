/**
 * Thin adapter over the generic tenant room factory
 * (variant-tenant/room-factory.ts) for Crossroads Chess. Two pre-migration
 * behaviors are preserved here rather than in the core: the running-game
 * record is written for PvE rooms only (the hook is gated on the engine
 * seat), and the in-process FSF engine seat carries no reservation id.
 */

import type { RoomTimeControl } from '@mistboard/game';
import type {
  CrossroadsChessCreatorPreference,
  CrossroadsChessEvent,
  CrossroadsChessRuntimeRoom,
} from './crossroads-chess-runtime.js';
import { crossroadsChessTenant } from './crossroads-chess-tenant.js';
import type * as persistence from './persistence.js';
import { createTenantLiveRoom } from './variant-tenant/room-factory.js';

export type CrossroadsChessRoomEngineSeat = {
  engineId: string;
  seat: 'white' | 'red';
  botId?: string;
};

export type CrossroadsChessLiveRoomCreation =
  | { ok: true; room: CrossroadsChessRuntimeRoom }
  | { ok: false; error: 'crossroads_chess_disabled' | 'persistence_failure' | 'room_id_collision' };

export type CrossroadsChessLiveRoomFactoryContext = {
  crossroadsChessRooms: Map<string, CrossroadsChessRuntimeRoom>;
  // Collision check across rooms living outside this tenant's own map.
  isRoomIdTaken(roomId: string): boolean;
  appendRoomEvent(roomId: string, seq: number, event: CrossroadsChessEvent): Promise<void>;
  createRoomId?: () => string;
  isPersistenceEnabled(): boolean;
  recordGameStart(roomId: string, summary: persistence.RunningGameSummary): Promise<void>;
  recordPersistenceError(roomId: string, seq: number, eventType: string, err: Error): void;
};

export async function createCrossroadsChessLiveRoom(
  ctx: CrossroadsChessLiveRoomFactoryContext,
  timeControl?: RoomTimeControl,
  creatorPreference?: CrossroadsChessCreatorPreference,
  engine?: CrossroadsChessRoomEngineSeat,
): Promise<CrossroadsChessLiveRoomCreation> {
  const created = await createTenantLiveRoom(
    crossroadsChessTenant,
    {
      rooms: ctx.crossroadsChessRooms,
      isRoomIdTaken: ctx.isRoomIdTaken,
      appendRoomEvent: ctx.appendRoomEvent,
      createRoomId: ctx.createRoomId,
      isPersistenceEnabled: ctx.isPersistenceEnabled,
      // Crossroads records a running game for PvE rooms only; PvP rooms have
      // never written a game-start record.
      ...(engine ? { recordGameStart: ctx.recordGameStart } : {}),
      recordPersistenceError: ctx.recordPersistenceError,
    },
    { timeControl, creatorPreference, engine },
  );
  if (!created.ok) {
    return created.error === 'disabled'
      ? { ok: false, error: 'crossroads_chess_disabled' }
      : { ok: false, error: created.error };
  }
  return created;
}
