// Live multiplayer room client for hidden/dev-only Dark Xiangqi (9x10) — the
// second self-contained tenant client and the first FOG tenant on the
// socket-client + chrome stack (the P2 rehearsal: chess and DMX converge on
// this shape next). The connection state machine lives in
// variant-tenant/socket-client.ts and the room chrome (clocks, countdowns,
// action status with confirm dialogs, room actions) in
// variant-tenant/room-chrome.ts; this module owns what is genuinely Dark
// Xiangqi: the intersection-board SVG with the fog mask, click-to-move over
// visible pieces, the fog-safe replay CAPTURE policy, and the masked move
// list. The postgame module reuses renderDarkXiangqiBoardSvg.
//
// Wire shape pinned by dark-xiangqi-golden-wire.test.ts: the tenant core
// snapshot with NO extras (no mode/pveEngineId/rated/forfeitDeadline/rematch),
// so the chrome's forfeit banner and rematch block simply never arm.

import type {
  XiangqiColor,
  XiangqiGameStatus,
  XiangqiMove,
  XiangqiPiece,
  XiangqiSquare,
} from '@mistboard/game';
import './live-xiangqi.css';
import { darkXiangqiEnabled } from './feature-flags.js';
import { createLiveLayout, setLiveLayoutGameSpec } from './live-layout.js';
import { initLiveSound, resetLiveSoundState } from './live-sound.js';
import { clearSeatTokenForRoom, type LiveRefs } from './live-state.js';
import { roomIdFromPath } from './room-url.js';
import { createTenantReplayController } from './variant-tenant/replay-controller.js';
import { createTenantRoomChrome, type WebVariantTenant } from './variant-tenant/room-chrome.js';
import {
  createTenantSocketClient,
  type TenantConnectionState,
  type TenantSocketClient,
} from './variant-tenant/socket-client.js';
import { xiangqiFogRegion } from './xiangqi-fog.js';
import { renderXiangqiPiece } from './xiangqi-pieces.js';

type DarkXiangqiWireBoardEntry =
  | { piece: XiangqiPiece; shrouded: false }
  | { color: XiangqiColor; shrouded: true };

export type DarkXiangqiWireView = {
  id: string;
  perspective: XiangqiColor;
  board: Partial<Record<XiangqiSquare, DarkXiangqiWireBoardEntry>>;
  visibleSquares: XiangqiSquare[];
  legalMoves: XiangqiMove[];
  status: XiangqiGameStatus;
  moveNumber: number;
  lastMove?: XiangqiMove;
};

type DarkXiangqiWireEvent =
  | { type: 'move-played'; color: XiangqiColor; move: XiangqiMove; at: number; ply?: number }
  | { type: string; [key: string]: unknown };
type DarkXiangqiMoveEvent = Extract<DarkXiangqiWireEvent, { type: 'move-played' }>;
type DarkXiangqiVisibleMoveRow = {
  fullMove: number;
  red?: string;
  black?: string;
};

type DarkXiangqiLiveClock = {
  activeColor: XiangqiColor | null;
  incrementMs: number;
  initialMs: number;
  remainingMs: Record<XiangqiColor, number>;
  runningSince: number | null;
};

type DarkXiangqiLiveFrame = {
  type: 'hello' | 'snapshot' | 'event-appended';
  clientId?: string;
  seatToken?: string;
  seat: XiangqiColor | 'spectator';
  seats: Partial<Record<XiangqiColor, string>>;
  state: DarkXiangqiWireView;
  clock?: DarkXiangqiLiveClock | null;
  connectedSeats?: Record<XiangqiColor, boolean>;
  abortDeadline?: number | null;
  timeControl?: { initialMs: number; incrementMs: number } | null;
  clients?: number;
  events?: DarkXiangqiWireEvent[];
  event?: DarkXiangqiWireEvent;
  seq?: number;
};

const FILES = 'abcdefghi';
const FILE_COUNT = 9;
const RANK_COUNT = 10;
const CELL = 60;
const MARGIN = 36;
const WIDTH = MARGIN * 2 + (FILE_COUNT - 1) * CELL;
const HEIGHT = MARGIN * 2 + (RANK_COUNT - 1) * CELL;
// Corner rounding (viewBox units). Kept in sync with the `.xiangqi-live-board`
// container border-radius so the SVG bg/border and the clipped container agree.
const BOARD_RADIUS = 16;
const RIVER_TOP = MARGIN + 4 * CELL;
const RIVER_BOTTOM = MARGIN + 5 * CELL;
const PIECE_SIZE = 52;
const HIT_HALF = 26;
const FOG_OVERLAP = 0.5;

// ── Module state ─────────────────────────────────────────────────────────────

const state = {
  room: '',
  seat: null as XiangqiColor | 'spectator' | null,
  view: null as DarkXiangqiWireView | null,
  clock: null as DarkXiangqiLiveClock | null,
  timeControl: null as { initialMs: number; incrementMs: number } | null,
  seats: {} as Partial<Record<XiangqiColor, string>>,
  connectedSeats: { red: false, black: false } as Record<XiangqiColor, boolean>,
  events: [] as DarkXiangqiWireEvent[],
  abortDeadline: null as number | null,
};

let client: TenantSocketClient | null = null;
let refs: LiveRefs | null = null;
let selectedSquare: XiangqiSquare | null = null;
let lastCapturedView: DarkXiangqiWireView | null = null;
let lastCapturedPositionKey: string | null = null;

const replay = createTenantReplayController<DarkXiangqiWireView>();

function send(payload: unknown): boolean {
  return client?.send(payload) ?? false;
}

function connection(): TenantConnectionState {
  return client?.connection() ?? 'connecting';
}

// ── Shared tenant room chrome ────────────────────────────────────────────────

const darkXiangqiWebTenant: WebVariantTenant<XiangqiColor> = {
  displayName: 'Dark Xiangqi',
  colors: ['red', 'black'],
  isColor: isXiangqiColor,
  oppositeColor: (color) => (color === 'red' ? 'black' : 'red'),
  enabled: darkXiangqiEnabled,
  reviewUrl: (roomId) => `/dark-xiangqi/game/${encodeURIComponent(roomId)}`,
  reasonPhrase: darkXiangqiReasonPhrase,
  disabledTitle: 'Dark Xiangqi disabled',
  disabledBody: 'This client build has the room renderer off.',
  rejectedBody: 'This Dark Xiangqi room is not active. Create a new invite to start a game.',
  spectatorBody: 'Watching without private information.',
  selectInstruction: 'Select one of your visible pieces, then choose a destination.',
};

const chrome = createTenantRoomChrome(darkXiangqiWebTenant, {
  view: () => state.view,
  seat: () => state.seat,
  connectionState: () => connection(),
  clock: () => state.clock,
  timeControl: () => state.timeControl,
  connectedSeats: () => state.connectedSeats,
  abortDeadline: () => state.abortDeadline,
  // Not on the Dark Xiangqi wire (golden-pinned, no snapshot extras): the
  // forfeit banner and rematch block never arm.
  forfeitDeadline: () => null,
  roomMode: () => 'pvp',
  room: () => state.room,
  debugRequested: () => false,
  isReplayLive: () => replay.isLive(),
  orientation: () => orientationFor(state.view),
  playAgainRequestBody: () => ({
    mode: 'pvp',
    gameSpecId: 'dark-xiangqi',
    preferredColor: 'random',
    ...(state.timeControl ? { timeControl: state.timeControl } : {}),
  }),
  rematchControls: () => null,
});

function darkXiangqiReasonPhrase(reason: string): string {
  switch (reason) {
    case 'general-captured':
      return 'general capture';
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

export function bootstrapDarkXiangqiLiveRoom(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('missing #app');

  const params = new URLSearchParams(window.location.search);
  const room = roomIdFromPath(window.location.pathname) ?? params.get('room') ?? 'dxq_dev';
  state.room = room;
  selectedSquare = null;
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
  setLiveLayoutGameSpec(app, 'dark-xiangqi');
  chrome.setRenderTarget(refs, {
    sendSocket: send,
    // connect() drops any pending backoff timer and reconnects immediately.
    reconnectNow: () => client?.connect(),
  });

  client = createTenantSocketClient({
    room,
    applyHello: (frame) => applyFrame(frame as DarkXiangqiLiveFrame),
    applySnapshot: (frame) => applyFrame(frame as DarkXiangqiLiveFrame),
    applyEvent: (frame) => applyEventFrame(frame as DarkXiangqiLiveFrame),
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

function applyFrame(frame: DarkXiangqiLiveFrame): void {
  state.seat = frame.seat;
  state.view = frame.state;
  state.clock = frame.clock ?? null;
  state.timeControl = frame.timeControl ?? state.timeControl;
  state.seats = frame.seats ?? state.seats;
  if (frame.connectedSeats) state.connectedSeats = frame.connectedSeats;
  state.abortDeadline = frame.abortDeadline ?? null;
  if (frame.events) state.events = frame.events;
}

function applyEventFrame(frame: DarkXiangqiLiveFrame): void {
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

  if (!darkXiangqiEnabled()) {
    refs.board.className = 'board xiangqi-live-board xiangqi-live-board--disabled';
    refs.board.replaceChildren();
    selectedSquare = null;
    return;
  }

  renderBoard(refs, displayedView);
  renderVisibleMoveList(refs);
}

export function renderDarkXiangqiBoardSvg(
  view: DarkXiangqiWireView,
  perspective: XiangqiColor = view.perspective,
  options: { showFog?: boolean } = {},
): string {
  return boardSvg(view, perspective, { interactive: false, showFog: options.showFog ?? true });
}

function renderBoard(liveRefs: LiveRefs, view: DarkXiangqiWireView | null): void {
  liveRefs.board.className = 'board xiangqi-live-board';
  liveRefs.board.setAttribute('aria-label', 'Dark Xiangqi board');
  if (!view) {
    liveRefs.board.replaceChildren();
    return;
  }

  const perspective = orientationFor(view);
  liveRefs.board.innerHTML = boardSvg(view, perspective, { interactive: true });
  liveRefs.board.querySelectorAll<SVGElement>('[data-square]').forEach((el) => {
    el.addEventListener('click', () => {
      const square = el.dataset.square as XiangqiSquare | undefined;
      if (!square) return;
      handleSquareClick(view, square);
      renderBoard(liveRefs, view);
    });
  });
}

function boardSvg(
  view: DarkXiangqiWireView,
  perspective: XiangqiColor,
  options: { interactive: boolean; showFog?: boolean },
): string {
  // Key the fog mask by the VIEW's own perspective, not the render orientation.
  // The postgame triptych draws the red, truth, and black views in one document,
  // all with the same board orientation and the same view.id (one game) — keying
  // by render orientation made the red and black masks collide, so the black
  // board resolved url(#…) to the red board's mask and showed RED's fog. The
  // view's perspective (red vs black) is unique per fogged board.
  const maskId = `xq-live-fog-${view.id.replace(/[^a-zA-Z0-9_-]/g, '')}-${view.perspective}`;
  const fog = options.showFog === false ? '' : fogLayer(view, perspective, maskId);
  return `
    <svg class="xq-live-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect class="xq-live-bg" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" rx="${BOARD_RADIUS}"/>
      <g class="xq-live-grid">${gridLayer()}</g>
      <g class="xq-live-palace">${palaceLayer(perspective)}</g>
      <g class="xq-live-river">${riverLayer(perspective)}</g>
      <g class="xq-live-fog">${fog}</g>
      <g class="xq-live-lastmove">${lastMoveLayer(view, perspective)}</g>
      <g class="xq-live-selection">${selectionLayer(selectedSquare, perspective)}</g>
      <g class="xq-live-hints">${hintLayer(view, perspective)}</g>
      <g class="xq-live-pieces">${pieceLayer(view, perspective)}</g>
      <g class="xq-live-clicks">${options.interactive ? clickLayer(perspective) : ''}</g>
      <rect class="xq-live-border" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" rx="${BOARD_RADIUS}"/>
    </svg>
  `;
}

function gridLayer(): string {
  const parts: string[] = [];
  const left = MARGIN;
  const right = MARGIN + (FILE_COUNT - 1) * CELL;
  const top = MARGIN;
  const bottom = MARGIN + (RANK_COUNT - 1) * CELL;
  for (let rank = 0; rank < RANK_COUNT; rank++) {
    const y = MARGIN + rank * CELL;
    parts.push(`<line class="xq-live-line" x1="${left}" y1="${y}" x2="${right}" y2="${y}"/>`);
  }
  for (let file = 0; file < FILE_COUNT; file++) {
    const x = MARGIN + file * CELL;
    if (file === 0 || file === FILE_COUNT - 1) {
      parts.push(`<line class="xq-live-line" x1="${x}" y1="${top}" x2="${x}" y2="${bottom}"/>`);
    } else {
      parts.push(`<line class="xq-live-line" x1="${x}" y1="${top}" x2="${x}" y2="${RIVER_TOP}"/>`);
      parts.push(
        `<line class="xq-live-line" x1="${x}" y1="${RIVER_BOTTOM}" x2="${x}" y2="${bottom}"/>`,
      );
    }
  }
  return parts.join('');
}

function palaceLayer(perspective: XiangqiColor): string {
  const parts: string[] = [];
  for (const palace of [
    { fileMin: 3, fileMax: 5, rankMin: 1, rankMax: 3 },
    { fileMin: 3, fileMax: 5, rankMin: 8, rankMax: 10 },
  ]) {
    const a = intersection(palace.fileMin, palace.rankMax, perspective);
    const b = intersection(palace.fileMax, palace.rankMin, perspective);
    const c = intersection(palace.fileMax, palace.rankMax, perspective);
    const d = intersection(palace.fileMin, palace.rankMin, perspective);
    parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
    parts.push(`<line x1="${c.x}" y1="${c.y}" x2="${d.x}" y2="${d.y}"/>`);
  }
  return parts.join('');
}

function riverLayer(perspective: XiangqiColor): string {
  const y = (RIVER_TOP + RIVER_BOTTOM) / 2;
  void perspective;
  return `
    <text x="${MARGIN + 4 * CELL}" y="${y + 1}">楚 河   漢 界</text>
  `;
}

function fogLayer(view: DarkXiangqiWireView, perspective: XiangqiColor, maskId: string): string {
  const cutouts = view.visibleSquares
    .map((square) => {
      const coord = coordOf(square);
      const center = intersection(coord.file, coord.rank, perspective);
      const displayRank = displayRankFor(coord.rank, perspective);
      const x0 = coord.file === 0 ? 0 : center.x - CELL / 2 - FOG_OVERLAP;
      const x1 = coord.file === FILE_COUNT - 1 ? WIDTH : center.x + CELL / 2 + FOG_OVERLAP;
      const y0 = displayRank === 0 ? 0 : center.y - CELL / 2 - FOG_OVERLAP;
      const y1 = displayRank === RANK_COUNT - 1 ? HEIGHT : center.y + CELL / 2 + FOG_OVERLAP;
      return `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="black"/>`;
    })
    .join('');
  return xiangqiFogRegion(
    { width: WIDTH, height: HEIGHT, cell: CELL, margin: MARGIN, rx: BOARD_RADIUS },
    maskId,
    'xq-live-fog-mask',
    cutouts,
  );
}

function lastMoveLayer(view: DarkXiangqiWireView, perspective: XiangqiColor): string {
  if (!view.lastMove) return '';
  return [view.lastMove.from, view.lastMove.to]
    .filter((square) => view.visibleSquares.includes(square))
    .map((square) => {
      const coord = coordOf(square);
      const center = intersection(coord.file, coord.rank, perspective);
      return `<circle class="xq-live-lastmove-cell" cx="${center.x}" cy="${center.y}" r="27"/>`;
    })
    .join('');
}

function selectionLayer(square: XiangqiSquare | null, perspective: XiangqiColor): string {
  if (!square) return '';
  const coord = coordOf(square);
  const center = intersection(coord.file, coord.rank, perspective);
  return `<circle class="xq-live-selection-cell" cx="${center.x}" cy="${center.y}" r="30"/>`;
}

function hintLayer(view: DarkXiangqiWireView, perspective: XiangqiColor): string {
  if (!selectedSquare) return '';
  return view.legalMoves
    .filter((move) => move.from === selectedSquare)
    .map((move) => {
      const coord = coordOf(move.to);
      const center = intersection(coord.file, coord.rank, perspective);
      const occupied = view.board[move.to] !== undefined;
      return occupied
        ? `<circle class="xq-live-hint-capture" cx="${center.x}" cy="${center.y}" r="28"/>`
        : `<circle class="xq-live-hint-dot" cx="${center.x}" cy="${center.y}" r="7"/>`;
    })
    .join('');
}

function pieceLayer(view: DarkXiangqiWireView, perspective: XiangqiColor): string {
  const parts: string[] = [];
  for (const [square, entry] of Object.entries(view.board)) {
    if (!entry) continue;
    const coord = coordOf(square as XiangqiSquare);
    const center = intersection(coord.file, coord.rank, perspective);
    const piece =
      'piece' in entry ? entry.piece : ({ color: entry.color, role: 'soldier' } as const);
    parts.push(
      renderXiangqiPiece(piece, {
        ariaLabel: entry.shrouded ? `${entry.color} hidden piece` : undefined,
        x: center.x - PIECE_SIZE / 2,
        y: center.y - PIECE_SIZE / 2,
        size: PIECE_SIZE,
        shrouded: entry.shrouded,
        className: 'xq-piece',
      }),
    );
  }
  return parts.join('');
}

function clickLayer(perspective: XiangqiColor): string {
  const parts: string[] = [];
  for (let file = 0; file < FILE_COUNT; file++) {
    for (let rank = 1; rank <= RANK_COUNT; rank++) {
      const square = `${FILES[file]}${rank}` as XiangqiSquare;
      const center = intersection(file, rank, perspective);
      parts.push(
        `<rect class="xq-live-hit" data-square="${square}" x="${center.x - HIT_HALF}" y="${center.y - HIT_HALF}" width="${HIT_HALF * 2}" height="${HIT_HALF * 2}"/>`,
      );
    }
  }
  return parts.join('');
}

function handleSquareClick(view: DarkXiangqiWireView, square: XiangqiSquare): void {
  if (!replay.isLive() || connection() !== 'connected') return;
  const result = darkXiangqiClickResult(view, state.seat, selectedSquare, square);
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

export type DarkXiangqiClickResult =
  | { kind: 'select'; square: XiangqiSquare }
  | { kind: 'clear' }
  | { kind: 'move'; move: XiangqiMove }
  | { kind: 'noop' };

// Pure click-to-move decision over a fog view: only the seated player's own
// VISIBLE pieces with at least one legal move are selectable (the web-side
// half of the hidden-info guarantee; pinned by live-dark-xiangqi.test.ts).
export function darkXiangqiClickResult(
  view: DarkXiangqiWireView,
  seat: unknown,
  selected: XiangqiSquare | null,
  square: XiangqiSquare,
): DarkXiangqiClickResult {
  if (!canInteract(view, seat)) return { kind: 'noop' };
  if (!selected) {
    return canSelect(view, seat, square) ? { kind: 'select', square } : { kind: 'noop' };
  }
  if (selected === square) return { kind: 'clear' };
  const move = view.legalMoves.find(
    (candidate) => candidate.from === selected && candidate.to === square,
  );
  if (move) return { kind: 'move', move };
  return canSelect(view, seat, square) ? { kind: 'select', square } : { kind: 'clear' };
}

function canInteract(view: DarkXiangqiWireView, seat: unknown): boolean {
  return view.status.type === 'playing' && isXiangqiColor(seat) && view.status.turn === seat;
}

function canSelect(view: DarkXiangqiWireView, seat: unknown, square: XiangqiSquare): boolean {
  if (!canInteract(view, seat)) return false;
  const entry = view.board[square];
  if (!entry || !('piece' in entry) || entry.piece.color !== seat) return false;
  return view.legalMoves.some((move) => move.from === square);
}

function renderVisibleMoveList(liveRefs: LiveRefs): void {
  const moves = state.events.filter((event): event is DarkXiangqiMoveEvent =>
    isDarkXiangqiMoveEvent(event),
  );
  const plyCount = replay.visiblePlyCount();
  liveRefs.moveList.replaceChildren();
  if (plyCount === 0) {
    const item = document.createElement('li');
    item.className = 'move-row masked';
    item.textContent = 'No visible moves yet';
    liveRefs.moveList.append(item);
    return;
  }
  const activePly = replay.activePly();
  for (const row of visibleMoveRows(moves, plyCount)) {
    const item = document.createElement('li');
    item.className = 'move-row xiangqi-move-row';
    const number = document.createElement('span');
    number.className = 'xiangqi-move-row__number';
    number.textContent = `${row.fullMove}.`;
    const red = document.createElement('span');
    red.className = [
      'xiangqi-move-row__move',
      row.red ? '' : 'masked',
      activePly === row.fullMove * 2 - 1 ? 'active' : '',
    ]
      .filter(Boolean)
      .join(' ');
    red.textContent = row.red ?? '...';
    const black = document.createElement('span');
    const blackPly = row.fullMove * 2;
    black.className = [
      'xiangqi-move-row__move',
      row.black ? '' : 'masked',
      activePly === blackPly ? 'active' : '',
    ]
      .filter(Boolean)
      .join(' ');
    black.textContent = blackPly <= plyCount ? (row.black ?? '...') : '';
    item.append(number, red, black);
    liveRefs.moveList.append(item);
  }
}

function visibleMoveRows(
  moves: readonly DarkXiangqiMoveEvent[],
  plyCount: number,
): DarkXiangqiVisibleMoveRow[] {
  const rows = new Map<number, DarkXiangqiVisibleMoveRow>();
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

function eventPly(event: DarkXiangqiMoveEvent, fallbackIndex: number): number {
  return Number.isInteger(event.ply) && event.ply && event.ply > 0 ? event.ply : fallbackIndex + 1;
}

function captureReplayView(view: DarkXiangqiWireView | null): void {
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

function replayPlyForView(view: DarkXiangqiWireView, positionChanged: boolean): number {
  if (view.status.type === 'playing') {
    const completedFullMoves = Math.max(0, view.moveNumber - 1);
    return completedFullMoves * 2 + (view.status.turn === 'black' ? 1 : 0);
  }
  if (positionChanged && view.lastMove) return replay.latestPly() + 1;
  return replay.latestPly();
}

function replayPositionKey(view: DarkXiangqiWireView): string {
  const board = Object.entries(view.board)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([square, entry]) =>
      'piece' in entry
        ? [square, entry.piece.color, entry.piece.role, false]
        : [square, entry.color, true],
    );
  return JSON.stringify({
    board,
    lastMove: view.lastMove ?? null,
    moveNumber: view.moveNumber,
    perspective: view.perspective,
    visibleSquares: [...view.visibleSquares].sort(),
  });
}

function isDarkXiangqiMoveEvent(event: DarkXiangqiWireEvent): event is DarkXiangqiMoveEvent {
  const move = (event as { move?: unknown }).move;
  return (
    event.type === 'move-played' &&
    isXiangqiColor((event as { color?: unknown }).color) &&
    typeof move === 'object' &&
    move !== null &&
    typeof (move as { from?: unknown }).from === 'string' &&
    typeof (move as { to?: unknown }).to === 'string'
  );
}

function orientationFor(view: DarkXiangqiWireView | null): XiangqiColor {
  if (isXiangqiColor(state.seat)) return state.seat;
  return view?.perspective ?? 'red';
}

function intersection(
  file: number,
  rank: number,
  perspective: XiangqiColor,
): { x: number; y: number } {
  return {
    x: MARGIN + file * CELL,
    y: MARGIN + displayRankFor(rank, perspective) * CELL,
  };
}

function displayRankFor(rank: number, perspective: XiangqiColor): number {
  return perspective === 'red' ? RANK_COUNT - rank : rank - 1;
}

function coordOf(square: XiangqiSquare): { file: number; rank: number } {
  return {
    file: Math.max(0, FILES.indexOf(square[0] ?? '')),
    rank: Number(square.slice(1)),
  };
}

function isXiangqiColor(value: unknown): value is XiangqiColor {
  return value === 'red' || value === 'black';
}
