// Live multiplayer room client for jieqi (揭棋) — a self-contained tenant client
// on the socket-client + chrome stack, modeled on the Dark Xiangqi room but
// IDENTITY-hidden rather than POSITION-hidden.
//
// Jieqi positions are fully PUBLIC: both players see every square, every piece's
// color, and every move. The only hidden axis is piece IDENTITY (a face-down
// piece's role). So this client carries NO fog: no fog mask, no visibleSquares,
// no opponent-move stripping, and the replay capture is straightforward (the
// server already redacts identities in the per-seat view, and there is nothing
// further to redact across replay).
//
// Board rendering, the face-down vs revealed pieces, selection ring, hints,
// last-move, and the interactive hit layer all come from live-jieqi-render.ts;
// click-to-move from live-jieqi-interaction.ts. The connection state machine
// lives in variant-tenant/socket-client.ts and the room chrome (clocks,
// countdowns, action status, room actions) in variant-tenant/room-chrome.ts.
// This module adds the captured-pool panel (grouped by owner, "?" for an
// identity the viewer cannot see) on top of that shared chrome.

import type {
  JieqiColor,
  JieqiGameStatus,
  JieqiMove,
  JieqiPieceRole,
  JieqiSquare,
} from '@mistboard/game';
import './live-xiangqi.css';
import { jieqiEnabled } from './feature-flags.js';
import { jieqiClickResult } from './live-jieqi-interaction.js';
import { installJieqiBoardStyles, renderJieqiBoardSvg } from './live-jieqi-render.js';
import { createLiveLayout, setLiveLayoutGameSpec } from './live-layout.js';
import { initLiveSound, resetLiveSoundState } from './live-sound.js';
import { clearSeatTokenForRoom, type LiveRefs } from './live-state.js';
import { roomIdFromPath } from './room-url.js';
import { scrollActiveMoveIntoView } from './variant-tenant/chrome-dom.js';
import { createTenantReplayController } from './variant-tenant/replay-controller.js';
import { createTenantRoomChrome, type WebVariantTenant } from './variant-tenant/room-chrome.js';
import {
  createTenantSocketClient,
  type TenantConnectionState,
  type TenantSocketClient,
} from './variant-tenant/socket-client.js';
import { readStoredXiangqiPieceSet } from './xiangqi-appearance-storage.js';
import { renderXiangqiPieceGlyphed } from './xiangqi-piece-sets.js';

// ── Wire shapes (mirror JieqiPlayerView; board entries are faceDown-tagged) ──

type JieqiWireBoardEntry =
  | { color: JieqiColor; role: JieqiPieceRole; faceDown: false }
  | { color: JieqiColor; faceDown: true };

type JieqiWireCaptured = { owner: JieqiColor; role: JieqiPieceRole | null };

export type JieqiWireView = {
  id: string;
  perspective: JieqiColor;
  board: Partial<Record<JieqiSquare, JieqiWireBoardEntry>>;
  legalMoves: JieqiMove[];
  captured: JieqiWireCaptured[];
  inCheck: boolean;
  status: JieqiGameStatus;
  moveNumber: number;
  lastMove?: JieqiMove;
};

type JieqiWireEvent =
  | { type: 'move-played'; color: JieqiColor; move: JieqiMove; at: number; ply?: number }
  | { type: string; [key: string]: unknown };
type JieqiMoveEvent = Extract<JieqiWireEvent, { type: 'move-played' }>;
type JieqiVisibleMoveRow = {
  fullMove: number;
  red?: string;
  black?: string;
};

type JieqiLiveClock = {
  activeColor: JieqiColor | null;
  incrementMs: number;
  initialMs: number;
  remainingMs: Record<JieqiColor, number>;
  runningSince: number | null;
};

type JieqiLiveFrame = {
  type: 'hello' | 'snapshot' | 'event-appended';
  clientId?: string;
  seatToken?: string;
  seat: JieqiColor | 'spectator';
  seats: Partial<Record<JieqiColor, string>>;
  state: JieqiWireView;
  clock?: JieqiLiveClock | null;
  connectedSeats?: Record<JieqiColor, boolean>;
  abortDeadline?: number | null;
  roomMode?: 'pve' | 'pvp';
  pveEngineId?: string | null;
  timeControl?: { initialMs: number; incrementMs: number } | null;
  clients?: number;
  events?: JieqiWireEvent[];
  event?: JieqiWireEvent;
  seq?: number;
};

// ── Module state ─────────────────────────────────────────────────────────────

const state = {
  room: '',
  seat: null as JieqiColor | 'spectator' | null,
  view: null as JieqiWireView | null,
  clock: null as JieqiLiveClock | null,
  timeControl: null as { initialMs: number; incrementMs: number } | null,
  seats: {} as Partial<Record<JieqiColor, string>>,
  connectedSeats: { red: false, black: false } as Record<JieqiColor, boolean>,
  events: [] as JieqiWireEvent[],
  abortDeadline: null as number | null,
  roomMode: 'pvp' as 'pve' | 'pvp',
  pveEngineId: null as string | null,
};

let client: TenantSocketClient | null = null;
let refs: LiveRefs | null = null;
let selectedSquare: JieqiSquare | null = null;
let lastCapturedView: JieqiWireView | null = null;
let lastCapturedPositionKey: string | null = null;

const replay = createTenantReplayController<JieqiWireView>();

function send(payload: unknown): boolean {
  return client?.send(payload) ?? false;
}

function connection(): TenantConnectionState {
  return client?.connection() ?? 'connecting';
}

// ── Shared tenant room chrome ────────────────────────────────────────────────

const jieqiWebTenant: WebVariantTenant<JieqiColor> = {
  displayName: 'Jieqi',
  colors: ['red', 'black'],
  isColor: isJieqiColor,
  oppositeColor: (color) => (color === 'red' ? 'black' : 'red'),
  enabled: jieqiEnabled,
  reviewUrl: (roomId) => `/jieqi/game/${encodeURIComponent(roomId)}`,
  reasonPhrase: jieqiReasonPhrase,
  disabledTitle: 'Jieqi disabled',
  disabledBody: 'This client build has the room renderer off.',
  rejectedBody: 'This Jieqi room is not active. Create a new invite to start a game.',
  spectatorBody: 'Watching without private information.',
  selectInstruction: 'Select one of your pieces, then choose a destination.',
};

const chrome = createTenantRoomChrome(jieqiWebTenant, {
  view: () => state.view,
  seat: () => state.seat,
  connectionState: () => connection(),
  clock: () => state.clock,
  timeControl: () => state.timeControl,
  connectedSeats: () => state.connectedSeats,
  abortDeadline: () => state.abortDeadline,
  // Not on the Jieqi wire: the forfeit banner and rematch block never arm.
  forfeitDeadline: () => null,
  roomMode: () => state.roomMode,
  room: () => state.room,
  debugRequested: () => false,
  isReplayLive: () => replay.isLive(),
  orientation: () => orientationFor(state.view),
  playAgainRequestBody: () => ({
    mode: state.roomMode,
    gameSpecId: 'jieqi',
    preferredColor: 'random',
    ...(state.roomMode === 'pve' && state.pveEngineId ? { engineId: state.pveEngineId } : {}),
    ...(state.timeControl ? { timeControl: state.timeControl } : {}),
  }),
  rematchControls: () => null,
});

function jieqiReasonPhrase(reason: string): string {
  switch (reason) {
    case 'checkmate':
      return 'checkmate';
    case 'stalemate':
      return 'stalemate';
    case 'no-capture-clock':
      return 'no progress';
    case 'timeout':
      return 'timeout';
    case 'resignation':
      return 'resignation';
    case 'abandonment':
      return 'abandonment';
    default:
      return 'the game rules';
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function bootstrapJieqiLiveRoom(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('missing #app');

  const params = new URLSearchParams(window.location.search);
  const room = roomIdFromPath(window.location.pathname) ?? params.get('room') ?? 'jq_dev';
  state.room = room;
  selectedSquare = null;
  lastCapturedView = null;
  lastCapturedPositionKey = null;
  replay.reset();
  chrome.resetState();
  installJieqiBoardStyles();
  initLiveSound();
  resetLiveSoundState();

  if (params.get('reset') === '1') {
    clearSeatTokenForRoom(room);
    params.delete('reset');
    const search = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${search ? `?${search}` : ''}`,
    );
  }

  refs = createLiveLayout(app, { debugRequested: false });
  setLiveLayoutGameSpec(app, 'jieqi');
  chrome.setRenderTarget(refs, {
    sendSocket: send,
    // connect() drops any pending backoff timer and reconnects immediately.
    reconnectNow: () => client?.connect(),
  });

  client = createTenantSocketClient({
    room,
    applyHello: (frame) => applyFrame(frame as JieqiLiveFrame),
    applySnapshot: (frame) => applyFrame(frame as JieqiLiveFrame),
    applyEvent: (frame) => applyEventFrame(frame as JieqiLiveFrame),
    render: renderAll,
  });
  client.connect();
  client.startPing();
  window.setInterval(() => {
    chrome.tickClocks();
    chrome.tickCountdowns();
  }, 100);
  document.addEventListener('keydown', handleReplayKeyboard);
  renderAll();
}

// ── Frame application ────────────────────────────────────────────────────────

function applyFrame(frame: JieqiLiveFrame): void {
  state.seat = frame.seat;
  state.view = frame.state;
  state.clock = frame.clock ?? null;
  state.timeControl = frame.timeControl ?? state.timeControl;
  state.seats = frame.seats ?? state.seats;
  state.roomMode = frame.roomMode ?? state.roomMode;
  state.pveEngineId = frame.pveEngineId ?? state.pveEngineId;
  if (frame.connectedSeats) state.connectedSeats = frame.connectedSeats;
  state.abortDeadline = frame.abortDeadline ?? null;
  if (frame.events) state.events = frame.events;
}

function applyEventFrame(frame: JieqiLiveFrame): void {
  const events = state.events;
  applyFrame(frame);
  state.events = events;
  if (frame.event) state.events = [...events, frame.event];
}

function handleReplayKeyboard(event: KeyboardEvent): void {
  replay.handleKeyboard(event, renderAll);
}

// ── Rendering ────────────────────────────────────────────────────────────────

function renderAll(): void {
  if (!refs) return;
  chrome.resetHostPanels();
  chrome.renderMeta();
  chrome.renderClocks();

  const view = state.view;
  captureReplayView(view);
  const displayedView = replay.currentView(view);
  refs.moveList.classList.add('xiangqi-move-list');
  replay.renderShell(refs, renderAll);
  refs.boardStatus.hidden = view !== null;
  chrome.renderActionStatus();
  chrome.renderGameControls();
  chrome.renderRoomActions();
  renderCapturedPools(refs, displayedView);

  if (!jieqiEnabled()) {
    refs.board.className = 'board jieqi-live-board jieqi-live-board--disabled';
    refs.board.replaceChildren();
    selectedSquare = null;
    return;
  }

  renderBoard(refs, displayedView);
  renderVisibleMoveList(refs);
}

function renderBoard(liveRefs: LiveRefs, view: JieqiWireView | null): void {
  liveRefs.board.className = 'board jieqi-live-board';
  liveRefs.board.setAttribute('aria-label', 'Jieqi board');
  if (!view) {
    liveRefs.board.replaceChildren();
    return;
  }

  const perspective = orientationFor(view);
  liveRefs.board.innerHTML = renderJieqiBoardSvg(view, perspective, {
    interactive: true,
    selectedSquare,
    legalMoves: selectedSquare
      ? view.legalMoves.filter((move) => move.from === selectedSquare)
      : [],
  });
  liveRefs.board.querySelectorAll<SVGElement>('[data-square]').forEach((el) => {
    el.addEventListener('click', () => {
      const square = el.dataset.square as JieqiSquare | undefined;
      if (!square) return;
      handleSquareClick(view, square);
      renderBoard(liveRefs, view);
    });
  });
}

function handleSquareClick(view: JieqiWireView, square: JieqiSquare): void {
  if (!replay.isLive() || connection() !== 'connected') return;
  const result = jieqiClickResult(view, state.seat, selectedSquare, square);
  if (result.kind === 'noop') return;
  if (result.kind === 'select') {
    selectedSquare = result.square;
    return;
  }
  if (result.kind === 'clear') {
    selectedSquare = null;
    return;
  }
  selectedSquare = null;
  send({ type: 'move', from: result.move.from, to: result.move.to });
}

// ── Captured pool ─────────────────────────────────────────────────────────────

// Lichess convention: a player's captured material sits next to that player.
// The bottom strip is the viewer's side, so it shows the pieces the viewer has
// captured (the opponent's lost pieces); the top strip is the opponent's side,
// so it shows the pieces the opponent has captured (the viewer's lost pieces).
// fillCapturedPool filters by former owner, so top filters the viewer's color
// and bottom filters the opponent's color. A null role (a dark piece the viewer
// did not capture, so cannot identify) renders face-down ("?"). Reuses the
// existing .captures-strip / .mini-xq-capture-piece styling (no new CSS).
function renderCapturedPools(liveRefs: LiveRefs, view: JieqiWireView | null): void {
  liveRefs.capturesTop.replaceChildren();
  liveRefs.capturesBottom.replaceChildren();
  if (!view) return;
  const viewer = orientationFor(view);
  const opponent = viewer === 'red' ? 'black' : 'red';
  fillCapturedPool(liveRefs.capturesTop, view.captured, viewer);
  fillCapturedPool(liveRefs.capturesBottom, view.captured, opponent);
}

// Exported for unit testing the captured-pool data path (revealed identity vs
// an unidentifiable "?" dark piece) without a live socket — same extraction
// rationale as live-jieqi-render / live-jieqi-interaction.
export function fillCapturedPool(
  host: HTMLElement,
  captured: readonly JieqiWireCaptured[],
  owner: JieqiColor,
): void {
  const mine = captured.filter((entry) => entry.owner === owner);
  host.classList.toggle('has-captures', mine.length > 0);
  if (mine.length === 0) return;
  const pieceSet = readStoredXiangqiPieceSet();
  const row = document.createElement('div');
  row.className = 'captures-row mini-xq-captures-row';
  for (const entry of mine) {
    const span = document.createElement('span');
    span.className = 'mini-xq-capture-piece';
    if (entry.role === null) {
      span.setAttribute('aria-label', `${owner} hidden piece`);
      span.innerHTML = renderXiangqiPieceGlyphed({ color: owner, role: 'soldier' }, pieceSet, {
        ariaLabel: `${owner} hidden piece`,
        shrouded: true,
      });
    } else {
      span.setAttribute('aria-label', `${owner} ${entry.role}`);
      span.innerHTML = renderXiangqiPieceGlyphed({ color: owner, role: entry.role }, pieceSet, {
        ariaLabel: `${owner} ${entry.role}`,
      });
    }
    row.append(span);
  }
  host.append(row);
}

// ── Move list (positions are public, so every move shows) ────────────────────

function renderVisibleMoveList(liveRefs: LiveRefs): void {
  const moves = state.events.filter((event): event is JieqiMoveEvent => isJieqiMoveEvent(event));
  // Render every move that has been played, always. Stepping back only moves the
  // active highlight (replay.activePly()); it must never drop rows. The ceiling
  // is the full game length, not the scrubbed ply.
  const totalPly = replay.latestPly();
  liveRefs.moveList.replaceChildren();
  if (totalPly === 0) {
    const item = document.createElement('li');
    item.className = 'move-row';
    item.textContent = 'No moves yet';
    liveRefs.moveList.append(item);
    return;
  }
  const activePly = replay.activePly();
  for (const row of visibleMoveRows(moves, totalPly)) {
    const item = document.createElement('li');
    item.className = 'move-row xiangqi-move-row';
    const number = document.createElement('span');
    number.className = 'xiangqi-move-row__number';
    number.textContent = `${row.fullMove}.`;
    const red = document.createElement('span');
    red.className = ['xiangqi-move-row__move', activePly === row.fullMove * 2 - 1 ? 'active' : '']
      .filter(Boolean)
      .join(' ');
    red.textContent = row.red ?? '...';
    const black = document.createElement('span');
    const blackPly = row.fullMove * 2;
    black.className = ['xiangqi-move-row__move', activePly === blackPly ? 'active' : '']
      .filter(Boolean)
      .join(' ');
    black.textContent = blackPly <= totalPly ? (row.black ?? '...') : '';
    item.append(number, red, black);
    liveRefs.moveList.append(item);
  }
  scrollActiveMoveIntoView(liveRefs.moveList);
}

function visibleMoveRows(
  moves: readonly JieqiMoveEvent[],
  plyCount: number,
): JieqiVisibleMoveRow[] {
  const rows = new Map<number, JieqiVisibleMoveRow>();
  for (let fullMove = 1; fullMove <= Math.ceil(plyCount / 2); fullMove += 1) {
    rows.set(fullMove, { fullMove });
  }
  moves.forEach((event, index) => {
    const ply = eventPly(event, index);
    if (ply > plyCount) return;
    const fullMove = Math.floor((ply - 1) / 2) + 1;
    const row = rows.get(fullMove) ?? { fullMove };
    row[event.color] = `${event.move.from}-${event.move.to}`;
    rows.set(fullMove, row);
  });
  return [...rows.values()].sort((a, b) => a.fullMove - b.fullMove);
}

function eventPly(event: JieqiMoveEvent, fallbackIndex: number): number {
  return Number.isInteger(event.ply) && event.ply && event.ply > 0 ? event.ply : fallbackIndex + 1;
}

// ── Replay capture (no fog to redact; capture every distinct position) ────────

function captureReplayView(view: JieqiWireView | null): void {
  if (!view) return;
  if (view === lastCapturedView) return;
  const positionKey = replayPositionKey(view);
  const nextPly = replayPlyForView(view, positionKey !== lastCapturedPositionKey);
  if (positionKey === lastCapturedPositionKey && nextPly <= replay.latestPly()) {
    lastCapturedView = view;
    return;
  }
  replay.push({ ply: nextPly, view });
  lastCapturedView = view;
  lastCapturedPositionKey = positionKey;
}

function replayPlyForView(view: JieqiWireView, positionChanged: boolean): number {
  if (view.status.type === 'playing') {
    const completedFullMoves = Math.max(0, view.moveNumber - 1);
    return completedFullMoves * 2 + (view.status.turn === 'black' ? 1 : 0);
  }
  if (positionChanged && view.lastMove) return replay.latestPly() + 1;
  return replay.latestPly();
}

function replayPositionKey(view: JieqiWireView): string {
  const board = Object.entries(view.board)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([square, entry]) =>
      entry.faceDown ? [square, entry.color, true] : [square, entry.color, entry.role, false],
    );
  return JSON.stringify({
    board,
    lastMove: view.lastMove ?? null,
    moveNumber: view.moveNumber,
    perspective: view.perspective,
    captured: view.captured,
  });
}

function isJieqiMoveEvent(event: JieqiWireEvent): event is JieqiMoveEvent {
  const move = (event as { move?: unknown }).move;
  return (
    event.type === 'move-played' &&
    isJieqiColor((event as { color?: unknown }).color) &&
    typeof move === 'object' &&
    move !== null &&
    typeof (move as { from?: unknown }).from === 'string' &&
    typeof (move as { to?: unknown }).to === 'string'
  );
}

function orientationFor(view: JieqiWireView | null): JieqiColor {
  if (isJieqiColor(state.seat)) return state.seat;
  return view?.perspective ?? 'red';
}

function isJieqiColor(value: unknown): value is JieqiColor {
  return value === 'red' || value === 'black';
}
