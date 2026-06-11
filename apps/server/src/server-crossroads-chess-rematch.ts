/**
 * Thin adapter over the generic tenant rematch orchestrator
 * (variant-tenant/rematch.ts) for Crossroads Chess: mutual-confirm offers over
 * white/red seats, swapped-color finalize with pre-issued seat tokens, and
 * redirect replay on reconnect.
 *
 * The pre-migration context's createRoom takes only a time control (Crossroads
 * has no rated rooms); asTenantCrossroadsChessRematchContext bridges it to the
 * generic createRoom(timeControl, rated) signature by dropping the flag.
 */

import type {
  CrossroadsChessColor,
  CrossroadsChessGameState,
  CrossroadsChessMove,
  RoomTimeControl,
} from '@mistboard/game';
import type {
  CrossroadsChessRuntimeRoom,
  CrossroadsChessSeatTokenState,
} from './crossroads-chess-runtime.js';
import { type CrossroadsChessSpecId, crossroadsChessTenant } from './crossroads-chess-tenant.js';
import type {
  CrossroadsChessLiveClient,
  CrossroadsChessLiveRoom,
} from './server-crossroads-chess-live-room.js';
import {
  broadcastTenantRematchState,
  cancelTenantRematch,
  declineTenantRematch,
  finalizeTenantRematchIfReady,
  maybeReplayTenantRematchRedirect,
  offerTenantRematch,
  type TenantRematchContext,
} from './variant-tenant/rematch.js';

export type CrossroadsChessRematchContext = {
  send: (client: CrossroadsChessLiveClient, payload: unknown) => void;
  createRoom: (
    timeControl: RoomTimeControl | undefined,
  ) => Promise<{ ok: true; room: CrossroadsChessRuntimeRoom } | { ok: false; error: string }>;
  issueSeatToken: (
    room: CrossroadsChessRuntimeRoom,
    seat: CrossroadsChessColor,
    identity: { userId: string | null; userHandle: string | null; userDisplayName: string | null },
  ) => Promise<{ rawToken: string; state: CrossroadsChessSeatTokenState }>;
  buildRoomUrl: (roomId: string) => string;
};

type GenericRematchContext = TenantRematchContext<
  'crossroads-chess',
  CrossroadsChessColor,
  CrossroadsChessMove,
  CrossroadsChessGameState,
  CrossroadsChessSpecId,
  CrossroadsChessLiveClient
>;

export function asTenantCrossroadsChessRematchContext(
  ctx: CrossroadsChessRematchContext,
): GenericRematchContext {
  return { ...ctx, createRoom: (timeControl, _rated) => ctx.createRoom(timeControl) };
}

export function broadcastCrossroadsChessRematchState(
  ctx: CrossroadsChessRematchContext,
  room: CrossroadsChessLiveRoom,
): void {
  broadcastTenantRematchState(
    crossroadsChessTenant,
    asTenantCrossroadsChessRematchContext(ctx),
    room,
  );
}

export function offerCrossroadsChessRematch(
  ctx: CrossroadsChessRematchContext,
  room: CrossroadsChessLiveRoom,
  client: CrossroadsChessLiveClient,
): void {
  offerTenantRematch(
    crossroadsChessTenant,
    asTenantCrossroadsChessRematchContext(ctx),
    room,
    client,
  );
}

export function cancelCrossroadsChessRematch(
  ctx: CrossroadsChessRematchContext,
  room: CrossroadsChessLiveRoom,
  client: CrossroadsChessLiveClient,
): void {
  cancelTenantRematch(
    crossroadsChessTenant,
    asTenantCrossroadsChessRematchContext(ctx),
    room,
    client,
  );
}

export function declineCrossroadsChessRematch(
  ctx: CrossroadsChessRematchContext,
  room: CrossroadsChessLiveRoom,
  client: CrossroadsChessLiveClient,
): void {
  declineTenantRematch(
    crossroadsChessTenant,
    asTenantCrossroadsChessRematchContext(ctx),
    room,
    client,
  );
}

export async function finalizeCrossroadsChessRematchIfReady(
  ctx: CrossroadsChessRematchContext,
  room: CrossroadsChessLiveRoom,
): Promise<CrossroadsChessRuntimeRoom | null> {
  return finalizeTenantRematchIfReady(
    crossroadsChessTenant,
    asTenantCrossroadsChessRematchContext(ctx),
    room,
  );
}

export function maybeReplayCrossroadsChessRematchRedirect(
  ctx: CrossroadsChessRematchContext,
  room: CrossroadsChessLiveRoom,
  client: CrossroadsChessLiveClient,
): void {
  maybeReplayTenantRematchRedirect(asTenantCrossroadsChessRematchContext(ctx), room, client);
}
