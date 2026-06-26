/**
 * Flip Jungle WebSocket handler — thin adapter over the generic tenant ws runtime.
 * Symmetric-information (the tenant's clientEventFor/viewForClient do the deal
 * redaction + masking), PvP only, so no fog wiring and no engine scheduler.
 */

import type { IncomingMessage } from 'node:http';
import type { JungleFlipSeat } from '@mistboard/game';
import type { WebSocket } from 'ws';
import type { JungleFlipRuntimeRoom } from './jungle-flip-runtime.js';
import { jungleFlipTenant } from './jungle-flip-tenant.js';
import { clearTenantRuntimeTimers } from './variant-tenant/lifecycle.js';
import { createTenantWsRuntime, type TenantLiveClient } from './variant-tenant/ws.js';

export type JungleFlipLiveClient = TenantLiveClient<JungleFlipSeat>;

export type JungleFlipLiveRoom = Omit<JungleFlipRuntimeRoom, 'clients'> & {
  clients: Set<JungleFlipLiveClient>;
};

export type JungleFlipWebSocketContext = {
  defaultRoomRegion: string;
  wsMessageLimit: number;
  wsMessageWindowMs: number;
};

export const jungleFlipWs = createTenantWsRuntime(jungleFlipTenant);

export async function handleJungleFlipWebSocketConnection(
  ctx: JungleFlipWebSocketContext,
  socket: WebSocket,
  request: IncomingMessage,
  room: JungleFlipLiveRoom,
): Promise<void> {
  return jungleFlipWs.handleConnection(
    {
      wsMessageLimit: ctx.wsMessageLimit,
      wsMessageWindowMs: ctx.wsMessageWindowMs,
      defaultRoomRegion: ctx.defaultRoomRegion,
    },
    socket,
    request,
    room,
  );
}

export function scheduleJungleFlipLifecycleTimers(room: JungleFlipLiveRoom): void {
  jungleFlipWs.scheduleLifecycleTimers(room);
}

export function clearJungleFlipRuntimeTimers(room: JungleFlipLiveRoom): void {
  clearTenantRuntimeTimers(room);
}
