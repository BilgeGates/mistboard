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
// interaction loop, and the resign/abort controls. The replay scrubber and
// move list are deferred to the UX-hardening slice.

type MiniXiangqiSquare = MiniXiangqiMove['from'];

let selectedSquare: MiniXiangqiSquare | null = null;

export function isDarkMiniXiangqiLiveRoom(): boolean {
  return liveState.gameSpecId === 'dark-mini-xiangqi';
}

export function resetDarkMiniXiangqiReplayState(): void {
  selectedSquare = null;
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
  resetChessOnlyPanels(refs);
  renderMeta(refs);
  renderRoomActions(refs);

  const view = currentMiniView();
  refs.boardStatus.hidden = view !== null;
  renderActionStatus(refs, view, callbacks.reconnectNow);
  renderGameControls(refs, view, callbacks.sendSocket);

  // Replay scrubber + visible move list are part of UX hardening; keep the
  // panels inert and clean until then.
  refs.moveList.replaceChildren();
  refs.replayMeta.textContent = 'Live';
  for (const button of refs.replayControls) {
    button.disabled = true;
    button.onclick = null;
  }

  if (!darkMiniXiangqiEnabled()) {
    refs.board.className = 'board mini-xiangqi-live-board mini-xiangqi-live-board--disabled';
    refs.board.replaceChildren();
    selectedSquare = null;
    return;
  }

  renderBoard(refs, view, callbacks.sendSocket);
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
  refs.board.innerHTML = renderMiniXiangqiBoardSvg(view, perspective, {
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

function orientationFor(view: MiniXiangqiPlayerView): MiniXiangqiColor {
  return isMiniColor(liveState.seat) ? liveState.seat : view.perspective;
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
