import type { GameEvent, PlayerView } from '@mistboard/game';
import { isColor } from './web-utils.js';
import {
  liveState,
  normalizedOffers,
  writeSeatTokenForRoom,
  seatTokenForRoom,
} from './live-state.js';

// ── Types ─────────────────────────────────────────────────────────────────────

import type {
  BidResolution,
  Chess960Start,
  Color,
} from '@mistboard/game';
import type { DevViews, DraftOffers, DraftResolvedStartIds, RoomMode, Seat } from './live-state.js';

type ServerMessage =
  | {
    type: 'hello';
    clientId: string;
    clients: number;
    mode?: RoomMode;
    pveEngineId?: string | null;
    pveEngineName?: string | null;
    roomId: string;
    serverAt?: number;
    seat: Seat;
    seatToken?: string;
    solo: boolean;
    offer: Chess960Start[];
    offers?: DraftOffers;
    selections: Partial<Record<Color, number>>;
    bids: Partial<Record<Color, number>>;
    bidResolution: BidResolution | null;
    devViews: DevViews | null;
    resolvedStartId: number | null;
    resolvedStartIds?: DraftResolvedStartIds;
    events: GameEvent[];
    state: PlayerView;
    rated?: boolean;
    paused?: boolean;
    connectedSeats?: { white: boolean; black: boolean };
    rematch?: { offers: { white: boolean; black: boolean }; finalizedRoomId: string | null };
    seatDisplayNames?: Partial<Record<Color, string>>;
  }
  | {
    type: 'snapshot';
    roomId: string;
    clients: number;
    mode?: RoomMode;
    pveEngineId?: string | null;
    pveEngineName?: string | null;
    serverAt?: number;
    seat: Seat;
    solo: boolean;
    seats: Partial<Record<Color, string>>;
    offer: Chess960Start[];
    offers?: DraftOffers;
    selections: Partial<Record<Color, number>>;
    bids: Partial<Record<Color, number>>;
    bidResolution: BidResolution | null;
    devViews: DevViews | null;
    resolvedStartId: number | null;
    resolvedStartIds?: DraftResolvedStartIds;
    events: GameEvent[];
    state: PlayerView;
    rated?: boolean;
    paused?: boolean;
    connectedSeats?: { white: boolean; black: boolean };
    rematch?: { offers: { white: boolean; black: boolean }; finalizedRoomId: string | null };
    seatDisplayNames?: Partial<Record<Color, string>>;
  }
  | {
    type: 'rematch:state';
    offers: { white: boolean; black: boolean };
    finalizedRoomId: string | null;
  }
  | {
    type: 'rematch:redirect';
    url: string;
    roomId: string;
    seat: Color;
    seatToken: string;
  }
  | { type: 'pong'; at: number };

// ── Module-scope socket state ─────────────────────────────────────────────────

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;

// ── Injected callbacks (set by initSocket) ────────────────────────────────────

let _render: () => void = () => {};
let _reconcileInteractionState: () => void = () => {};
let _maybePlaySnapshotSound: (events: GameEvent[], state: PlayerView | null) => void = () => {};

// ── Init ──────────────────────────────────────────────────────────────────────

export function initSocket(callbacks: {
  render: () => void;
  reconcileInteractionState: () => void;
  maybePlaySnapshotSound: (events: GameEvent[], state: PlayerView | null) => void;
}): void {
  _render = callbacks.render;
  _reconcileInteractionState = callbacks.reconcileInteractionState;
  _maybePlaySnapshotSound = callbacks.maybePlaySnapshotSound;
}

// ── Socket management ─────────────────────────────────────────────────────────

export function connectSocket(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  liveState.connectionState = liveState.clientId ? 'reconnecting' : 'connecting';
  _render();

  const nextSocket = connectWebSocket();
  socket = nextSocket;
  nextSocket.addEventListener('message', handleSocketMessage);
  nextSocket.addEventListener('open', () => {
    if (socket !== nextSocket) return;
    liveState.reconnectAttempt = 0;
    liveState.connectionState = 'connected';
    _render();
  });
  nextSocket.addEventListener('close', (event) => {
    if (socket !== nextSocket) return;
    liveState.closeReason = event.reason;
    if (event.code === 4000 && event.reason === 'duplicate session') {
      liveState.connectionState = 'displaced';
      socket = null;
      _render();
      return;
    }
    if (event.code === 1008) {
      liveState.connectionState = 'rejected';
      socket = null;
      _render();
      return;
    }
    liveState.connectionState = 'disconnected';
    _render();
    scheduleReconnect();
  });
  nextSocket.addEventListener('error', () => {
    if (socket !== nextSocket) return;
    liveState.connectionState = 'disconnected';
    _render();
  });
}

function connectWebSocket(): WebSocket {
  const token = seatTokenForRoom(liveState.room);
  if (!token) return new WebSocket(liveState.socketUrl);
  return new WebSocket(liveState.socketUrl, [`mistboard-seat.${token}`]);
}

function handleSocketMessage(event: MessageEvent<string>): void {
  const message = JSON.parse(event.data) as ServerMessage;
  if (message.type === 'pong') {
    liveState.latencyMs = Math.max(0, Date.now() - message.at);
    _render();
    return;
  }
  if (message.type === 'rematch:state') {
    liveState.rematch = {
      offers: message.offers,
      finalizedRoomId: message.finalizedRoomId,
    };
    _render();
    return;
  }
  if (message.type === 'rematch:redirect') {
    writeSeatTokenForRoom(message.roomId, { seat: message.seat, token: message.seatToken });
    window.location.assign(message.url);
    return;
  }
  liveState.lastSnapshotAt = Date.now();
  if (message.type === 'hello') {
    liveState.clientId = message.clientId;
    if (message.seatToken && isColor(message.seat)) {
      writeSeatTokenForRoom(liveState.room, { seat: message.seat, token: message.seatToken });
    }
    liveState.clientCount = message.clients;
    liveState.connectionState = 'connected';
    liveState.roomMode = message.mode ?? liveState.roomMode;
    liveState.pveEngineId = message.pveEngineId ?? null;
    liveState.pveEngineName = message.pveEngineName ?? null;
    liveState.lastServerAt = message.serverAt ?? null;
    liveState.seat = message.seat;
    liveState.solo = message.solo;
    liveState.offer = message.offer;
    liveState.offers = normalizedOffers(message.offer, message.offers);
    liveState.selections = message.selections;
    liveState.bids = message.bids;
    liveState.bidResolution = message.bidResolution;
    liveState.devViews = message.devViews;
    liveState.resolvedStartId = message.resolvedStartId;
    liveState.resolvedStartIds = message.resolvedStartIds ?? {};
    liveState.rated = message.rated ?? true;
    liveState.paused = message.paused ?? false;
    liveState.events = message.events;
    liveState.state = message.state;
    if (message.connectedSeats) liveState.connectedSeats = message.connectedSeats;
    if (message.rematch) liveState.rematch = message.rematch;
    if (message.seatDisplayNames) liveState.seatDisplayNames = message.seatDisplayNames;
  }
  if (message.type === 'snapshot') {
    liveState.clientCount = message.clients;
    liveState.connectionState = 'connected';
    liveState.roomMode = message.mode ?? liveState.roomMode;
    liveState.pveEngineId = message.pveEngineId ?? null;
    liveState.pveEngineName = message.pveEngineName ?? null;
    liveState.lastServerAt = message.serverAt ?? null;
    liveState.seat = message.seat;
    liveState.solo = message.solo;
    liveState.offer = message.offer;
    liveState.offers = normalizedOffers(message.offer, message.offers);
    liveState.selections = message.selections;
    liveState.bids = message.bids;
    liveState.bidResolution = message.bidResolution;
    liveState.devViews = message.devViews;
    liveState.resolvedStartId = message.resolvedStartId;
    liveState.resolvedStartIds = message.resolvedStartIds ?? {};
    liveState.rated = message.rated ?? true;
    liveState.paused = message.paused ?? false;
    liveState.events = message.events;
    liveState.state = message.state;
    if (message.connectedSeats) liveState.connectedSeats = message.connectedSeats;
    if (message.rematch) liveState.rematch = message.rematch;
    if (message.seatDisplayNames) liveState.seatDisplayNames = message.seatDisplayNames;
  }
  _maybePlaySnapshotSound(liveState.events, liveState.state);
  _reconcileInteractionState();
  _render();
}

function scheduleReconnect(): void {
  if (liveState.connectionState === 'displaced' || liveState.connectionState === 'rejected') return;
  if (reconnectTimer) return;
  liveState.reconnectAttempt += 1;
  const delay = Math.min(10_000, 750 * 2 ** Math.min(liveState.reconnectAttempt - 1, 4));
  liveState.connectionState = 'reconnecting';
  _render();
  reconnectTimer = window.setTimeout(() => connectSocket(), delay);
}

export function reconnectNow(): void {
  if (liveState.connectionState === 'displaced' || liveState.connectionState === 'rejected') return;
  liveState.reconnectAttempt = 0;
  connectSocket();
}

export function sendSocket(payload: unknown): boolean {
  if (liveState.connectionState === 'displaced' || liveState.connectionState === 'rejected') return false;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    liveState.connectionState = 'reconnecting';
    scheduleReconnect();
    return false;
  }
  socket.send(JSON.stringify(payload));
  return true;
}
