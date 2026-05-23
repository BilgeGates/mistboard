import type { Color, GameEvent, GameProjection, RoomTimeControl, VariantId } from '@mistboard/game';
import type { WebSocket } from 'ws';
import type { Seat } from './payloads.js';
import type { GameMode } from './persistence.js';

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
  // Authenticated account id for this connection, or null when anonymous. Used
  // to displace another live connection from the same account across devices
  // (see seatsShareAuthority), independent of the bearer seat token.
  userId?: string | null;
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
  // Pre-move abort window. While a game is playing but both players haven't yet
  // completed their first move, the side to move must move within ABORT_WINDOW_MS
  // or the game is aborted (no result). abortPhase tracks which side's window is
  // live ('white-1' | 'black-1') so the deadline only resets when the phase
  // changes, not on unrelated re-broadcasts. abortDeadline is the absolute ms
  // timestamp sent to clients for the countdown. All null once both first moves
  // are in (or the game isn't in a pre-move window).
  abortTimer: ReturnType<typeof setTimeout> | null;
  abortDeadline: number | null;
  abortPhase: 'white-1' | 'black-1' | null;
  mode: GameMode;
  rated: boolean;
  randomEngine: boolean;
  randomSeating: boolean;
  // Honored on the first PvP arrival when set: assigns that color to the creator.
  // Random preference uses randomSeating instead, so this is null in that path.
  creatorPreference: 'white' | 'black' | null;
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
