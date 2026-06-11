import type {
  CrossroadsChessColor,
  CrossroadsChessGameState,
  CrossroadsChessMove,
} from '@mistboard/game';
import type { CrossroadsChessSpecId } from './crossroads-chess-tenant.js';
import type { TenantLiveClient, TenantLiveRoom } from './variant-tenant/ws.js';

// The live (connected) Crossroads Chess client + room shapes, in their own leaf module
// so the WS handler and the rematch module can share the types without an
// import cycle (mirrors the DMX live-room leaf).
export type CrossroadsChessLiveClient = TenantLiveClient<CrossroadsChessColor>;

export type CrossroadsChessLiveRoom = TenantLiveRoom<
  'crossroads-chess',
  CrossroadsChessColor,
  CrossroadsChessMove,
  CrossroadsChessGameState,
  CrossroadsChessSpecId
>;
