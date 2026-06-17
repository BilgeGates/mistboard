/**
 * Thin adapter over the generic tenant room factory
 * (variant-tenant/room-factory.ts) for Reveal Chess. PvP only — no PvE/engine
 * seat and no rated option (matching the dark-xiangqi factory); no running-game
 * record (recordGameStart omitted).
 */

import type { RoomTimeControl } from '@mistboard/game';
import type {
  RevealChessCreatorPreference,
  RevealChessEvent,
  RevealChessRuntimeRoom,
} from './reveal-chess-runtime.js';
import { revealChessTenant } from './reveal-chess-tenant.js';
import type { RevealChessLiveRoom } from './server-ws-reveal-chess.js';
import { createTenantLiveRoom } from './variant-tenant/room-factory.js';

export type RevealChessLiveRoomCreation =
  | { ok: true; room: RevealChessLiveRoom }
  | {
      ok: false;
      error: 'reveal_chess_disabled' | 'persistence_failure' | 'room_id_collision';
    };

export type RevealChessLiveRoomFactoryContext = {
  revealChessRooms: Map<string, RevealChessLiveRoom>;
  isRoomIdTaken(roomId: string): boolean;
  appendRoomEvent(roomId: string, seq: number, event: RevealChessEvent): Promise<void>;
  createRoomId?: () => string;
  isPersistenceEnabled(): boolean;
  recordPersistenceError(roomId: string, seq: number, eventType: string, err: Error): void;
};

export async function createRevealChessLiveRoom(
  ctx: RevealChessLiveRoomFactoryContext,
  timeControl?: RoomTimeControl,
  creatorPreference?: RevealChessCreatorPreference,
): Promise<RevealChessLiveRoomCreation> {
  const created = await createTenantLiveRoom(
    revealChessTenant,
    {
      rooms: ctx.revealChessRooms as unknown as Map<string, RevealChessRuntimeRoom>,
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
      ? { ok: false, error: 'reveal_chess_disabled' }
      : { ok: false, error: created.error };
  }
  return { ok: true, room: created.room as RevealChessLiveRoom };
}
