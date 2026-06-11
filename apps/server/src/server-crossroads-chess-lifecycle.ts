/**
 * Thin adapter over the generic tenant lifecycle timers
 * (variant-tenant/lifecycle.ts) for Crossroads Chess.
 *
 * The pre-migration client type admits spectators (the runtime room's client
 * set is mixed), while the generic lifecycle client is color-seated. The casts
 * below are safe because the generic connected-seat accounting only ever reads
 * the tenant's two color keys — a spectator entry adds an unread key, exactly
 * matching the old "ignore spectators" behavior. The exported
 * crossroadsChessConnectedSeats filters spectators first so its return shape
 * stays the pre-migration {white, red} record.
 */

import type {
  CrossroadsChessColor,
  CrossroadsChessGameState,
  CrossroadsChessMove,
} from '@mistboard/game';
import type {
  CrossroadsChessEvent,
  CrossroadsChessRuntimeRoom,
  CrossroadsChessSeat,
} from './crossroads-chess-runtime.js';
import { type CrossroadsChessSpecId, crossroadsChessTenant } from './crossroads-chess-tenant.js';
import {
  clearTenantAbortTimer,
  clearTenantClockTimer,
  clearTenantForfeitTimer,
  clearTenantRuntimeTimers,
  scheduleTenantLifecycleTimers,
  type TenantLifecycleContext,
  type TenantLifecycleRoom,
  tenantAbortPhaseFor,
  tenantConnectedSeats,
  tenantForfeitingSeat,
} from './variant-tenant/lifecycle.js';

// Seat may be a spectator (the runtime room's client set is mixed); connected-seat
// accounting ignores spectators.
export type CrossroadsChessLifecycleClient = { displaced: boolean; seat: CrossroadsChessSeat };

export type CrossroadsChessLifecycleRoom<
  Client extends CrossroadsChessLifecycleClient = CrossroadsChessLifecycleClient,
> = Omit<CrossroadsChessRuntimeRoom, 'clients'> & { clients: Iterable<Client> };

export type CrossroadsChessLifecycleContext<
  Room extends CrossroadsChessLifecycleRoom = CrossroadsChessLifecycleRoom,
> = {
  appendEvent(room: Room, event: CrossroadsChessEvent): Promise<number>;
  broadcastEventAppended(room: Room, event: CrossroadsChessEvent, seq: number): void;
  logTimerFailure?(kind: 'abort' | 'clock' | 'forfeit', roomId: string, err: Error): void;
  now?(): number;
};

type GenericLifecycleRoom = TenantLifecycleRoom<
  CrossroadsChessColor,
  CrossroadsChessMove,
  CrossroadsChessGameState,
  CrossroadsChessSpecId
>;
type GenericLifecycleContext = TenantLifecycleContext<
  CrossroadsChessColor,
  CrossroadsChessMove,
  CrossroadsChessGameState,
  CrossroadsChessSpecId
>;

export function clearCrossroadsChessRuntimeTimers(room: CrossroadsChessLifecycleRoom): void {
  clearTenantRuntimeTimers(room);
}

export function clearCrossroadsChessAbortTimer(room: CrossroadsChessLifecycleRoom): void {
  clearTenantAbortTimer(room);
}

export function clearCrossroadsChessClockTimer(room: CrossroadsChessLifecycleRoom): void {
  clearTenantClockTimer(room);
}

export function clearCrossroadsChessEngineTimer(room: CrossroadsChessLifecycleRoom): void {
  if (room.engineTimer) clearTimeout(room.engineTimer);
  room.engineTimer = null;
}

export function clearCrossroadsChessForfeitTimer(room: CrossroadsChessLifecycleRoom): void {
  clearTenantForfeitTimer(room);
}

export function scheduleCrossroadsChessLifecycleTimers<Room extends CrossroadsChessLifecycleRoom>(
  room: Room,
  ctx: CrossroadsChessLifecycleContext<Room>,
): void {
  scheduleTenantLifecycleTimers(
    crossroadsChessTenant,
    room as unknown as GenericLifecycleRoom,
    ctx as unknown as GenericLifecycleContext,
  );
}

export function crossroadsChessAbortPhaseFor(
  room: CrossroadsChessLifecycleRoom,
): `${CrossroadsChessColor}-1` | null {
  return tenantAbortPhaseFor(crossroadsChessTenant, room as unknown as GenericLifecycleRoom);
}

export function crossroadsChessForfeitingSeat(
  room: CrossroadsChessLifecycleRoom,
): CrossroadsChessColor | null {
  return tenantForfeitingSeat(crossroadsChessTenant, room as unknown as GenericLifecycleRoom);
}

export function crossroadsChessConnectedSeats(
  clients: Iterable<CrossroadsChessLifecycleClient>,
): Record<CrossroadsChessColor, boolean> {
  const seated = [...clients].filter(
    (client): client is { displaced: boolean; seat: CrossroadsChessColor } =>
      client.seat !== 'spectator',
  );
  return tenantConnectedSeats(crossroadsChessTenant, seated);
}
