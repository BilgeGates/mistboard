/**
 * Dark chess registry entry — the first registered consumer of
 * dark-chess-tenant.ts, fixing the dchx_ room-id scheme (correspondence C1).
 *
 * Scope: correspondence (days-per-move) rooms ONLY. Live dark-chess rooms are
 * unprefixed UUIDs on the legacy room-manager stack and never route here.
 * PvP only (a bot that moves instantly defeats the point of correspondence),
 * no rematch, no lobby (invite links; an open-challenge list is C3), gated by
 * MISTBOARD_CORRESPONDENCE_ENABLED.
 *
 * Deploy safety: activeGameCount counts only LIVE-policy rooms, so multi-week
 * correspondence games never block the drain gate — their deadline
 * enforcement is durable (room_deadlines + sweeper) and a mid-deploy
 * reconnect is invisible at days-per-move cadence.
 */

import {
  type Color,
  clockPolicyKindFor,
  type DARK_CHESS_SPEC_ID,
  type Move,
  type RoomTimeControl,
} from '@mistboard/game';
import { currentAccountUser } from './account-session.js';
import {
  DARK_CHESS_TENANT_ROOM_ID_PREFIX,
  type DarkChessTenantState,
  darkChessTenant,
} from './dark-chess-tenant.js';
import { correspondenceEnabled } from './feature-flags.js';
import * as persistence from './persistence.js';
import {
  handleCorrespondenceCreate,
  requestsCorrespondence,
} from './routes/correspondence-rooms.js';
import { recordTenantPersistenceError } from './variant-tenant/events.js';
import { getOrLoadTenantRoom } from './variant-tenant/hydration.js';
import { clearTenantRuntimeTimers, sweepTenantRoomDeadline } from './variant-tenant/lifecycle.js';
import {
  registerVariantTenant,
  type TenantManagedRoom,
  variantTenantRoomIdTaken,
} from './variant-tenant/registry.js';
import { createTenantLiveRoom } from './variant-tenant/room-factory.js';
import type { TenantRuntimeRoom } from './variant-tenant/tenant.js';
import { createTenantWsRuntime, type TenantLiveRoom } from './variant-tenant/ws.js';

type DarkChessRuntimeRoom = TenantRuntimeRoom<
  'dark-chess',
  Color,
  Move,
  DarkChessTenantState,
  typeof DARK_CHESS_SPEC_ID
>;

type DarkChessLiveRoom = TenantLiveRoom<
  'dark-chess',
  Color,
  Move,
  DarkChessTenantState,
  typeof DARK_CHESS_SPEC_ID
>;

export const darkChessTenantRooms = new Map<string, DarkChessRuntimeRoom>();

// No engine scheduler (PvP only) and no rematch context (omitting the
// capability makes rematch:* messages no-ops).
const darkChessWs = createTenantWsRuntime(darkChessTenant);

export async function createDarkChessCorrespondenceRoom(
  timeControl: RoomTimeControl,
  creatorPreference?: 'white' | 'black' | 'random',
) {
  return createTenantLiveRoom(darkChessTenant, factoryContext(), {
    timeControl,
    creatorPreference,
  });
}

function factoryContext() {
  return {
    rooms: darkChessTenantRooms,
    isRoomIdTaken: (roomId: string) => variantTenantRoomIdTaken(roomId, darkChessTenant.kind),
    appendRoomEvent: persistence.appendRoomEvent,
    isPersistenceEnabled: persistence.isInitialized,
    recordGameStart: persistence.recordGameStart,
    recordPersistenceError: (roomId: string, seq: number, eventType: string, err: Error) =>
      recordTenantPersistenceError(darkChessTenant, roomId, seq, eventType, err),
  };
}

export function getOrLoadDarkChessTenantRoom(roomId: string): Promise<DarkChessRuntimeRoom | null> {
  return getOrLoadTenantRoom(darkChessTenant, darkChessTenantRooms, roomId);
}

// Durable-deadline enforcement (the sweeper's per-room hook): hydrate, then
// re-derive and act through the ws runtime's lifecycle context so the
// timeout/abort appends persist, maintain the deadline row, and broadcast to
// any connected clients exactly like a live flag.
export async function sweepDarkChessDueDeadline(roomId: string): Promise<void> {
  const room = await getOrLoadDarkChessTenantRoom(roomId);
  if (!room) return;
  await sweepTenantRoomDeadline(
    darkChessTenant,
    room as DarkChessLiveRoom,
    darkChessWs.lifecycleCtx,
  );
}

registerVariantTenant({
  kind: darkChessTenant.kind,
  gameSpecId: darkChessTenant.gameSpecId,
  roomIdPrefix: DARK_CHESS_TENANT_ROOM_ID_PREFIX,
  // The legacy chess stack owns the dark-chess spec's primary routing (the
  // live lobby reaches chess via registry MISS); this registration owns only
  // the dchx_ correspondence slice.
  ownsSpecRouting: false,
  errorPrefix: 'correspondence',
  enabled: correspondenceEnabled,
  rooms: darkChessTenantRooms as unknown as ReadonlyMap<string, TenantManagedRoom>,
  // Correspondence rooms are exempt by design; live-policy dchx_ rooms (none
  // at C1) would still count.
  activeGameCount: () => {
    let count = 0;
    for (const room of darkChessTenantRooms.values()) {
      if (room.projection.state.status.type !== 'playing') continue;
      if (clockPolicyKindFor(room.projection.timeControl) !== 'live') continue;
      count += 1;
    }
    return count;
  },
  getOrLoadRoom: (roomId) =>
    getOrLoadDarkChessTenantRoom(roomId) as Promise<TenantManagedRoom | null>,
  attachWebSocket: (ctx, socket, request, room) =>
    darkChessWs.handleConnection(
      {
        wsMessageLimit: ctx.wsMessageLimit,
        wsMessageWindowMs: ctx.wsMessageWindowMs,
        defaultRoomRegion: ctx.defaultRoomRegion,
      },
      socket,
      request,
      room as unknown as DarkChessLiveRoom,
    ),
  clearRuntimeTimers: (room) => clearTenantRuntimeTimers(room as unknown as DarkChessLiveRoom),
  clearRooms: () => darkChessTenantRooms.clear(),
  http: {
    matchesCreateRequest: requestsCorrespondence,
    handleCreate: async (ctx, request, response, body) =>
      handleCorrespondenceCreate(
        {
          ...ctx,
          createCorrespondenceRoom: async (timeControl, creatorPreference) => {
            const created = await createDarkChessCorrespondenceRoom(timeControl, creatorPreference);
            if (!created.ok) return created;
            return {
              ok: true,
              room: { id: created.room.id, gameSpecId: created.room.gameSpecId },
            };
          },
        },
        response,
        body,
        await currentAccountUser(request),
      ),
  },
  lobby: null,
  sweepDueDeadline: sweepDarkChessDueDeadline,
});
