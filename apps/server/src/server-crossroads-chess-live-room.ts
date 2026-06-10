import type { CrossroadsChessColor } from '@mistboard/game';
import type { WebSocket } from 'ws';
import type { CrossroadsChessRuntimeRoom } from './crossroads-chess-runtime.js';

// The live (connected) Crossroads Chess client + room shapes, in their own leaf module
// so the WS handler and any future rematch module can share the types without an
// import cycle (mirrors the DMX live-room leaf).
export type CrossroadsChessLiveClient = {
  displaced: boolean;
  id: string;
  messageTimestamps: number[];
  roomId: string;
  seat: CrossroadsChessColor;
  seatTokenHash?: string;
  socket: WebSocket;
  solo: false;
  userId?: string | null;
};

export type CrossroadsChessLiveRoom = Omit<CrossroadsChessRuntimeRoom, 'clients'> & {
  clients: Set<CrossroadsChessLiveClient>;
};
