import type {
  XiangqiColor,
  XiangqiGameStatus,
  XiangqiMove,
  XiangqiPiece,
  XiangqiSquare,
} from '@mistboard/game';
import { openConfirmDialog } from './confirm-dialog.js';
import {
  createDarkXiangqiPlayAgainRoom,
  darkXiangqiTimeControlFromEvents,
} from './dark-xiangqi-room-actions.js';
import { darkXiangqiEnabled } from './feature-flags.js';
import type { LiveRefs } from './live-state.js';
import { liveState } from './live-state.js';
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
type DarkXiangqiReplaySnapshot = {
  ply: number;
  view: DarkXiangqiWireView;
};

const FILES = 'abcdefghi';
const FILE_COUNT = 9;
const RANK_COUNT = 10;
const CELL = 60;
const MARGIN = 36;
const WIDTH = MARGIN * 2 + (FILE_COUNT - 1) * CELL;
const HEIGHT = MARGIN * 2 + (RANK_COUNT - 1) * CELL;
const RIVER_TOP = MARGIN + 4 * CELL;
const RIVER_BOTTOM = MARGIN + 5 * CELL;
const PIECE_SIZE = 52;
const HIT_HALF = 26;
const FOG_OVERLAP = 0.5;

let selectedSquare: XiangqiSquare | null = null;
let playAgainStatus: 'idle' | 'creating' | 'failed' = 'idle';
let replayIndex: number | null = null;
let viewHistory: DarkXiangqiReplaySnapshot[] = [];
let lastCapturedView: DarkXiangqiWireView | null = null;
let lastCapturedPositionKey: string | null = null;
let latestCapturedPly = 0;
let renderCallbacks: { reconnectNow: () => void; sendSocket: (payload: unknown) => boolean } = {
  reconnectNow: () => {},
  sendSocket: () => false,
};

export function isDarkXiangqiLiveRoom(): boolean {
  return liveState.gameSpecId === 'dark-xiangqi';
}

export function resetDarkXiangqiReplayState(): void {
  replayIndex = null;
  viewHistory = [];
  lastCapturedView = null;
  lastCapturedPositionKey = null;
  latestCapturedPly = 0;
}

export function renderDarkXiangqiRoom(
  refs: LiveRefs,
  callbacks: { reconnectNow: () => void; sendSocket: (payload: unknown) => boolean },
): void {
  renderCallbacks = callbacks;
  resetChessOnlyPanels(refs);
  renderMeta(refs);
  renderRoomActions(refs);

  const view = liveState.state as unknown as DarkXiangqiWireView | null;
  captureReplayView(view);
  const displayedView = currentReplayView(view);
  renderReplayShell(refs);
  refs.boardStatus.hidden = view !== null;
  renderActionStatus(refs, view, callbacks.reconnectNow);
  renderGameControls(refs, view, callbacks.sendSocket);

  if (!darkXiangqiEnabled()) {
    refs.board.className = 'board xiangqi-live-board xiangqi-live-board--disabled';
    refs.board.replaceChildren();
    selectedSquare = null;
    return;
  }

  renderBoard(refs, displayedView, callbacks.sendSocket);
  renderVisibleMoveList(refs);
}

export function reconcileDarkXiangqiInteractionState(): void {
  const view = liveState.state as unknown as DarkXiangqiWireView | null;
  if (!view || view.status.type !== 'playing') {
    selectedSquare = null;
    return;
  }
  if (selectedSquare && !view.legalMoves.some((move) => move.from === selectedSquare)) {
    selectedSquare = null;
  }
}

export function renderDarkXiangqiBoardSvg(
  view: DarkXiangqiWireView,
  perspective: XiangqiColor = view.perspective,
): string {
  return boardSvg(view, perspective, { interactive: false });
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
  const seat = isXiangqiColor(liveState.seat) ? liveState.seat : null;
  refs.gameInfo.replaceChildren(
    infoItem('Variant', 'Dark Xiangqi'),
    infoItem('Mode', 'Direct challenge'),
    infoItem('Seat', seat ? capitalize(seat) : 'Spectator'),
  );
  if (liveState.debugRequested) {
    refs.roomMeta.textContent = `Dark Xiangqi${seat ? ` · Playing as ${capitalize(seat)}` : ''}`;
  }
}

function renderRoomActions(refs: LiveRefs): void {
  refs.roomActions.replaceChildren();
  const row = document.createElement('div');
  row.className = 'room-actions-row';
  const view = liveState.state as unknown as DarkXiangqiWireView | null;

  if (view?.status.type === 'finished' || view?.status.type === 'aborted') {
    row.append(playAgainButton(refs), roomLink('Home', '/'));
    if (view.status.type === 'finished') {
      row.append(
        roomLink('Game review', `/dark-xiangqi/game/${encodeURIComponent(liveState.room)}`),
      );
    }
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

function playAgainButton(refs: LiveRefs): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = playAgainStatus === 'failed' ? 'danger' : 'primary';
  button.disabled = playAgainStatus === 'creating';
  button.textContent =
    playAgainStatus === 'creating'
      ? 'Creating'
      : playAgainStatus === 'failed'
        ? 'Try play again'
        : 'Play again';
  button.addEventListener('click', () => {
    void createPlayAgainRoom(refs);
  });
  return button;
}

async function createPlayAgainRoom(refs: LiveRefs): Promise<void> {
  playAgainStatus = 'creating';
  renderRoomActions(refs);
  try {
    const url = await createDarkXiangqiPlayAgainRoom({
      timeControl: darkXiangqiTimeControlFromEvents(liveState.events),
    });
    window.location.assign(url);
  } catch (err) {
    console.warn(err);
    playAgainStatus = 'failed';
    renderRoomActions(refs);
  }
}

function renderGameControls(
  refs: LiveRefs,
  view: DarkXiangqiWireView | null,
  sendSocket: (payload: unknown) => boolean,
): void {
  refs.gameControls.replaceChildren();
  refs.gameControlsSection.hidden = true;
  if (!view || view.status.type !== 'playing' || !isXiangqiColor(liveState.seat)) {
    return;
  }
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
      renderDarkXiangqiRoom(refs, renderCallbacks);
    };
  }
}

function renderActionStatus(
  refs: LiveRefs,
  view: DarkXiangqiWireView | null,
  reconnectNow: () => void,
): void {
  refs.actionStatus.replaceChildren();
  refs.actionSection.hidden = false;
  const notice = document.createElement('div');

  if (!darkXiangqiEnabled()) {
    notice.className = 'action-notice danger';
    notice.append(
      noticeTitle('Dark Xiangqi disabled'),
      noticeBody('This client build has the room renderer off.'),
    );
    refs.actionStatus.append(notice);
    return;
  }

  const tone = actionTone(view);
  notice.className = `action-notice ${tone}`;
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
  view: DarkXiangqiWireView | null,
): 'danger' | 'default' | 'pending' | 'success' {
  if (liveState.connectionState === 'rejected' || liveState.connectionState === 'displaced')
    return 'danger';
  if (!view || liveState.connectionState !== 'connected') return 'pending';
  if (view.status.type === 'playing' && liveState.seat === view.status.turn) return 'success';
  return 'default';
}

function actionTitle(view: DarkXiangqiWireView | null): string {
  if (liveState.connectionState === 'rejected') return 'Room unavailable';
  if (liveState.connectionState === 'displaced') return 'Session moved';
  if (!view) return 'Connecting';
  if (view.status.type === 'finished') return 'Game finished';
  if (view.status.type === 'aborted') return 'Game aborted';
  if (liveState.seat === view.status.turn) return 'Your move';
  return `${capitalize(view.status.turn)} to move`;
}

function actionBody(view: DarkXiangqiWireView | null): string {
  if (liveState.connectionState === 'rejected') return rejectedBody();
  if (liveState.connectionState === 'displaced') return 'Another tab reclaimed this seat.';
  if (!view) return 'Opening the room socket.';
  if (view.status.type === 'finished') {
    return view.status.winner ? `${capitalize(view.status.winner)} wins.` : 'Draw.';
  }
  if (view.status.type === 'aborted') {
    return 'This game ended before both sides completed their first move.';
  }
  if (liveState.seat === 'spectator') return 'Watching without private information.';
  if (liveState.seat === view.status.turn)
    return 'Select one of your visible pieces, then choose a destination.';
  return 'Waiting for the opponent.';
}

function rejectedBody(): string {
  if (liveState.closeReason === 'room unavailable')
    return 'This Dark Xiangqi room is not active. Create a new invite to start a game.';
  if (liveState.closeReason === 'game spec disabled')
    return 'Dark Xiangqi is not enabled on this server.';
  if (liveState.closeReason === 'private room') return 'This Dark Xiangqi room is full.';
  if (liveState.closeReason === 'rate limit')
    return 'The room connection was closed after too many messages.';
  return 'The Dark Xiangqi room rejected this connection.';
}

function renderBoard(
  refs: LiveRefs,
  view: DarkXiangqiWireView | null,
  sendSocket: (payload: unknown) => boolean,
): void {
  refs.board.className = 'board xiangqi-live-board';
  refs.board.setAttribute('aria-label', 'Dark Xiangqi board');
  if (!view) {
    refs.board.replaceChildren();
    return;
  }

  const perspective = orientationFor(view);
  refs.board.innerHTML = boardSvg(view, perspective, { interactive: true });
  refs.board.querySelectorAll<SVGElement>('[data-square]').forEach((el) => {
    el.addEventListener('click', () => {
      const square = el.dataset.square as XiangqiSquare | undefined;
      if (!square) return;
      handleSquareClick(view, square, sendSocket);
      renderBoard(refs, view, sendSocket);
    });
  });
}

function boardSvg(
  view: DarkXiangqiWireView,
  perspective: XiangqiColor,
  options: { interactive: boolean },
): string {
  const maskId = `xq-live-fog-${view.id.replace(/[^a-zA-Z0-9_-]/g, '')}-${perspective}`;
  return `
    <svg class="xq-live-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect class="xq-live-bg" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" rx="8"/>
      <g class="xq-live-grid">${gridLayer()}</g>
      <g class="xq-live-palace">${palaceLayer(perspective)}</g>
      <g class="xq-live-river">${riverLayer(perspective)}</g>
      <g class="xq-live-fog">${fogLayer(view, perspective, maskId)}</g>
      <g class="xq-live-lastmove">${lastMoveLayer(view, perspective)}</g>
      <g class="xq-live-selection">${selectionLayer(selectedSquare, perspective)}</g>
      <g class="xq-live-hints">${hintLayer(view, perspective)}</g>
      <g class="xq-live-pieces">${pieceLayer(view, perspective)}</g>
      <g class="xq-live-clicks">${options.interactive ? clickLayer(perspective) : ''}</g>
      <rect class="xq-live-border" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" rx="8"/>
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
  return `
    <defs>
      <mask id="${maskId}">
        <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="white"/>
        ${cutouts}
      </mask>
    </defs>
    <rect class="xq-live-fog-mask" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" mask="url(#${maskId})"/>
  `;
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

function handleSquareClick(
  view: DarkXiangqiWireView,
  square: XiangqiSquare,
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

function canInteract(view: DarkXiangqiWireView): boolean {
  return (
    isReplayLive() &&
    liveState.connectionState === 'connected' &&
    view.status.type === 'playing' &&
    isXiangqiColor(liveState.seat) &&
    view.status.turn === liveState.seat
  );
}

function canSelect(view: DarkXiangqiWireView, square: XiangqiSquare): boolean {
  if (!canInteract(view)) return false;
  const entry = view.board[square];
  if (!entry || !('piece' in entry) || entry.piece.color !== liveState.seat) return false;
  return view.legalMoves.some((move) => move.from === square);
}

function renderVisibleMoveList(refs: LiveRefs): void {
  const moves = (liveState.events as unknown as DarkXiangqiWireEvent[]).filter(
    (event): event is DarkXiangqiMoveEvent => isDarkXiangqiMoveEvent(event),
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
  if (positionKey === lastCapturedPositionKey && nextPly <= latestCapturedPly) {
    lastCapturedView = view;
    return;
  }
  latestCapturedPly = nextPly;
  viewHistory.push({ ply: latestCapturedPly, view });
  lastCapturedView = view;
  lastCapturedPositionKey = positionKey;
}

function replayPlyForView(view: DarkXiangqiWireView, positionChanged: boolean): number {
  if (view.status.type === 'playing') {
    const completedFullMoves = Math.max(0, view.moveNumber - 1);
    return completedFullMoves * 2 + (view.status.turn === 'black' ? 1 : 0);
  }
  if (positionChanged && view.lastMove) return latestCapturedPly + 1;
  return latestCapturedPly;
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

function currentReplayView(liveView: DarkXiangqiWireView | null): DarkXiangqiWireView | null {
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

function orientationFor(view: DarkXiangqiWireView): XiangqiColor {
  return isXiangqiColor(liveState.seat) ? liveState.seat : view.perspective;
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
