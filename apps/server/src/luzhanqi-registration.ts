import type { RoomTimeControl } from '@mistboard/game';
import type { LuzhanqiCreatorPreference, LuzhanqiRuntimeRoom } from './luzhanqi-runtime.js';
import { luzhanqiTenant } from './luzhanqi-tenant.js';
import * as persistence from './persistence.js';
import { handleLuzhanqiCreate, requestsLuzhanqi } from './routes/luzhanqi-rooms.js';
import {
  createLuzhanqiLiveRoom,
  type LuzhanqiLiveRoomCreation,
} from './server-luzhanqi-room-factory.js';
import {
  clearLuzhanqiRuntimeTimers,
  handleLuzhanqiWebSocketConnection,
  type LuzhanqiLiveRoom,
} from './server-ws-luzhanqi.js';
import { recordTenantPersistenceError } from './variant-tenant/events.js';
import { getOrLoadTenantRoom } from './variant-tenant/hydration.js';
import {
  registerVariantTenant,
  type TenantManagedRoom,
  variantTenantRoomIdTaken,
} from './variant-tenant/registry.js';
import { countActiveTenantGames } from './variant-tenant/runtime.js';

export const luzhanqiRooms = new Map<string, LuzhanqiLiveRoom>();

export async function createLuzhanqiRoom(
  timeControl?: RoomTimeControl,
  creatorPreference?: LuzhanqiCreatorPreference,
): Promise<LuzhanqiLiveRoomCreation> {
  return createLuzhanqiLiveRoom(
    {
      appendRoomEvent: persistence.appendRoomEvent,
      luzhanqiRooms,
      isRoomIdTaken: (roomId) => variantTenantRoomIdTaken(roomId, luzhanqiTenant.kind),
      isPersistenceEnabled: persistence.isInitialized,
      recordPersistenceError: (roomId, seq, eventType, err) =>
        recordTenantPersistenceError(luzhanqiTenant, roomId, seq, eventType, err),
    },
    timeControl,
    creatorPreference,
  );
}

export async function getOrLoadLuzhanqiRoom(roomId: string): Promise<LuzhanqiLiveRoom | null> {
  const room = await getOrLoadTenantRoom(
    luzhanqiTenant,
    luzhanqiRooms as unknown as Map<string, LuzhanqiRuntimeRoom>,
    roomId,
  );
  return room as LuzhanqiLiveRoom | null;
}

registerVariantTenant({
  kind: luzhanqiTenant.kind,
  gameSpecId: luzhanqiTenant.gameSpecId,
  roomIdPrefix: luzhanqiTenant.roomIdPrefix,
  watch: null,
  ownsSpecRouting: true,
  errorPrefix: 'luzhanqi',
  enabled: luzhanqiTenant.enabled,
  rooms: luzhanqiRooms as unknown as ReadonlyMap<string, TenantManagedRoom>,
  activeGameCount: () => countActiveTenantGames(luzhanqiRooms.values()),
  getOrLoadRoom: (roomId) => getOrLoadLuzhanqiRoom(roomId) as Promise<TenantManagedRoom | null>,
  attachWebSocket: (ctx, socket, request, room) =>
    handleLuzhanqiWebSocketConnection(
      {
        defaultRoomRegion: ctx.defaultRoomRegion,
        wsMessageLimit: ctx.wsMessageLimit,
        wsMessageWindowMs: ctx.wsMessageWindowMs,
      },
      socket,
      request,
      room as unknown as LuzhanqiLiveRoom,
    ),
  clearRuntimeTimers: (room) => clearLuzhanqiRuntimeTimers(room as unknown as LuzhanqiLiveRoom),
  clearRooms: () => luzhanqiRooms.clear(),
  http: {
    matchesCreateRequest: requestsLuzhanqi,
    handleCreate: (ctx, _request, response, body) =>
      handleLuzhanqiCreate({ ...ctx, createLuzhanqiRoom }, response, body),
  },
  lobby: null,
  sweepDueDeadline: null,
});
