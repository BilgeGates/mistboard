import type {
  DARK_MINI_XIANGQI_SPEC_ID,
  MiniXiangqiColor,
  MiniXiangqiGameState,
  MiniXiangqiMove,
} from '@mistboard/game';
import type { TenantLiveClient, TenantLiveRoom } from './variant-tenant/ws.js';

// The live (connected) Dark Mini Xiangqi client + room shapes. Kept in their own
// leaf module so both the WS handler (server-ws-dark-mini-xiangqi.ts) and the
// rematch module (server-dark-mini-xiangqi-rematch.ts) can depend on the types
// without forming an import cycle — the WS handler imports the rematch functions,
// so the rematch module must not import back from it.
export type DarkMiniXiangqiLiveClient = TenantLiveClient<MiniXiangqiColor>;

export type DarkMiniXiangqiLiveRoom = TenantLiveRoom<
  'dark-mini-xiangqi',
  MiniXiangqiColor,
  MiniXiangqiMove,
  MiniXiangqiGameState,
  typeof DARK_MINI_XIANGQI_SPEC_ID
>;
