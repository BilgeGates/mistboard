/**
 * Thin adapter over the generic tenant WebSocket runtime
 * (variant-tenant/ws.ts) for hidden Kriegspiel. PvP-only, no rematch (the
 * optional ctx.rematch capability stays absent), no PvE engine.
 */

import type { IncomingMessage } from 'node:http';
import type { Color } from '@mistboard/game';
import type { WebSocket } from 'ws';
import type { KriegspielRuntimeRoom } from './kriegspiel-runtime.js';
import { kriegspielTenant } from './kriegspiel-tenant.js';
import { clearTenantRuntimeTimers } from './variant-tenant/lifecycle.js';
import { createTenantWsRuntime, type TenantLiveClient } from './variant-tenant/ws.js';

export type KriegspielLiveClient = TenantLiveClient<Color>;

export type KriegspielLiveRoom = Omit<KriegspielRuntimeRoom, 'clients'> & {
  clients: Set<KriegspielLiveClient>;
};

export type KriegspielWebSocketContext = {
  defaultRoomRegion: string;
  wsMessageLimit: number;
  wsMessageWindowMs: number;
};

export const kriegspielWs = createTenantWsRuntime(kriegspielTenant);

export async function handleKriegspielWebSocketConnection(
  ctx: KriegspielWebSocketContext,
  socket: WebSocket,
  request: IncomingMessage,
  room: KriegspielLiveRoom,
): Promise<void> {
  return kriegspielWs.handleConnection(
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

export function scheduleKriegspielLifecycleTimers(room: KriegspielLiveRoom): void {
  kriegspielWs.scheduleLifecycleTimers(room);
}

export function clearKriegspielRuntimeTimers(room: KriegspielLiveRoom): void {
  clearTenantRuntimeTimers(room);
}
