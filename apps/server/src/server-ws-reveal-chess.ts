/**
 * Reveal Chess WebSocket handler — thin adapter over the generic tenant ws
 * runtime (variant-tenant/ws.ts). Reveal Chess positions are public, so the
 * generic host needs no fog-specific wiring; the tenant's clientEventFor/
 * viewForClient perform the identity redaction. PvP only — no engine scheduler
 * (the identity-belief bot is deferred), so createTenantWsRuntime gets no
 * scheduleEngineMove hook (matching dark-xiangqi).
 */

import type { IncomingMessage } from 'node:http';
import type { RevealChessColor } from '@mistboard/game';
import type { WebSocket } from 'ws';
import type { RevealChessRuntimeRoom } from './reveal-chess-runtime.js';
import { revealChessTenant } from './reveal-chess-tenant.js';
import { clearTenantRuntimeTimers } from './variant-tenant/lifecycle.js';
import { createTenantWsRuntime, type TenantLiveClient } from './variant-tenant/ws.js';

export type RevealChessLiveClient = TenantLiveClient<RevealChessColor>;

export type RevealChessLiveRoom = Omit<RevealChessRuntimeRoom, 'clients'> & {
  clients: Set<RevealChessLiveClient>;
};

export type RevealChessWebSocketContext = {
  defaultRoomRegion: string;
  wsMessageLimit: number;
  wsMessageWindowMs: number;
};

export const revealChessWs = createTenantWsRuntime(revealChessTenant);

export async function handleRevealChessWebSocketConnection(
  ctx: RevealChessWebSocketContext,
  socket: WebSocket,
  request: IncomingMessage,
  room: RevealChessLiveRoom,
): Promise<void> {
  return revealChessWs.handleConnection(
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

export function scheduleRevealChessLifecycleTimers(room: RevealChessLiveRoom): void {
  revealChessWs.scheduleLifecycleTimers(room);
}

export function clearRevealChessRuntimeTimers(room: RevealChessLiveRoom): void {
  clearTenantRuntimeTimers(room);
}
