import type { MiniXiangqiColor } from '@mistboard/game';
import type { WebSocket } from 'ws';
import type { DarkMiniXiangqiRuntimeRoom } from './dark-mini-xiangqi-runtime.js';

// The live (connected) Dark Mini Xiangqi client + room shapes. Kept in their own
// leaf module so both the WS handler (server-ws-dark-mini-xiangqi.ts) and the
// rematch module (server-dark-mini-xiangqi-rematch.ts) can depend on the types
// without forming an import cycle — the WS handler imports the rematch functions,
// so the rematch module must not import back from it.
export type DarkMiniXiangqiLiveClient = {
  debugRequested: false;
  displaced: boolean;
  id: string;
  messageTimestamps: number[];
  roomId: string;
  seat: MiniXiangqiColor;
  seatTokenHash?: string;
  socket: WebSocket;
  solo: false;
  userId?: string | null;
};

export type DarkMiniXiangqiLiveRoom = Omit<DarkMiniXiangqiRuntimeRoom, 'clients'> & {
  clients: Set<DarkMiniXiangqiLiveClient>;
};
