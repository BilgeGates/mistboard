/**
 * Standard Xiangqi (9x10, open information) live-room type aliases over the
 * generic VariantTenant runtime. Types only — the ws, factory, routes,
 * registration, and tenant modules call the generic tenant* functions directly,
 * bound to xiangqiTenant.
 */

import type { XIANGQI_SPEC_ID, XiangqiColor, XiangqiGameState, XiangqiMove } from '@mistboard/game';
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

export type XiangqiSpecId = typeof XIANGQI_SPEC_ID;
export type XiangqiSeat = TenantSeat<XiangqiColor>;
export type XiangqiCreatorPreference = XiangqiColor | 'random';
export type XiangqiClockState = TenantClockState<XiangqiColor>;
export type XiangqiEvent = TenantRoomEvent<XiangqiColor, XiangqiMove, XiangqiSpecId>;
export type XiangqiClientEvent = TenantClientEvent<XiangqiColor, XiangqiMove, XiangqiSpecId>;
export type XiangqiProjection = TenantProjection<XiangqiColor, XiangqiGameState, XiangqiSpecId>;
export type XiangqiSeatTokenState = TenantSeatTokenState<XiangqiColor>;
export type XiangqiRuntimeRoom = TenantRuntimeRoom<
  'xiangqi',
  XiangqiColor,
  XiangqiMove,
  XiangqiGameState,
  XiangqiSpecId
>;
export type XiangqiSnapshotClient = TenantSnapshotClient<XiangqiColor>;
