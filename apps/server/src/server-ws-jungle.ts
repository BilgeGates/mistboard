/**
 * Jungle WebSocket handler — thin adapter over the generic tenant ws runtime
 * (variant-tenant/ws.ts). Jungle positions are public and there is no engine seat
 * at this checkpoint, so the generic host needs no fog-specific wiring and no
 * engine scheduler. PvP only.
 */

import type { IncomingMessage } from 'node:http';
import type { JungleColor } from '@mistboard/game';
import type { WebSocket } from 'ws';
import type { JungleRuntimeRoom } from './jungle-runtime.js';
import { jungleTenant } from './jungle-tenant.js';
import { scheduleJungleEngineMove } from './server-jungle-engine.js';
import { clearTenantRuntimeTimers } from './variant-tenant/lifecycle.js';
import { createTenantWsRuntime, type TenantLiveClient } from './variant-tenant/ws.js';

export type JungleLiveClient = TenantLiveClient<JungleColor>;

export type JungleLiveRoom = Omit<JungleRuntimeRoom, 'clients'> & {
  clients: Set<JungleLiveClient>;
};

export type JungleWebSocketContext = {
  defaultRoomRegion: string;
  wsMessageLimit: number;
  wsMessageWindowMs: number;
};

export const jungleWs = createTenantWsRuntime(jungleTenant, {
  scheduleEngineMove: (ctx, room) => scheduleJungleEngineMove(ctx, room),
});

export async function handleJungleWebSocketConnection(
  ctx: JungleWebSocketContext,
  socket: WebSocket,
  request: IncomingMessage,
  room: JungleLiveRoom,
): Promise<void> {
  return jungleWs.handleConnection(
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

export function scheduleJungleLifecycleTimers(room: JungleLiveRoom): void {
  jungleWs.scheduleLifecycleTimers(room);
}

export function clearJungleRuntimeTimers(room: JungleLiveRoom): void {
  clearTenantRuntimeTimers(room);
}
