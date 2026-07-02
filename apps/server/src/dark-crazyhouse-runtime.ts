/**
 * Dark Crazyhouse live-room type aliases over the generic VariantTenant runtime.
 * A migrated variant carries no legacy export names, so this is types only — the
 * ws, factory, routes, registration, and golden-wire modules call the generic
 * tenant* functions directly, bound to darkCrazyhouseTenant.
 */

import type {
  Color,
  CrazyhouseGameState,
  CrazyhouseMove,
  DARK_CRAZYHOUSE_SPEC_ID,
} from '@mistboard/game';
import type {
  TenantClientEvent,
  TenantClockState,
  TenantProjection,
  TenantRoomEvent,
  TenantRuntimeRoom,
  TenantSeat,
  TenantSnapshotClient,
} from './variant-tenant/tenant.js';

export type DarkCrazyhouseSpecId = typeof DARK_CRAZYHOUSE_SPEC_ID;
export type DarkCrazyhouseSeat = TenantSeat<Color>;
export type DarkCrazyhouseCreatorPreference = Color | 'random';
export type DarkCrazyhouseClockState = TenantClockState<Color>;
export type DarkCrazyhouseEvent = TenantRoomEvent<Color, CrazyhouseMove, DarkCrazyhouseSpecId>;
export type DarkCrazyhouseClientEvent = TenantClientEvent<
  Color,
  CrazyhouseMove,
  DarkCrazyhouseSpecId
>;
export type DarkCrazyhouseProjection = TenantProjection<
  Color,
  CrazyhouseGameState,
  DarkCrazyhouseSpecId
>;
export type DarkCrazyhouseRuntimeRoom = TenantRuntimeRoom<
  'dark-crazyhouse',
  Color,
  CrazyhouseMove,
  CrazyhouseGameState,
  DarkCrazyhouseSpecId
>;
export type DarkCrazyhouseSnapshotClient = TenantSnapshotClient<Color>;
