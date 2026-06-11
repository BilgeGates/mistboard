/**
 * Thin adapter over the generic tenant rematch orchestrator
 * (variant-tenant/rematch.ts) for Dark Mini Xiangqi: mutual-confirm offers
 * over red/black seats, swapped-color finalize with pre-issued seat tokens,
 * and redirect replay on reconnect.
 */

import type {
  DARK_MINI_XIANGQI_SPEC_ID,
  MiniXiangqiColor,
  MiniXiangqiGameState,
  MiniXiangqiMove,
} from '@mistboard/game';
import type { DarkMiniXiangqiRuntimeRoom } from './dark-mini-xiangqi-runtime.js';
import { darkMiniXiangqiTenant } from './dark-mini-xiangqi-tenant.js';
import type {
  DarkMiniXiangqiLiveClient,
  DarkMiniXiangqiLiveRoom,
} from './server-dark-mini-xiangqi-live-room.js';
import {
  broadcastTenantRematchState,
  cancelTenantRematch,
  declineTenantRematch,
  finalizeTenantRematchIfReady,
  maybeReplayTenantRematchRedirect,
  offerTenantRematch,
  type TenantRematchContext,
} from './variant-tenant/rematch.js';

export type DarkMiniXiangqiRematchContext = TenantRematchContext<
  'dark-mini-xiangqi',
  MiniXiangqiColor,
  MiniXiangqiMove,
  MiniXiangqiGameState,
  typeof DARK_MINI_XIANGQI_SPEC_ID,
  DarkMiniXiangqiLiveClient
>;

export function broadcastDarkMiniXiangqiRematchState(
  ctx: DarkMiniXiangqiRematchContext,
  room: DarkMiniXiangqiLiveRoom,
): void {
  broadcastTenantRematchState(darkMiniXiangqiTenant, ctx, room);
}

export function offerDarkMiniXiangqiRematch(
  ctx: DarkMiniXiangqiRematchContext,
  room: DarkMiniXiangqiLiveRoom,
  client: DarkMiniXiangqiLiveClient,
): void {
  offerTenantRematch(darkMiniXiangqiTenant, ctx, room, client);
}

export function cancelDarkMiniXiangqiRematch(
  ctx: DarkMiniXiangqiRematchContext,
  room: DarkMiniXiangqiLiveRoom,
  client: DarkMiniXiangqiLiveClient,
): void {
  cancelTenantRematch(darkMiniXiangqiTenant, ctx, room, client);
}

export function declineDarkMiniXiangqiRematch(
  ctx: DarkMiniXiangqiRematchContext,
  room: DarkMiniXiangqiLiveRoom,
  client: DarkMiniXiangqiLiveClient,
): void {
  declineTenantRematch(darkMiniXiangqiTenant, ctx, room, client);
}

export async function finalizeDarkMiniXiangqiRematchIfReady(
  ctx: DarkMiniXiangqiRematchContext,
  room: DarkMiniXiangqiLiveRoom,
): Promise<DarkMiniXiangqiRuntimeRoom | null> {
  return finalizeTenantRematchIfReady(darkMiniXiangqiTenant, ctx, room);
}

export function maybeReplayDarkMiniXiangqiRematchRedirect(
  ctx: DarkMiniXiangqiRematchContext,
  room: DarkMiniXiangqiLiveRoom,
  client: DarkMiniXiangqiLiveClient,
): void {
  maybeReplayTenantRematchRedirect(ctx, room, client);
}
