/**
 * Thin adapter over the generic tenant WebSocket runtime
 * (variant-tenant/ws.ts) for hidden Dark Crossroads Chess. PvP-only, no
 * rematch (the optional ctx.rematch capability stays absent), no PvE engine.
 */

import type { IncomingMessage } from 'node:http';
import type { CrossroadsChessColor } from '@mistboard/game';
import type { WebSocket } from 'ws';
import type { DarkCrossroadsChessRuntimeRoom } from './dark-crossroads-chess-runtime.js';
import { darkCrossroadsChessTenant } from './dark-crossroads-chess-tenant.js';
import { clearTenantRuntimeTimers } from './variant-tenant/lifecycle.js';
import { createTenantWsRuntime, type TenantLiveClient } from './variant-tenant/ws.js';

export type DarkCrossroadsChessLiveClient = TenantLiveClient<CrossroadsChessColor>;

export type DarkCrossroadsChessLiveRoom = Omit<DarkCrossroadsChessRuntimeRoom, 'clients'> & {
  clients: Set<DarkCrossroadsChessLiveClient>;
};

export type DarkCrossroadsChessWebSocketContext = {
  defaultRoomRegion: string;
  wsMessageLimit: number;
  wsMessageWindowMs: number;
};

export const darkCrossroadsChessWs = createTenantWsRuntime(darkCrossroadsChessTenant);

export async function handleDarkCrossroadsChessWebSocketConnection(
  ctx: DarkCrossroadsChessWebSocketContext,
  socket: WebSocket,
  request: IncomingMessage,
  room: DarkCrossroadsChessLiveRoom,
): Promise<void> {
  return darkCrossroadsChessWs.handleConnection(
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

export function scheduleDarkCrossroadsChessLifecycleTimers(
  room: DarkCrossroadsChessLiveRoom,
): void {
  darkCrossroadsChessWs.scheduleLifecycleTimers(room);
}

export function clearDarkCrossroadsChessRuntimeTimers(room: DarkCrossroadsChessLiveRoom): void {
  clearTenantRuntimeTimers(room);
}
