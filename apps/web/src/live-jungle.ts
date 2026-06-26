// Live multiplayer room client for Jungle / Dou Shou Qi (斗兽棋) — a self-contained
// tenant client on the socket-client + chrome stack, modeled on live-banqi.ts but
// PERFECT-INFORMATION and flip-free.
//
// Jungle hides nothing: the server sends the full board to both seats, the seat IS
// the piece colour (red moves first and owns the red animals), and there is no fog
// mask, no face-down tiles, and no deal. Interaction is plain click-to-move: select
// one of your animals, then click a highlighted legal target. Board rendering comes
// from jungle-render.ts; the connection state machine from
// variant-tenant/socket-client.ts and the room chrome (clocks, status, actions)
// from variant-tenant/room-chrome.ts.

import type {
  JungleColor,
  JungleGameStatus,
  JungleMove,
  JunglePieceRole,
  JungleSquare,
} from '@mistboard/game';
import './live-xiangqi.css';
import { jungleEnabled } from './feature-flags.js';
import { renderJungleBoardSvg } from './jungle-render.js';
import { createLiveLayout, setLiveLayoutGameSpec } from './live-layout.js';
import { clearSeatTokenForRoom, type LiveRefs } from './live-state.js';
import { roomIdFromPath } from './room-url.js';
import { syncMoveListScroll } from './variant-tenant/chrome-dom.js';
import { createTenantReplayController } from './variant-tenant/replay-controller.js';
import { createTenantRoomChrome, type WebVariantTenant } from './variant-tenant/room-chrome.js';
import { installSelectionClickAway } from './variant-tenant/selection-click-away.js';
import {
  createTenantSocketClient,
  type TenantConnectionState,
  type TenantSocketClient,
} from './variant-tenant/socket-client.js';

// ── Wire shapes (mirror JunglePlayerView; the board is a plain piece map) ─────

type JungleWireBoardEntry = { color: JungleColor; role: JunglePieceRole };

export type JungleWireView = {
  id: string;
  perspective: JungleColor;
  board: Partial<Record<JungleSquare, JungleWireBoardEntry>>;
  visibleSquares: JungleSquare[];
  legalMoves: JungleMove[];
  status: JungleGameStatus;
  moveNumber: number;
  lastMove?: JungleMove;
};

type JungleWireEvent =
  | { type: 'move-played'; color: JungleColor; move: JungleMove; at: number; ply?: number }
  | { type: string; [key: string]: unknown };
type JungleMoveEvent = Extract<JungleWireEvent, { type: 'move-played' }>;
type JungleVisibleMoveRow = { fullMove: number; red?: string; black?: string };

type JungleLiveClock = {
  activeColor: JungleColor | null;
  incrementMs: number;
  initialMs: number;
  remainingMs: Record<JungleColor, number>;
  runningSince: number | null;
};

type JungleLiveFrame = {
  type: 'hello' | 'snapshot' | 'event-appended';
  clientId?: string;
  seatToken?: string;
  seat: JungleColor | 'spectator';
  seats: Partial<Record<JungleColor, string>>;
  state: JungleWireView;
  clock?: JungleLiveClock | null;
  connectedSeats?: Record<JungleColor, boolean>;
  abortDeadline?: number | null;
  roomMode?: 'pve' | 'pvp';
  pveEngineId?: string | null;
  timeControl?: { initialMs: number; incrementMs: number } | null;
  events?: JungleWireEvent[];
  event?: JungleWireEvent;
  seq?: number;
};

// ── Module state ─────────────────────────────────────────────────────────────

const state = {
  room: '',
  seat: null as JungleColor | 'spectator' | null,
  view: null as JungleWireView | null,
  clock: null as JungleLiveClock | null,
  timeControl: null as { initialMs: number; incrementMs: number } | null,
  seats: {} as Partial<Record<JungleColor, string>>,
  connectedSeats: { red: false, black: false } as Record<JungleColor, boolean>,
  events: [] as JungleWireEvent[],
  abortDeadline: null as number | null,
  roomMode: 'pvp' as 'pve' | 'pvp',
  pveEngineId: null as string | null,
};

let client: TenantSocketClient | null = null;
let refs: LiveRefs | null = null;
let selectedSquare: JungleSquare | null = null;
let lastCapturedView: JungleWireView | null = null;
let lastCapturedKey: string | null = null;

const replay = createTenantReplayController<JungleWireView>();

function send(payload: unknown): boolean {
  return client?.send(payload) ?? false;
}

function connection(): TenantConnectionState {
  return client?.connection() ?? 'connecting';
}

function isJungleColor(value: unknown): value is JungleColor {
  return value === 'red' || value === 'black';
}

function oppositeColor(color: JungleColor): JungleColor {
  return color === 'red' ? 'black' : 'red';
}

function orientationFor(view: JungleWireView | null): JungleColor {
  if (isJungleColor(state.seat)) return state.seat;
  return view?.perspective ?? 'red';
}

// ── Shared tenant room chrome ────────────────────────────────────────────────

const jungleWebTenant: WebVariantTenant<JungleColor> = {
  displayName: 'Jungle',
  colors: ['red', 'black'],
  isColor: isJungleColor,
  oppositeColor,
  enabled: jungleEnabled,
  reviewUrl: (roomId) => `/room/${encodeURIComponent(roomId)}`,
  reasonPhrase: jungleReasonPhrase,
  disabledTitle: 'Jungle disabled',
  disabledBody: 'This client build has the room renderer off.',
  rejectedBody: 'This Jungle room is not active. Create a new invite to start a game.',
  spectatorBody: 'Watching the game.',
  selectInstruction: 'Select one of your animals, then tap where it should move.',
  seatLabel: (seat) => (seat === 'red' ? 'Red' : 'Black'),
  showPregameTurn: true,
};

const chrome = createTenantRoomChrome(jungleWebTenant, {
  view: () => state.view,
  seat: () => state.seat,
  connectionState: () => connection(),
  clock: () => state.clock,
  timeControl: () => state.timeControl,
  connectedSeats: () => state.connectedSeats,
  abortDeadline: () => state.abortDeadline,
  forfeitDeadline: () => null,
  roomMode: () => state.roomMode,
  room: () => state.room,
  debugRequested: () => false,
  isReplayLive: () => replay.isLive(),
  orientation: () => orientationFor(state.view),
  playAgainRequestBody: () => ({
    mode: state.roomMode,
    gameSpecId: 'jungle',
    // Alternate the opener each rematch: request the seat opposite this game's.
    preferredColor: isJungleColor(state.seat) ? oppositeColor(state.seat) : 'random',
    ...(state.roomMode === 'pve' && state.pveEngineId ? { engineId: state.pveEngineId } : {}),
    ...(state.timeControl ? { timeControl: state.timeControl } : {}),
  }),
  rematchControls: () => null,
});

function jungleReasonPhrase(reason: string): string {
  switch (reason) {
    case 'den-entered':
      return 'reaching the den';
    case 'pieces-captured':
      return 'capturing every animal';
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

export function bootstrapJungleLiveRoom(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('missing #app');

  const params = new URLSearchParams(window.location.search);
  const room = roomIdFromPath(window.location.pathname) ?? params.get('room') ?? 'jgl_dev';
  state.room = room;
  selectedSquare = null;
  lastCapturedView = null;
  lastCapturedKey = null;
  replay.reset();
  chrome.resetState();

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
  setLiveLayoutGameSpec(app, 'jungle');
  chrome.setRenderTarget(refs, {
    sendSocket: send,
    reconnectNow: () => client?.connect(),
  });
  installJungleBoardInteraction(refs);
  installSelectionClickAway({
    roots: () => [refs?.board],
    hasSelection: () => selectedSquare !== null,
    clearSelection: () => {
      selectedSquare = null;
      if (refs) renderBoard(refs, replay.currentView(state.view));
    },
  });

  client = createTenantSocketClient({
    room,
    applyHello: (frame) => applyFrame(frame as JungleLiveFrame),
    applySnapshot: (frame) => applyFrame(frame as JungleLiveFrame),
    applyEvent: (frame) => applyEventFrame(frame as JungleLiveFrame),
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

function applyFrame(frame: JungleLiveFrame): void {
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

function applyEventFrame(frame: JungleLiveFrame): void {
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

  if (!jungleEnabled()) {
    refs.board.className = 'board jungle-live-board jungle-live-board--disabled';
    refs.board.replaceChildren();
    selectedSquare = null;
    return;
  }

  renderBoard(refs, displayedView);
  renderVisibleMoveList(refs);
}

function renderBoard(liveRefs: LiveRefs, view: JungleWireView | null): void {
  liveRefs.board.className = 'board jungle-live-board';
  liveRefs.board.setAttribute('aria-label', 'Jungle board');
  if (!view) {
    liveRefs.board.replaceChildren();
    return;
  }
  const targets = selectedSquare
    ? view.legalMoves.filter((m) => m.from === selectedSquare).map((m) => m.to)
    : [];
  liveRefs.board.innerHTML = renderJungleBoardSvg(view.board, {
    perspective: orientationFor(view),
    interactive: true,
    selected: selectedSquare,
    targets,
    lastMove: view.lastMove ?? null,
  });
}

// Click is delegated to the persistent board container once at mount so it
// survives every innerHTML re-render (closest [data-square] reads the cell).
function installJungleBoardInteraction(liveRefs: LiveRefs): void {
  liveRefs.board.addEventListener('click', (event) => {
    const cell = (event.target as HTMLElement).closest('[data-square]');
    const square = cell?.getAttribute('data-square');
    const view = state.view;
    if (!view || !square) return;
    handleSquareClick(view, square as JungleSquare);
    renderBoard(liveRefs, view);
  });
}

function handleSquareClick(view: JungleWireView, square: JungleSquare): void {
  if (!replay.isLive() || connection() !== 'connected') return;
  const seat = state.seat;
  if (!isJungleColor(seat) || view.status.type !== 'playing' || view.status.turn !== seat) {
    selectedSquare = null;
    return;
  }
  const piece = view.board[square];
  // Click your own animal to select it (or re-select another of yours).
  if (piece && piece.color === seat) {
    selectedSquare = square;
    return;
  }
  // With a selection, a click on a legal target plays the move.
  if (selectedSquare) {
    const move = view.legalMoves.find((m) => m.from === selectedSquare && m.to === square);
    if (move) {
      selectedSquare = null;
      send({ type: 'move', from: move.from, to: move.to });
      return;
    }
  }
  selectedSquare = null;
}

// ── Move list (positions are public, so every move shows) ────────────────────

function renderVisibleMoveList(liveRefs: LiveRefs): void {
  const moves = state.events.filter((event): event is JungleMoveEvent => isJungleMoveEvent(event));
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
  moves: readonly JungleMoveEvent[],
  plyCount: number,
): JungleVisibleMoveRow[] {
  const rows = new Map<number, JungleVisibleMoveRow>();
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

function eventPly(event: JungleMoveEvent, fallbackIndex: number): number {
  return Number.isInteger(event.ply) && event.ply && event.ply > 0 ? event.ply : fallbackIndex + 1;
}

// ── Replay capture (perfect info: capture every distinct position) ────────────

function captureReplayView(view: JungleWireView | null): void {
  if (!view || view === lastCapturedView) return;
  const key = JSON.stringify({
    board: view.board,
    lastMove: view.lastMove ?? null,
    status: view.status,
  });
  if (key === lastCapturedKey) {
    lastCapturedView = view;
    return;
  }
  // Ply = number of moves played so far; the initial position is ply 0.
  const ply = state.events.filter(isJungleMoveEvent).length;
  replay.push({ ply, view });
  lastCapturedView = view;
  lastCapturedKey = key;
}

function isJungleMoveEvent(event: JungleWireEvent): event is JungleMoveEvent {
  const move = (event as { move?: unknown }).move;
  return (
    event.type === 'move-played' &&
    isJungleColor((event as { color?: unknown }).color) &&
    typeof move === 'object' &&
    move !== null &&
    typeof (move as { from?: unknown }).from === 'string' &&
    typeof (move as { to?: unknown }).to === 'string'
  );
}
