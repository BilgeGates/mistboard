/**
 * Thin adapter over the generic tenant lifecycle timers
 * (variant-tenant/lifecycle.ts) for hidden Dark Crossroads Chess.
 */

import type {
  CrossroadsChessColor,
  CrossroadsChessGameState,
  CrossroadsChessMove,
  DARK_CROSSROADS_CHESS_SPEC_ID,
} from '@mistboard/game';
import { darkCrossroadsChessTenant } from './dark-crossroads-chess-tenant.js';
import {
  clearTenantAbortTimer,
  clearTenantClockTimer,
  clearTenantForfeitTimer,
  clearTenantRuntimeTimers,
  scheduleTenantLifecycleTimers,
  type TenantLifecycleClient,
  type TenantLifecycleContext,
  type TenantLifecycleRoom,
  tenantAbortPhaseFor,
  tenantConnectedSeats,
  tenantForfeitingSeat,
} from './variant-tenant/lifecycle.js';

export type DarkCrossroadsChessLifecycleClient = TenantLifecycleClient<CrossroadsChessColor>;

export type DarkCrossroadsChessLifecycleRoom<
  Client extends DarkCrossroadsChessLifecycleClient = DarkCrossroadsChessLifecycleClient,
> = TenantLifecycleRoom<
  CrossroadsChessColor,
  CrossroadsChessMove,
  CrossroadsChessGameState,
  typeof DARK_CROSSROADS_CHESS_SPEC_ID,
  Client
>;

export type DarkCrossroadsChessLifecycleContext<
  Room extends DarkCrossroadsChessLifecycleRoom = DarkCrossroadsChessLifecycleRoom,
> = TenantLifecycleContext<
  CrossroadsChessColor,
  CrossroadsChessMove,
  CrossroadsChessGameState,
  typeof DARK_CROSSROADS_CHESS_SPEC_ID,
  Room
>;

export function clearDarkCrossroadsChessRuntimeTimers(
  room: DarkCrossroadsChessLifecycleRoom,
): void {
  clearTenantRuntimeTimers(room);
}

export function clearDarkCrossroadsChessAbortTimer(room: DarkCrossroadsChessLifecycleRoom): void {
  clearTenantAbortTimer(room);
}

export function clearDarkCrossroadsChessClockTimer(room: DarkCrossroadsChessLifecycleRoom): void {
  clearTenantClockTimer(room);
}

export function clearDarkCrossroadsChessForfeitTimer(room: DarkCrossroadsChessLifecycleRoom): void {
  clearTenantForfeitTimer(room);
}

export function scheduleDarkCrossroadsChessLifecycleTimers<
  Room extends DarkCrossroadsChessLifecycleRoom,
>(room: Room, ctx: DarkCrossroadsChessLifecycleContext<Room>): void {
  scheduleTenantLifecycleTimers(darkCrossroadsChessTenant, room, ctx);
}

export function darkCrossroadsChessAbortPhaseFor(
  room: DarkCrossroadsChessLifecycleRoom,
): `${CrossroadsChessColor}-1` | null {
  return tenantAbortPhaseFor(darkCrossroadsChessTenant, room);
}

export function darkCrossroadsChessForfeitingSeat(
  room: DarkCrossroadsChessLifecycleRoom,
): CrossroadsChessColor | null {
  return tenantForfeitingSeat(darkCrossroadsChessTenant, room);
}

export function darkCrossroadsChessConnectedSeats(
  clients: Iterable<DarkCrossroadsChessLifecycleClient>,
): Record<CrossroadsChessColor, boolean> {
  return tenantConnectedSeats(darkCrossroadsChessTenant, clients);
}
