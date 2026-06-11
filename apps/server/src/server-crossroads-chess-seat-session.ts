/**
 * Thin adapter over the generic tenant seat session
 * (variant-tenant/seat-session.ts) for Crossroads Chess.
 */

import type { CrossroadsChessColor } from '@mistboard/game';
import type { CrossroadsChessSeatTokenState } from './crossroads-chess-runtime.js';
import { crossroadsChessTenant } from './crossroads-chess-tenant.js';
import type { UserAccount } from './persistence.js';
import {
  assignTenantSeat,
  displaceOlderTenantSeatClients,
  mintTenantSeatToken,
  rollbackTenantSeatAssignment,
  type TenantSeatAssignment,
  type TenantSeatClient,
  type TenantSeatRoom,
} from './variant-tenant/seat-session.js';

export type CrossroadsChessSeatClient = TenantSeatClient<CrossroadsChessColor>;

export type CrossroadsChessSeatRoom<
  Client extends CrossroadsChessSeatClient = CrossroadsChessSeatClient,
> = TenantSeatRoom<CrossroadsChessColor, Client>;

export type CrossroadsChessSeatAssignment = TenantSeatAssignment<CrossroadsChessColor>;

export function assignCrossroadsChessSeat(
  room: CrossroadsChessSeatRoom,
  clientId: string,
  rawToken: string | undefined,
  accountUser: UserAccount | null,
): CrossroadsChessSeatAssignment {
  return assignTenantSeat(crossroadsChessTenant, room, clientId, rawToken, accountUser);
}

// Pre-issue a fresh seat token for a chosen seat (rematch finalize reserves the
// swapped-color seats on the new room before either player connects).
export function mintCrossroadsChessSeatToken(
  room: Pick<CrossroadsChessSeatRoom, 'seatTokens'>,
  seat: CrossroadsChessColor,
  identity: { userId: string | null; userHandle: string | null; userDisplayName: string | null },
): { rawToken: string; state: CrossroadsChessSeatTokenState } {
  return mintTenantSeatToken(room, seat, identity);
}

export function rollbackCrossroadsChessSeatAssignment(
  room: CrossroadsChessSeatRoom,
  assignment: Extract<CrossroadsChessSeatAssignment, { ok: true }>,
): void {
  rollbackTenantSeatAssignment(room, assignment);
}

export function displaceOlderCrossroadsChessSeatClients<Client extends CrossroadsChessSeatClient>(
  room: CrossroadsChessSeatRoom<Client>,
  newest: Client,
): void {
  displaceOlderTenantSeatClients(room, newest);
}
