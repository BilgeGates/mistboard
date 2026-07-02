/**
 * Dark Shogi live-room type aliases over the generic VariantTenant runtime. A
 * migrated variant carries no legacy export names, so this is types only — the
 * ws, factory, routes, registration, and golden-wire modules call the generic
 * tenant* functions directly, bound to darkShogiTenant.
 */

import type { DARK_SHOGI_SPEC_ID, ShogiColor, ShogiGameState, ShogiMove } from '@mistboard/game';
import type {
  TenantClientEvent,
  TenantClockState,
  TenantProjection,
  TenantRoomEvent,
  TenantRuntimeRoom,
  TenantSeat,
  TenantSnapshotClient,
} from './variant-tenant/tenant.js';

export type DarkShogiSpecId = typeof DARK_SHOGI_SPEC_ID;
export type DarkShogiSeat = TenantSeat<ShogiColor>;
export type DarkShogiCreatorPreference = ShogiColor | 'random';
export type DarkShogiClockState = TenantClockState<ShogiColor>;
export type DarkShogiEvent = TenantRoomEvent<ShogiColor, ShogiMove, DarkShogiSpecId>;
export type DarkShogiClientEvent = TenantClientEvent<ShogiColor, ShogiMove, DarkShogiSpecId>;
export type DarkShogiProjection = TenantProjection<ShogiColor, ShogiGameState, DarkShogiSpecId>;
export type DarkShogiRuntimeRoom = TenantRuntimeRoom<
  'dark-shogi',
  ShogiColor,
  ShogiMove,
  ShogiGameState,
  DarkShogiSpecId
>;
export type DarkShogiSnapshotClient = TenantSnapshotClient<ShogiColor>;
