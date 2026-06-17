/**
 * Reveal Chess live-room type aliases over the generic VariantTenant runtime. A
 * new variant carries no legacy export names, so this is types only — the ws,
 * factory, routes, and registration modules call the generic tenant* functions
 * directly, bound to revealChessTenant.
 */

import type {
  REVEAL_CHESS_SPEC_ID,
  RevealChessColor,
  RevealChessGameState,
  RevealChessMove,
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

export type RevealChessSpecId = typeof REVEAL_CHESS_SPEC_ID;
export type RevealChessTenantSeat = TenantSeat<RevealChessColor>;
export type RevealChessCreatorPreference = RevealChessColor | 'random';
export type RevealChessClockState = TenantClockState<RevealChessColor>;
export type RevealChessEvent = TenantRoomEvent<
  RevealChessColor,
  RevealChessMove,
  RevealChessSpecId
>;
export type RevealChessClientEvent = TenantClientEvent<
  RevealChessColor,
  RevealChessMove,
  RevealChessSpecId
>;
export type RevealChessProjection = TenantProjection<
  RevealChessColor,
  RevealChessGameState,
  RevealChessSpecId
>;
export type RevealChessRuntimeRoom = TenantRuntimeRoom<
  'reveal-chess',
  RevealChessColor,
  RevealChessMove,
  RevealChessGameState,
  RevealChessSpecId
>;
export type RevealChessSnapshotClient = TenantSnapshotClient<RevealChessColor>;
