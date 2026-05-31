import type { MiniXiangqiColor, MiniXiangqiMove, MiniXiangqiPlayerView } from '@mistboard/game';
import { openConfirmDialog } from './confirm-dialog.js';
import { darkMiniXiangqiEnabled } from './feature-flags.js';
import { setLiveLayoutGameSpec } from './live-layout.js';
import {
  installMiniXiangqiBoardStyles,
  renderMiniXiangqiBoardSvg,
} from './live-mini-xiangqi-render.js';
import type { LiveRefs } from './live-state.js';
import { liveState } from './live-state.js';

// Live-room shell for Dark Mini Xiangqi. The board SVG is delegated to
// live-mini-xiangqi-render.ts; this module owns the room chrome, the seat
// interaction loop, the resign/abort controls, and a fog-safe replay scrubber
// over the per-recipient snapshots the server streams.

type MiniXiangqiSquare = MiniXiangqiMove['from'];
type MiniXiangqiWireEvent =
  | {
      type: 'move-played';
      color: MiniXiangqiColor;
      move: { from: string; to: string };
      ply?: number;
    }
  | { type: string; [key: string]: unknown };
type MiniXiangqiMoveEvent = Extract<MiniXiangqiWireEvent, { type: 'move-played' }>;
type MiniXiangqiVisibleMoveRow = { fullMove: number; red?: string; black?: string };
type MiniXiangqiReplaySnapshot = { ply: number; view: MiniXiangqiPlayerView };

let selectedSquare: MiniXiangqiSquare | null = null;
let replayIndex: number | null = null;
let viewHistory: MiniXiangqiReplaySnapshot[] = [];
let lastCapturedView: MiniXiangqiPlayerView | null = null;
let lastCapturedPositionKey: string | null = null;
let latestCapturedPly = 0;
let renderCallbacks: { reconnectNow: () => void; sendSocket: (payload: unknown) => boolean } = {
  reconnectNow: () => {},
  sendSocket: () => false,
};

export function isDarkMiniXiangqiLiveRoom(): boolean {
  return liveState.gameSpecId === 'dark-mini-xiangqi';
}

export function resetDarkMiniXiangqiReplayState(): void {
  selectedSquare = null;
  replayIndex = null;
  viewHistory = [];
  lastCapturedView = null;
  lastCapturedPositionKey = null;
  latestCapturedPly = 0;
}

export function reconcileDarkMiniXiangqiInteractionState(): void {
  const view = currentMiniView();
  if (!view || view.status.type !== 'playing') {
    selectedSquare = null;
    return;
  }
  if (selectedSquare && !view.legalMoves.some((move) => move.from === selectedSquare)) {
    selectedSquare = null;
  }
}

export function renderDarkMiniXiangqiRoom(
  refs: LiveRefs,
  callbacks: { reconnectNow: () => void; sendSocket: (payload: unknown) => boolean },
): void {
  setLiveLayoutGameSpec(
    refs.board.closest('#app') ?? refs.board.ownerDocument.body,
    'dark-mini-xiangqi',
  );
  installMiniXiangqiBoardStyles();
  renderCallbacks = callbacks;
  resetChessOnlyPanels(refs);
  renderMeta(refs);
  renderRoomActions(refs);

  const view = currentMiniView();
  captureReplayView(view);
  const displayedView = currentReplayView(view);
  renderReplayShell(refs);
  refs.boardStatus.hidden = view !== null;
  renderActionStatus(refs, view, callbacks.reconnectNow);
  renderGameControls(refs, view, callbacks.sendSocket);

  if (!darkMiniXiangqiEnabled()) {
    refs.board.className = 'board mini-xiangqi-live-board mini-xiangqi-live-board--disabled';
    refs.board.replaceChildren();
    selectedSquare = null;
    return;
  }

  renderBoard(refs, displayedView, callbacks.sendSocket);
  renderVisibleMoveList(refs);
}

function currentMiniView(): MiniXiangqiPlayerView | null {
  return liveState.state as unknown as MiniXiangqiPlayerView | null;
}

function resetChessOnlyPanels(refs: LiveRefs): void {
  refs.offerSection.hidden = true;
  refs.selectionSection.hidden = true;
  refs.devViewsSection.hidden = true;
  refs.gameControlsSection.hidden = true;
  refs.draftPicker.hidden = true;
  refs.promotion.hidden = true;
  refs.boardPaused.hidden = true;
  refs.capturesBottom.replaceChildren();
  refs.capturesTop.replaceChildren();
  refs.clockTop.replaceChildren();
  refs.clockBottom.replaceChildren();
  refs.clockNote.hidden = true;
}

function renderMeta(refs: LiveRefs): void {
  const seat = isMiniColor(liveState.seat) ? liveState.seat : null;
  refs.gameInfo.replaceChildren(
    infoItem('Variant', 'Dark Mini Xiangqi'),
    infoItem('Mode', 'Direct challenge'),
    infoItem('Seat', seat ? capitalize(seat) : 'Spectator'),
  );
  if (liveState.debugRequested) {
    refs.roomMeta.textContent = `Dark Mini Xiangqi${seat ? ` · Playing as ${capitalize(seat)}` : ''}`;
  }
}

function renderRoomActions(refs: LiveRefs): void {
  refs.roomActions.replaceChildren();
  const row = document.createElement('div');
  row.className = 'room-actions-row';
  const view = currentMiniView();

  if (view?.status.type === 'finished' || view?.status.type === 'aborted') {
    row.append(roomLink('Home', '/'));
    refs.roomActions.append(row);
    return;
  }

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy invite';
  copy.addEventListener('click', () => {
    void navigator.clipboard?.writeText(window.location.href);
  });
  row.append(copy);
  refs.roomActions.append(row);
}

function roomLink(label: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  return link;
}

function renderGameControls(
  refs: LiveRefs,
  view: MiniXiangqiPlayerView | null,
  sendSocket: (payload: unknown) => boolean,
): void {
  refs.gameControls.replaceChildren();
  refs.gameControlsSection.hidden = true;
  if (!view || view.status.type !== 'playing' || !isMiniColor(liveState.seat)) return;

  if (view.moveNumber < 2) {
    if (view.status.turn !== liveState.seat) return;
    const abort = document.createElement('button');
    abort.type = 'button';
    abort.className = 'danger';
    abort.textContent = 'Abort';
    abort.addEventListener('click', () => {
      openConfirmDialog({
        title: 'Abort this game?',
        body: 'This ends the room without recording a result.',
        confirmLabel: 'Abort',
        confirmTone: 'danger',
        onConfirm: () => sendSocket({ type: 'abort' }),
      });
    });
    refs.gameControls.append(abort);
    refs.gameControlsSection.hidden = false;
    return;
  }

  const resign = document.createElement('button');
  resign.type = 'button';
  resign.className = 'danger';
  resign.textContent = 'Resign';
  resign.addEventListener('click', () => {
    openConfirmDialog({
      title: 'Resign this game?',
      body: 'Your opponent wins. This cannot be undone.',
      confirmLabel: 'Resign',
      confirmTone: 'danger',
      onConfirm: () => sendSocket({ type: 'resign' }),
    });
  });
  refs.gameControls.append(resign);
  refs.gameControlsSection.hidden = false;
}

function renderReplayShell(refs: LiveRefs): void {
  refs.moveList.classList.add('xiangqi-move-list');
  refs.replayMeta.textContent = replayMetaLabel();
  for (const button of refs.replayControls) {
    const action = button.dataset.replay ?? '';
    button.disabled = replayControlDisabled(action);
    button.onclick = () => {
      handleReplayControl(action);
      renderDarkMiniXiangqiRoom(refs, renderCallbacks);
    };
  }
}

function renderActionStatus(
  refs: LiveRefs,
  view: MiniXiangqiPlayerView | null,
  reconnectNow: () => void,
): void {
  refs.actionStatus.replaceChildren();
  refs.actionSection.hidden = false;
  const notice = document.createElement('div');

  if (!darkMiniXiangqiEnabled()) {
    notice.className = 'action-notice danger';
    notice.append(
      noticeTitle('Dark Mini Xiangqi disabled'),
      noticeBody('This client build has the room renderer off.'),
    );
    refs.actionStatus.append(notice);
    return;
  }

  notice.className = `action-notice ${actionTone(view)}`;
  notice.append(noticeTitle(actionTitle(view)), noticeBody(actionBody(view)));
  if (
    liveState.connectionState === 'disconnected' ||
    liveState.connectionState === 'reconnecting'
  ) {
    const reconnect = document.createElement('button');
    reconnect.type = 'button';
    reconnect.textContent = 'Reconnect now';
    reconnect.addEventListener('click', reconnectNow);
    notice.append(reconnect);
  }
  refs.actionStatus.append(notice);
}

function actionTone(
  view: MiniXiangqiPlayerView | null,
): 'danger' | 'default' | 'pending' | 'success' {
  if (liveState.connectionState === 'rejected' || liveState.connectionState === 'displaced') {
    return 'danger';
  }
  if (!view || liveState.connectionState !== 'connected') return 'pending';
  if (view.status.type === 'playing' && liveState.seat === view.status.turn) return 'success';
  return 'default';
}

function actionTitle(view: MiniXiangqiPlayerView | null): string {
  if (liveState.connectionState === 'rejected') return 'Room unavailable';
  if (liveState.connectionState === 'displaced') return 'Session moved';
  if (!view) return 'Connecting';
  if (view.status.type === 'finished') return 'Game finished';
  if (view.status.type === 'aborted') return 'Game aborted';
  if (liveState.seat === view.status.turn) return 'Your move';
  return `${capitalize(view.status.turn)} to move`;
}

function actionBody(view: MiniXiangqiPlayerView | null): string {
  if (liveState.connectionState === 'rejected') {
    return 'This Dark Mini Xiangqi room is not active. Create a new invite to start a game.';
  }
  if (liveState.connectionState === 'displaced') return 'Another tab reclaimed this seat.';
  if (!view) return 'Opening the room socket.';
  if (view.status.type === 'finished') {
    return view.status.winner ? `${capitalize(view.status.winner)} wins.` : 'Draw.';
  }
  if (view.status.type === 'aborted') {
    return 'This game ended before both sides completed their first move.';
  }
  if (liveState.seat === 'spectator') return 'Watching without private information.';
  if (liveState.seat === view.status.turn) {
    return 'Select one of your visible pieces, then choose a destination.';
  }
  return 'Waiting for the opponent.';
}

function renderBoard(
  refs: LiveRefs,
  view: MiniXiangqiPlayerView | null,
  sendSocket: (payload: unknown) => boolean,
): void {
  refs.board.className = 'board mini-xiangqi-live-board';
  refs.board.setAttribute('aria-label', 'Dark Mini Xiangqi board');
  if (!view) {
    refs.board.replaceChildren();
    return;
  }

  const perspective = orientationFor(view);
  const hints = selectedSquare
    ? view.legalMoves.filter((move) => move.from === selectedSquare)
    : [];
  // Only ever highlight the viewer's own last move. The server already redacts
  // an opponent's move, but gating on board ownership here makes the fog
  // guarantee hold for every rendered view — live, replayed, or reconnected.
  const renderView = viewerOwnsLastMove(view) ? view : { ...view, lastMove: undefined };
  refs.board.innerHTML = renderMiniXiangqiBoardSvg(renderView, perspective, {
    interactive: true,
    showFog: true,
    selectedSquare,
    legalMoves: hints,
  });
  refs.board.querySelectorAll<SVGElement>('[data-square]').forEach((el) => {
    el.addEventListener('click', () => {
      const square = el.dataset.square as MiniXiangqiSquare | undefined;
      if (!square) return;
      handleSquareClick(view, square, sendSocket);
      renderBoard(refs, view, sendSocket);
    });
  });
}

function handleSquareClick(
  view: MiniXiangqiPlayerView,
  square: MiniXiangqiSquare,
  sendSocket: (payload: unknown) => boolean,
): void {
  if (!canInteract(view)) return;
  if (!selectedSquare) {
    if (canSelect(view, square)) selectedSquare = square;
    return;
  }
  if (selectedSquare === square) {
    selectedSquare = null;
    return;
  }
  const move = view.legalMoves.find(
    (candidate) => candidate.from === selectedSquare && candidate.to === square,
  );
  if (move) {
    selectedSquare = null;
    sendSocket({ type: 'move', from: move.from, to: move.to });
    return;
  }
  selectedSquare = canSelect(view, square) ? square : null;
}

function canInteract(view: MiniXiangqiPlayerView): boolean {
  return (
    isReplayLive() &&
    liveState.connectionState === 'connected' &&
    view.status.type === 'playing' &&
    isMiniColor(liveState.seat) &&
    view.status.turn === liveState.seat
  );
}

function canSelect(view: MiniXiangqiPlayerView, square: MiniXiangqiSquare): boolean {
  if (!canInteract(view)) return false;
  const entry = view.board[square];
  if (!entry || entry.shrouded !== false || entry.piece.color !== liveState.seat) return false;
  return view.legalMoves.some((move) => move.from === square);
}

function renderVisibleMoveList(refs: LiveRefs): void {
  const moves = (liveState.events as unknown as MiniXiangqiWireEvent[]).filter(
    (event): event is MiniXiangqiMoveEvent => isMiniXiangqiMoveEvent(event),
  );
  const plyCount = visiblePlyCount();
  refs.moveList.replaceChildren();
  if (plyCount === 0) {
    const item = document.createElement('li');
    item.className = 'move-row masked';
    item.textContent = 'No visible moves yet';
    refs.moveList.append(item);
    return;
  }
  const activePly = activeReplayPly();
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
    refs.moveList.append(item);
  }
}

function visibleMoveRows(
  moves: readonly MiniXiangqiMoveEvent[],
  plyCount: number,
): MiniXiangqiVisibleMoveRow[] {
  const rows = new Map<number, MiniXiangqiVisibleMoveRow>();
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

function eventPly(event: MiniXiangqiMoveEvent, fallbackIndex: number): number {
  return Number.isInteger(event.ply) && event.ply && event.ply > 0 ? event.ply : fallbackIndex + 1;
}

function captureReplayView(view: MiniXiangqiPlayerView | null): void {
  if (!view) return;
  if (view === lastCapturedView) return;
  const positionKey = replayPositionKey(view);
  const nextPly = replayPlyForView(view, positionKey !== lastCapturedPositionKey);
  if (positionKey === lastCapturedPositionKey && nextPly <= latestCapturedPly) {
    lastCapturedView = view;
    return;
  }
  latestCapturedPly = nextPly;
  viewHistory.push({ ply: latestCapturedPly, view });
  lastCapturedView = view;
  lastCapturedPositionKey = positionKey;
}

function replayPlyForView(view: MiniXiangqiPlayerView, positionChanged: boolean): number {
  if (view.status.type === 'playing') {
    const completedFullMoves = Math.max(0, view.moveNumber - 1);
    return completedFullMoves * 2 + (view.status.turn === 'black' ? 1 : 0);
  }
  if (positionChanged && view.lastMove) return latestCapturedPly + 1;
  return latestCapturedPly;
}

function replayPositionKey(view: MiniXiangqiPlayerView): string {
  const board = Object.entries(view.board)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([square, entry]) =>
      entry.shrouded === false
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

function currentReplayView(liveView: MiniXiangqiPlayerView | null): MiniXiangqiPlayerView | null {
  if (replayIndex === null) return liveView;
  return viewHistory[replayIndex]?.view ?? liveView;
}

function isReplayLive(): boolean {
  return replayIndex === null || replayIndex >= viewHistory.length - 1;
}

function visiblePlyCount(): number {
  if (replayIndex !== null) return viewHistory[replayIndex]?.ply ?? 0;
  return viewHistory.at(-1)?.ply ?? 0;
}

function activeReplayPly(): number | null {
  if (replayIndex === null) return null;
  return viewHistory[replayIndex]?.ply ?? null;
}

function replayMetaLabel(): string {
  const total = viewHistory.at(-1)?.ply ?? 0;
  if (total === 0) return 'Live · ply 0 of 0';
  if (isReplayLive()) return `Live · ply ${total} of ${total}`;
  return `Replay · ply ${visiblePlyCount()} of ${total}`;
}

function replayControlDisabled(action: string): boolean {
  if (viewHistory.length <= 1) return action !== 'latest';
  const current = replayIndex ?? viewHistory.length - 1;
  if (action === 'latest') return isReplayLive();
  if (action === 'next') return isReplayLive();
  if (action === 'first') return current <= 0;
  if (action === 'prev') return current <= 0;
  return true;
}

function handleReplayControl(action: string): void {
  if (action === 'latest') {
    replayIndex = null;
    return;
  }
  if (viewHistory.length === 0) {
    replayIndex = null;
    return;
  }
  const current = replayIndex ?? viewHistory.length - 1;
  if (action === 'first') replayIndex = 0;
  if (action === 'prev') replayIndex = Math.max(0, current - 1);
  if (action === 'next') {
    const next = current + 1;
    replayIndex = next >= viewHistory.length - 1 ? null : next;
  }
}

function isMiniXiangqiMoveEvent(event: MiniXiangqiWireEvent): event is MiniXiangqiMoveEvent {
  const move = (event as { move?: unknown }).move;
  return (
    event.type === 'move-played' &&
    isMiniColor((event as { color?: unknown }).color) &&
    typeof move === 'object' &&
    move !== null &&
    typeof (move as { from?: unknown }).from === 'string' &&
    typeof (move as { to?: unknown }).to === 'string'
  );
}

function orientationFor(view: MiniXiangqiPlayerView): MiniXiangqiColor {
  return isMiniColor(liveState.seat) ? liveState.seat : view.perspective;
}

function viewerOwnsLastMove(view: MiniXiangqiPlayerView): boolean {
  const lastMove = view.lastMove;
  if (!lastMove) return false;
  // After a move the moving piece sits on `to`; a visible own piece there means
  // the viewer made this move. An opponent move shows the opponent's piece (or a
  // shrouded/absent square), so it is never highlighted.
  const entry = view.board[lastMove.to];
  return entry?.shrouded === false && entry.piece.color === liveState.seat;
}

function isMiniColor(value: unknown): value is MiniXiangqiColor {
  return value === 'red' || value === 'black';
}

function infoItem(label: string, value: string): HTMLDivElement {
  const item = document.createElement('div');
  const key = document.createElement('span');
  const val = document.createElement('strong');
  key.textContent = label;
  val.textContent = value;
  item.append(key, val);
  return item;
}

function noticeTitle(text: string): HTMLElement {
  const el = document.createElement('strong');
  el.textContent = text;
  return el;
}

function noticeBody(text: string): HTMLElement {
  const el = document.createElement('span');
  el.textContent = text;
  return el;
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
