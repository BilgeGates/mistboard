import type { XiangqiColor } from '@mistboard/game';
import type { TenantLiveClient } from './variant-tenant/ws.js';
import type { XiangqiRuntimeRoom } from './xiangqi-runtime.js';

export type XiangqiLiveClient = TenantLiveClient<XiangqiColor>;

export type XiangqiLiveRoom = Omit<XiangqiRuntimeRoom, 'clients'> & {
  clients: Set<XiangqiLiveClient>;
};
