/**
 * Thin adapter over the generic tenant lifecycle timers
 * (variant-tenant/lifecycle.ts) for Dark Mini Xiangqi.
 */

import type {
  DARK_MINI_XIANGQI_SPEC_ID,
  MiniXiangqiColor,
  MiniXiangqiGameState,
  MiniXiangqiMove,
} from '@mistboard/game';
import { darkMiniXiangqiTenant } from './dark-mini-xiangqi-tenant.js';
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

export type DarkMiniXiangqiLifecycleClient = TenantLifecycleClient<MiniXiangqiColor>;

export type DarkMiniXiangqiLifecycleRoom<
  Client extends DarkMiniXiangqiLifecycleClient = DarkMiniXiangqiLifecycleClient,
> = TenantLifecycleRoom<
  MiniXiangqiColor,
  MiniXiangqiMove,
  MiniXiangqiGameState,
  typeof DARK_MINI_XIANGQI_SPEC_ID,
  Client
>;

export type DarkMiniXiangqiLifecycleContext<
  Room extends DarkMiniXiangqiLifecycleRoom = DarkMiniXiangqiLifecycleRoom,
> = TenantLifecycleContext<
  MiniXiangqiColor,
  MiniXiangqiMove,
  MiniXiangqiGameState,
  typeof DARK_MINI_XIANGQI_SPEC_ID,
  Room
>;

export function clearDarkMiniXiangqiRuntimeTimers(room: DarkMiniXiangqiLifecycleRoom): void {
  clearTenantRuntimeTimers(room);
}

export function clearDarkMiniXiangqiAbortTimer(room: DarkMiniXiangqiLifecycleRoom): void {
  clearTenantAbortTimer(room);
}

export function clearDarkMiniXiangqiClockTimer(room: DarkMiniXiangqiLifecycleRoom): void {
  clearTenantClockTimer(room);
}

export function clearDarkMiniXiangqiForfeitTimer(room: DarkMiniXiangqiLifecycleRoom): void {
  clearTenantForfeitTimer(room);
}

export function scheduleDarkMiniXiangqiLifecycleTimers<Room extends DarkMiniXiangqiLifecycleRoom>(
  room: Room,
  ctx: DarkMiniXiangqiLifecycleContext<Room>,
): void {
  scheduleTenantLifecycleTimers(darkMiniXiangqiTenant, room, ctx);
}

export function darkMiniXiangqiAbortPhaseFor(
  room: DarkMiniXiangqiLifecycleRoom,
): `${MiniXiangqiColor}-1` | null {
  return tenantAbortPhaseFor(darkMiniXiangqiTenant, room);
}

export function darkMiniXiangqiForfeitingSeat(
  room: DarkMiniXiangqiLifecycleRoom,
): MiniXiangqiColor | null {
  return tenantForfeitingSeat(darkMiniXiangqiTenant, room);
}

export function darkMiniXiangqiConnectedSeats(
  clients: Iterable<DarkMiniXiangqiLifecycleClient>,
): Record<MiniXiangqiColor, boolean> {
  return tenantConnectedSeats(darkMiniXiangqiTenant, clients);
}
