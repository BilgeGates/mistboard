import { WebSocket } from 'ws';
import type { Color, GameEvent, GameProjection, RoomTimeControl } from '@mistboard/game';
import type { GameMode } from './persistence.js';
import type { Seat } from './payloads.js';

export type Client = {
  debugRequested: boolean;
  devViews: boolean;
  id: string;
  messageTimestamps: number[];
  socket: WebSocket;
  roomId: string;
  seat: Seat;
  seatTokenHash?: string;
  displaced: boolean;
  solo: boolean;
};

export type SeatTokenState = {
  clientId: string;
  seat: Color;
  tokenHash: string;
  userId: string | null;
  userHandle: string | null;
  userDisplayName: string | null;
  issuedAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
};

export type SeatAssignment = {
  seat: Seat;
  seatToken?: string;
  seatTokenHash?: string;
};

export type Room = {
  id: string;
  clients: Set<Client>;
  events: GameEvent[];
  projection: GameProjection;
  seatTokens: Partial<Record<Color, SeatTokenState>>;
  clockTimer: ReturnType<typeof setTimeout> | null;
  engineTimer: ReturnType<typeof setTimeout> | null;
  mode: GameMode;
  rated: boolean;
  randomEngine: boolean;
  randomSeating: boolean;
  pveEngineId: string | null;
  pendingWrites: Promise<void>;
  gameEndRecorded: boolean;
};

export type LobbyTicket = {
  id: string;
  createdAt: number;
  hiddenDraft960: boolean;
  rated: boolean;
  matchedAt: number | null;
  roomId: string | null;
  timeControl: RoomTimeControl | undefined;
};
