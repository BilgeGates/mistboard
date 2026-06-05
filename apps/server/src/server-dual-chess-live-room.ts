import type { DualChessColor } from '@mistboard/game';
import type { WebSocket } from 'ws';
import type { DualChessRuntimeRoom } from './dual-chess-runtime.js';

// The live (connected) Dual Chess client + room shapes, in their own leaf module
// so the WS handler and any future rematch module can share the types without an
// import cycle (mirrors the DMX live-room leaf).
export type DualChessLiveClient = {
  displaced: boolean;
  id: string;
  messageTimestamps: number[];
  roomId: string;
  seat: DualChessColor;
  seatTokenHash?: string;
  socket: WebSocket;
  solo: false;
  userId?: string | null;
};

export type DualChessLiveRoom = Omit<DualChessRuntimeRoom, 'clients'> & {
  clients: Set<DualChessLiveClient>;
};
