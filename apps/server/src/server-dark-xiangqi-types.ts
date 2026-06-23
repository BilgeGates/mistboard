import type { XiangqiColor } from '@mistboard/game';
import type { DarkXiangqiRuntimeRoom } from './dark-xiangqi-runtime.js';
import type { TenantLiveClient } from './variant-tenant/ws.js';

export type DarkXiangqiLiveClient = TenantLiveClient<XiangqiColor>;

export type DarkXiangqiLiveRoom = Omit<DarkXiangqiRuntimeRoom, 'clients'> & {
  clients: Set<DarkXiangqiLiveClient>;
};
