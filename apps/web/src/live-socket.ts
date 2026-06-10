import type { GameEvent, GameSpecId, PlayerView } from '@mistboard/game';
import {
  isPlayableSeat,
  liveState,
  normalizedOffers,
  seatTokenForRoom,
  takeRematchCancel,
  writeSeatTokenForRoom,
} from './live-state.js';
import { setRestartBanner } from './restart-banner.js';

// ── Types ─────────────────────────────────────────────────────────────────────

import type { Chess960Start, Color } from '@mistboard/game';
import type {
  ConnectedSeats,
  DevViews,
  DraftOffers,
  DraftResolvedStartIds,
  PauseReason,
  PlayableSeat,
  RoomMode,
  Seat,
  XiangqiFamilyClock,
} from './live-state.js';

type ServerMessage =
  | {
      type: 'hello';
      clientId: string;
      clients: number;
      gameSpecId?: GameSpecId;
      mode?: RoomMode;
      pveEngineId?: string | null;
      pveEngineName?: string | null;
      roomId: string;
      region?: string;
      serverAt?: number;
      seat: Seat;
      seatToken?: string;
      solo: boolean;
      offer?: Chess960Start[];
      offers?: DraftOffers;
      selections?: Partial<Record<Color, number>>;
      devViews?: DevViews | null;
      resolvedStartId?: number | null;
      resolvedStartIds?: DraftResolvedStartIds;
      events: GameEvent[];
      state: PlayerView;
      rated?: boolean;
      paused?: boolean;
      pauseReason?: PauseReason | null;
      abortDeadline?: number | null;
      forfeitDeadline?: number | null;
      connectedSeats?: ConnectedSeats;
      clock?: XiangqiFamilyClock | null;
      timeControl?: { initialMs: number; incrementMs: number } | null;
      rematch?: {
        offers: { white?: boolean; black?: boolean; red?: boolean };
        finalizedRoomId: string | null;
      };
      seatDisplayNames?: Partial<Record<Color, string>>;
    }
  | {
      type: 'snapshot';
      roomId: string;
      gameSpecId?: GameSpecId;
      region?: string;
      clients: number;
      mode?: RoomMode;
      pveEngineId?: string | null;
      pveEngineName?: string | null;
      serverAt?: number;
      seat: Seat;
      solo: boolean;
      seats: Partial<Record<Color, string>>;
      offer?: Chess960Start[];
      offers?: DraftOffers;
      selections?: Partial<Record<Color, number>>;
      devViews?: DevViews | null;
      resolvedStartId?: number | null;
      resolvedStartIds?: DraftResolvedStartIds;
      events: GameEvent[];
      state: PlayerView;
      rated?: boolean;
      paused?: boolean;
      pauseReason?: PauseReason | null;
      abortDeadline?: number | null;
      forfeitDeadline?: number | null;
      connectedSeats?: ConnectedSeats;
      clock?: XiangqiFamilyClock | null;
      timeControl?: { initialMs: number; incrementMs: number } | null;
      rematch?: {
        offers: { white?: boolean; black?: boolean; red?: boolean };
        finalizedRoomId: string | null;
      };
      seatDisplayNames?: Partial<Record<Color, string>>;
    }
  | {
      // Steady-state delta frame. Mirrors the snapshot shape minus the
      // events array and plus seq + (optional) event. See
      // docs/specs/incremental-snapshot-protocol.md.
      type: 'event-appended';
      roomId: string;
      gameSpecId?: GameSpecId;
      region?: string;
      seq: number;
      event?: GameEvent;
      clients: number;
      mode?: RoomMode;
      pveEngineId?: string | null;
      pveEngineName?: string | null;
      serverAt?: number;
      seat: Seat;
      solo: boolean;
      seats: Partial<Record<Color, string>>;
      offer?: Chess960Start[];
      offers?: DraftOffers;
      selections?: Partial<Record<Color, number>>;
      devViews?: DevViews | null;
      resolvedStartId?: number | null;
      resolvedStartIds?: DraftResolvedStartIds;
      state: PlayerView;
      rated?: boolean;
      paused?: boolean;
      pauseReason?: PauseReason | null;
      abortDeadline?: number | null;
      forfeitDeadline?: number | null;
      connectedSeats?: ConnectedSeats;
      clock?: XiangqiFamilyClock | null;
      timeControl?: { initialMs: number; incrementMs: number } | null;
      rematch?: {
        offers: { white?: boolean; black?: boolean; red?: boolean };
        finalizedRoomId: string | null;
      };
      seatDisplayNames?: Partial<Record<Color, string>>;
    }
  | {
      type: 'rematch:state';
      offers: { white?: boolean; black?: boolean; red?: boolean };
      finalizedRoomId: string | null;
    }
  | {
      type: 'rematch:redirect';
      url: string;
      roomId: string;
      seat: PlayableSeat;
      seatToken: string;
    }
  | { type: 'server_restart_scheduled'; restartAt: number }
  | { type: 'server_restart_cancelled' }
  | { type: 'pong'; at: number; serverAt?: number };

// ── Module-scope socket state ─────────────────────────────────────────────────

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;

// Staged reconnect UI (see ConnectionNoticeTier). A dropped socket almost always
// reconnects in under a second, so we say nothing for a grace window, then show
// a subtle own-presence dot, then escalate to the full notice only once retries
// have been failing for a while. The two timers are anchored to the *first* drop
// of an outage (startReconnectTiers is a no-op while a window is already open),
// so reconnect churn doesn't keep resetting the clock.
const RECONNECT_NOTICE_GRACE_MS = 1_500;
const RECONNECT_NOTICE_ESCALATE_MS = 5_000;
let reconnectTierTimers: number[] = [];

function startReconnectTiers(): void {
  if (reconnectTierTimers.length > 0) return;
  liveState.connectionNoticeTier = 'none';
  reconnectTierTimers.push(
    window.setTimeout(() => {
      if (liveState.connectionState === 'connected') return;
      liveState.connectionNoticeTier = 'dot';
      _render();
    }, RECONNECT_NOTICE_GRACE_MS),
    window.setTimeout(() => {
      if (liveState.connectionState === 'connected') return;
      liveState.connectionNoticeTier = 'banner';
      _render();
    }, RECONNECT_NOTICE_ESCALATE_MS),
  );
}

function clearReconnectTiers(): void {
  for (const timer of reconnectTierTimers) window.clearTimeout(timer);
  reconnectTierTimers = [];
  liveState.connectionNoticeTier = 'none';
}
let lastLatencySampleSentAt = 0;
// Last server-side event index this socket has processed. Used to detect
// gaps in the event-appended stream and trigger snapshot:request recovery.
// Reset to null on every snapshot/hello — the snapshot is the new baseline,
// and the next event-appended re-anchors. Phase 2 of the snapshot→delta
// migration; see docs/specs/incremental-snapshot-protocol.md.
let lastSeenServerSeq: number | null = null;

// ── Injected callbacks (set by initSocket) ────────────────────────────────────

let _render: () => void = () => {};
let _reconcileInteractionState: () => void = () => {};
let _maybePlaySnapshotSound: (events: GameEvent[], state: PlayerView | null) => void = () => {};
let _maybePlayDarkMiniXiangqiSound: () => void = () => {};

// ── Init ──────────────────────────────────────────────────────────────────────

export function initSocket(callbacks: {
  render: () => void;
  reconcileInteractionState: () => void;
  maybePlaySnapshotSound: (events: GameEvent[], state: PlayerView | null) => void;
  maybePlayDarkMiniXiangqiSound: () => void;
}): void {
  _render = callbacks.render;
  _reconcileInteractionState = callbacks.reconcileInteractionState;
  _maybePlaySnapshotSound = callbacks.maybePlaySnapshotSound;
  _maybePlayDarkMiniXiangqiSound = callbacks.maybePlayDarkMiniXiangqiSound;
}

// ── Socket management ─────────────────────────────────────────────────────────

export function connectSocket(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  // Tear down any prior socket before opening a new one. Without this, a
  // reconnect fired while the previous socket is still CONNECTING (e.g. via
  // sendSocket → scheduleReconnect) orphans a live socket that never closes.
  // Dropping the message listener stops a late buffered frame from being
  // applied; the close/open/error handlers self-neutralize via their
  // `socket !== nextSocket` identity guard once we reassign `socket` below.
  if (socket) {
    socket.removeEventListener('message', handleSocketMessage);
    socket.close();
    socket = null;
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
    clearReconnectTiers();
    _render();
  });
  nextSocket.addEventListener('close', (event) => {
    if (socket !== nextSocket) return;
    liveState.closeReason = event.reason;
    if (event.code === 4000 && event.reason === 'duplicate session') {
      liveState.connectionState = 'displaced';
      socket = null;
      clearReconnectTiers();
      _render();
      return;
    }
    if (event.code === 1008) {
      liveState.connectionState = 'rejected';
      socket = null;
      clearReconnectTiers();
      _render();
      return;
    }
    liveState.connectionState = 'disconnected';
    startReconnectTiers();
    _render();
    scheduleReconnect();
  });
  nextSocket.addEventListener('error', () => {
    if (socket !== nextSocket) return;
    liveState.connectionState = 'disconnected';
    startReconnectTiers();
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
    maybeSendLatencySample(liveState.latencyMs);
    // No re-render: latency is only surfaced in the degraded-connection path
    // (see connectionDetailLabel), and a pong only arrives while connected, so
    // the value is never on screen here. Rendering on every 5s ping is pure
    // churn — thousands of no-op renders on a tab left open overnight.
    return;
  }
  if (message.type === 'server_restart_scheduled') {
    setRestartBanner(message.restartAt);
    return;
  }
  if (message.type === 'server_restart_cancelled') {
    setRestartBanner(null);
    return;
  }
  if (message.type === 'rematch:state') {
    const mySeat = liveState.seat;
    const hadMyOffer = isPlayableSeat(mySeat) && Boolean(liveState.rematch.offers[mySeat]);
    const stillMyOffer = isPlayableSeat(mySeat) && Boolean(message.offers[mySeat]);
    const anyOffer = Boolean(message.offers.white || message.offers.black || message.offers.red);
    // Decline and self-cancel both clear my offer on the wire, so they're only
    // distinguishable by intent: if my pending offer vanished without a redirect
    // and I didn't click Cancel, the opponent declined. Keep the cue until either
    // side has an active offer again.
    const iCancelled = takeRematchCancel();
    const declined =
      hadMyOffer && !stillMyOffer && !message.finalizedRoomId && !iCancelled
        ? true
        : anyOffer
          ? false
          : liveState.rematch.declined;
    liveState.rematch = {
      offers: message.offers,
      finalizedRoomId: message.finalizedRoomId,
      declined,
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
    if (message.seatToken && isPlayableSeat(message.seat)) {
      writeSeatTokenForRoom(liveState.room, { seat: message.seat, token: message.seatToken });
    }
    applyFullFrame(message);
    liveState.events = message.events;
    // Snapshot/hello reset the seq baseline. The events array we just
    // received was already filtered server-side, so the client cannot
    // derive the server's max-seq from `events.length`. Wait for the
    // next event-appended to re-anchor.
    lastSeenServerSeq = null;
  } else if (message.type === 'snapshot') {
    applyFullFrame(message);
    liveState.events = message.events;
    lastSeenServerSeq = null;
  } else if (message.type === 'event-appended') {
    if (!applyEventAppended(message)) return;
  }
  if (liveState.gameSpecId === 'dark-mini-xiangqi') {
    _maybePlayDarkMiniXiangqiSound();
  } else if (liveState.gameSpecId !== 'dark-xiangqi') {
    _maybePlaySnapshotSound(liveState.events, liveState.state);
  }
  _reconcileInteractionState();
  _render();
}

type FullFrameSource = Extract<ServerMessage, { type: 'hello' | 'snapshot' | 'event-appended' }>;

// Fields shared by every state-bearing frame (hello, snapshot, event-
// appended). Keeping this in one helper prevents the three handlers from
// drifting — same code wrote the snapshot for years, now event-appended
// uses the same projection.
function applyFullFrame(message: FullFrameSource): void {
  liveState.clientCount = message.clients;
  liveState.connectionState = 'connected';
  liveState.gameSpecId = message.gameSpecId ?? liveState.gameSpecId;
  liveState.roomRegion = message.region ?? liveState.roomRegion;
  liveState.roomMode = message.mode ?? liveState.roomMode;
  liveState.pveEngineId = message.pveEngineId ?? null;
  liveState.pveEngineName = message.pveEngineName ?? null;
  liveState.lastServerAt = message.serverAt ?? null;
  liveState.seat = message.seat;
  liveState.solo = message.solo;
  liveState.offer = message.offer ?? [];
  liveState.offers = normalizedOffers(message.offer ?? [], message.offers);
  liveState.selections = message.selections ?? {};
  liveState.devViews = message.devViews ?? null;
  liveState.resolvedStartId = message.resolvedStartId ?? null;
  liveState.resolvedStartIds = message.resolvedStartIds ?? {};
  liveState.rated = message.rated ?? true;
  liveState.paused = message.paused ?? false;
  liveState.pauseReason = message.pauseReason ?? null;
  liveState.abortDeadline = message.abortDeadline ?? null;
  liveState.forfeitDeadline = message.forfeitDeadline ?? null;
  liveState.state = message.state;
  liveState.clock = message.clock ?? null;
  liveState.timeControl = message.timeControl ?? null;
  if (message.connectedSeats) liveState.connectedSeats = message.connectedSeats;
  if (message.rematch) liveState.rematch = message.rematch;
  if (message.seatDisplayNames) liveState.seatDisplayNames = message.seatDisplayNames;
}

// Apply an event-appended frame. Returns true if the frame was applied;
// false if it was discarded (gap detected and a snapshot:request was
// queued — caller should NOT fire sound/render hooks for a dropped frame).
function applyEventAppended(message: Extract<ServerMessage, { type: 'event-appended' }>): boolean {
  if (lastSeenServerSeq !== null && message.seq !== lastSeenServerSeq + 1) {
    // Gap. Discard this frame and ask the server for a fresh snapshot.
    // The snapshot will reset lastSeenServerSeq to null, and the next
    // event-appended re-anchors. TCP guarantees frames don't get
    // reordered on the open socket, so a gap means the socket was
    // briefly closed/reopened or the server made a wire-protocol
    // mistake — both are recoverable via full resync.
    sendSocket({ type: 'snapshot:request' });
    return false;
  }
  applyFullFrame(message);
  if (message.event) liveState.events = [...liveState.events, message.event];
  lastSeenServerSeq = message.seq;
  return true;
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
  if (liveState.connectionState === 'displaced' || liveState.connectionState === 'rejected')
    return false;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    liveState.connectionState = 'reconnecting';
    scheduleReconnect();
    return false;
  }
  socket.send(JSON.stringify(payload));
  return true;
}

function maybeSendLatencySample(rttMs: number): void {
  const now = Date.now();
  if (lastLatencySampleSentAt !== 0 && now - lastLatencySampleSentAt < 60_000) return;
  lastLatencySampleSentAt = now;
  sendSocket({ type: 'latency-sample', rttMs });
}
