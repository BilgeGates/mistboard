/**
 * Thin adapter over the generic tenant WebSocket runtime
 * (variant-tenant/ws.ts) for Dark Mini Xiangqi. Instantiates the per-tenant
 * bundle once at module scope (wiring the DMX PvE engine scheduler into the
 * post-connect / post-move hooks) and re-exports the bound functions under
 * their pre-migration names. Registry dispatch lives in
 * dark-mini-xiangqi-registration.ts.
 */

import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import type { DarkMiniXiangqiEvent } from './dark-mini-xiangqi-runtime.js';
import { darkMiniXiangqiTenant } from './dark-mini-xiangqi-tenant.js';
import { scheduleDarkMiniXiangqiEngineMove } from './server-dark-mini-xiangqi-engine.js';
import type {
  DarkMiniXiangqiLiveClient,
  DarkMiniXiangqiLiveRoom,
} from './server-dark-mini-xiangqi-live-room.js';
import type { DarkMiniXiangqiRematchContext } from './server-dark-mini-xiangqi-rematch.js';
import { clearTenantRuntimeTimers } from './variant-tenant/lifecycle.js';
import { createTenantWsRuntime } from './variant-tenant/ws.js';

// Re-exported (the definitions live in a leaf module so this handler and the
// rematch module it imports don't form an import cycle).
export type { DarkMiniXiangqiLiveClient, DarkMiniXiangqiLiveRoom };

export type DarkMiniXiangqiWebSocketContext = {
  wsMessageLimit: number;
  wsMessageWindowMs: number;
  darkMiniXiangqiRematch: DarkMiniXiangqiRematchContext;
};

const darkMiniXiangqiWs = createTenantWsRuntime(darkMiniXiangqiTenant, {
  // PvE: after a join or a human move it may be the engine's turn; the engine
  // move flows through the same append+broadcast path as a human move.
  scheduleEngineMove: (ctx, room) => scheduleDarkMiniXiangqiEngineMove(ctx, room),
});

export async function handleDarkMiniXiangqiWebSocketConnection(
  ctx: DarkMiniXiangqiWebSocketContext,
  socket: WebSocket,
  request: IncomingMessage,
  room: DarkMiniXiangqiLiveRoom,
): Promise<void> {
  return darkMiniXiangqiWs.handleConnection(
    {
      wsMessageLimit: ctx.wsMessageLimit,
      wsMessageWindowMs: ctx.wsMessageWindowMs,
      rematch: ctx.darkMiniXiangqiRematch,
    },
    socket,
    request,
    room,
  );
}

export function scheduleDarkMiniXiangqiLifecycleTimers(room: DarkMiniXiangqiLiveRoom): void {
  darkMiniXiangqiWs.scheduleLifecycleTimers(room);
}

export function clearDarkMiniXiangqiRuntimeTimers(room: DarkMiniXiangqiLiveRoom): void {
  clearTenantRuntimeTimers(room);
}

export function broadcastDarkMiniXiangqiEventAppended(
  room: DarkMiniXiangqiLiveRoom,
  event: DarkMiniXiangqiEvent,
  seq: number,
): void {
  darkMiniXiangqiWs.broadcastEventAppended(room, event, seq);
}

export function sendDarkMiniXiangqiPayload(
  client: Pick<DarkMiniXiangqiLiveClient, 'displaced' | 'socket'>,
  payload: unknown,
): void {
  darkMiniXiangqiWs.sendPayload(client, payload);
}

export function broadcastDarkMiniXiangqiSnapshot(room: DarkMiniXiangqiLiveRoom): void {
  darkMiniXiangqiWs.broadcastSnapshot(room);
}

export function darkMiniXiangqiTransportSnapshotPayload(
  room: DarkMiniXiangqiLiveRoom,
  client: DarkMiniXiangqiLiveClient,
) {
  return darkMiniXiangqiWs.transportSnapshotPayload(room, client);
}
