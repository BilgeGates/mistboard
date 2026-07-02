/**
 * Crossroads Chess live-room type aliases over the generic VariantTenant
 * runtime. A migrated variant carries no legacy export names, so this is types
 * only — the ws, factory, engine, rematch, routes, registration, and
 * golden-wire modules call the generic tenant* functions directly, bound to
 * crossroadsChessTenant.
 */

import type {
  CrossroadsChessColor,
  CrossroadsChessGameState,
  CrossroadsChessMove,
} from '@mistboard/game';
// The spec id is a union (includes the legacy 'dual-chess' alias), so it is
// owned by the tenant and reused here rather than re-derived from one literal.
import type { CrossroadsChessSpecId } from './crossroads-chess-tenant.js';
import type {
  TenantClientEvent,
  TenantClockState,
  TenantProjection,
  TenantRoomEvent,
  TenantRuntimeRoom,
  TenantSeat,
  TenantSeatTokenState,
  TenantSnapshotClient,
} from './variant-tenant/tenant.js';

export type CrossroadsChessSeat = TenantSeat<CrossroadsChessColor>;
export type CrossroadsChessCreatorPreference = CrossroadsChessColor | 'random';
export type CrossroadsChessClockState = TenantClockState<CrossroadsChessColor>;
export type CrossroadsChessEvent = TenantRoomEvent<
  CrossroadsChessColor,
  CrossroadsChessMove,
  CrossroadsChessSpecId
>;
export type CrossroadsChessClientEvent = TenantClientEvent<
  CrossroadsChessColor,
  CrossroadsChessMove,
  CrossroadsChessSpecId
>;
export type CrossroadsChessProjection = TenantProjection<
  CrossroadsChessColor,
  CrossroadsChessGameState,
  CrossroadsChessSpecId
>;
export type CrossroadsChessSeatTokenState = TenantSeatTokenState<CrossroadsChessColor>;
export type CrossroadsChessRuntimeRoom = TenantRuntimeRoom<
  'crossroads-chess',
  CrossroadsChessColor,
  CrossroadsChessMove,
  CrossroadsChessGameState,
  CrossroadsChessSpecId
>;
export type CrossroadsChessSnapshotClient = TenantSnapshotClient<CrossroadsChessColor>;
