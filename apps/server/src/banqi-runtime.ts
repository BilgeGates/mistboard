/**
 * Banqi live-room type aliases over the generic VariantTenant runtime. A new
 * variant carries no legacy export names, so this is types only — the ws,
 * factory, routes, and registration modules call the generic tenant* functions
 * directly, bound to banqiTenant.
 *
 * The tenant's C is the SEAT (BanqiSeat = 'first' | 'second'), not the piece ink
 * (BanqiColor). Seats are stable from seat-assignment; the first seat's ink binds
 * on its opening flip and travels on the wire as the view's `firstColor`.
 */

import type { BANQI_SPEC_ID, BanqiGameState, BanqiMove, BanqiSeat } from '@mistboard/game';
import type {
  TenantClientEvent,
  TenantClockState,
  TenantProjection,
  TenantRoomEvent,
  TenantRuntimeRoom,
  TenantSeat,
  TenantSnapshotClient,
} from './variant-tenant/tenant.js';

export type BanqiSpecId = typeof BANQI_SPEC_ID;
export type BanqiTenantSeat = TenantSeat<BanqiSeat>;
export type BanqiCreatorPreference = BanqiSeat | 'random';
export type BanqiClockState = TenantClockState<BanqiSeat>;
export type BanqiEvent = TenantRoomEvent<BanqiSeat, BanqiMove, BanqiSpecId>;
export type BanqiClientEvent = TenantClientEvent<BanqiSeat, BanqiMove, BanqiSpecId>;
export type BanqiProjection = TenantProjection<BanqiSeat, BanqiGameState, BanqiSpecId>;
export type BanqiRuntimeRoom = TenantRuntimeRoom<
  'banqi',
  BanqiSeat,
  BanqiMove,
  BanqiGameState,
  BanqiSpecId
>;
export type BanqiSnapshotClient = TenantSnapshotClient<BanqiSeat>;
