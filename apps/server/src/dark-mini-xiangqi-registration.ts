/**
 * Dark Mini Xiangqi registry entry. Owns the tenant's live-room map, the
 * room-factory binding, hydration, and the rematch context (all moved out of
 * index.ts at the registry dispatch collapse), and registers the type-erased
 * closures the shared dispatch sites route through. Imported for side effects
 * by variant-tenant/register-tenants.ts.
 */

import type { RoomTimeControl } from '@mistboard/game';
import { currentAccountUser } from './account-session.js';
import type {
  DarkMiniXiangqiCreatorPreference,
  DarkMiniXiangqiRuntimeRoom,
} from './dark-mini-xiangqi-runtime.js';
import { darkMiniXiangqiTenant } from './dark-mini-xiangqi-tenant.js';
import * as persistence from './persistence.js';
import {
  handleDarkMiniXiangqiCreate,
  requestsDarkMiniXiangqi,
} from './routes/dark-mini-xiangqi-rooms.js';
import { persistenceRecordForDarkMiniXiangqiSeatToken } from './server-dark-mini-xiangqi-events.js';
import type { DarkMiniXiangqiRematchContext } from './server-dark-mini-xiangqi-rematch.js';
import {
  createDarkMiniXiangqiLiveRoom,
  type DarkMiniXiangqiLiveRoomCreation,
  type DarkMiniXiangqiRoomEngineSeat,
} from './server-dark-mini-xiangqi-room-factory.js';
import { mintDarkMiniXiangqiSeatToken } from './server-dark-mini-xiangqi-seat-session.js';
import {
  clearDarkMiniXiangqiRuntimeTimers,
  type DarkMiniXiangqiLiveRoom,
  handleDarkMiniXiangqiWebSocketConnection,
  sendDarkMiniXiangqiPayload,
} from './server-ws-dark-mini-xiangqi.js';
import { recordTenantPersistenceError } from './variant-tenant/events.js';
import { getOrLoadTenantRoom } from './variant-tenant/hydration.js';
import {
  registerVariantTenant,
  type TenantManagedRoom,
  variantTenantRoomIdTaken,
} from './variant-tenant/registry.js';
import { countActiveTenantGames } from './variant-tenant/runtime.js';

export const darkMiniXiangqiRooms = new Map<string, DarkMiniXiangqiRuntimeRoom>();

export async function createDarkMiniXiangqiRoom(
  timeControl?: RoomTimeControl,
  creatorPreference?: DarkMiniXiangqiCreatorPreference,
  engine?: DarkMiniXiangqiRoomEngineSeat,
  rated?: boolean,
): Promise<DarkMiniXiangqiLiveRoomCreation> {
  return createDarkMiniXiangqiLiveRoom(
    {
      appendRoomEvent: persistence.appendRoomEvent,
      darkMiniXiangqiRooms,
      isRoomIdTaken: (roomId) => variantTenantRoomIdTaken(roomId, darkMiniXiangqiTenant.kind),
      isPersistenceEnabled: persistence.isInitialized,
      recordGameStart: persistence.recordGameStart,
      recordPersistenceError: (roomId, seq, eventType, err) =>
        recordTenantPersistenceError(darkMiniXiangqiTenant, roomId, seq, eventType, err),
    },
    timeControl,
    creatorPreference,
    engine,
    rated,
  );
}

export function getOrLoadDarkMiniXiangqiRoom(
  roomId: string,
): Promise<DarkMiniXiangqiRuntimeRoom | null> {
  return getOrLoadTenantRoom(darkMiniXiangqiTenant, darkMiniXiangqiRooms, roomId);
}

// Rematch: mutual offer over red/black, swapped-color room, pre-issued seat
// token persisted with the same durability as live seating so a reconnecting
// player still re-attaches after a server restart.
const darkMiniXiangqiRematchCtx: DarkMiniXiangqiRematchContext = {
  send: (client, payload) => sendDarkMiniXiangqiPayload(client, payload),
  createRoom: (timeControl, rated) =>
    createDarkMiniXiangqiRoom(timeControl, undefined, undefined, rated),
  buildRoomUrl: (roomId) => `/room/${encodeURIComponent(roomId)}`,
  issueSeatToken: async (room, seat, identity) => {
    const minted = mintDarkMiniXiangqiSeatToken(room, seat, identity);
    if (persistence.isInitialized()) {
      await persistence.upsertRoomSeatToken(
        room.id,
        persistenceRecordForDarkMiniXiangqiSeatToken(minted.state),
      );
    }
    return minted;
  },
};

registerVariantTenant({
  kind: darkMiniXiangqiTenant.kind,
  gameSpecId: darkMiniXiangqiTenant.gameSpecId,
  roomIdPrefix: darkMiniXiangqiTenant.roomIdPrefix,
  errorPrefix: 'dark_mini_xiangqi',
  enabled: darkMiniXiangqiTenant.enabled,
  rooms: darkMiniXiangqiRooms as unknown as ReadonlyMap<string, TenantManagedRoom>,
  activeGameCount: () => countActiveTenantGames(darkMiniXiangqiRooms.values()),
  getOrLoadRoom: (roomId) =>
    getOrLoadDarkMiniXiangqiRoom(roomId) as Promise<TenantManagedRoom | null>,
  attachWebSocket: (ctx, socket, request, room) =>
    handleDarkMiniXiangqiWebSocketConnection(
      {
        darkMiniXiangqiRematch: darkMiniXiangqiRematchCtx,
        wsMessageLimit: ctx.wsMessageLimit,
        wsMessageWindowMs: ctx.wsMessageWindowMs,
      },
      socket,
      request,
      room as unknown as DarkMiniXiangqiLiveRoom,
    ),
  clearRuntimeTimers: (room) =>
    clearDarkMiniXiangqiRuntimeTimers(room as unknown as DarkMiniXiangqiLiveRoom),
  clearRooms: () => darkMiniXiangqiRooms.clear(),
  http: {
    matchesCreateRequest: requestsDarkMiniXiangqi,
    handleCreate: async (ctx, request, response, body) => {
      // Rated requests are account-gated before room creation.
      const accountUser = body.rated === true ? await currentAccountUser(request) : null;
      await handleDarkMiniXiangqiCreate(
        { ...ctx, createDarkMiniXiangqiRoom },
        response,
        body,
        accountUser,
      );
    },
  },
  lobby: {
    supportsRated: true,
    // DMX keeps its existing open time-control policy in matchmaking.
    allowsTimeControl: () => true,
    createRoom: async (timeControl, rated) => {
      const created = await createDarkMiniXiangqiRoom(timeControl, 'random', undefined, rated);
      if (!created.ok) throw new Error(`dark_mini_xiangqi_room_create_failed:${created.error}`);
      return { id: created.room.id, region: 'global' };
    },
  },
});
