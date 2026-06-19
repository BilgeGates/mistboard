// Live multiplayer room client for banqi (半棋 / Chinese Dark Chess) — a
// self-contained tenant client on the socket-client + chrome stack, modeled on
// the jieqi room but SYMMETRIC-information rather than identity-per-seat-hidden.
//
// Banqi positions are fully PUBLIC and a face-down tile carries NO colour or
// identity to anyone (the deal is the only hidden state, hidden from both seats
// equally). So this client carries NO fog: no fog mask, no visibleSquares, no
// opponent-move stripping. It renders the masked BanqiPlayerView the server
// sends; there is NO hidden-info logic client-side.
//
// Board rendering, the face-down tile-backs vs revealed pieces, selection ring,
// hints, and last-move come from live-banqi-render.ts; click-to-move from
// live-banqi-interaction.ts. The connection state machine lives in
// variant-tenant/socket-client.ts and the room chrome (clocks, countdowns,
// action status, room actions) in variant-tenant/room-chrome.ts. This module
// adds the captured-pool panel (grouped by owner) on top of that shared chrome.

import type {
  BanqiColor,
  BanqiGameStatus,
  BanqiMove,
  BanqiPieceRole,
  BanqiSeat,
  BanqiSquare,
} from '@mistboard/game';
import './live-xiangqi.css';
import { banqiEnabled } from './feature-flags.js';
import { banqiClickResult } from './live-banqi-interaction.js';
import { installBanqiBoardStyles, renderBanqiBoardSvg } from './live-banqi-render.js';
import {
  maybePlayBanqiSnapshotSound,
  resetBanqiSoundState,
  soundForOwnBanqiMove,
} from './live-banqi-sound.js';
import { createLiveLayout, setLiveLayoutGameSpec } from './live-layout.js';
import { initLiveSound, playSound, resetLiveSoundState } from './live-sound.js';
import { clearSeatTokenForRoom, type LiveRefs } from './live-state.js';
import { roomIdFromPath } from './room-url.js';
import { syncMoveListScroll } from './variant-tenant/chrome-dom.js';
import { createTenantReplayController } from './variant-tenant/replay-controller.js';
import { createTenantRoomChrome, type WebVariantTenant } from './variant-tenant/room-chrome.js';
import {
  createTenantSocketClient,
  type TenantConnectionState,
  type TenantSocketClient,
} from './variant-tenant/socket-client.js';
import { readStoredXiangqiPieceSet } from './xiangqi-appearance-storage.js';
import { renderXiangqiPieceGlyphed } from './xiangqi-piece-sets.js';

// ── Wire shapes (mirror BanqiPlayerView; board entries are faceDown-tagged) ──

type BanqiWireBoardEntry =
  | { color: BanqiColor; role: BanqiPieceRole; faceDown: false }
  | { faceDown: true };

type BanqiWireCaptured = { owner: BanqiColor; role: BanqiPieceRole };

export type BanqiWireView = {
  id: string;
  perspective: BanqiSeat;
  board: Partial<Record<BanqiSquare, BanqiWireBoardEntry>>;
  legalMoves: BanqiMove[];
  captured: BanqiWireCaptured[];
  status: BanqiGameStatus;
  ply: number;
  firstColor: BanqiColor | null;
  moveNumber: number;
  lastMove?: BanqiMove;
};

type BanqiWireEvent =
  | { type: 'move-played'; color: BanqiSeat; move: BanqiMove; at: number; ply?: number }
  | { type: string; [key: string]: unknown };
type BanqiMoveEvent = Extract<BanqiWireEvent, { type: 'move-played' }>;
type BanqiVisibleMoveRow = {
  fullMove: number;
  red?: string;
  black?: string;
};

type BanqiLiveClock = {
  activeColor: BanqiSeat | null;
  incrementMs: number;
  initialMs: number;
  remainingMs: Record<BanqiSeat, number>;
  runningSince: number | null;
};

type BanqiLiveFrame = {
  type: 'hello' | 'snapshot' | 'event-appended';
  clientId?: string;
  seatToken?: string;
  seat: BanqiSeat | 'spectator';
  seats: Partial<Record<BanqiSeat, string>>;
  state: BanqiWireView;
  clock?: BanqiLiveClock | null;
  connectedSeats?: Record<BanqiSeat, boolean>;
  abortDeadline?: number | null;
  roomMode?: 'pve' | 'pvp';
  pveEngineId?: string | null;
  timeControl?: { initialMs: number; incrementMs: number } | null;
  clients?: number;
  events?: BanqiWireEvent[];
  event?: BanqiWireEvent;
  seq?: number;
};

// ── Module state ─────────────────────────────────────────────────────────────

const state = {
  room: '',
  seat: null as BanqiSeat | 'spectator' | null,
  view: null as BanqiWireView | null,
  clock: null as BanqiLiveClock | null,
  timeControl: null as { initialMs: number; incrementMs: number } | null,
  seats: {} as Partial<Record<BanqiSeat, string>>,
  connectedSeats: { red: false, black: false } as Record<BanqiSeat, boolean>,
  events: [] as BanqiWireEvent[],
  abortDeadline: null as number | null,
  roomMode: 'pvp' as 'pve' | 'pvp',
  pveEngineId: null as string | null,
};

let client: TenantSocketClient | null = null;
let refs: LiveRefs | null = null;
let selectedSquare: BanqiSquare | null = null;
let lastCapturedView: BanqiWireView | null = null;
let lastCapturedPositionKey: string | null = null;

const replay = createTenantReplayController<BanqiWireView>();

function send(payload: unknown): boolean {
  return client?.send(payload) ?? false;
}

function connection(): TenantConnectionState {
  return client?.connection() ?? 'connecting';
}

// ── Shared tenant room chrome ────────────────────────────────────────────────

// Banqi seats are first/second mover ('red' seat = first); the actual ink is bound by the
// opening flip (view.firstColor). The first-mover seat plays firstColor; the second-mover
// seat plays the opposite. Null until the flip binds.
export function banqiSeatInk(seat: BanqiSeat, view: BanqiWireView | null): BanqiColor | null {
  if (!view || view.firstColor === null) return null;
  return seat === 'red' ? view.firstColor : view.firstColor === 'red' ? 'black' : 'red';
}

// A seat's player label. Banqi's seat names are NOT colors, so labeling by seat shows the
// engine as "Red" even when it flipped black. Label by the bound ink once the flip
// assigns it, else by move order ("First"/"Second") — colors do not exist pre-flip.
function banqiSeatLabel(seat: BanqiSeat): string {
  const ink = banqiSeatInk(seat, state.view);
  if (ink) return ink === 'red' ? 'Red' : 'Black';
  return seat === 'red' ? 'First' : 'Second';
}

const banqiWebTenant: WebVariantTenant<BanqiSeat> = {
  displayName: 'Banqi',
  colors: ['red', 'black'],
  isColor: isBanqiSeat,
  oppositeColor: (color) => (color === 'red' ? 'black' : 'red'),
  enabled: banqiEnabled,
  reviewUrl: (roomId) => `/banqi/game/${encodeURIComponent(roomId)}`,
  reasonPhrase: banqiReasonPhrase,
  disabledTitle: 'Banqi disabled',
  disabledBody: 'This client build has the room renderer off.',
  rejectedBody: 'This Banqi room is not active. Create a new invite to start a game.',
  spectatorBody: 'Watching without private information.',
  selectInstruction: 'Tap a face-down tile to flip it, or select one of your pieces to move.',
  // Banqi colors are assigned by the opening flip; label players by ink (or move order
  // before the flip), and surface the opening "to move" before the clock arms.
  seatLabel: banqiSeatLabel,
  showPregameTurn: true,
};

const chrome = createTenantRoomChrome(banqiWebTenant, {
  view: () => state.view,
  seat: () => state.seat,
  connectionState: () => connection(),
  clock: () => state.clock,
  timeControl: () => state.timeControl,
  connectedSeats: () => state.connectedSeats,
  abortDeadline: () => state.abortDeadline,
  // Not on the Banqi wire: the forfeit banner and rematch block never arm.
  forfeitDeadline: () => null,
  roomMode: () => state.roomMode,
  room: () => state.room,
  debugRequested: () => false,
  isReplayLive: () => replay.isLive(),
  orientation: () => orientationFor(state.view),
  playAgainRequestBody: () => ({
    mode: state.roomMode,
    gameSpecId: 'banqi',
    // Swap who opens each rematch: the 'red' seat moves first, so request the seat opposite
    // this game's to alternate the opener (you and the engine take turns going first).
    preferredColor: isBanqiSeat(state.seat) ? (state.seat === 'red' ? 'black' : 'red') : 'random',
    ...(state.roomMode === 'pve' && state.pveEngineId ? { engineId: state.pveEngineId } : {}),
    ...(state.timeControl ? { timeControl: state.timeControl } : {}),
  }),
  rematchControls: () => null,
});

function banqiReasonPhrase(reason: string): string {
  switch (reason) {
    case 'stalemate':
      return 'no legal move';
    case 'no-progress':
      return 'no progress';
    case 'repetition':
      return 'repetition';
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

export function bootstrapBanqiLiveRoom(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('missing #app');

  const params = new URLSearchParams(window.location.search);
  const room = roomIdFromPath(window.location.pathname) ?? params.get('room') ?? 'bq_dev';
  state.room = room;
  selectedSquare = null;
  lastCapturedView = null;
  lastCapturedPositionKey = null;
  replay.reset();
  chrome.resetState();
  installBanqiBoardStyles();
  initLiveSound();
  resetLiveSoundState();
  resetBanqiSoundState();

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
  setLiveLayoutGameSpec(app, 'banqi');
  chrome.setRenderTarget(refs, {
    sendSocket: send,
    // connect() drops any pending backoff timer and reconnects immediately.
    reconnectNow: () => client?.connect(),
  });

  client = createTenantSocketClient({
    room,
    applyHello: (frame) => applyFrame(frame as BanqiLiveFrame),
    applySnapshot: (frame) => {
      applyFrame(frame as BanqiLiveFrame);
      maybePlayBanqiSnapshotSound(state.view, state.seat);
    },
    applyEvent: (frame) => applyEventFrame(frame as BanqiLiveFrame),
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

function applyFrame(frame: BanqiLiveFrame): void {
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

function applyEventFrame(frame: BanqiLiveFrame): void {
  const events = state.events;
  applyFrame(frame);
  state.events = events;
  if (frame.event) state.events = [...events, frame.event];
  maybePlayBanqiSnapshotSound(state.view, state.seat);
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

  if (!banqiEnabled()) {
    refs.board.className = 'board banqi-live-board banqi-live-board--disabled';
    refs.board.replaceChildren();
    selectedSquare = null;
    return;
  }

  renderBoard(refs, displayedView);
  renderVisibleMoveList(refs);
}

function renderBoard(liveRefs: LiveRefs, view: BanqiWireView | null): void {
  liveRefs.board.className = 'board banqi-live-board';
  liveRefs.board.setAttribute('aria-label', 'Banqi board');
  if (!view) {
    liveRefs.board.replaceChildren();
    return;
  }

  const perspective = orientationFor(view);
  liveRefs.board.innerHTML = renderBanqiBoardSvg(view, perspective, {
    interactive: true,
    selectedSquare,
    // A face-down tile is clicked directly to flip, so the renderer wants only
    // the selected piece's board moves (it already excludes self-move flips).
    legalMoves: selectedSquare
      ? view.legalMoves.filter((move) => move.from === selectedSquare && move.to !== move.from)
      : [],
  });
  liveRefs.board.querySelectorAll<SVGElement>('[data-square]').forEach((el) => {
    el.addEventListener('click', () => {
      const square = el.dataset.square as BanqiSquare | undefined;
      if (!square) return;
      handleSquareClick(view, square);
      renderBoard(liveRefs, view);
    });
  });
}

function handleSquareClick(view: BanqiWireView, square: BanqiSquare): void {
  if (!replay.isLive() || connection() !== 'connected') return;
  const result = banqiClickResult(view, state.seat, selectedSquare, square);
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
  if (send({ type: 'move', from: result.move.from, to: result.move.to })) {
    playSound(soundForOwnBanqiMove(view, result.move));
  }
}

// ── Captured pool ─────────────────────────────────────────────────────────────

// Lichess convention: a player's captured material sits next to that player.
// The bottom strip is the viewer's side, so it shows the pieces the viewer has
// captured (the opponent's lost pieces); the top strip is the opponent's side,
// so it shows the pieces the opponent has captured (the viewer's lost pieces).
// fillCapturedPool filters by former owner, so top filters the viewer's ink and
// bottom filters the opponent's ink. Captures are always REVEALED in banqi
// (adjacency and cannon both require a revealed target), so every captured piece
// has a known identity — there is no "?" case. Reuses the existing
// .captures-strip / .mini-xq-capture-piece styling (no new CSS).
function renderCapturedPools(liveRefs: LiveRefs, view: BanqiWireView | null): void {
  liveRefs.capturesTop.replaceChildren();
  liveRefs.capturesBottom.replaceChildren();
  if (!view) return;
  const viewerInk = viewerInkFor(view);
  if (viewerInk === null) return; // no ink bound yet → nothing captured
  const opponentInk = viewerInk === 'red' ? 'black' : 'red';
  fillCapturedPool(liveRefs.capturesTop, view.captured, viewerInk);
  fillCapturedPool(liveRefs.capturesBottom, view.captured, opponentInk);
}

// The viewer's INK (glyph colour), once the first flip binds it. Falls back to
// the seated viewer's ink via firstColor; spectators and pre-binding return null.
function viewerInkFor(view: BanqiWireView): BanqiColor | null {
  if (view.firstColor === null) return null;
  const seat = orientationFor(view);
  return seat === 'red' ? view.firstColor : view.firstColor === 'red' ? 'black' : 'red';
}

// Exported for unit testing the captured-pool data path without a live socket —
// same extraction rationale as live-banqi-render / live-banqi-interaction.
export function fillCapturedPool(
  host: HTMLElement,
  captured: readonly BanqiWireCaptured[],
  owner: BanqiColor,
): void {
  const mine = captured.filter((entry) => entry.owner === owner);
  host.classList.toggle('has-captures', mine.length > 0);
  if (mine.length === 0) return;
  // Group repeats of the same role into one glyph + a count badge so a full pool
  // (banqi tops out at 16 captures per side) stays inside the board width instead
  // of overflowing the fixed-height strip. Keep first-capture order (no ladder
  // sort) so the row reads as material taken over time.
  const order: BanqiPieceRole[] = [];
  const counts = new Map<BanqiPieceRole, number>();
  for (const entry of mine) {
    if (!counts.has(entry.role)) order.push(entry.role);
    counts.set(entry.role, (counts.get(entry.role) ?? 0) + 1);
  }
  const pieceSet = readStoredXiangqiPieceSet();
  const row = document.createElement('div');
  row.className = 'captures-row mini-xq-captures-row';
  for (const role of order) {
    const count = counts.get(role) ?? 1;
    const span = document.createElement('span');
    span.className = count > 1 ? 'mini-xq-capture-piece has-count' : 'mini-xq-capture-piece';
    span.setAttribute('aria-label', count > 1 ? `${owner} ${role} x${count}` : `${owner} ${role}`);
    span.innerHTML = renderXiangqiPieceGlyphed({ color: owner, role }, pieceSet, {
      ariaLabel: `${owner} ${role}`,
    });
    if (count > 1) {
      const badge = document.createElement('span');
      badge.className = 'captures-count-badge';
      badge.textContent = String(count);
      badge.setAttribute('aria-hidden', 'true');
      span.append(badge);
    }
    row.append(span);
  }
  host.append(row);
}

// ── Move list (positions are public, so every move shows) ────────────────────

function renderVisibleMoveList(liveRefs: LiveRefs): void {
  const moves = state.events.filter((event): event is BanqiMoveEvent => isBanqiMoveEvent(event));
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
  syncMoveListScroll(liveRefs.moveList, { live: replay.isLive(), plyCount: replay.latestPly() });
}

function visibleMoveRows(
  moves: readonly BanqiMoveEvent[],
  plyCount: number,
): BanqiVisibleMoveRow[] {
  const rows = new Map<number, BanqiVisibleMoveRow>();
  for (let fullMove = 1; fullMove <= Math.ceil(plyCount / 2); fullMove += 1) {
    rows.set(fullMove, { fullMove });
  }
  moves.forEach((event, index) => {
    const ply = eventPly(event, index);
    if (ply > plyCount) return;
    const fullMove = Math.floor((ply - 1) / 2) + 1;
    const row = rows.get(fullMove) ?? { fullMove };
    row[event.color] = banqiMoveLabel(event.move);
    rows.set(fullMove, row);
  });
  return [...rows.values()].sort((a, b) => a.fullMove - b.fullMove);
}

// A flip (self-move) is shown as the flipped square; a board move as from-to.
function banqiMoveLabel(move: BanqiMove): string {
  return move.from === move.to ? `${move.from}↑` : `${move.from}-${move.to}`;
}

function eventPly(event: BanqiMoveEvent, fallbackIndex: number): number {
  return Number.isInteger(event.ply) && event.ply && event.ply > 0 ? event.ply : fallbackIndex + 1;
}

// ── Replay capture (no fog to redact; capture every distinct position) ────────

function captureReplayView(view: BanqiWireView | null): void {
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

// Banqi's view carries its own ply count, so the live ply is just view.ply while
// playing; a finished frame appends a final ply only when the position changed.
function replayPlyForView(view: BanqiWireView, positionChanged: boolean): number {
  if (view.status.type === 'playing') return view.ply;
  if (positionChanged && view.lastMove) return replay.latestPly() + 1;
  return replay.latestPly();
}

function replayPositionKey(view: BanqiWireView): string {
  const board = Object.entries(view.board)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([square, entry]) =>
      entry.faceDown ? [square, true] : [square, entry.color, entry.role, false],
    );
  return JSON.stringify({
    board,
    lastMove: view.lastMove ?? null,
    ply: view.ply,
    perspective: view.perspective,
    firstColor: view.firstColor,
    captured: view.captured,
  });
}

function isBanqiMoveEvent(event: BanqiWireEvent): event is BanqiMoveEvent {
  const move = (event as { move?: unknown }).move;
  return (
    event.type === 'move-played' &&
    isBanqiSeat((event as { color?: unknown }).color) &&
    typeof move === 'object' &&
    move !== null &&
    typeof (move as { from?: unknown }).from === 'string' &&
    typeof (move as { to?: unknown }).to === 'string'
  );
}

function orientationFor(view: BanqiWireView | null): BanqiSeat {
  if (isBanqiSeat(state.seat)) return state.seat;
  return view?.perspective ?? 'red';
}

function isBanqiSeat(value: unknown): value is BanqiSeat {
  return value === 'red' || value === 'black';
}
