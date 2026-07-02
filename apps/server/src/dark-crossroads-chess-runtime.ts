/**
 * Dark Crossroads Chess (6x8) live-room type aliases over the generic
 * VariantTenant runtime. A migrated variant carries no legacy export names, so
 * this is types only — the ws, factory, routes, registration, and golden-wire
 * modules call the generic tenant* functions directly, bound to
 * darkCrossroadsChessTenant.
 */

import type {
  CrossroadsChessColor,
  CrossroadsChessGameState,
  CrossroadsChessMove,
  DARK_CROSSROADS_CHESS_SPEC_ID,
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

export type DarkCrossroadsChessSpecId = typeof DARK_CROSSROADS_CHESS_SPEC_ID;
export type DarkCrossroadsChessSeat = TenantSeat<CrossroadsChessColor>;
export type DarkCrossroadsChessCreatorPreference = CrossroadsChessColor | 'random';
export type DarkCrossroadsChessClockState = TenantClockState<CrossroadsChessColor>;
export type DarkCrossroadsChessEvent = TenantRoomEvent<
  CrossroadsChessColor,
  CrossroadsChessMove,
  DarkCrossroadsChessSpecId
>;
export type DarkCrossroadsChessClientEvent = TenantClientEvent<
  CrossroadsChessColor,
  CrossroadsChessMove,
  DarkCrossroadsChessSpecId
>;
export type DarkCrossroadsChessProjection = TenantProjection<
  CrossroadsChessColor,
  CrossroadsChessGameState,
  DarkCrossroadsChessSpecId
>;
export type DarkCrossroadsChessRuntimeRoom = TenantRuntimeRoom<
  'dark-crossroads-chess',
  CrossroadsChessColor,
  CrossroadsChessMove,
  CrossroadsChessGameState,
  DarkCrossroadsChessSpecId
>;
export type DarkCrossroadsChessSnapshotClient = TenantSnapshotClient<CrossroadsChessColor>;
