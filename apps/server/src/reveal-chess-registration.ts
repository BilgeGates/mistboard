/**
 * Reveal Chess registry entry. Owns the tenant's live-room map, the room-factory
 * binding, and hydration. No rematch flow and no lobby surface yet — the lobby
 * route answers reveal_chess_not_integrated while the flag is on. PvP-only,
 * live-clock only (no engine/bot; correspondence comes later). Imported for side
 * effects by variant-tenant/register-tenants.ts.
 */

import type { RoomTimeControl } from '@mistboard/game';
import * as persistence from './persistence.js';
import type {
  RevealChessCreatorPreference,
  RevealChessRuntimeRoom,
} from './reveal-chess-runtime.js';
import { revealChessTenant } from './reveal-chess-tenant.js';
import { handleRevealChessCreate, requestsRevealChess } from './routes/reveal-chess-rooms.js';
import {
  createRevealChessLiveRoom,
  type RevealChessLiveRoomCreation,
} from './server-reveal-chess-room-factory.js';
import {
  clearRevealChessRuntimeTimers,
  handleRevealChessWebSocketConnection,
  type RevealChessLiveRoom,
} from './server-ws-reveal-chess.js';
import { recordTenantPersistenceError } from './variant-tenant/events.js';
import { getOrLoadTenantRoom } from './variant-tenant/hydration.js';
import {
  registerVariantTenant,
  type TenantManagedRoom,
  variantTenantRoomIdTaken,
} from './variant-tenant/registry.js';
import { countActiveTenantGames } from './variant-tenant/runtime.js';

export const revealChessRooms = new Map<string, RevealChessLiveRoom>();

export async function createRevealChessRoom(
  timeControl?: RoomTimeControl,
  creatorPreference?: RevealChessCreatorPreference,
): Promise<RevealChessLiveRoomCreation> {
  return createRevealChessLiveRoom(
    {
      appendRoomEvent: persistence.appendRoomEvent,
      revealChessRooms,
      isRoomIdTaken: (roomId) => variantTenantRoomIdTaken(roomId, revealChessTenant.kind),
      isPersistenceEnabled: persistence.isInitialized,
      recordPersistenceError: (roomId, seq, eventType, err) =>
        recordTenantPersistenceError(revealChessTenant, roomId, seq, eventType, err),
    },
    timeControl,
    creatorPreference,
  );
}

export async function getOrLoadRevealChessRoom(
  roomId: string,
): Promise<RevealChessLiveRoom | null> {
  const room = await getOrLoadTenantRoom(
    revealChessTenant,
    revealChessRooms as unknown as Map<string, RevealChessRuntimeRoom>,
    roomId,
  );
  return room as RevealChessLiveRoom | null;
}

registerVariantTenant({
  kind: revealChessTenant.kind,
  gameSpecId: revealChessTenant.gameSpecId,
  roomIdPrefix: revealChessTenant.roomIdPrefix,
  watch: {
    channelId: 'reveal-chess',
    family: 'chess',
    label: 'Reveal Chess',
    legacyVariants: ['reveal-chess'],
  },
  ownsSpecRouting: true,
  errorPrefix: 'reveal_chess',
  enabled: revealChessTenant.enabled,
  rooms: revealChessRooms as unknown as ReadonlyMap<string, TenantManagedRoom>,
  activeGameCount: () => countActiveTenantGames(revealChessRooms.values()),
  getOrLoadRoom: (roomId) => getOrLoadRevealChessRoom(roomId) as Promise<TenantManagedRoom | null>,
  attachWebSocket: (ctx, socket, request, room) =>
    handleRevealChessWebSocketConnection(
      {
        defaultRoomRegion: ctx.defaultRoomRegion,
        wsMessageLimit: ctx.wsMessageLimit,
        wsMessageWindowMs: ctx.wsMessageWindowMs,
      },
      socket,
      request,
      room as unknown as RevealChessLiveRoom,
    ),
  clearRuntimeTimers: (room) =>
    clearRevealChessRuntimeTimers(room as unknown as RevealChessLiveRoom),
  clearRooms: () => revealChessRooms.clear(),
  http: {
    matchesCreateRequest: requestsRevealChess,
    handleCreate: (ctx, _request, response, body) =>
      handleRevealChessCreate({ ...ctx, createRevealChessRoom }, response, body),
  },
  lobby: null,
  sweepDueDeadline: null,
});
