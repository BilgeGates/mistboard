// Live multiplayer room client for Reveal Chess (chess-jieqi) — a self-contained
// tenant client on the socket-client + chrome stack, modeled on the jieqi room
// but on an 8x8 CHESS board with cburnett pieces (the Crossroads geometry) and
// standard white/black colors.
//
// Reveal Chess is IDENTITY-hidden, not POSITION-hidden: both players see every
// square, every piece's color, and every move. The only hidden axis is piece
// IDENTITY (a face-down piece's role). So this client carries NO fog: no fog
// mask, no visibleSquares, no opponent-move stripping. The client renders ONLY
// the server-sent PlayerView and never invents or infers a hidden identity, so
// the replay capture stores the server's per-seat views directly (a local kernel
// replay is impossible — the client does not know the hidden identities).
//
// Board rendering (face-down disc vs revealed cburnett glyph), selection ring,
// move hints, last-move, and the hit layer come from reveal-chess-render.ts. The
// connection state machine lives in variant-tenant/socket-client.ts and the room
// chrome (clocks, countdowns, action status, room actions) in
// variant-tenant/room-chrome.ts. This module adds the captured-pool panel
// (grouped by owner, "?" disc for an identity the viewer cannot see) and the
// promotion picker (only for a KNOWN pawn reaching its far rank) on top.

import { PIECE_SVGS } from '@mistboard/board-render';
import type {
  RevealChessColor,
  RevealChessGameStatus,
  RevealChessMove,
  RevealChessPieceRole,
  RevealChessPromotionRole,
  RevealChessSquare,
} from '@mistboard/game';
import './live-reveal-chess.css';
import { revealChessEnabled } from './feature-flags.js';
import { createLiveLayout, setLiveLayoutGameSpec } from './live-layout.js';
import { initLiveSound, resetLiveSoundState } from './live-sound.js';
import { clearSeatTokenForRoom, type LiveRefs } from './live-state.js';
import { renderRevealChessBoardSvg, revealChessFacedownDisc } from './reveal-chess-render.js';
import { roomIdFromPath } from './room-url.js';
import { boardAppearanceChangedEvent, setBoardFamily } from './theme.js';
import { createTenantReplayController } from './variant-tenant/replay-controller.js';
import { createTenantRoomChrome, type WebVariantTenant } from './variant-tenant/room-chrome.js';
import {
  createTenantSocketClient,
  type TenantConnectionState,
  type TenantSocketClient,
} from './variant-tenant/socket-client.js';

// ── Wire shapes (mirror RevealChessPlayerView; entries are faceDown-tagged) ──

type RevealChessWireBoardEntry =
  | { color: RevealChessColor; role: RevealChessPieceRole; faceDown: false }
  | { color: RevealChessColor; faceDown: true };

type RevealChessWireCaptured = { owner: RevealChessColor; role: RevealChessPieceRole | null };

export type RevealChessWireView = {
  id: string;
  perspective: RevealChessColor;
  board: Partial<Record<RevealChessSquare, RevealChessWireBoardEntry>>;
  legalMoves: RevealChessMove[];
  captured: RevealChessWireCaptured[];
  inCheck: boolean;
  status: RevealChessGameStatus;
  moveNumber: number;
  lastMove?: RevealChessMove;
};

type RevealChessWireEvent =
  | {
      type: 'move-played';
      color: RevealChessColor;
      move: RevealChessMove;
      at: number;
      ply?: number;
    }
  | { type: string; [key: string]: unknown };
type RevealChessMoveEvent = Extract<RevealChessWireEvent, { type: 'move-played' }>;
type RevealChessVisibleMoveRow = { fullMove: number; white?: string; black?: string };

type RevealChessLiveClock = {
  activeColor: RevealChessColor | null;
  incrementMs: number;
  initialMs: number;
  remainingMs: Record<RevealChessColor, number>;
  runningSince: number | null;
};

type RevealChessLiveTimeControl = { initialMs: number; incrementMs: number };

type RevealChessLiveFrame = {
  type: 'hello' | 'snapshot' | 'event-appended';
  clientId?: string;
  seatToken?: string;
  seat: RevealChessColor | 'spectator';
  seats: Partial<Record<RevealChessColor, string>>;
  state: RevealChessWireView;
  clock?: RevealChessLiveClock | null;
  connectedSeats?: Record<RevealChessColor, boolean>;
  abortDeadline?: number | null;
  forfeitDeadline?: number | null;
  roomMode?: 'pve' | 'pvp';
  pveEngineId?: string | null;
  timeControl?: { initialMs: number; incrementMs: number } | null;
  clients?: number;
  events?: RevealChessWireEvent[];
  event?: RevealChessWireEvent;
  seq?: number;
};

// ── Module state ─────────────────────────────────────────────────────────────

const state = {
  room: '',
  seat: null as RevealChessColor | 'spectator' | null,
  view: null as RevealChessWireView | null,
  clock: null as RevealChessLiveClock | null,
  timeControl: null as RevealChessLiveTimeControl | null,
  seats: {} as Partial<Record<RevealChessColor, string>>,
  connectedSeats: { white: false, black: false } as Record<RevealChessColor, boolean>,
  events: [] as RevealChessWireEvent[],
  abortDeadline: null as number | null,
  forfeitDeadline: null as number | null,
  roomMode: 'pvp' as 'pve' | 'pvp',
  pveEngineId: null as string | null,
};

let client: TenantSocketClient | null = null;
let refs: LiveRefs | null = null;
let selectedSquare: RevealChessSquare | null = null;
// A pending promotion: the from/to of a known-pawn move whose promotion role the
// player still has to pick. While set, the board is non-interactive (the picker
// owns the next input).
let pendingPromotion: { from: RevealChessSquare; to: RevealChessSquare } | null = null;

const replay = createTenantReplayController<RevealChessWireView>();
let lastCapturedView: RevealChessWireView | null = null;
let lastCapturedPositionKey: string | null = null;

function send(payload: unknown): boolean {
  return client?.send(payload) ?? false;
}

function connection(): TenantConnectionState {
  return client?.connection() ?? 'connecting';
}

// ── Shared tenant room chrome ────────────────────────────────────────────────

const revealChessWebTenant: WebVariantTenant<RevealChessColor> = {
  displayName: 'Reveal Chess',
  colors: ['white', 'black'],
  isColor: isRevealChessColor,
  oppositeColor: (color) => (color === 'white' ? 'black' : 'white'),
  enabled: revealChessEnabled,
  reviewUrl: revealChessReviewUrl,
  reasonPhrase: revealChessReasonPhrase,
  disabledTitle: 'Reveal Chess disabled',
  disabledBody: 'This client build has the room renderer off.',
  rejectedBody: 'This Reveal Chess room is not active. Create a new invite to start a game.',
  spectatorBody: 'Watching without private information.',
  selectInstruction: 'Select one of your pieces, then choose a destination.',
};

const chrome = createTenantRoomChrome(revealChessWebTenant, {
  view: () => state.view,
  seat: () => state.seat,
  connectionState: () => connection(),
  clock: () => state.clock,
  timeControl: () => state.timeControl,
  connectedSeats: () => state.connectedSeats,
  abortDeadline: () => state.abortDeadline,
  forfeitDeadline: () => state.forfeitDeadline,
  roomMode: () => state.roomMode,
  room: () => state.room,
  debugRequested: () => false,
  isReplayLive: () => replay.isLive(),
  orientation: () => orientationFor(state.view),
  playAgainRequestBody: () =>
    revealChessLivePlayAgainRequestBody(state.timeControl, {
      mode: state.roomMode,
      pveEngineId: state.pveEngineId,
      seat: state.seat,
    }),
  rematchControls: () => null,
  variantDetail: () => revealChessLiveTimeControlLabel(state.timeControl),
});

export function revealChessReasonPhrase(reason: string): string {
  switch (reason) {
    case 'checkmate':
      return 'checkmate';
    case 'stalemate':
      return 'stalemate';
    case 'no-progress-clock':
    case 'progress-clock':
      return 'no progress';
    case 'threefold-repetition':
    case 'repetition':
      return 'repetition';
    case 'timeout':
      return 'timeout';
    case 'resignation':
      return 'resignation';
    case 'abandonment':
      return 'abandonment';
    case 'king-captured':
      return 'king capture';
    default:
      return 'the game rules';
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function bootstrapRevealChessLiveRoom(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('missing #app');

  const params = new URLSearchParams(window.location.search);
  const room = roomIdFromPath(window.location.pathname) ?? params.get('room') ?? 'rc_dev';
  state.room = room;
  selectedSquare = null;
  pendingPromotion = null;
  lastCapturedView = null;
  lastCapturedPositionKey = null;
  replay.reset();
  chrome.resetState();
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
  setLiveLayoutGameSpec(app, 'reveal-chess');
  setBoardFamily('chess');
  chrome.setRenderTarget(refs, {
    sendSocket: send,
    // connect() drops any pending backoff timer and reconnects immediately.
    reconnectNow: () => client?.connect(),
  });

  client = createTenantSocketClient({
    room,
    applyHello: (frame) => applyFrame(frame as RevealChessLiveFrame),
    applySnapshot: (frame) => applyFrame(frame as RevealChessLiveFrame),
    applyEvent: (frame) => applyEventFrame(frame as RevealChessLiveFrame),
    render: renderAll,
  });
  client.connect();
  client.startPing();
  window.setInterval(() => {
    chrome.tickClocks();
    chrome.tickCountdowns();
  }, 100);
  document.addEventListener('keydown', handleReplayKeyboard);
  window.addEventListener(boardAppearanceChangedEvent, renderAll);
  renderAll();
}

// ── Frame application ────────────────────────────────────────────────────────

function applyFrame(frame: RevealChessLiveFrame): void {
  state.seat = frame.seat;
  state.view = frame.state;
  state.clock = frame.clock ?? null;
  state.timeControl = frame.timeControl ?? state.timeControl;
  state.seats = frame.seats ?? state.seats;
  state.roomMode = frame.roomMode ?? state.roomMode;
  state.pveEngineId = frame.pveEngineId ?? state.pveEngineId;
  if (frame.connectedSeats) state.connectedSeats = frame.connectedSeats;
  state.abortDeadline = frame.abortDeadline ?? null;
  state.forfeitDeadline = frame.forfeitDeadline ?? null;
  if (frame.events) state.events = frame.events;
}

function applyEventFrame(frame: RevealChessLiveFrame): void {
  const events = state.events;
  applyFrame(frame);
  state.events = events;
  if (frame.event) state.events = [...events, frame.event];
}

function handleReplayKeyboard(event: KeyboardEvent): void {
  if (pendingPromotion) return;
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
  refs.moveList.classList.add('reveal-chess-move-list');
  replay.renderShell(refs, renderAll);
  refs.boardStatus.hidden = view !== null;
  chrome.renderActionStatus();
  chrome.renderGameControls();
  chrome.renderRoomActions();
  renderCapturedPools(refs, displayedView);

  if (!revealChessEnabled()) {
    refs.board.className = 'board reveal-chess-live-board reveal-chess-live-board--disabled';
    refs.board.replaceChildren();
    selectedSquare = null;
    pendingPromotion = null;
    return;
  }

  renderBoard(refs, displayedView);
  renderVisibleMoveList(refs);
}

function renderBoard(liveRefs: LiveRefs, view: RevealChessWireView | null): void {
  liveRefs.board.className = 'board reveal-chess-live-board';
  liveRefs.board.setAttribute('aria-label', 'Reveal Chess board');
  if (!view) {
    liveRefs.board.replaceChildren();
    return;
  }

  const perspective = orientationFor(view);
  liveRefs.board.innerHTML = renderRevealChessBoardSvg(view, {
    perspective,
    interactive: replay.isLive() && !pendingPromotion,
    selected: selectedSquare,
    targets: selectedSquare ? legalTargets(view, selectedSquare) : [],
    lastMove: view.lastMove ?? null,
  });
  liveRefs.board.querySelectorAll<SVGElement>('[data-square]').forEach((el) => {
    el.addEventListener('click', () => {
      const square = el.dataset.square as RevealChessSquare | undefined;
      if (!square) return;
      handleSquareClick(view, square);
    });
  });
  if (pendingPromotion) renderPromotionPicker(liveRefs, view, pendingPromotion);
}

function legalTargets(view: RevealChessWireView, from: RevealChessSquare): RevealChessSquare[] {
  return view.legalMoves.filter((move) => move.from === from).map((move) => move.to);
}

function handleSquareClick(view: RevealChessWireView, square: RevealChessSquare): void {
  if (pendingPromotion) return;
  if (!replay.isLive() || connection() !== 'connected') return;
  if (!canInteract(view)) return;

  if (selectedSquare === null) {
    if (canSelect(view, square)) {
      selectedSquare = square;
      renderBoard(refs!, view);
    }
    return;
  }
  if (selectedSquare === square) {
    selectedSquare = null;
    renderBoard(refs!, view);
    return;
  }
  const move = view.legalMoves.find((m) => m.from === selectedSquare && m.to === square);
  if (move) {
    submitMove(view, move.from, move.to);
    return;
  }
  // Clicked elsewhere: reselect if the new square is selectable, else clear.
  selectedSquare = canSelect(view, square) ? square : null;
  renderBoard(refs!, view);
}

// A move from a KNOWN pawn onto its far rank needs a promotion choice (queen /
// rook / bishop / knight). A FACE-DOWN piece reaching the far rank promotes
// automatically server-side (the kernel defaults to queen), so no picker for it.
function submitMove(
  view: RevealChessWireView,
  from: RevealChessSquare,
  to: RevealChessSquare,
): void {
  if (isKnownPawnPromotion(view, from, to)) {
    pendingPromotion = { from, to };
    selectedSquare = null;
    renderBoard(refs!, view);
    return;
  }
  selectedSquare = null;
  send({ type: 'move', from, to });
  renderBoard(refs!, view);
}

function isKnownPawnPromotion(
  view: RevealChessWireView,
  from: RevealChessSquare,
  to: RevealChessSquare,
): boolean {
  const piece = view.board[from];
  if (!piece || piece.faceDown || piece.role !== 'pawn') return false;
  const farRank = piece.color === 'white' ? 8 : 1;
  return Number(to.slice(1)) === farRank;
}

function canInteract(view: RevealChessWireView): boolean {
  return (
    view.status.type === 'playing' &&
    isRevealChessColor(state.seat) &&
    view.status.turn === state.seat
  );
}

function canSelect(view: RevealChessWireView, square: RevealChessSquare): boolean {
  if (!canInteract(view)) return false;
  const entry = view.board[square];
  if (!entry || entry.color !== state.seat) return false;
  return view.legalMoves.some((move) => move.from === square);
}

// ── Promotion picker ──────────────────────────────────────────────────────────

const PROMOTION_ROLES: readonly RevealChessPromotionRole[] = ['queen', 'rook', 'bishop', 'knight'];

function renderPromotionPicker(
  liveRefs: LiveRefs,
  view: RevealChessWireView,
  promotion: { from: RevealChessSquare; to: RevealChessSquare },
): void {
  const piece = view.board[promotion.from];
  const color: RevealChessColor = piece && !piece.faceDown ? piece.color : orientationFor(view);

  const overlay = document.createElement('div');
  overlay.className = 'reveal-chess-promotion';
  const heading = document.createElement('p');
  heading.className = 'reveal-chess-promotion__title';
  heading.textContent = 'Promote to';
  const choices = document.createElement('div');
  choices.className = 'reveal-chess-promotion__choices';
  for (const role of PROMOTION_ROLES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'reveal-chess-promotion__choice';
    button.setAttribute('aria-label', `Promote to ${role}`);
    button.dataset.role = role;
    button.innerHTML = `<svg viewBox="0 0 45 45" width="44" height="44" aria-hidden="true">${promotionGlyph(color, role)}</svg>`;
    button.addEventListener('click', () => {
      const move = promotion;
      pendingPromotion = null;
      send({ type: 'move', from: move.from, to: move.to, promotion: role });
      if (state.view) renderBoard(liveRefs, state.view);
    });
    choices.append(button);
  }
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'reveal-chess-promotion__cancel';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => {
    pendingPromotion = null;
    if (state.view) renderBoard(liveRefs, state.view);
  });
  const card = document.createElement('div');
  card.className = 'reveal-chess-promotion__card';
  card.append(heading, choices, cancel);
  overlay.append(card);
  liveRefs.board.append(overlay);
}

// ── Captured pool ─────────────────────────────────────────────────────────────

// Lichess convention: a player's captured material sits next to that player.
// The bottom strip is the viewer's side, so it shows the pieces the viewer has
// captured (the opponent's lost pieces); the top strip is the opponent's side.
// fillCapturedPool filters by former owner, so top filters the viewer's color
// and bottom filters the opponent's color. A null role (a dark piece the viewer
// did not capture, so cannot identify) renders the face-down "?" disc.
function renderCapturedPools(liveRefs: LiveRefs, view: RevealChessWireView | null): void {
  liveRefs.capturesTop.replaceChildren();
  liveRefs.capturesBottom.replaceChildren();
  if (!view) return;
  const viewer = orientationFor(view);
  const opponent = viewer === 'white' ? 'black' : 'white';
  fillCapturedPool(liveRefs.capturesTop, view.captured, viewer);
  fillCapturedPool(liveRefs.capturesBottom, view.captured, opponent);
}

// Exported for unit testing the captured-pool data path (revealed identity vs
// an unidentifiable "?" dark piece) without a live socket — same extraction
// rationale as the jieqi room's fillCapturedPool.
export function fillCapturedPool(
  host: HTMLElement,
  captured: readonly RevealChessWireCaptured[],
  owner: RevealChessColor,
): void {
  const mine = captured.filter((entry) => entry.owner === owner);
  host.classList.toggle('has-captures', mine.length > 0);
  if (mine.length === 0) return;
  const row = document.createElement('div');
  row.className = 'captures-row reveal-chess-captures-row';
  for (const entry of mine) {
    const span = document.createElement('span');
    span.className = 'reveal-chess-capture-piece';
    if (entry.role === null) {
      span.setAttribute('aria-label', `${owner} hidden piece`);
      span.innerHTML = `<svg viewBox="0 0 44 44" width="26" height="26" aria-hidden="true">${revealChessFacedownDisc(owner, 0, 0, 44)}</svg>`;
    } else {
      span.setAttribute('aria-label', `${owner} ${entry.role}`);
      span.innerHTML = `<svg viewBox="0 0 45 45" width="26" height="26" aria-hidden="true">${promotionGlyph(owner, entry.role)}</svg>`;
    }
    row.append(span);
  }
  host.append(row);
}

// ── Move list (positions are public, so every move shows) ────────────────────

function renderVisibleMoveList(liveRefs: LiveRefs): void {
  const moves = state.events.filter((event): event is RevealChessMoveEvent =>
    isRevealChessMoveEvent(event),
  );
  const plyCount = replay.visiblePlyCount();
  liveRefs.moveList.replaceChildren();
  if (plyCount === 0) {
    const item = document.createElement('li');
    item.className = 'move-row';
    item.textContent = 'No moves yet';
    liveRefs.moveList.append(item);
    return;
  }
  const activePly = replay.activePly();
  for (const row of visibleMoveRows(moves, plyCount)) {
    const item = document.createElement('li');
    item.className = 'move-row reveal-chess-move-row';
    const number = document.createElement('span');
    number.className = 'reveal-chess-move-row__number';
    number.textContent = `${row.fullMove}.`;
    const white = document.createElement('span');
    white.className = [
      'reveal-chess-move-row__move',
      activePly === row.fullMove * 2 - 1 ? 'active' : '',
    ]
      .filter(Boolean)
      .join(' ');
    white.textContent = row.white ?? '...';
    const black = document.createElement('span');
    const blackPly = row.fullMove * 2;
    black.className = ['reveal-chess-move-row__move', activePly === blackPly ? 'active' : '']
      .filter(Boolean)
      .join(' ');
    black.textContent = blackPly <= plyCount ? (row.black ?? '...') : '';
    item.append(number, white, black);
    liveRefs.moveList.append(item);
  }
}

export function visibleMoveRows(
  moves: readonly RevealChessMoveEvent[],
  plyCount: number,
): RevealChessVisibleMoveRow[] {
  const rows = new Map<number, RevealChessVisibleMoveRow>();
  for (let fullMove = 1; fullMove <= Math.ceil(plyCount / 2); fullMove += 1) {
    rows.set(fullMove, { fullMove });
  }
  moves.forEach((event, index) => {
    const ply = eventPly(event, index);
    if (ply > plyCount) return;
    const fullMove = Math.floor((ply - 1) / 2) + 1;
    const row = rows.get(fullMove) ?? { fullMove };
    row[event.color] = uci(event.move);
    rows.set(fullMove, row);
  });
  return [...rows.values()].sort((a, b) => a.fullMove - b.fullMove);
}

function eventPly(event: RevealChessMoveEvent, fallbackIndex: number): number {
  return Number.isInteger(event.ply) && event.ply && event.ply > 0 ? event.ply : fallbackIndex + 1;
}

// ── Replay capture (no fog to redact; capture every distinct server view) ─────

function captureReplayView(view: RevealChessWireView | null): void {
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

function replayPlyForView(view: RevealChessWireView, positionChanged: boolean): number {
  if (view.status.type === 'playing') {
    const completedFullMoves = Math.max(0, view.moveNumber - 1);
    return completedFullMoves * 2 + (view.status.turn === 'black' ? 1 : 0);
  }
  if (positionChanged && view.lastMove) return replay.latestPly() + 1;
  return replay.latestPly();
}

function replayPositionKey(view: RevealChessWireView): string {
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

// ── Helpers ────────────────────────────────────────────────────────────────

export type RevealChessLivePlayAgainOptions = {
  mode?: 'pvp' | 'pve';
  pveEngineId?: string | null;
  seat?: RevealChessColor | 'spectator' | null;
};

export function revealChessLivePlayAgainRequestBody(
  timeControl: RevealChessLiveTimeControl | null,
  options: RevealChessLivePlayAgainOptions = {},
): {
  mode: 'pvp' | 'pve';
  gameSpecId: 'reveal-chess';
  preferredColor: 'white' | 'black' | 'random';
  timeControl?: RevealChessLiveTimeControl;
  engineId?: string;
} {
  const mode = options.mode === 'pve' ? 'pve' : 'pvp';
  const preferredColor =
    mode === 'pve' && options.seat === 'white'
      ? 'black'
      : mode === 'pve' && options.seat === 'black'
        ? 'white'
        : 'random';
  return {
    mode,
    gameSpecId: 'reveal-chess',
    preferredColor,
    ...(timeControl ? { timeControl } : {}),
    ...(mode === 'pve' && options.pveEngineId ? { engineId: options.pveEngineId } : {}),
  };
}

export function revealChessLiveTimeControlLabel(
  timeControl: RevealChessLiveTimeControl | null,
): string | null {
  if (!timeControl) return null;
  const minutes = Math.round(timeControl.initialMs / 60_000);
  const incrementSeconds = Math.round(timeControl.incrementMs / 1000);
  return incrementSeconds > 0 ? `${minutes}+${incrementSeconds}` : `${minutes}+0`;
}

export function revealChessReviewUrl(roomId: string): string {
  return `/reveal-chess/game/${encodeURIComponent(roomId)}`;
}

function orientationFor(view: RevealChessWireView | null): RevealChessColor {
  if (isRevealChessColor(state.seat)) return state.seat;
  return view?.perspective ?? 'white';
}

function uci(move: RevealChessMove): string {
  return `${move.from}${move.to}${move.promotion ? move.promotion[0].toUpperCase() : ''}`;
}

function isRevealChessColor(value: unknown): value is RevealChessColor {
  return value === 'white' || value === 'black';
}

function isRevealChessMoveEvent(event: RevealChessWireEvent): event is RevealChessMoveEvent {
  const move = (event as { move?: unknown }).move;
  return (
    event.type === 'move-played' &&
    isRevealChessColor((event as { color?: unknown }).color) &&
    typeof move === 'object' &&
    move !== null &&
    typeof (move as { from?: unknown }).from === 'string' &&
    typeof (move as { to?: unknown }).to === 'string'
  );
}

// The cburnett glyph inner body for a revealed piece, used by the promotion
// picker and the captured pool. Reveal Chess uses the standard white/black set.
function promotionGlyph(color: RevealChessColor, role: RevealChessPieceRole): string {
  const raw = PIECE_SVGS[`${color}:${role}`];
  if (!raw) return '';
  // Strip the outer <svg ...> open tag and the trailing </svg> so the inner
  // paint can be embedded in a caller-sized <svg viewBox="0 0 45 45">.
  return raw.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}
