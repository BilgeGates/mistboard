import type { IncomingMessage } from 'node:http';
import type { LuzhanqiColor } from '@mistboard/game';
import type { WebSocket } from 'ws';
import type { LuzhanqiRuntimeRoom } from './luzhanqi-runtime.js';
import { luzhanqiTenant } from './luzhanqi-tenant.js';
import { clearTenantRuntimeTimers } from './variant-tenant/lifecycle.js';
import { createTenantWsRuntime, type TenantLiveClient } from './variant-tenant/ws.js';

export type LuzhanqiLiveClient = TenantLiveClient<LuzhanqiColor>;

export type LuzhanqiLiveRoom = Omit<LuzhanqiRuntimeRoom, 'clients'> & {
  clients: Set<LuzhanqiLiveClient>;
};

export type LuzhanqiWebSocketContext = {
  defaultRoomRegion: string;
  wsMessageLimit: number;
  wsMessageWindowMs: number;
};

export const luzhanqiWs = createTenantWsRuntime(luzhanqiTenant);

export async function handleLuzhanqiWebSocketConnection(
  ctx: LuzhanqiWebSocketContext,
  socket: WebSocket,
  request: IncomingMessage,
  room: LuzhanqiLiveRoom,
): Promise<void> {
  return luzhanqiWs.handleConnection(
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

export function scheduleLuzhanqiLifecycleTimers(room: LuzhanqiLiveRoom): void {
  luzhanqiWs.scheduleLifecycleTimers(room);
}

export function clearLuzhanqiRuntimeTimers(room: LuzhanqiLiveRoom): void {
  clearTenantRuntimeTimers(room);
}
