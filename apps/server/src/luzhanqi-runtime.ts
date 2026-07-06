import type {
  LUZHANQI_SPEC_ID,
  LuzhanqiColor,
  LuzhanqiGameState,
  LuzhanqiMove,
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

export type LuzhanqiSpecId = typeof LUZHANQI_SPEC_ID;
export type LuzhanqiTenantSeat = TenantSeat<LuzhanqiColor>;
export type LuzhanqiCreatorPreference = LuzhanqiColor | 'random';
export type LuzhanqiClockState = TenantClockState<LuzhanqiColor>;
export type LuzhanqiEvent = TenantRoomEvent<LuzhanqiColor, LuzhanqiMove, LuzhanqiSpecId>;
export type LuzhanqiClientEvent = TenantClientEvent<LuzhanqiColor, LuzhanqiMove, LuzhanqiSpecId>;
export type LuzhanqiProjection = TenantProjection<LuzhanqiColor, LuzhanqiGameState, LuzhanqiSpecId>;
export type LuzhanqiRuntimeRoom = TenantRuntimeRoom<
  'luzhanqi',
  LuzhanqiColor,
  LuzhanqiMove,
  LuzhanqiGameState,
  LuzhanqiSpecId
>;
export type LuzhanqiSnapshotClient = TenantSnapshotClient<LuzhanqiColor>;
