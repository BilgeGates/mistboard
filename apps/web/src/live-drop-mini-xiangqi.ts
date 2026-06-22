import {
  DROP_MINI_XIANGQI_DROP_ROLES,
  DROP_MINI_XIANGQI_SPEC_ID,
  type DropMiniXiangqiDropRole,
  type DropMiniXiangqiMove,
  type DropMiniXiangqiPlayerView,
  type MiniXiangqiColor,
  type MiniXiangqiSquare,
} from '@mistboard/game';
import './drop-mini-xiangqi.css';
import {
  dropMiniXiangqiBoardMoves,
  dropMiniXiangqiBoardView,
  dropMiniXiangqiDropTargets,
  dropMiniXiangqiMoveLabel,
  dropMiniXiangqiTargetMoves,
  fillDropMiniXiangqiReserve,
} from './drop-mini-xiangqi-view.js';
import { dropMiniXiangqiEnabled } from './feature-flags.js';
import { createLiveLayout, setLiveLayoutGameSpec } from './live-layout.js';
import {
  installMiniXiangqiBoardStyles,
  MINI_XIANGQI_PIECE_PX,
  miniXiangqiPieceGhostSvg,
  renderMiniXiangqiBoardSvg,
} from './live-mini-xiangqi-render.js';
import { clearSeatTokenForRoom, type LiveRefs } from './live-state.js';
import { roomIdFromPath } from './room-url.js';
import { setBoardFamily } from './theme.js';
import { installBoardDrag } from './variant-tenant/board-drag.js';
import { syncMoveListScroll } from './variant-tenant/chrome-dom.js';
import { installHandDrag } from './variant-tenant/hand-drag.js';
import { createTenantReplayController } from './variant-tenant/replay-controller.js';
import { createTenantRoomChrome, type WebVariantTenant } from './variant-tenant/room-chrome.js';
import { installSelectionClickAway } from './variant-tenant/selection-click-away.js';
import {
  createTenantSocketClient,
  type TenantConnectionState,
  type TenantSocketClient,
} from './variant-tenant/socket-client.js';

type DropMiniClock = {
  activeColor: MiniXiangqiColor | null;
  incrementMs: number;
  initialMs: number;
  remainingMs: Record<MiniXiangqiColor, number>;
  runningSince: number | null;
};

type DropMiniWireEvent =
  | {
      type: 'move-played';
      color: MiniXiangqiColor;
      move: DropMiniXiangqiMove;
      at: number;
      ply?: number;
    }
  | { type: string; [key: string]: unknown };
type DropMiniMoveEvent = Extract<DropMiniWireEvent, { type: 'move-played' }>;
type DropMiniMoveRow = { fullMove: number; red?: string; black?: string };

type DropMiniLiveFrame = {
  type: 'hello' | 'snapshot' | 'event-appended';
  clientId?: string;
  seatToken?: string;
  seat: MiniXiangqiColor | 'spectator';
  seats: Partial<Record<MiniXiangqiColor, string>>;
  state: DropMiniXiangqiPlayerView;
  clock?: DropMiniClock | null;
  connectedSeats?: Record<MiniXiangqiColor, boolean>;
  abortDeadline?: number | null;
  forfeitDeadline?: number | null;
  roomMode?: 'pvp' | 'pve';
  pveEngineId?: string | null;
  rated?: boolean;
  timeControl?: { initialMs: number; incrementMs: number } | null;
  clients?: number;
  events?: DropMiniWireEvent[];
  event?: DropMiniWireEvent;
  seq?: number;
};

const state = {
  room: '',
  seat: null as MiniXiangqiColor | 'spectator' | null,
  view: null as DropMiniXiangqiPlayerView | null,
  clock: null as DropMiniClock | null,
  timeControl: null as { initialMs: number; incrementMs: number } | null,
  seats: {} as Partial<Record<MiniXiangqiColor, string>>,
  connectedSeats: { red: false, black: false } as Record<MiniXiangqiColor, boolean>,
  events: [] as DropMiniWireEvent[],
  abortDeadline: null as number | null,
  forfeitDeadline: null as number | null,
  rated: false,
  roomMode: 'pvp' as 'pvp' | 'pve',
  pveEngineId: null as string | null,
};

let client: TenantSocketClient | null = null;
let refs: LiveRefs | null = null;
let selectedSquare: MiniXiangqiSquare | null = null;
let selectedDropRole: DropMiniXiangqiDropRole | null = null;
let draggingFrom: MiniXiangqiSquare | null = null;
let lastCapturedView: DropMiniXiangqiPlayerView | null = null;
let lastCapturedPositionKey: string | null = null;

const replay = createTenantReplayController<DropMiniXiangqiPlayerView>();

function send(payload: unknown): boolean {
  return client?.send(payload) ?? false;
}

function connection(): TenantConnectionState {
  return client?.connection() ?? 'connecting';
}

const dropMiniWebTenant: WebVariantTenant<MiniXiangqiColor> = {
  displayName: 'Drop Mini Xiangqi',
  colors: ['red', 'black'],
  isColor: isMiniColor,
  oppositeColor: (color) => (color === 'red' ? 'black' : 'red'),
  enabled: dropMiniXiangqiEnabled,
  reviewUrl: (roomId) => `/drop-mini-xiangqi/game/${encodeURIComponent(roomId)}`,
  reasonPhrase: dropMiniReasonPhrase,
  disabledTitle: 'Drop Mini Xiangqi disabled',
  disabledBody: 'This client build has the room renderer off.',
  rejectedBody: 'This Drop Mini Xiangqi room is not active. Create a new invite to start a game.',
  spectatorBody: 'Watching the full board.',
  selectInstruction: 'Select a piece, or select a reserve and then a drop square.',
};

const chrome = createTenantRoomChrome(dropMiniWebTenant, {
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
  playAgainRequestBody: () => ({
    mode: state.roomMode,
    gameSpecId: DROP_MINI_XIANGQI_SPEC_ID,
    preferredColor: 'random',
    ...(state.roomMode === 'pvp' ? { rated: false } : {}),
    ...(state.roomMode === 'pve' && state.pveEngineId ? { engineId: state.pveEngineId } : {}),
    ...(state.timeControl ? { timeControl: state.timeControl } : {}),
  }),
  rematchControls: () => null,
});

export function bootstrapDropMiniXiangqiLiveRoom(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('missing #app');

  const params = new URLSearchParams(window.location.search);
  const room = roomIdFromPath(window.location.pathname) ?? params.get('room') ?? 'dmxqd_dev';
  state.room = room;
  state.roomMode = 'pvp';
  state.pveEngineId = null;
  state.rated = false;
  selectedSquare = null;
  selectedDropRole = null;
  draggingFrom = null;
  lastCapturedView = null;
  lastCapturedPositionKey = null;
  replay.reset();
  chrome.resetState();
  installMiniXiangqiBoardStyles();
  setBoardFamily('xiangqi');

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
  setLiveLayoutGameSpec(app, DROP_MINI_XIANGQI_SPEC_ID);
  chrome.setRenderTarget(refs, {
    sendSocket: send,
    reconnectNow: () => client?.connect(),
  });
  installBoardInteraction(refs);
  installSelectionClickAway({
    roots: () => [refs?.board, refs?.capturesBottom],
    hasSelection: () => selectedSquare !== null || selectedDropRole !== null,
    clearSelection: () => {
      selectedSquare = null;
      selectedDropRole = null;
      renderAll();
    },
  });

  client = createTenantSocketClient({
    room,
    applyHello: (frame) => applyFrame(frame as DropMiniLiveFrame),
    applySnapshot: (frame) => applyFrame(frame as DropMiniLiveFrame),
    applyEvent: (frame) => applyEventFrame(frame as DropMiniLiveFrame),
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

function applyFrame(frame: DropMiniLiveFrame): void {
  state.seat = frame.seat;
  state.view = frame.state;
  state.clock = frame.clock ?? null;
  state.timeControl = frame.timeControl ?? state.timeControl;
  state.seats = frame.seats ?? state.seats;
  if (frame.connectedSeats) state.connectedSeats = frame.connectedSeats;
  state.abortDeadline = frame.abortDeadline ?? null;
  state.forfeitDeadline = frame.forfeitDeadline ?? null;
  state.rated = frame.rated ?? state.rated;
  state.roomMode = frame.roomMode ?? state.roomMode;
  state.pveEngineId = frame.pveEngineId ?? (frame.roomMode === 'pve' ? state.pveEngineId : null);
  if (frame.events) state.events = frame.events;
}

function applyEventFrame(frame: DropMiniLiveFrame): void {
  const events = state.events;
  applyFrame(frame);
  state.events = events;
  if (frame.event) state.events = [...events, frame.event];
}

function renderAll(): void {
  if (!refs) return;
  chrome.resetHostPanels();
  chrome.renderMeta();
  chrome.renderClocks();

  const view = state.view;
  reconcileInteractionState(view);
  captureReplayView(view);
  const displayedView = replay.currentView(view);
  refs.moveList.classList.add('xiangqi-move-list');
  replay.renderShell(refs, renderAll);
  refs.boardStatus.hidden = view !== null;
  chrome.renderActionStatus();
  renderCheckStatus(refs, displayedView);
  chrome.renderGameControls();
  chrome.renderRoomActions();

  renderReserves(refs, displayedView);
  if (!dropMiniXiangqiEnabled()) {
    refs.board.className = 'board mini-xiangqi-live-board mini-xiangqi-live-board--disabled';
    refs.board.replaceChildren();
    selectedSquare = null;
    selectedDropRole = null;
    return;
  }
  renderBoard(refs, displayedView);
  renderMoveList(refs);
}

function renderCheckStatus(liveRefs: LiveRefs, view: DropMiniXiangqiPlayerView | null): void {
  if (!view || view.status.type !== 'playing' || !view.inCheck || !replay.isLive()) return;

  liveRefs.actionSection.hidden = false;
  liveRefs.actionStatus.replaceChildren();

  const notice = document.createElement('div');
  notice.className = 'action-notice danger';

  const title = document.createElement('strong');
  title.textContent = 'Check';

  const body = document.createElement('p');
  body.textContent =
    state.seat === view.perspective
      ? 'Your general is in check. Answer the threat.'
      : `${capitalize(view.perspective)} general is in check.`;

  notice.append(title, body);
  liveRefs.actionStatus.append(notice);
}

function renderBoard(liveRefs: LiveRefs, view: DropMiniXiangqiPlayerView | null): void {
  liveRefs.board.className = 'board mini-xiangqi-live-board';
  liveRefs.board.setAttribute('aria-label', 'Drop Mini Xiangqi board');
  if (!view) {
    liveRefs.board.replaceChildren();
    return;
  }
  const perspective = orientationFor(view);
  const hints = selectedDropRole
    ? dropMiniXiangqiTargetMoves(dropMiniXiangqiDropTargets(view, selectedDropRole))
    : selectedSquare
      ? dropMiniXiangqiBoardMoves(view, selectedSquare)
      : [];
  liveRefs.board.innerHTML = renderMiniXiangqiBoardSvg(
    dropMiniXiangqiBoardView(view, hints),
    perspective,
    {
      interactive: true,
      showFog: false,
      selectedSquare,
      legalMoves: hints,
      draggingFrom,
    },
  );
}

function renderReserves(liveRefs: LiveRefs, view: DropMiniXiangqiPlayerView | null): void {
  liveRefs.capturesTop.replaceChildren();
  liveRefs.capturesBottom.replaceChildren();
  if (!view) return;
  const bottom = orientationFor(view);
  const top = bottom === 'red' ? 'black' : 'red';
  fillDropMiniXiangqiReserve(liveRefs.capturesTop, view, top);
  fillDropMiniXiangqiReserve(liveRefs.capturesBottom, view, bottom, {
    interactive: canInteract(view) && state.seat === bottom,
    selectedRole: selectedDropRole,
    onSelect: (role) => {
      if (!canInteract(view) || state.seat !== bottom) return;
      selectedSquare = null;
      selectedDropRole = selectedDropRole === role ? null : role;
      renderAll();
    },
  });
}

function installBoardInteraction(liveRefs: LiveRefs): void {
  installBoardDrag({
    board: liveRefs.board,
    ghostSizePx: MINI_XIANGQI_PIECE_PX,
    onSquareClick: (square) => handleSquareClick(square as MiniXiangqiSquare),
    canDragFrom: (square) => canDragPiece(square as MiniXiangqiSquare),
    ghostHtml: (square) => {
      const piece = state.view?.board[square as MiniXiangqiSquare];
      return piece ? miniXiangqiPieceGhostSvg(piece) : null;
    },
    onDragStart: (from) => {
      selectedDropRole = null;
      selectedSquare = from as MiniXiangqiSquare;
      draggingFrom = from as MiniXiangqiSquare;
      renderBoard(liveRefs, state.view);
    },
    onDrop: (from, to) => dropPiece(from as MiniXiangqiSquare, to as MiniXiangqiSquare | null),
  });
  installHandDrag({
    hand: liveRefs.capturesBottom,
    ghostSizePx: MINI_XIANGQI_PIECE_PX,
    isRole: isDropRole,
    canDragRole: canDragDropRole,
    ghostHtml: (role) =>
      isMiniColor(state.seat) ? miniXiangqiPieceGhostSvg({ color: state.seat, role }) : null,
    onDragStart: (role) => {
      selectedSquare = null;
      selectedDropRole = role;
      renderAll();
    },
    onDrop: (role, to) => dropReservePiece(role, to),
  });
}

function handleSquareClick(square: MiniXiangqiSquare): void {
  const view = state.view;
  if (!view || !canInteract(view)) return;
  if (selectedDropRole) {
    const targets = dropMiniXiangqiDropTargets(view, selectedDropRole);
    if (targets.includes(square)) {
      send({ type: 'move', drop: selectedDropRole, to: square });
      selectedDropRole = null;
      selectedSquare = null;
      renderAll();
      return;
    }
    selectedDropRole = null;
  }

  if (!selectedSquare) {
    if (canSelect(view, square)) selectedSquare = square;
    renderBoardIfMounted();
    return;
  }
  if (selectedSquare === square) {
    selectedSquare = null;
    renderBoardIfMounted();
    return;
  }
  const move = dropMiniXiangqiBoardMoves(view, selectedSquare).find(
    (candidate) => candidate.to === square,
  );
  if (move) {
    selectedSquare = null;
    send({ type: 'move', from: move.from, to: move.to });
    renderAll();
    return;
  }
  selectedSquare = canSelect(view, square) ? square : null;
  renderBoardIfMounted();
}

function canDragPiece(square: MiniXiangqiSquare): boolean {
  const view = state.view;
  if (!view || !canInteract(view)) return false;
  const piece = view.board[square];
  return !!piece && piece.color === state.seat;
}

function dropPiece(from: MiniXiangqiSquare, to: MiniXiangqiSquare | null): void {
  draggingFrom = null;
  const view = state.view;
  const move = to
    ? dropMiniXiangqiBoardMoves(view!, from).find((candidate) => candidate.to === to)
    : undefined;
  if (move) {
    selectedSquare = null;
    send({ type: 'move', from: move.from, to: move.to });
  } else {
    selectedSquare = null;
  }
  renderAll();
}

function canDragDropRole(role: DropMiniXiangqiDropRole): boolean {
  const view = state.view;
  if (!view || !canInteract(view) || !isMiniColor(state.seat)) return false;
  return (view.hands[state.seat][role] ?? 0) > 0;
}

function dropReservePiece(role: DropMiniXiangqiDropRole, to: string | null): void {
  const view = state.view;
  if (!view || !canInteract(view)) {
    selectedDropRole = null;
    renderAll();
    return;
  }
  selectedSquare = null;
  selectedDropRole = role;
  const targets = dropMiniXiangqiDropTargets(view, role);
  if (to && isMiniSquare(to) && targets.includes(to)) {
    send({ type: 'move', drop: role, to });
  }
  selectedDropRole = null;
  renderAll();
}

function canInteract(view: DropMiniXiangqiPlayerView): boolean {
  return (
    replay.isLive() &&
    connection() === 'connected' &&
    view.status.type === 'playing' &&
    isMiniColor(state.seat) &&
    view.status.turn === state.seat
  );
}

function canSelect(view: DropMiniXiangqiPlayerView, square: MiniXiangqiSquare): boolean {
  if (!canInteract(view)) return false;
  const piece = view.board[square];
  return (
    !!piece && piece.color === state.seat && dropMiniXiangqiBoardMoves(view, square).length > 0
  );
}

function reconcileInteractionState(view: DropMiniXiangqiPlayerView | null): void {
  if (!view || !canInteract(view)) {
    selectedSquare = null;
    selectedDropRole = null;
    return;
  }
  if (selectedSquare && dropMiniXiangqiBoardMoves(view, selectedSquare).length === 0) {
    selectedSquare = null;
  }
  if (
    selectedDropRole &&
    (view.hands[state.seat as MiniXiangqiColor][selectedDropRole] ?? 0) <= 0
  ) {
    selectedDropRole = null;
  }
}

function renderBoardIfMounted(): void {
  if (refs) renderBoard(refs, replay.currentView(state.view));
}

function renderMoveList(liveRefs: LiveRefs): void {
  const moves = state.events.filter((event): event is DropMiniMoveEvent =>
    isDropMiniMoveEvent(event),
  );
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
  for (const row of moveRows(moves, totalPly)) {
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

function moveRows(moves: readonly DropMiniMoveEvent[], plyCount: number): DropMiniMoveRow[] {
  const rows = new Map<number, DropMiniMoveRow>();
  for (let fullMove = 1; fullMove <= Math.ceil(plyCount / 2); fullMove += 1) {
    rows.set(fullMove, { fullMove });
  }
  moves.forEach((event, index) => {
    const ply = eventPly(event, index);
    if (ply > plyCount) return;
    const fullMove = Math.floor((ply - 1) / 2) + 1;
    const row = rows.get(fullMove) ?? { fullMove };
    row[event.color] = dropMiniXiangqiMoveLabel(event.move);
    rows.set(fullMove, row);
  });
  return [...rows.values()].sort((a, b) => a.fullMove - b.fullMove);
}

function eventPly(event: DropMiniMoveEvent, fallbackIndex: number): number {
  return Number.isInteger(event.ply) && event.ply && event.ply > 0 ? event.ply : fallbackIndex + 1;
}

function captureReplayView(view: DropMiniXiangqiPlayerView | null): void {
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

function replayPlyForView(view: DropMiniXiangqiPlayerView, positionChanged: boolean): number {
  if (view.status.type === 'playing') {
    const completedFullMoves = Math.max(0, view.moveNumber - 1);
    return completedFullMoves * 2 + (view.status.turn === 'black' ? 1 : 0);
  }
  if (positionChanged && view.lastMove) return replay.latestPly() + 1;
  return replay.latestPly();
}

function replayPositionKey(view: DropMiniXiangqiPlayerView): string {
  const board = Object.entries(view.board)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([square, piece]) => [square, piece.color, piece.role]);
  return JSON.stringify({
    board,
    hands: view.hands,
    cooldownHands: view.cooldownHands,
    lastMove: view.lastMove ?? null,
    moveNumber: view.moveNumber,
    perspective: view.perspective,
    turn: view.status.type === 'playing' ? view.status.turn : view.status.type,
  });
}

function handleReplayKeyboard(event: KeyboardEvent): void {
  replay.handleKeyboard(event, renderAll);
}

function isDropMiniMoveEvent(event: DropMiniWireEvent): event is DropMiniMoveEvent {
  const move = (event as { move?: unknown }).move;
  return (
    event.type === 'move-played' &&
    isMiniColor((event as { color?: unknown }).color) &&
    typeof move === 'object' &&
    move !== null &&
    ((typeof (move as { from?: unknown }).from === 'string' &&
      typeof (move as { to?: unknown }).to === 'string') ||
      (typeof (move as { drop?: unknown }).drop === 'string' &&
        typeof (move as { to?: unknown }).to === 'string'))
  );
}

function orientationFor(view: DropMiniXiangqiPlayerView | null): MiniXiangqiColor {
  if (isMiniColor(state.seat)) return state.seat;
  return view?.perspective ?? 'red';
}

function dropMiniReasonPhrase(reason: string): string {
  switch (reason) {
    case 'checkmate':
      return 'checkmate';
    case 'general-captured':
      return 'general capture';
    case 'stalemate':
      return 'stalemate';
    case 'timeout':
      return 'timeout';
    case 'resignation':
      return 'resignation';
    case 'abandonment':
      return 'abandonment';
    case 'repetition':
      return 'threefold repetition';
    case 'progress-clock':
      return 'the no-capture rule';
    default:
      return 'the game rules';
  }
}

function isMiniColor(value: unknown): value is MiniXiangqiColor {
  return value === 'red' || value === 'black';
}

function isMiniSquare(value: string): value is MiniXiangqiSquare {
  return /^[a-g][1-7]$/.test(value);
}

function isDropRole(value: string): value is DropMiniXiangqiDropRole {
  return (DROP_MINI_XIANGQI_DROP_ROLES as readonly string[]).includes(value);
}

function capitalize(value: string): string {
  if (!value) return value;
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
