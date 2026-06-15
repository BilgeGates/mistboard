/**
 * Jieqi registry entry. Owns the tenant's live-room map, the room-factory
 * binding, and hydration. No rematch flow and no lobby surface yet — the lobby
 * route answers jieqi_not_integrated while the flag is on. PvP, live-clock only
 * (PvE and correspondence come later). Imported for side effects by
 * variant-tenant/register-tenants.ts.
 */

import type { RoomTimeControl } from '@mistboard/game';
import type { JieqiCreatorPreference, JieqiRuntimeRoom } from './jieqi-runtime.js';
import { jieqiTenant } from './jieqi-tenant.js';
import * as persistence from './persistence.js';
import { handleJieqiCreate, requestsJieqi } from './routes/jieqi-rooms.js';
import {
  createJieqiLiveRoom,
  type JieqiLiveRoomCreation,
  type JieqiRoomEngineSeat,
} from './server-jieqi-room-factory.js';
import {
  clearJieqiRuntimeTimers,
  handleJieqiWebSocketConnection,
  type JieqiLiveRoom,
} from './server-ws-jieqi.js';
import { recordTenantPersistenceError } from './variant-tenant/events.js';
import { getOrLoadTenantRoom } from './variant-tenant/hydration.js';
import {
  registerVariantTenant,
  type TenantManagedRoom,
  variantTenantRoomIdTaken,
} from './variant-tenant/registry.js';
import { countActiveTenantGames } from './variant-tenant/runtime.js';

export const jieqiRooms = new Map<string, JieqiLiveRoom>();

export async function createJieqiRoom(
  timeControl?: RoomTimeControl,
  creatorPreference?: JieqiCreatorPreference,
  engine?: JieqiRoomEngineSeat,
): Promise<JieqiLiveRoomCreation> {
  return createJieqiLiveRoom(
    {
      appendRoomEvent: persistence.appendRoomEvent,
      jieqiRooms,
      isRoomIdTaken: (roomId) => variantTenantRoomIdTaken(roomId, jieqiTenant.kind),
      isPersistenceEnabled: persistence.isInitialized,
      recordPersistenceError: (roomId, seq, eventType, err) =>
        recordTenantPersistenceError(jieqiTenant, roomId, seq, eventType, err),
    },
    timeControl,
    creatorPreference,
    engine,
  );
}

export async function getOrLoadJieqiRoom(roomId: string): Promise<JieqiLiveRoom | null> {
  const room = await getOrLoadTenantRoom(
    jieqiTenant,
    jieqiRooms as unknown as Map<string, JieqiRuntimeRoom>,
    roomId,
  );
  return room as JieqiLiveRoom | null;
}

registerVariantTenant({
  kind: jieqiTenant.kind,
  gameSpecId: jieqiTenant.gameSpecId,
  roomIdPrefix: jieqiTenant.roomIdPrefix,
  watch: {
    channelId: 'jieqi',
    family: 'xiangqi',
    label: 'Jieqi',
    legacyVariants: ['jieqi'],
  },
  ownsSpecRouting: true,
  errorPrefix: 'jieqi',
  enabled: jieqiTenant.enabled,
  rooms: jieqiRooms as unknown as ReadonlyMap<string, TenantManagedRoom>,
  activeGameCount: () => countActiveTenantGames(jieqiRooms.values()),
  getOrLoadRoom: (roomId) => getOrLoadJieqiRoom(roomId) as Promise<TenantManagedRoom | null>,
  attachWebSocket: (ctx, socket, request, room) =>
    handleJieqiWebSocketConnection(
      {
        defaultRoomRegion: ctx.defaultRoomRegion,
        wsMessageLimit: ctx.wsMessageLimit,
        wsMessageWindowMs: ctx.wsMessageWindowMs,
      },
      socket,
      request,
      room as unknown as JieqiLiveRoom,
    ),
  clearRuntimeTimers: (room) => clearJieqiRuntimeTimers(room as unknown as JieqiLiveRoom),
  clearRooms: () => jieqiRooms.clear(),
  http: {
    matchesCreateRequest: requestsJieqi,
    handleCreate: (ctx, _request, response, body) =>
      handleJieqiCreate({ ...ctx, createJieqiRoom }, response, body),
  },
  lobby: null,
  sweepDueDeadline: null,
});
