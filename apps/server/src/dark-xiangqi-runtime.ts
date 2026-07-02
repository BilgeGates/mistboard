/**
 * Dark Xiangqi (9x10) live-room type aliases over the generic VariantTenant
 * runtime. A migrated variant carries no legacy export names, so this is types
 * only — the ws, factory, engine, routes, registration, and golden-wire modules
 * call the generic tenant* functions directly, bound to darkXiangqiTenant.
 */

import type {
  DARK_XIANGQI_SPEC_ID,
  XiangqiColor,
  XiangqiGameState,
  XiangqiMove,
} from '@mistboard/game';
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

export type DarkXiangqiSpecId = typeof DARK_XIANGQI_SPEC_ID;
export type DarkXiangqiSeat = TenantSeat<XiangqiColor>;
export type DarkXiangqiCreatorPreference = XiangqiColor | 'random';
export type DarkXiangqiClockState = TenantClockState<XiangqiColor>;
export type DarkXiangqiEvent = TenantRoomEvent<XiangqiColor, XiangqiMove, DarkXiangqiSpecId>;
export type DarkXiangqiClientEvent = TenantClientEvent<
  XiangqiColor,
  XiangqiMove,
  DarkXiangqiSpecId
>;
export type DarkXiangqiProjection = TenantProjection<
  XiangqiColor,
  XiangqiGameState,
  DarkXiangqiSpecId
>;
export type DarkXiangqiSeatTokenState = TenantSeatTokenState<XiangqiColor>;
export type DarkXiangqiRuntimeRoom = TenantRuntimeRoom<
  'dark-xiangqi',
  XiangqiColor,
  XiangqiMove,
  XiangqiGameState,
  DarkXiangqiSpecId
>;
export type DarkXiangqiSnapshotClient = TenantSnapshotClient<XiangqiColor>;
