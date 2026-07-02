/**
 * Dark Mini Xiangqi (7x7) live-room type aliases over the generic VariantTenant
 * runtime. A migrated variant carries no legacy export names, so this is types
 * only — the ws, factory, engine, rematch, routes, registration, export, and
 * golden-wire modules call the generic tenant* functions directly, bound to
 * darkMiniXiangqiTenant. DMX fog policy lives in dark-mini-xiangqi-tenant.ts.
 */

import type {
  DARK_MINI_XIANGQI_SPEC_ID,
  MiniXiangqiColor,
  MiniXiangqiGameState,
  MiniXiangqiMove,
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

export type DarkMiniXiangqiSpecId = typeof DARK_MINI_XIANGQI_SPEC_ID;
export type DarkMiniXiangqiSeat = TenantSeat<MiniXiangqiColor>;
export type DarkMiniXiangqiCreatorPreference = MiniXiangqiColor | 'random';
export type DarkMiniXiangqiClockState = TenantClockState<MiniXiangqiColor>;
export type DarkMiniXiangqiEvent = TenantRoomEvent<
  MiniXiangqiColor,
  MiniXiangqiMove,
  DarkMiniXiangqiSpecId
>;
export type DarkMiniXiangqiClientEvent = TenantClientEvent<
  MiniXiangqiColor,
  MiniXiangqiMove,
  DarkMiniXiangqiSpecId
>;
export type DarkMiniXiangqiProjection = TenantProjection<
  MiniXiangqiColor,
  MiniXiangqiGameState,
  DarkMiniXiangqiSpecId
>;
export type DarkMiniXiangqiSeatTokenState = TenantSeatTokenState<MiniXiangqiColor>;
export type DarkMiniXiangqiRuntimeRoom = TenantRuntimeRoom<
  'dark-mini-xiangqi',
  MiniXiangqiColor,
  MiniXiangqiMove,
  MiniXiangqiGameState,
  DarkMiniXiangqiSpecId
>;
export type DarkMiniXiangqiSnapshotClient = TenantSnapshotClient<MiniXiangqiColor>;
