/**
 * Thin adapter over the generic tenant lifecycle timers
 * (variant-tenant/lifecycle.ts) for hidden Dark Xiangqi.
 */

import type {
  DARK_XIANGQI_SPEC_ID,
  XiangqiColor,
  XiangqiGameState,
  XiangqiMove,
} from '@mistboard/game';
import { darkXiangqiTenant } from './dark-xiangqi-tenant.js';
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

export type DarkXiangqiLifecycleClient = TenantLifecycleClient<XiangqiColor>;

export type DarkXiangqiLifecycleRoom<
  Client extends DarkXiangqiLifecycleClient = DarkXiangqiLifecycleClient,
> = TenantLifecycleRoom<
  XiangqiColor,
  XiangqiMove,
  XiangqiGameState,
  typeof DARK_XIANGQI_SPEC_ID,
  Client
>;

export type DarkXiangqiLifecycleContext<
  Room extends DarkXiangqiLifecycleRoom = DarkXiangqiLifecycleRoom,
> = TenantLifecycleContext<
  XiangqiColor,
  XiangqiMove,
  XiangqiGameState,
  typeof DARK_XIANGQI_SPEC_ID,
  Room
>;

export function clearDarkXiangqiRuntimeTimers(room: DarkXiangqiLifecycleRoom): void {
  clearTenantRuntimeTimers(room);
}

export function clearDarkXiangqiAbortTimer(room: DarkXiangqiLifecycleRoom): void {
  clearTenantAbortTimer(room);
}

export function clearDarkXiangqiClockTimer(room: DarkXiangqiLifecycleRoom): void {
  clearTenantClockTimer(room);
}

export function clearDarkXiangqiForfeitTimer(room: DarkXiangqiLifecycleRoom): void {
  clearTenantForfeitTimer(room);
}

export function scheduleDarkXiangqiLifecycleTimers<Room extends DarkXiangqiLifecycleRoom>(
  room: Room,
  ctx: DarkXiangqiLifecycleContext<Room>,
): void {
  scheduleTenantLifecycleTimers(darkXiangqiTenant, room, ctx);
}

export function darkXiangqiAbortPhaseFor(
  room: DarkXiangqiLifecycleRoom,
): `${XiangqiColor}-1` | null {
  return tenantAbortPhaseFor(darkXiangqiTenant, room);
}

export function darkXiangqiForfeitingSeat(room: DarkXiangqiLifecycleRoom): XiangqiColor | null {
  return tenantForfeitingSeat(darkXiangqiTenant, room);
}

export function darkXiangqiConnectedSeats(
  clients: Iterable<DarkXiangqiLifecycleClient>,
): Record<XiangqiColor, boolean> {
  return tenantConnectedSeats(darkXiangqiTenant, clients);
}
