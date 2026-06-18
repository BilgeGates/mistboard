/**
 * Thin adapter over the generic tenant lifecycle timers
 * (variant-tenant/lifecycle.ts) for hidden Dark Crazyhouse.
 */

import type {
  Color,
  CrazyhouseGameState,
  CrazyhouseMove,
  DARK_CRAZYHOUSE_SPEC_ID,
} from '@mistboard/game';
import { darkCrazyhouseTenant } from './dark-crazyhouse-tenant.js';
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

export type DarkCrazyhouseLifecycleClient = TenantLifecycleClient<Color>;

export type DarkCrazyhouseLifecycleRoom<
  Client extends DarkCrazyhouseLifecycleClient = DarkCrazyhouseLifecycleClient,
> = TenantLifecycleRoom<
  Color,
  CrazyhouseMove,
  CrazyhouseGameState,
  typeof DARK_CRAZYHOUSE_SPEC_ID,
  Client
>;

export type DarkCrazyhouseLifecycleContext<
  Room extends DarkCrazyhouseLifecycleRoom = DarkCrazyhouseLifecycleRoom,
> = TenantLifecycleContext<
  Color,
  CrazyhouseMove,
  CrazyhouseGameState,
  typeof DARK_CRAZYHOUSE_SPEC_ID,
  Room
>;

export function clearDarkCrazyhouseRuntimeTimers(room: DarkCrazyhouseLifecycleRoom): void {
  clearTenantRuntimeTimers(room);
}

export function clearDarkCrazyhouseAbortTimer(room: DarkCrazyhouseLifecycleRoom): void {
  clearTenantAbortTimer(room);
}

export function clearDarkCrazyhouseClockTimer(room: DarkCrazyhouseLifecycleRoom): void {
  clearTenantClockTimer(room);
}

export function clearDarkCrazyhouseForfeitTimer(room: DarkCrazyhouseLifecycleRoom): void {
  clearTenantForfeitTimer(room);
}

export function scheduleDarkCrazyhouseLifecycleTimers<Room extends DarkCrazyhouseLifecycleRoom>(
  room: Room,
  ctx: DarkCrazyhouseLifecycleContext<Room>,
): void {
  scheduleTenantLifecycleTimers(darkCrazyhouseTenant, room, ctx);
}

export function darkCrazyhouseAbortPhaseFor(
  room: DarkCrazyhouseLifecycleRoom,
): `${Color}-1` | null {
  return tenantAbortPhaseFor(darkCrazyhouseTenant, room);
}

export function darkCrazyhouseForfeitingSeat(room: DarkCrazyhouseLifecycleRoom): Color | null {
  return tenantForfeitingSeat(darkCrazyhouseTenant, room);
}

export function darkCrazyhouseConnectedSeats(
  clients: Iterable<DarkCrazyhouseLifecycleClient>,
): Record<Color, boolean> {
  return tenantConnectedSeats(darkCrazyhouseTenant, clients);
}
