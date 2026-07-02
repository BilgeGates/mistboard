/**
 * Kriegspiel live-room type aliases over the generic VariantTenant runtime. A
 * migrated variant carries no legacy export names, so this is types only — the
 * ws, factory, routes, registration, and golden-wire modules call the generic
 * tenant* functions directly, bound to kriegspielTenant.
 */

import type { Color, KRIEGSPIEL_SPEC_ID, KriegspielGameState } from '@mistboard/game';
import type { KriegspielWireMove } from './kriegspiel-tenant.js';
import type {
  TenantClientEvent,
  TenantClockState,
  TenantProjection,
  TenantRoomEvent,
  TenantRuntimeRoom,
  TenantSeat,
  TenantSnapshotClient,
} from './variant-tenant/tenant.js';

export type KriegspielSpecId = typeof KRIEGSPIEL_SPEC_ID;
export type KriegspielSeat = TenantSeat<Color>;
export type KriegspielCreatorPreference = Color | 'random';
export type KriegspielClockState = TenantClockState<Color>;
export type KriegspielEvent = TenantRoomEvent<Color, KriegspielWireMove, KriegspielSpecId>;
export type KriegspielClientEvent = TenantClientEvent<Color, KriegspielWireMove, KriegspielSpecId>;
export type KriegspielProjection = TenantProjection<Color, KriegspielGameState, KriegspielSpecId>;
export type KriegspielRuntimeRoom = TenantRuntimeRoom<
  'kriegspiel',
  Color,
  KriegspielWireMove,
  KriegspielGameState,
  KriegspielSpecId
>;
export type KriegspielSnapshotClient = TenantSnapshotClient<Color>;
