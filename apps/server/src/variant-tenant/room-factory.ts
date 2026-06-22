/**
 * Generic live-room creation for tenant rooms: id minting with cross-variant
 * collision retry, optional PvE engine seating (durable in the initial event
 * log so it replays on hydration), persistence-first event writes, and the
 * running-game record.
 */

import { randomUUID } from 'node:crypto';
import type { RoomTimeControl } from '@mistboard/game';
import type * as persistence from '../persistence.js';
import { appendTenantRuntimeEvent, createTenantRuntimeRoom } from './runtime.js';
import type {
  TenantGameStateLike,
  TenantRoomEvent,
  TenantRuntimeRoom,
  VariantTenant,
} from './tenant.js';

/** PvE: seat an engine in `seat` at creation (its clientId is the engine id),
 * holding the given engine-service seat reservation for the game. Omit
 * reservationId for tenants whose engines run in-process with no seat
 * reservation system (Crossroads' Fairy-Stockfish). */
export type TenantRoomEngineSeat<C extends string> = {
  engineId: string;
  seat: C;
  reservationId?: string;
  botId?: string;
};

export type TenantLiveRoomCreation<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  Spec extends string,
> =
  | { ok: true; room: TenantRuntimeRoom<Kind, C, M, State, Spec> }
  | { ok: false; error: 'disabled' | 'persistence_failure' | 'room_id_collision' };

export type TenantLiveRoomFactoryContext<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  Spec extends string,
> = {
  rooms: Map<string, TenantRuntimeRoom<Kind, C, M, State, Spec>>;
  // Collision check across the OTHER variants' room maps (this tenant's own
  // map is checked via `rooms`).
  isRoomIdTaken(roomId: string): boolean;
  appendRoomEvent(roomId: string, seq: number, event: TenantRoomEvent<C, M, Spec>): Promise<void>;
  createRoomId?: () => string;
  isPersistenceEnabled(): boolean;
  // Omit for tenants that don't record running games (Dark Xiangqi).
  recordGameStart?(roomId: string, summary: persistence.RunningGameSummary): Promise<void>;
  recordPersistenceError(roomId: string, seq: number, eventType: string, err: Error): void;
};

export async function createTenantLiveRoom<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  View,
  Spec extends string,
>(
  tenant: VariantTenant<Kind, C, M, State, View, Spec>,
  ctx: TenantLiveRoomFactoryContext<Kind, C, M, State, Spec>,
  options: {
    timeControl?: RoomTimeControl;
    creatorPreference?: C | 'random';
    engine?: TenantRoomEngineSeat<C>;
    rated?: boolean;
  } = {},
): Promise<TenantLiveRoomCreation<Kind, C, M, State, Spec>> {
  const { timeControl, creatorPreference, engine, rated = false } = options;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomId = ctx.createRoomId?.() ?? `${tenant.roomIdPrefix}${randomUUID()}`;
    if (ctx.rooms.has(roomId) || ctx.isRoomIdTaken(roomId)) {
      continue;
    }
    const created = createTenantRuntimeRoom(tenant, roomId, {
      creatorPreference,
      pveBotId: engine?.botId,
      rated,
      timeControl,
    });
    if (!created.ok) return created;
    const room = created.room;
    // PvE: seat the engine before persistence so the seat-assigned event is part
    // of the room's initial event log (durable + replays on hydration). The human
    // then takes the only empty seat on connect.
    if (engine) {
      appendTenantRuntimeEvent(tenant, room, {
        type: 'seat-assigned',
        at: Date.now(),
        roomId,
        clientId: engine.engineId,
        seat: engine.seat,
      });
      room.engineReservationId = engine.reservationId ?? null;
    }
    if (ctx.isPersistenceEnabled()) {
      let writingSeq = 0;
      let writingEventType = 'room-created';
      try {
        for (const [seq, event] of room.events.entries()) {
          writingSeq = seq;
          writingEventType = event.type;
          await ctx.appendRoomEvent(roomId, seq, event);
        }
        if (ctx.recordGameStart) {
          writingSeq = room.events.length;
          writingEventType = 'game-start';
          await ctx.recordGameStart(roomId, {
            variant: tenant.gameSpecId,
            mode: engine ? 'pve' : 'pvp',
            startedAt: new Date(room.events[0]?.at ?? Date.now()),
            whiteClient: null,
            blackClient: null,
            whiteName: null,
            blackName: null,
            corpusId: null,
            visibility: engine ? 'public' : 'private',
          });
        }
      } catch (err) {
        ctx.recordPersistenceError(roomId, writingSeq, writingEventType, err as Error);
        return { ok: false, error: 'persistence_failure' };
      }
    }
    ctx.rooms.set(roomId, room);
    return { ok: true, room };
  }
  return { ok: false, error: 'room_id_collision' };
}
