/**
 * Thin adapter over the generic tenant WebSocket runtime
 * (variant-tenant/ws.ts) for hidden Dark Crazyhouse. PvP-only, no rematch (the
 * optional ctx.rematch capability stays absent), no PvE engine.
 */

import type { IncomingMessage } from 'node:http';
import type { Color } from '@mistboard/game';
import type { WebSocket } from 'ws';
import type { DarkCrazyhouseRuntimeRoom } from './dark-crazyhouse-runtime.js';
import { darkCrazyhouseTenant } from './dark-crazyhouse-tenant.js';
import { clearTenantRuntimeTimers } from './variant-tenant/lifecycle.js';
import { createTenantWsRuntime, type TenantLiveClient } from './variant-tenant/ws.js';

export type DarkCrazyhouseLiveClient = TenantLiveClient<Color>;

export type DarkCrazyhouseLiveRoom = Omit<DarkCrazyhouseRuntimeRoom, 'clients'> & {
  clients: Set<DarkCrazyhouseLiveClient>;
};

export type DarkCrazyhouseWebSocketContext = {
  defaultRoomRegion: string;
  wsMessageLimit: number;
  wsMessageWindowMs: number;
};

export const darkCrazyhouseWs = createTenantWsRuntime(darkCrazyhouseTenant);

export async function handleDarkCrazyhouseWebSocketConnection(
  ctx: DarkCrazyhouseWebSocketContext,
  socket: WebSocket,
  request: IncomingMessage,
  room: DarkCrazyhouseLiveRoom,
): Promise<void> {
  return darkCrazyhouseWs.handleConnection(
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

export function scheduleDarkCrazyhouseLifecycleTimers(room: DarkCrazyhouseLiveRoom): void {
  darkCrazyhouseWs.scheduleLifecycleTimers(room);
}

export function clearDarkCrazyhouseRuntimeTimers(room: DarkCrazyhouseLiveRoom): void {
  clearTenantRuntimeTimers(room);
}
