import type { Api } from 'chessground/api';
import type {
  BidResolution,
  Chess960Start,
  Color,
  GameEvent,
  Move,
  PieceRole,
  PlayerView,
  Square,
} from '@mistboard/game';
import { isColor } from './web-utils.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Seat = Color | 'spectator';
export type RoomMode = 'pvp' | 'pve' | 'eve' | 'imported' | 'manual';
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'displaced' | 'rejected';
export type PlayAgainStatus = 'creating' | 'failed' | 'idle';
export type DraftOffers = Partial<Record<Color, Chess960Start[]>>;
export type DraftResolvedStartIds = Partial<Record<Color, number>>;
export type PromotionRole = Exclude<PieceRole, 'king' | 'pawn'>;
export type MovePlayedEvent = Extract<GameEvent, { type: 'move-played' }>;
export type MoveListEntry = {
  event: MovePlayedEvent;
  eventIndex: number;
  ply: number;
};
export type PendingPromotion = {
  color: Color;
  from: Square;
  moves: Move[];
  to: Square;
};
export type InfoTone = 'danger' | 'default' | 'pending' | 'success';
export type DevViews = {
  opponent: Color;
  opponentView: PlayerView;
  player: PlayerView;
  truth: PlayerView;
};
export type StoredSeatToken = {
  seat: Color;
  token: string;
};

export type LiveRefs = {
  board: HTMLDivElement;
  boardResult: HTMLDivElement;
  boardStatus: HTMLDivElement;
  draftPicker: HTMLDivElement;
  actionStatus: HTMLDivElement;
  bidControls: HTMLDivElement;
  bidSection: HTMLElement;
  bidStatus: HTMLDivElement;
  clocks: HTMLDivElement;
  devViews: HTMLDivElement;
  devViewsSection: HTMLElement;
  fogToggle: HTMLButtonElement;
  gameInfo: HTMLDivElement;
  moveList: HTMLOListElement;
  offerSection: HTMLElement;
  promotion: HTMLDivElement;
  replayControls: NodeListOf<HTMLButtonElement>;
  replayMeta: HTMLParagraphElement;
  roomActions: HTMLDivElement;
  selectionSection: HTMLElement;
  roomMeta: HTMLParagraphElement;
  selectionList: HTMLDivElement;
  starts: HTMLDivElement;
  gameControls: HTMLDivElement;
  gameControlsSection: HTMLElement;
};

export type SoundController = {
  play(kind: SoundKind): void;
};

export type SoundKind = 'capture' | 'captured' | 'castle' | 'lose' | 'move' | 'win';

// ── Shared mutable state (accessed by both live-socket and live-render) ────────

export const liveState = {
  // Setup fields — set once by live.ts before first socket/render call
  room: '',
  socketUrl: '',
  engineRequested: false,
  debugRequested: false,
  variantRequested: null as string | null,

  // Cross-module runtime state
  clientId: '',
  clientCount: 0,
  connectionState: 'connecting' as ConnectionState,
  closeReason: '',
  latencyMs: null as number | null,
  lastServerAt: null as number | null,
  lastSnapshotAt: null as number | null,
  roomMode: 'pvp' as RoomMode,
  rated: true,
  pveEngineId: null as string | null,
  pveEngineName: null as string | null,
  seatDisplayNames: {} as Partial<Record<Color, string>>,
  seat: 'spectator' as Seat,
  solo: false,
  offer: [] as Chess960Start[],
  offers: {} as DraftOffers,
  selections: {} as Partial<Record<Color, number>>,
  bids: {} as Partial<Record<Color, number>>,
  bidResolution: null as BidResolution | null,
  devViews: null as DevViews | null,
  resolvedStartId: null as number | null,
  resolvedStartIds: {} as DraftResolvedStartIds,
  state: null as PlayerView | null,
  events: [] as GameEvent[],
  reconnectAttempt: 0,
  rematch: { offers: { white: false, black: false }, finalizedRoomId: null as string | null },
  connectedSeats: { white: false, black: false },

  // Chessground instance — owned by live-render, typed here for cross-module access
  ground: null as Api | null,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

export function resolveWebSocketBaseUrl(): string {
  const configured = import.meta.env.VITE_MISTBOARD_WS_URL;
  if (configured) return (configured as string).replace(/\?$/, '');
  if (import.meta.env.DEV) return 'ws://localhost:3001';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

export function normalizedOffers(primaryOffer: Chess960Start[], nextOffers: DraftOffers | undefined): DraftOffers {
  if (nextOffers?.white || nextOffers?.black) return nextOffers;
  if (primaryOffer.length === 0) return {};
  return { white: primaryOffer, black: primaryOffer };
}

export function clientIdForRoom(roomId: string): string {
  const key = `mistboard.client.${roomId}`;
  const existing = readLocalStorage(key);
  if (existing && /^[a-zA-Z0-9:_-]{8,80}$/.test(existing)) return existing;
  const next = window.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
  writeLocalStorage(key, next);
  return next;
}

export function seatTokenForRoom(roomId: string): string | null {
  const stored = readSeatTokenForRoom(roomId);
  return stored?.token ?? null;
}

export function readSeatTokenForRoom(roomId: string): StoredSeatToken | null {
  const raw = readLocalStorage(`mistboard.seatToken.${roomId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSeatToken>;
    if (!isColor(parsed.seat)) return null;
    if (typeof parsed.token !== 'string' || !/^[a-zA-Z0-9_-]{32,128}$/.test(parsed.token)) return null;
    return { seat: parsed.seat, token: parsed.token };
  } catch {
    return null;
  }
}

export function writeSeatTokenForRoom(roomId: string, token: StoredSeatToken): void {
  writeLocalStorage(`mistboard.seatToken.${roomId}`, JSON.stringify(token));
}

export function clearSeatTokenForRoom(roomId: string): void {
  try {
    window.localStorage.removeItem(`mistboard.seatToken.${roomId}`);
  } catch {
    // Storage may be unavailable; reset still proceeds server-side.
  }
}

export function readLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocalStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The room still works without seat recovery if storage is unavailable.
  }
}
