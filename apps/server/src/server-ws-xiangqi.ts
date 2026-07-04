/**
 * Thin adapter over the generic tenant WebSocket runtime
 * (variant-tenant/ws.ts) for open-information Standard Xiangqi. The
 * scheduleEngineMove hook drives mainline-Pikafish PvE (server-xiangqi-engine.ts).
 */

import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import { scheduleXiangqiEngineMove } from './server-xiangqi-engine.js';
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

export const xiangqiWs = createTenantWsRuntime(xiangqiTenant, {
  scheduleEngineMove: (ctx, room) => scheduleXiangqiEngineMove(ctx, room),
});

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
