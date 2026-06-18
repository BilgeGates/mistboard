/**
 * Thin adapter over the generic tenant lifecycle timers
 * (variant-tenant/lifecycle.ts) for hidden Dark Shogi.
 */

import type { DARK_SHOGI_SPEC_ID, ShogiColor, ShogiGameState, ShogiMove } from '@mistboard/game';
import { darkShogiTenant } from './dark-shogi-tenant.js';
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

export type DarkShogiLifecycleClient = TenantLifecycleClient<ShogiColor>;

export type DarkShogiLifecycleRoom<
  Client extends DarkShogiLifecycleClient = DarkShogiLifecycleClient,
> = TenantLifecycleRoom<ShogiColor, ShogiMove, ShogiGameState, typeof DARK_SHOGI_SPEC_ID, Client>;

export type DarkShogiLifecycleContext<
  Room extends DarkShogiLifecycleRoom = DarkShogiLifecycleRoom,
> = TenantLifecycleContext<ShogiColor, ShogiMove, ShogiGameState, typeof DARK_SHOGI_SPEC_ID, Room>;

export function clearDarkShogiRuntimeTimers(room: DarkShogiLifecycleRoom): void {
  clearTenantRuntimeTimers(room);
}

export function clearDarkShogiAbortTimer(room: DarkShogiLifecycleRoom): void {
  clearTenantAbortTimer(room);
}

export function clearDarkShogiClockTimer(room: DarkShogiLifecycleRoom): void {
  clearTenantClockTimer(room);
}

export function clearDarkShogiForfeitTimer(room: DarkShogiLifecycleRoom): void {
  clearTenantForfeitTimer(room);
}

export function scheduleDarkShogiLifecycleTimers<Room extends DarkShogiLifecycleRoom>(
  room: Room,
  ctx: DarkShogiLifecycleContext<Room>,
): void {
  scheduleTenantLifecycleTimers(darkShogiTenant, room, ctx);
}

export function darkShogiAbortPhaseFor(room: DarkShogiLifecycleRoom): `${ShogiColor}-1` | null {
  return tenantAbortPhaseFor(darkShogiTenant, room);
}

export function darkShogiForfeitingSeat(room: DarkShogiLifecycleRoom): ShogiColor | null {
  return tenantForfeitingSeat(darkShogiTenant, room);
}

export function darkShogiConnectedSeats(
  clients: Iterable<DarkShogiLifecycleClient>,
): Record<ShogiColor, boolean> {
  return tenantConnectedSeats(darkShogiTenant, clients);
}
