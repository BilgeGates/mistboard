/**
 * Thin adapter over the generic tenant lifecycle timers
 * (variant-tenant/lifecycle.ts) for hidden Kriegspiel.
 */

import type { Color, KRIEGSPIEL_SPEC_ID, KriegspielGameState } from '@mistboard/game';
import { type KriegspielWireMove, kriegspielTenant } from './kriegspiel-tenant.js';
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

export type KriegspielLifecycleClient = TenantLifecycleClient<Color>;

export type KriegspielLifecycleRoom<
  Client extends KriegspielLifecycleClient = KriegspielLifecycleClient,
> = TenantLifecycleRoom<
  Color,
  KriegspielWireMove,
  KriegspielGameState,
  typeof KRIEGSPIEL_SPEC_ID,
  Client
>;

export type KriegspielLifecycleContext<
  Room extends KriegspielLifecycleRoom = KriegspielLifecycleRoom,
> = TenantLifecycleContext<
  Color,
  KriegspielWireMove,
  KriegspielGameState,
  typeof KRIEGSPIEL_SPEC_ID,
  Room
>;

export function clearKriegspielRuntimeTimers(room: KriegspielLifecycleRoom): void {
  clearTenantRuntimeTimers(room);
}

export function clearKriegspielAbortTimer(room: KriegspielLifecycleRoom): void {
  clearTenantAbortTimer(room);
}

export function clearKriegspielClockTimer(room: KriegspielLifecycleRoom): void {
  clearTenantClockTimer(room);
}

export function clearKriegspielForfeitTimer(room: KriegspielLifecycleRoom): void {
  clearTenantForfeitTimer(room);
}

export function scheduleKriegspielLifecycleTimers<Room extends KriegspielLifecycleRoom>(
  room: Room,
  ctx: KriegspielLifecycleContext<Room>,
): void {
  scheduleTenantLifecycleTimers(kriegspielTenant, room, ctx);
}

export function kriegspielAbortPhaseFor(room: KriegspielLifecycleRoom): `${Color}-1` | null {
  return tenantAbortPhaseFor(kriegspielTenant, room);
}

export function kriegspielForfeitingSeat(room: KriegspielLifecycleRoom): Color | null {
  return tenantForfeitingSeat(kriegspielTenant, room);
}

export function kriegspielConnectedSeats(
  clients: Iterable<KriegspielLifecycleClient>,
): Record<Color, boolean> {
  return tenantConnectedSeats(kriegspielTenant, clients);
}
