/**
 * Thin adapter over the generic tenant WebSocket runtime
 * (variant-tenant/ws.ts) for hidden Dark Shogi. PvP-only, no rematch (the
 * optional ctx.rematch capability stays absent), no PvE engine.
 */

import type { IncomingMessage } from 'node:http';
import type { ShogiColor } from '@mistboard/game';
import type { WebSocket } from 'ws';
import type { DarkShogiRuntimeRoom } from './dark-shogi-runtime.js';
import { darkShogiTenant } from './dark-shogi-tenant.js';
import { clearDarkShogiRuntimeTimers } from './server-dark-shogi-lifecycle.js';
import { createTenantWsRuntime, type TenantLiveClient } from './variant-tenant/ws.js';

export type DarkShogiLiveClient = TenantLiveClient<ShogiColor>;

export type DarkShogiLiveRoom = Omit<DarkShogiRuntimeRoom, 'clients'> & {
  clients: Set<DarkShogiLiveClient>;
};

export type DarkShogiWebSocketContext = {
  defaultRoomRegion: string;
  wsMessageLimit: number;
  wsMessageWindowMs: number;
};

export const darkShogiWs = createTenantWsRuntime(darkShogiTenant);

export async function handleDarkShogiWebSocketConnection(
  ctx: DarkShogiWebSocketContext,
  socket: WebSocket,
  request: IncomingMessage,
  room: DarkShogiLiveRoom,
): Promise<void> {
  return darkShogiWs.handleConnection(
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

export function scheduleDarkShogiLifecycleTimers(room: DarkShogiLiveRoom): void {
  darkShogiWs.scheduleLifecycleTimers(room);
}

export { clearDarkShogiRuntimeTimers };
