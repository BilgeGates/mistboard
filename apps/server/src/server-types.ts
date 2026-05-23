import { WebSocket } from 'ws';
import type { Color, GameEvent, GameProjection, RoomTimeControl, VariantId } from '@mistboard/game';
import type { GameMode } from './persistence.js';
import type { Seat } from './payloads.js';

export type RematchOffer = {
  tokenHash: string;
  userId: string | null;
  at: number;
};

export type RematchPendingRedirect = {
  roomId: string;
  seat: Color;
  rawToken: string;
  url: string;
};

export type RematchState = {
  offers: Partial<Record<Color, RematchOffer>>;
  finalizedRoomId?: string;
  // Keyed by the OLD-room seat. Re-emitted on reconnect to that seat so a
  // player who was offline during finalize still lands in the new room.
  pendingRedirects?: Partial<Record<Color, RematchPendingRedirect>>;
};

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
  variant: VariantId;
  hiddenDraft960: boolean;
  timeControl: RoomTimeControl | undefined;
  rematch: RematchState;
  // Pending seat-vacated timers keyed by color. If a seated player disconnects
  // before any move is played, we defer the seat-vacated event so a quick
  // reconnect cancels the abort.
  pendingVacates: Partial<Record<Color, ReturnType<typeof setTimeout>>>;
  // Set when a paused room is hydrated post-restart. Fires the grace resume
  // (reason='grace-elapsed') if both players don't show up within the window.
  // Cleared on resume.
  pauseGraceTimer: ReturnType<typeof setTimeout> | null;
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
