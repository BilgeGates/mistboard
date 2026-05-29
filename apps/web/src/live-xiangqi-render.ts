import type {
  XiangqiColor,
  XiangqiGameStatus,
  XiangqiMove,
  XiangqiPiece,
  XiangqiSquare,
} from '@mistboard/game';
import { openConfirmDialog } from './confirm-dialog.js';
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
  | { type: 'move-played'; color: XiangqiColor; move: XiangqiMove; at: number }
  | { type: string; [key: string]: unknown };
type DarkXiangqiMoveEvent = Extract<DarkXiangqiWireEvent, { type: 'move-played' }>;

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

export function isDarkXiangqiLiveRoom(): boolean {
  return liveState.gameSpecId === 'dark-xiangqi';
}

export function renderDarkXiangqiRoom(
  refs: LiveRefs,
  callbacks: { reconnectNow: () => void; sendSocket: (payload: unknown) => boolean },
): void {
  resetChessOnlyPanels(refs);
  renderMeta(refs);
  renderRoomActions(refs);
  renderReplayShell(refs);

  const view = liveState.state as unknown as DarkXiangqiWireView | null;
  refs.boardStatus.hidden = view !== null;
  renderActionStatus(refs, view, callbacks.reconnectNow);
  renderGameControls(refs, view, callbacks.sendSocket);

  if (!darkXiangqiEnabled()) {
    refs.board.className = 'board xiangqi-live-board xiangqi-live-board--disabled';
    refs.board.replaceChildren();
    selectedSquare = null;
    return;
  }

  renderBoard(refs, view, callbacks.sendSocket);
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
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy invite';
  copy.addEventListener('click', () => {
    void navigator.clipboard?.writeText(window.location.href);
  });
  row.append(copy);
  refs.roomActions.append(row);
}

function renderGameControls(
  refs: LiveRefs,
  view: DarkXiangqiWireView | null,
  sendSocket: (payload: unknown) => boolean,
): void {
  refs.gameControls.replaceChildren();
  refs.gameControlsSection.hidden = true;
  if (
    !view ||
    view.status.type !== 'playing' ||
    view.moveNumber < 2 ||
    !isXiangqiColor(liveState.seat)
  ) {
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
  refs.replayMeta.textContent = 'Live';
  for (const button of refs.replayControls) button.disabled = true;
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
  refs.board.innerHTML = boardSvg(view, perspective);
  refs.board.querySelectorAll<SVGElement>('[data-square]').forEach((el) => {
    el.addEventListener('click', () => {
      const square = el.dataset.square as XiangqiSquare | undefined;
      if (!square) return;
      handleSquareClick(view, square, sendSocket);
      renderBoard(refs, view, sendSocket);
    });
  });
}

function boardSvg(view: DarkXiangqiWireView, perspective: XiangqiColor): string {
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
      <g class="xq-live-clicks">${clickLayer(perspective)}</g>
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
  refs.moveList.replaceChildren();
  if (moves.length === 0) {
    const item = document.createElement('li');
    item.className = 'move-row masked';
    item.textContent = 'No visible moves yet';
    refs.moveList.append(item);
    return;
  }
  moves.forEach((event, index) => {
    const item = document.createElement('li');
    item.className = 'move-row';
    item.textContent = `${index + 1}. ${capitalize(event.color)} ${event.move.from}-${event.move.to}`;
    refs.moveList.append(item);
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
