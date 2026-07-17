/**
 * Dark Crossroads Chess (6x8, hidden/dev-only) registry entry. Owns the
 * tenant's live-room map, the room-factory binding, hydration, and watch
 * channel metadata. No rematch flow and no lobby surface (deep-link PvP only,
 * like the Dark Xiangqi launch) — the lobby route answers
 * dark_crossroads_chess_not_integrated while the flag is on. Imported for side
 * effects by variant-tenant/register-tenants.ts.
 */

import type { RoomTimeControl } from '@mistboard/game';
import type {
  DarkCrossroadsChessCreatorPreference,
  DarkCrossroadsChessRuntimeRoom,
} from './dark-crossroads-chess-runtime.js';
import { darkCrossroadsChessTenant } from './dark-crossroads-chess-tenant.js';
import * as persistence from './persistence.js';
import {
  handleDarkCrossroadsChessCreate,
  requestsDarkCrossroadsChess,
} from './routes/dark-crossroads-chess-rooms.js';
import {
  createDarkCrossroadsChessLiveRoom,
  type DarkCrossroadsChessLiveRoomCreation,
} from './server-dark-crossroads-chess-room-factory.js';
import {
  clearDarkCrossroadsChessRuntimeTimers,
  type DarkCrossroadsChessLiveRoom,
  handleDarkCrossroadsChessWebSocketConnection,
} from './server-ws-dark-crossroads-chess.js';
import { recordTenantPersistenceError } from './variant-tenant/events.js';
import { getOrLoadTenantRoom } from './variant-tenant/hydration.js';
import {
  registerVariantTenant,
  type TenantManagedRoom,
  variantTenantRoomIdTaken,
} from './variant-tenant/registry.js';
import { countActiveTenantGames } from './variant-tenant/runtime.js';

export const darkCrossroadsChessRooms = new Map<string, DarkCrossroadsChessLiveRoom>();

export async function createDarkCrossroadsChessRoom(
  timeControl?: RoomTimeControl,
  creatorPreference?: DarkCrossroadsChessCreatorPreference,
): Promise<DarkCrossroadsChessLiveRoomCreation> {
  return createDarkCrossroadsChessLiveRoom(
    {
      appendRoomEvent: persistence.appendRoomEvent,
      darkCrossroadsChessRooms,
      isRoomIdTaken: (roomId) => variantTenantRoomIdTaken(roomId, darkCrossroadsChessTenant.kind),
      isPersistenceEnabled: persistence.isInitialized,
      recordPersistenceError: (roomId, seq, eventType, err) =>
        recordTenantPersistenceError(darkCrossroadsChessTenant, roomId, seq, eventType, err),
    },
    timeControl,
    creatorPreference,
  );
}

export async function getOrLoadDarkCrossroadsChessRoom(
  roomId: string,
): Promise<DarkCrossroadsChessLiveRoom | null> {
  // The live map stores rooms with connected-client sets; hydration only ever
  // inserts freshly loaded rooms (empty client set), same as the factory cast.
  const room = await getOrLoadTenantRoom(
    darkCrossroadsChessTenant,
    darkCrossroadsChessRooms as unknown as Map<string, DarkCrossroadsChessRuntimeRoom>,
    roomId,
  );
  return room as DarkCrossroadsChessLiveRoom | null;
}

registerVariantTenant({
  kind: darkCrossroadsChessTenant.kind,
  gameSpecId: darkCrossroadsChessTenant.gameSpecId,
  roomIdPrefix: darkCrossroadsChessTenant.roomIdPrefix,
  watch: {
    channelId: darkCrossroadsChessTenant.gameSpecId,
    label: 'Dark Crossroads Chess',
    family: 'crossroads-chess',
    legacyVariants: ['dark-crossroads-chess', 'dark-dual-chess'],
  },
  ownsSpecRouting: true,
  errorPrefix: 'dark_crossroads_chess',
  enabled: darkCrossroadsChessTenant.enabled,
  rooms: darkCrossroadsChessRooms as unknown as ReadonlyMap<string, TenantManagedRoom>,
  activeGameCount: () => countActiveTenantGames(darkCrossroadsChessRooms.values()),
  getOrLoadRoom: (roomId) =>
    getOrLoadDarkCrossroadsChessRoom(roomId) as Promise<TenantManagedRoom | null>,
  attachWebSocket: (ctx, socket, request, room) =>
    handleDarkCrossroadsChessWebSocketConnection(
      {
        defaultRoomRegion: ctx.defaultRoomRegion,
        wsMessageLimit: ctx.wsMessageLimit,
        wsMessageWindowMs: ctx.wsMessageWindowMs,
      },
      socket,
      request,
      room as unknown as DarkCrossroadsChessLiveRoom,
    ),
  clearRuntimeTimers: (room) =>
    clearDarkCrossroadsChessRuntimeTimers(room as unknown as DarkCrossroadsChessLiveRoom),
  clearRooms: () => darkCrossroadsChessRooms.clear(),
  http: {
    matchesCreateRequest: requestsDarkCrossroadsChess,
    handleCreate: (ctx, _request, response, body) =>
      handleDarkCrossroadsChessCreate({ ...ctx, createDarkCrossroadsChessRoom }, response, body),
  },
  lobby: null,
  sweepDueDeadline: null,
  createCorrespondenceGameForSeek: null,
});
