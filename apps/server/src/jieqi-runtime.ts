/**
 * Jieqi live-room type aliases over the generic VariantTenant runtime. A new
 * variant carries no legacy export names, so this is types only — the ws,
 * factory, routes, and registration modules call the generic tenant* functions
 * directly, bound to jieqiTenant.
 */

import type { JIEQI_SPEC_ID, JieqiColor, JieqiGameState, JieqiMove } from '@mistboard/game';
import type {
  TenantClientEvent,
  TenantClockState,
  TenantProjection,
  TenantRoomEvent,
  TenantRuntimeRoom,
  TenantSeat,
  TenantSnapshotClient,
} from './variant-tenant/tenant.js';

export type JieqiSpecId = typeof JIEQI_SPEC_ID;
export type JieqiSeat = TenantSeat<JieqiColor>;
export type JieqiCreatorPreference = JieqiColor | 'random';
export type JieqiClockState = TenantClockState<JieqiColor>;
export type JieqiEvent = TenantRoomEvent<JieqiColor, JieqiMove, JieqiSpecId>;
export type JieqiClientEvent = TenantClientEvent<JieqiColor, JieqiMove, JieqiSpecId>;
export type JieqiProjection = TenantProjection<JieqiColor, JieqiGameState, JieqiSpecId>;
export type JieqiRuntimeRoom = TenantRuntimeRoom<
  'jieqi',
  JieqiColor,
  JieqiMove,
  JieqiGameState,
  JieqiSpecId
>;
export type JieqiSnapshotClient = TenantSnapshotClient<JieqiColor>;
