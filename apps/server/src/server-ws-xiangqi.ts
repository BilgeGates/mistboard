/**
 * Thin adapter over the generic tenant WebSocket runtime
 * (variant-tenant/ws.ts) for open-information Standard Xiangqi. No engine is
 * wired yet (Pikafish arrives in a later increment), so the runtime is created
 * WITHOUT a scheduleEngineMove hook — PvE never triggers.
 */

import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import type { XiangqiLiveRoom } from './server-xiangqi-types.js';
import { clearTenantRuntimeTimers } from './variant-tenant/lifecycle.js';
import { createTenantWsRuntime } from './variant-tenant/ws.js';
import { xiangqiTenant } from './xiangqi-tenant.js';

export type { XiangqiLiveClient, XiangqiLiveRoom } from './server-xiangqi-types.js';

export type XiangqiWebSocketContext = {
  defaultRoomRegion: string;
  wsMessageLimit: number;
  wsMessageWindowMs: number;
};

export const xiangqiWs = createTenantWsRuntime(xiangqiTenant);

export async function handleXiangqiWebSocketConnection(
  ctx: XiangqiWebSocketContext,
  socket: WebSocket,
  request: IncomingMessage,
  room: XiangqiLiveRoom,
): Promise<void> {
  return xiangqiWs.handleConnection(
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

export function scheduleXiangqiLifecycleTimers(room: XiangqiLiveRoom): void {
  xiangqiWs.scheduleLifecycleTimers(room);
}

export function clearXiangqiRuntimeTimers(room: XiangqiLiveRoom): void {
  clearTenantRuntimeTimers(room);
}
