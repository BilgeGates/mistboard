/**
 * Jungle live-room type aliases over the generic VariantTenant runtime. A new
 * variant carries no legacy export names, so this is types only — the ws, factory,
 * routes, and registration modules call the generic tenant* helpers directly,
 * bound to jungleTenant.
 *
 * The tenant's C is the COLOUR/seat (JungleColor = 'red' | 'black'); red is the
 * first mover and owns the red pieces — unlike banqi, the seat and the piece
 * colour are the same axis (Jungle has no flip).
 */

import type { JUNGLE_SPEC_ID, JungleColor, JungleGameState, JungleMove } from '@mistboard/game';
import type {
  TenantClientEvent,
  TenantClockState,
  TenantProjection,
  TenantRoomEvent,
  TenantRuntimeRoom,
  TenantSeat,
  TenantSnapshotClient,
} from './variant-tenant/tenant.js';

export type JungleSpecId = typeof JUNGLE_SPEC_ID;
export type JungleTenantSeat = TenantSeat<JungleColor>;
export type JungleCreatorPreference = JungleColor | 'random';
export type JungleClockState = TenantClockState<JungleColor>;
export type JungleEvent = TenantRoomEvent<JungleColor, JungleMove, JungleSpecId>;
export type JungleClientEvent = TenantClientEvent<JungleColor, JungleMove, JungleSpecId>;
export type JungleProjection = TenantProjection<JungleColor, JungleGameState, JungleSpecId>;
export type JungleRuntimeRoom = TenantRuntimeRoom<
  'jungle',
  JungleColor,
  JungleMove,
  JungleGameState,
  JungleSpecId
>;
export type JungleSnapshotClient = TenantSnapshotClient<JungleColor>;
