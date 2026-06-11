/**
 * Thin adapter over the generic tenant WebSocket runtime
 * (variant-tenant/ws.ts) for Crossroads Chess. Instantiates the per-tenant
 * bundle once at module scope (wiring the in-process Fairy-Stockfish
 * scheduler into the post-connect / post-move hooks) and re-exports the bound
 * functions under their pre-migration names. The old runtime/transport
 * snapshot split is gone: roomMode/pveEngineId now ride
 * crossroadsChessTenant.wire.snapshotExtras, so the transport payload IS the
 * tenant snapshot payload (golden-pinned).
 */

import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import type { CrossroadsChessEvent } from './crossroads-chess-runtime.js';
import { crossroadsChessTenant } from './crossroads-chess-tenant.js';
import { scheduleCrossroadsChessEngineMove } from './server-crossroads-chess-engine.js';
import { clearCrossroadsChessRuntimeTimers } from './server-crossroads-chess-lifecycle.js';
import type {
  CrossroadsChessLiveClient,
  CrossroadsChessLiveRoom,
} from './server-crossroads-chess-live-room.js';
import {
  asTenantCrossroadsChessRematchContext,
  type CrossroadsChessRematchContext,
} from './server-crossroads-chess-rematch.js';
import { createTenantWsRuntime } from './variant-tenant/ws.js';

// Re-exported (the definitions live in a leaf module so this handler and the
// rematch module it imports don't form an import cycle).
export type { CrossroadsChessLiveClient, CrossroadsChessLiveRoom };

export type CrossroadsChessWebSocketContext = {
  crossroadsChessRematch: CrossroadsChessRematchContext;
  wsMessageLimit: number;
  wsMessageWindowMs: number;
};

const crossroadsChessWs = createTenantWsRuntime(crossroadsChessTenant, {
  // PvE: after a join or a human move it may be the engine's turn; the engine
  // move flows through the same append+broadcast path as a human move.
  scheduleEngineMove: (ctx, room) => scheduleCrossroadsChessEngineMove(ctx, room),
});

export async function handleCrossroadsChessWebSocketConnection(
  ctx: CrossroadsChessWebSocketContext,
  socket: WebSocket,
  request: IncomingMessage,
  room: CrossroadsChessLiveRoom,
): Promise<void> {
  return crossroadsChessWs.handleConnection(
    {
      wsMessageLimit: ctx.wsMessageLimit,
      wsMessageWindowMs: ctx.wsMessageWindowMs,
      rematch: asTenantCrossroadsChessRematchContext(ctx.crossroadsChessRematch),
    },
    socket,
    request,
    room,
  );
}

export function scheduleCrossroadsChessLifecycleTimers(room: CrossroadsChessLiveRoom): void {
  crossroadsChessWs.scheduleLifecycleTimers(room);
}

export { clearCrossroadsChessRuntimeTimers };

export function broadcastCrossroadsChessEventAppended(
  room: CrossroadsChessLiveRoom,
  event: CrossroadsChessEvent,
  seq: number,
): void {
  crossroadsChessWs.broadcastEventAppended(room, event, seq);
}

export function sendCrossroadsChessPayload(
  client: Pick<CrossroadsChessLiveClient, 'displaced' | 'socket'>,
  payload: unknown,
): void {
  crossroadsChessWs.sendPayload(client, payload);
}

export function broadcastCrossroadsChessSnapshot(room: CrossroadsChessLiveRoom): void {
  crossroadsChessWs.broadcastSnapshot(room);
}

export function crossroadsChessTransportSnapshotPayload(
  room: CrossroadsChessLiveRoom,
  client: CrossroadsChessLiveClient,
) {
  return crossroadsChessWs.transportSnapshotPayload(room, client);
}
