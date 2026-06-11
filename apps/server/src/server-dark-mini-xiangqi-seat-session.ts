/**
 * Thin adapter over the generic tenant seat session
 * (variant-tenant/seat-session.ts) for Dark Mini Xiangqi.
 */

import type { MiniXiangqiColor } from '@mistboard/game';
import type { DarkMiniXiangqiSeatTokenState } from './dark-mini-xiangqi-runtime.js';
import { darkMiniXiangqiTenant } from './dark-mini-xiangqi-tenant.js';
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

export type DarkMiniXiangqiSeatClient = TenantSeatClient<MiniXiangqiColor>;

export type DarkMiniXiangqiSeatRoom<
  Client extends DarkMiniXiangqiSeatClient = DarkMiniXiangqiSeatClient,
> = TenantSeatRoom<MiniXiangqiColor, Client>;

export type DarkMiniXiangqiSeatAssignment = TenantSeatAssignment<MiniXiangqiColor>;

export function assignDarkMiniXiangqiSeat(
  room: DarkMiniXiangqiSeatRoom,
  clientId: string,
  rawToken: string | undefined,
  accountUser: UserAccount | null,
): DarkMiniXiangqiSeatAssignment {
  return assignTenantSeat(darkMiniXiangqiTenant, room, clientId, rawToken, accountUser);
}

export function mintDarkMiniXiangqiSeatToken(
  room: Pick<DarkMiniXiangqiSeatRoom, 'seatTokens'>,
  seat: MiniXiangqiColor,
  identity: { userId: string | null; userHandle: string | null; userDisplayName: string | null },
): { rawToken: string; state: DarkMiniXiangqiSeatTokenState } {
  return mintTenantSeatToken(room, seat, identity);
}

export function rollbackDarkMiniXiangqiSeatAssignment(
  room: DarkMiniXiangqiSeatRoom,
  assignment: Extract<DarkMiniXiangqiSeatAssignment, { ok: true }>,
): void {
  rollbackTenantSeatAssignment(room, assignment);
}

export function displaceOlderDarkMiniXiangqiSeatClients<Client extends DarkMiniXiangqiSeatClient>(
  room: DarkMiniXiangqiSeatRoom<Client>,
  newest: Client,
): void {
  displaceOlderTenantSeatClients(room, newest);
}
