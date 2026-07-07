/**
 * Standard Xiangqi (9x10, open information) registry entry. Owns the tenant's
 * live-room map, the room-factory binding, and hydration. PvP-only for now (no
 * engine, no lobby surface); the lobby route answers xiangqi_not_integrated
 * while the flag is on. Imported for side effects by
 * variant-tenant/register-tenants.ts.
 */

import type { RoomTimeControl } from '@mistboard/game';
import * as persistence from './persistence.js';
import { handleXiangqiCreate, requestsXiangqi } from './routes/xiangqi-rooms.js';
import {
  clearXiangqiRuntimeTimers,
  handleXiangqiWebSocketConnection,
  type XiangqiLiveRoom,
} from './server-ws-xiangqi.js';
import {
  createXiangqiLiveRoom,
  type XiangqiLiveRoomCreation,
  type XiangqiRoomEngineSeat,
} from './server-xiangqi-room-factory.js';
import { recordTenantPersistenceError } from './variant-tenant/events.js';
import { getOrLoadTenantRoom } from './variant-tenant/hydration.js';
import {
  registerVariantTenant,
  type TenantManagedRoom,
  variantTenantRoomIdTaken,
} from './variant-tenant/registry.js';
import { countActiveTenantGames } from './variant-tenant/runtime.js';
import type { XiangqiCreatorPreference, XiangqiRuntimeRoom } from './xiangqi-runtime.js';
import { xiangqiTenant } from './xiangqi-tenant.js';

export const xiangqiRooms = new Map<string, XiangqiLiveRoom>();

export async function createXiangqiRoom(
  timeControl?: RoomTimeControl,
  creatorPreference?: XiangqiCreatorPreference,
  engine?: XiangqiRoomEngineSeat,
): Promise<XiangqiLiveRoomCreation> {
  return createXiangqiLiveRoom(
    {
      appendRoomEvent: persistence.appendRoomEvent,
      xiangqiRooms,
      isRoomIdTaken: (roomId) => variantTenantRoomIdTaken(roomId, xiangqiTenant.kind),
      isPersistenceEnabled: persistence.isInitialized,
      recordPersistenceError: (roomId, seq, eventType, err) =>
        recordTenantPersistenceError(xiangqiTenant, roomId, seq, eventType, err),
    },
    timeControl,
    creatorPreference,
    engine,
  );
}

export async function getOrLoadXiangqiRoom(roomId: string): Promise<XiangqiLiveRoom | null> {
  // The live map stores rooms with connected-client sets; hydration only ever
  // inserts freshly loaded rooms (empty client set), same as the factory cast.
  const room = await getOrLoadTenantRoom(
    xiangqiTenant,
    xiangqiRooms as unknown as Map<string, XiangqiRuntimeRoom>,
    roomId,
  );
  return room as XiangqiLiveRoom | null;
}

registerVariantTenant({
  kind: xiangqiTenant.kind,
  gameSpecId: xiangqiTenant.gameSpecId,
  roomIdPrefix: xiangqiTenant.roomIdPrefix,
  watch: {
    channelId: 'xiangqi',
    family: 'xiangqi',
    label: 'Elephant Chess',
    legacyVariants: ['xiangqi'],
  },
  ownsSpecRouting: true,
  errorPrefix: 'xiangqi',
  enabled: xiangqiTenant.enabled,
  rooms: xiangqiRooms as unknown as ReadonlyMap<string, TenantManagedRoom>,
  activeGameCount: () => countActiveTenantGames(xiangqiRooms.values()),
  getOrLoadRoom: (roomId) => getOrLoadXiangqiRoom(roomId) as Promise<TenantManagedRoom | null>,
  attachWebSocket: (ctx, socket, request, room) =>
    handleXiangqiWebSocketConnection(
      {
        defaultRoomRegion: ctx.defaultRoomRegion,
        wsMessageLimit: ctx.wsMessageLimit,
        wsMessageWindowMs: ctx.wsMessageWindowMs,
      },
      socket,
      request,
      room as unknown as XiangqiLiveRoom,
    ),
  clearRuntimeTimers: (room) => clearXiangqiRuntimeTimers(room as unknown as XiangqiLiveRoom),
  clearRooms: () => xiangqiRooms.clear(),
  http: {
    matchesCreateRequest: requestsXiangqi,
    handleCreate: (ctx, _request, response, body) =>
      handleXiangqiCreate({ ...ctx, createXiangqiRoom }, response, body),
  },
  lobby: null,
  sweepDueDeadline: null,
});
