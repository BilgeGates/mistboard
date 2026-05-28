import type { PlayerView } from '@mistboard/game';
import { type LiveRefs, liveState } from './live-state.js';
import { currentView } from './live-view.js';
import { isColor } from './web-utils.js';

type GameControlRefs = Pick<LiveRefs, 'gameControlsSection' | 'gameControls'>;
type SendSocket = (payload: unknown) => boolean;

export function renderGameControls(
  refs: GameControlRefs,
  view: PlayerView | null,
  sendSocket: SendSocket,
): void {
  const isLivePlayableRoom =
    (liveState.roomMode === 'pvp' || liveState.roomMode === 'pve') &&
    isColor(liveState.seat) &&
    view?.status.type === 'playing' &&
    !liveState.solo;
  if (!isLivePlayableRoom || !view || view.status.type !== 'playing') {
    refs.gameControlsSection.hidden = true;
    refs.gameControls.replaceChildren();
    return;
  }

  // Before both players have completed their first move, the game can only be
  // aborted by the side to move. From move 2 on, either player resigns.
  const preMove = view.moveNumber < 2;
  const isSideToMove = view.status.turn === liveState.seat;

  const children: HTMLElement[] = [];
  // Show the abort countdown to both players so the waiting side understands
  // the pause. Timing info only; it leaks no board state.
  if (preMove && liveState.abortDeadline !== null) {
    const countdown = document.createElement('span');
    countdown.className = 'abort-countdown';
    countdown.dataset.abortCountdown = '';
    countdown.textContent = abortCountdownText(isSideToMove);
    children.push(countdown);
  }
  // Post-move-1: only a present winning player receives forfeitDeadline, so
  // this banner always reads from the beneficiary's point of view.
  if (!preMove && liveState.forfeitDeadline !== null) {
    const banner = document.createElement('span');
    banner.className = 'forfeit-countdown';
    banner.dataset.forfeitCountdown = '';
    banner.textContent = forfeitCountdownText();
    children.push(banner);
  }
  if (preMove) {
    if (isSideToMove) children.push(makeControlButton('Abort', () => requestAbort(sendSocket)));
  } else {
    children.push(makeControlButton('Resign', () => requestResign(sendSocket)));
  }

  refs.gameControlsSection.hidden = children.length === 0;
  refs.gameControls.replaceChildren(...children);
}

// Driven by the 100ms tick loop so countdowns advance without a full re-render.
// Only touch existing elements' text; renderGameControls owns creation/teardown.
export function updateAbortCountdown(refs: GameControlRefs): void {
  const view = currentView();
  const abortEl = refs.gameControls.querySelector<HTMLElement>('[data-abort-countdown]');
  if (abortEl && view && view.status.type === 'playing' && view.moveNumber < 2) {
    abortEl.textContent = abortCountdownText(view.status.turn === liveState.seat);
  }
  const forfeitEl = refs.gameControls.querySelector<HTMLElement>('[data-forfeit-countdown]');
  if (forfeitEl && liveState.forfeitDeadline !== null) {
    forfeitEl.textContent = forfeitCountdownText();
  }
}

function abortRemainingMs(): number | null {
  if (liveState.abortDeadline === null) return null;
  return Math.max(0, liveState.abortDeadline - Date.now());
}

function abortCountdownText(isSideToMove: boolean): string {
  const remaining = abortRemainingMs();
  const seconds = remaining === null ? 0 : Math.ceil(remaining / 1000);
  return isSideToMove
    ? `Make your first move, aborting in ${seconds}s`
    : `Waiting for first move, aborting in ${seconds}s`;
}

function forfeitRemainingSeconds(): number {
  if (liveState.forfeitDeadline === null) return 0;
  return Math.ceil(Math.max(0, liveState.forfeitDeadline - Date.now()) / 1000);
}

function forfeitCountdownText(): string {
  return `Opponent left, you win in ${forfeitRemainingSeconds()}s`;
}

function makeControlButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'danger';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function requestResign(sendSocket: SendSocket): void {
  openConfirmDialog({
    title: 'Resign this game?',
    body: 'Your opponent wins. This cannot be undone.',
    confirmLabel: 'Resign',
    confirmTone: 'danger',
    onConfirm: () => {
      sendSocket({ type: 'resign' });
    },
  });
}

function requestAbort(sendSocket: SendSocket): void {
  openConfirmDialog({
    title: 'Abort this game?',
    body: 'The game ends with no result. Neither player is affected.',
    confirmLabel: 'Abort',
    confirmTone: 'danger',
    onConfirm: () => {
      sendSocket({ type: 'abort' });
    },
  });
}

type ConfirmOptions = {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmTone?: 'danger' | 'default';
  onConfirm: () => void;
};

function openConfirmDialog(opts: ConfirmOptions): void {
  const existing = document.querySelector<HTMLDialogElement>('dialog[data-confirm-dialog]');
  existing?.remove();

  const dialog = document.createElement('dialog');
  dialog.dataset.confirmDialog = '';
  dialog.className = 'confirm-dialog';

  const title = document.createElement('h2');
  title.className = 'confirm-dialog-title';
  title.textContent = opts.title;

  const body = document.createElement('p');
  body.className = 'confirm-dialog-body';
  body.textContent = opts.body;

  const actions = document.createElement('div');
  actions.className = 'confirm-dialog-actions';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'confirm-dialog-cancel';
  cancel.textContent = opts.cancelLabel ?? 'Cancel';
  cancel.addEventListener('click', () => {
    dialog.close('cancel');
  });

  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className =
    opts.confirmTone === 'danger' ? 'confirm-dialog-confirm danger' : 'confirm-dialog-confirm';
  confirm.textContent = opts.confirmLabel;
  confirm.addEventListener('click', () => {
    dialog.close('confirm');
  });

  actions.append(cancel, confirm);
  dialog.append(title, body, actions);

  // Close on backdrop click: only clicks that land on the dialog element itself.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close('cancel');
  });
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'confirm') opts.onConfirm();
    dialog.remove();
  });

  document.body.append(dialog);
  dialog.showModal();
  cancel.focus();
}
