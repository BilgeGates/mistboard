/**
 * Thin adapter over the generic tenant WebSocket runtime
 * (variant-tenant/ws.ts) for hidden Dark Xiangqi — the last tenant to converge
 * off a hand-rolled ws handler (registry dispatch collapse, 2026-06-11).
 *
 * The pre-convergence handler's quirks were each decided explicitly:
 * latency-sample handling, unknown-message logging, the strict client-id
 * regex, and synchronous clock-expiry-on-move moved INTO the generic runtime
 * (they were the chess-stack norms); the both-seats move gate was ADOPTED from
 * the generic runtime (dark xiangqi previously allowed moving before the
 * opponent was seated); rematch stays absent via the optional ctx.rematch
 * capability (dark xiangqi has no rematch flow).
 */

import type { IncomingMessage } from 'node:http';
import type { XiangqiColor } from '@mistboard/game';
import type { WebSocket } from 'ws';
import type { DarkXiangqiRuntimeRoom } from './dark-xiangqi-runtime.js';
import { darkXiangqiTenant } from './dark-xiangqi-tenant.js';
import { scheduleDarkXiangqiEngineMove } from './server-dark-xiangqi-engine.js';
import { clearDarkXiangqiRuntimeTimers } from './server-dark-xiangqi-lifecycle.js';
import { createTenantWsRuntime, type TenantLiveClient } from './variant-tenant/ws.js';

export type DarkXiangqiLiveClient = TenantLiveClient<XiangqiColor>;

export type DarkXiangqiLiveRoom = Omit<DarkXiangqiRuntimeRoom, 'clients'> & {
  clients: Set<DarkXiangqiLiveClient>;
};

export type DarkXiangqiWebSocketContext = {
  defaultRoomRegion: string;
  wsMessageLimit: number;
  wsMessageWindowMs: number;
};

export const darkXiangqiWs = createTenantWsRuntime(darkXiangqiTenant, {
  scheduleEngineMove: (ctx, room) => scheduleDarkXiangqiEngineMove(ctx, room),
});

export async function handleDarkXiangqiWebSocketConnection(
  ctx: DarkXiangqiWebSocketContext,
  socket: WebSocket,
  request: IncomingMessage,
  room: DarkXiangqiLiveRoom,
): Promise<void> {
  return darkXiangqiWs.handleConnection(
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

export function scheduleDarkXiangqiLifecycleTimers(room: DarkXiangqiLiveRoom): void {
  darkXiangqiWs.scheduleLifecycleTimers(room);
}

export { clearDarkXiangqiRuntimeTimers };
