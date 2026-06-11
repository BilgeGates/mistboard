/**
 * Thin adapter over the generic tenant seat session
 * (variant-tenant/seat-session.ts) for hidden Dark Xiangqi.
 */

import type { XiangqiColor } from '@mistboard/game';
import { darkXiangqiTenant } from './dark-xiangqi-tenant.js';
import type { UserAccount } from './persistence.js';
import {
  assignTenantSeat,
  displaceOlderTenantSeatClients,
  rollbackTenantSeatAssignment,
  type TenantSeatAssignment,
  type TenantSeatClient,
  type TenantSeatRoom,
} from './variant-tenant/seat-session.js';

export type DarkXiangqiSeatClient = TenantSeatClient<XiangqiColor>;

export type DarkXiangqiSeatRoom<Client extends DarkXiangqiSeatClient = DarkXiangqiSeatClient> =
  TenantSeatRoom<XiangqiColor, Client>;

export type DarkXiangqiSeatAssignment = TenantSeatAssignment<XiangqiColor>;

export function assignDarkXiangqiSeat(
  room: DarkXiangqiSeatRoom,
  clientId: string,
  rawToken: string | undefined,
  accountUser: UserAccount | null,
): DarkXiangqiSeatAssignment {
  return assignTenantSeat(darkXiangqiTenant, room, clientId, rawToken, accountUser);
}

export function rollbackDarkXiangqiSeatAssignment(
  room: DarkXiangqiSeatRoom,
  assignment: Extract<DarkXiangqiSeatAssignment, { ok: true }>,
): void {
  rollbackTenantSeatAssignment(room, assignment);
}

export function displaceOlderDarkXiangqiSeatClients<Client extends DarkXiangqiSeatClient>(
  room: DarkXiangqiSeatRoom<Client>,
  newest: Client,
): void {
  displaceOlderTenantSeatClients(room, newest);
}
