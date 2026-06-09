import {
  DARK_MINI_XIANGQI_SPEC_ID,
  type MiniXiangqiColor,
  type MiniXiangqiGameEndReason,
  type MiniXiangqiMove,
  type MiniXiangqiPlayerView,
} from '@mistboard/game';
import {
  classifyTimeControl,
  createGameLifecycleTracker,
  gameSpecAnalyticsPropsForId,
} from './analytics.js';
import { openConfirmDialog } from './confirm-dialog.js';
import { darkMiniXiangqiEnabled } from './feature-flags.js';
import { setLiveLayoutGameSpec } from './live-layout.js';
import {
  installMiniXiangqiBoardStyles,
  MINI_XIANGQI_PIECE_PX,
  miniXiangqiPieceGhostSvg,
  renderMiniXiangqiBoardSvg,
} from './live-mini-xiangqi-render.js';
import {
  resetDarkMiniXiangqiSoundState,
  soundForOwnMiniXiangqiMove,
} from './live-mini-xiangqi-sound.js';
import { playSound } from './live-sound.js';
import type { LiveRefs, XiangqiFamilyClock } from './live-state.js';
import { liveState } from './live-state.js';
import { rematchControls } from './rematch-controls.js';
import { setBoardFamily } from './theme.js';
import { formatClock } from './web-utils.js';

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
// Drag-and-drop state. Click-to-move stays the primary path; a real drag (moved
// past a small threshold) commits on drop and suppresses the trailing click.
let dragFrom: MiniXiangqiSquare | null = null;
let dragGhost: HTMLDivElement | null = null;
let suppressNextClick = false;
let playAgainStatus: 'idle' | 'creating' | 'failed' = 'idle';
// Previous active clock color across full clock renders, used to flash the seated
// player's clock on the turn flip (mirrors the chess clock; see live-clocks.ts).
let lastActiveMiniClockColor: MiniXiangqiColor | null = null;
let replayIndex: number | null = null;
let viewHistory: MiniXiangqiReplaySnapshot[] = [];
let lastCapturedView: MiniXiangqiPlayerView | null = null;
let lastCapturedPositionKey: string | null = null;
let latestCapturedPly = 0;
let renderCallbacks: { reconnectNow: () => void; sendSocket: (payload: unknown) => boolean } = {
  reconnectNow: () => {},
  sendSocket: () => false,
};
// Last refs handed to renderDarkMiniXiangqiRoom, so the 100ms clock tick can
// refresh the clock text without a full re-render.
let lastRefs: LiveRefs | null = null;
// System-health funnel (queue -> match -> start -> finish). Own instance so the
// chess tracker never bleeds transitions into DMX. See analytics.ts.
const lifecycleTracker = createGameLifecycleTracker();

export function isDarkMiniXiangqiLiveRoom(): boolean {
  return liveState.gameSpecId === 'dark-mini-xiangqi';
}

export function resetDarkMiniXiangqiReplayState(): void {
  selectedSquare = null;
  playAgainStatus = 'idle';
  replayIndex = null;
  viewHistory = [];
  lastCapturedView = null;
  lastCapturedPositionKey = null;
  latestCapturedPly = 0;
  lastActiveMiniClockColor = null;
  lifecycleTracker.reset();
  resetDarkMiniXiangqiSoundState();
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
  setBoardFamily('xiangqi');
  installMiniXiangqiBoardStyles();
  renderCallbacks = callbacks;
  lastRefs = refs;
  resetChessOnlyPanels(refs);
  renderMiniXiangqiClocks(refs);
  renderMeta(refs);
  renderRoomActions(refs);

  const view = currentMiniView();
  trackMiniXiangqiLifecycle(view);
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

// Feeds the shared start/finish funnel from the live DMX state (never the
// scrubbed replay view). Postgame review is a separate module, so this only ever
// runs for a live room — no isLive() gate needed. Tagged with the DMX game spec
// so the funnel is sliceable from the chess one in PostHog.
function trackMiniXiangqiLifecycle(view: MiniXiangqiPlayerView | null): void {
  if (!view) return;
  const tc = liveState.timeControl;
  const baseProps = {
    gameId: view.id,
    ...gameSpecAnalyticsPropsForId(DARK_MINI_XIANGQI_SPEC_ID),
    rated: liveState.rated,
    roomMode: liveState.roomMode,
    initialMs: tc?.initialMs ?? null,
    incrementMs: tc?.incrementMs ?? null,
    time_class: tc ? classifyTimeControl(tc.initialMs, tc.incrementMs) : null,
  };
  const outcome =
    view.status.type === 'finished'
      ? { winner: view.status.winner, reason: view.status.reason, moveNumber: view.moveNumber }
      : null;
  lifecycleTracker.update({ statusType: view.status.type, baseProps, outcome });
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

// Renders the two-seat clock into the shared clock slots. The board SVG owns
// no clock; this is room chrome reusing the same layout/CSS as the chess clock.
// Top slot is the opponent (relative to the viewer's orientation), bottom is
// the viewer. Untimed games render nothing.
function renderMiniXiangqiClocks(refs: LiveRefs): void {
  refs.clockTop.replaceChildren();
  refs.clockBottom.replaceChildren();
  refs.clockNote.hidden = true;
  refs.clockNote.textContent = '';

  const timeControl = liveState.timeControl;
  if (!timeControl) return;

  const clock = liveState.clock;
  const view = currentMiniView();
  const perspective = view
    ? orientationFor(view)
    : isMiniColor(liveState.seat)
      ? liveState.seat
      : 'red';
  const colors: MiniXiangqiColor[] = perspective === 'red' ? ['black', 'red'] : ['red', 'black'];
  const armed = !!clock && (clock.activeColor !== null || clock.runningSince !== null);

  if (!clock || !armed) {
    const incrementSec = Math.round(timeControl.incrementMs / 1000);
    const tcLabel =
      incrementSec > 0
        ? `${formatClock(timeControl.initialMs)}+${incrementSec}`
        : formatClock(timeControl.initialMs);
    colors.forEach((color, index) => {
      const row = document.createElement('div');
      row.className = 'pregame';
      row.dataset.color = color;
      const label = document.createElement('span');
      label.textContent = capitalize(color);
      const time = document.createElement('strong');
      time.textContent = formatClock(clock ? clock.remainingMs[color] : timeControl.initialMs);
      row.append(label, time);
      (index === 0 ? refs.clockTop : refs.clockBottom).append(row);
    });
    // Only show the "clock starts after the opening moves" hint while the game is
    // actually pregame — not once it's finished/aborted (the clock just sits unarmed
    // at the final times, and the hint would be stale).
    const ended = view?.status.type === 'finished' || view?.status.type === 'aborted';
    refs.clockNote.textContent = ended ? '' : `${tcLabel} · clock starts after the opening moves`;
    refs.clockNote.hidden = ended;
    lastActiveMiniClockColor = null;
    return;
  }

  const displayAt = isReplayLive() ? Date.now() : (clock.runningSince ?? Date.now());
  const playing = view?.status.type === 'playing';
  const activeColor = playing ? clock.activeColor : null;
  const humanColor = isMiniColor(liveState.seat) ? liveState.seat : null;
  // Flash fires once on the turn flip into the seated player's clock; skip the
  // first armed render so the initial activation does not flash.
  const flashThisRender =
    playing &&
    humanColor !== null &&
    activeColor === humanColor &&
    lastActiveMiniClockColor !== null &&
    lastActiveMiniClockColor !== humanColor;
  colors.forEach((color, index) => {
    const isActive = activeColor === color;
    const row = document.createElement('div');
    row.dataset.color = color;
    row.className = isActive
      ? flashThisRender
        ? 'clock-time-row active just-activated'
        : 'clock-time-row active'
      : 'clock-time-row';
    const playerLine = document.createElement('span');
    playerLine.className = isActive ? 'clock-player-line active' : 'clock-player-line';
    playerLine.append(presenceDot(liveState.connectedSeats[color] ?? false));
    const nameEl = document.createElement('span');
    nameEl.className = 'clock-name';
    const name = color === liveState.seat ? 'You' : capitalize(color);
    nameEl.textContent = name;
    nameEl.title = name;
    playerLine.append(nameEl);
    const toMove = document.createElement('span');
    toMove.className = 'clock-to-move';
    toMove.textContent = 'to move';
    toMove.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    playerLine.append(toMove);
    const time = document.createElement('strong');
    const remainingMs = miniClockRemainingMs(clock, color, displayAt);
    time.textContent = formatClock(remainingMs, isActive && remainingMs < 10_000);
    row.append(time);
    const slot = index === 0 ? refs.clockTop : refs.clockBottom;
    if (index === 0) slot.append(playerLine, row);
    else slot.append(row, playerLine);
  });
  lastActiveMiniClockColor = activeColor;
}

// Lightweight per-tick refresh (100ms). Updates only the time text and low-time
// emphasis on existing rows; falls back to a full clock render if the rows have
// not been built yet.
export function tickDarkMiniXiangqiClocks(): void {
  const refs = lastRefs;
  if (!refs) return;
  const clock = liveState.clock;
  const view = currentMiniView();
  if (!clock || !liveState.timeControl || view?.status.type !== 'playing') return;
  if (clock.activeColor === null && clock.runningSince === null) return;
  if (refs.clockTop.children.length === 0 || refs.clockBottom.children.length === 0) {
    renderMiniXiangqiClocks(refs);
    return;
  }
  const displayAt = isReplayLive() ? Date.now() : (clock.runningSince ?? Date.now());
  const rows = [...Array.from(refs.clockTop.children), ...Array.from(refs.clockBottom.children)];
  for (const row of rows as HTMLDivElement[]) {
    const color = row.dataset.color;
    if (color !== 'red' && color !== 'black') continue;
    const isActive = clock.activeColor === color;
    const remainingMs = miniClockRemainingMs(clock, color, displayAt);
    const strong = row.querySelector('strong');
    if (strong) strong.textContent = formatClock(remainingMs, isActive && remainingMs < 10_000);
  }
}

function miniClockRemainingMs(
  clock: XiangqiFamilyClock,
  color: MiniXiangqiColor,
  at: number,
): number {
  const remaining = clock.remainingMs[color];
  if (clock.activeColor !== color || clock.runningSince === null) return remaining;
  return Math.max(0, remaining - Math.max(0, at - clock.runningSince));
}

function presenceDot(connected: boolean): HTMLSpanElement {
  const dot = document.createElement('span');
  dot.className = `presence-dot ${connected ? 'is-online' : 'is-offline'}`;
  dot.setAttribute('aria-label', connected ? 'Connected' : 'Disconnected');
  dot.title = connected ? 'Connected' : 'Disconnected';
  return dot;
}

function renderMeta(refs: LiveRefs): void {
  const seat = isMiniColor(liveState.seat) ? liveState.seat : null;
  refs.gameInfo.replaceChildren(
    infoItem('Variant', 'Dark Mini Xiangqi'),
    infoItem('Mode', 'Casual'),
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
    // Only finished games have a postgame review (the endpoint 404s otherwise).
    if (view.status.type === 'finished') row.append(reviewLink());
    // Finished PvP games offer a mutual-confirm rematch with colors swapped
    // (same as dark chess); PvE and non-seated finished games get an instant new
    // room. Aborted games offer NO play-again — parity with dark chess. The old
    // instant-new-room button after an abort created a fresh solo room where the
    // mover could play before the opponent joined, and the opponent got no cue.
    const seat = liveState.seat;
    if (
      view.status.type === 'finished' &&
      liveState.roomMode === 'pvp' &&
      (seat === 'red' || seat === 'black')
    ) {
      const theirSeat = seat === 'red' ? 'black' : 'red';
      row.append(rematchControls(seat, theirSeat, renderCallbacks.sendSocket));
    } else if (view.status.type === 'finished') {
      row.append(playAgainButton(refs));
    }
    row.append(roomLink('Home', '/'));
    refs.roomActions.append(row);
    return;
  }

  row.append(copyInviteButton());
  refs.roomActions.append(row);
}

function reviewLink(): HTMLAnchorElement {
  const link = roomLink(
    'Review game',
    `/dark-mini-xiangqi/game/${encodeURIComponent(liveState.room)}`,
  );
  link.className = 'primary';
  return link;
}

function copyInviteButton(): HTMLButtonElement {
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy invite';
  copy.addEventListener('click', () => {
    navigator.clipboard
      ?.writeText(window.location.href)
      .then(() => {
        copy.textContent = 'Link copied!';
        setTimeout(() => {
          copy.textContent = 'Copy invite';
        }, 2000);
      })
      .catch(() => {});
  });
  return copy;
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
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildPlayAgainRoomRequestBody()),
    });
    if (!response.ok) throw new Error(`play-again failed: ${response.status}`);
    const data = (await response.json()) as { url?: string };
    if (!data.url) throw new Error('play-again did not return a URL');
    window.location.assign(data.url);
  } catch (err) {
    console.warn(err);
    playAgainStatus = 'failed';
    renderRoomActions(refs);
  }
}

function buildPlayAgainRoomRequestBody(): Record<string, unknown> {
  const mode = liveState.roomMode === 'pve' ? 'pve' : 'pvp';
  const preferredColor =
    mode === 'pve' && (liveState.seat === 'red' || liveState.seat === 'black')
      ? liveState.seat === 'red'
        ? 'black'
        : 'red'
      : 'random';
  return {
    mode,
    gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
    preferredColor,
    ...(mode === 'pve' && liveState.pveEngineId ? { engineId: liveState.pveEngineId } : {}),
    ...(liveState.timeControl ? { timeControl: liveState.timeControl } : {}),
  };
}

function renderGameControls(
  refs: LiveRefs,
  view: MiniXiangqiPlayerView | null,
  sendSocket: (payload: unknown) => boolean,
): void {
  refs.gameControls.replaceChildren();
  refs.gameControlsSection.hidden = true;
  if (!view || view.status.type !== 'playing' || !isMiniColor(liveState.seat)) return;

  const children: HTMLElement[] = [];
  const isSideToMove = view.status.turn === liveState.seat;

  if (view.moveNumber < 2) {
    // The abort countdown shows to both seats (timing only, no board state) so the
    // waiting side understands the pause; only the side to move gets the button.
    if (liveState.abortDeadline !== null) {
      const countdown = document.createElement('span');
      countdown.className = 'abort-countdown';
      countdown.dataset.abortCountdown = '';
      countdown.textContent = miniXiangqiAbortCountdownText(isSideToMove);
      children.push(countdown);
    }
    if (isSideToMove) {
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
      children.push(abort);
    }
    refs.gameControls.replaceChildren(...children);
    refs.gameControlsSection.hidden = children.length === 0;
    return;
  }

  // Post-move-1: only the present winning seat receives forfeitDeadline, so this
  // banner always reads from the beneficiary's point of view.
  if (liveState.forfeitDeadline !== null) {
    const banner = document.createElement('span');
    banner.className = 'forfeit-countdown';
    banner.dataset.forfeitCountdown = '';
    banner.textContent = miniXiangqiForfeitCountdownText();
    children.push(banner);
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
  children.push(resign);
  refs.gameControls.replaceChildren(...children);
  refs.gameControlsSection.hidden = false;
}

// Driven by the 100ms tick loop so the abort/forfeit countdowns advance without a
// full re-render. Only touches existing text; renderGameControls owns creation.
export function tickDarkMiniXiangqiCountdowns(): void {
  const refs = lastRefs;
  if (!refs) return;
  const view = currentMiniView();
  const abortEl = refs.gameControls.querySelector<HTMLElement>('[data-abort-countdown]');
  if (abortEl && view?.status.type === 'playing' && view.moveNumber < 2) {
    abortEl.textContent = miniXiangqiAbortCountdownText(view.status.turn === liveState.seat);
  }
  const forfeitEl = refs.gameControls.querySelector<HTMLElement>('[data-forfeit-countdown]');
  if (forfeitEl && liveState.forfeitDeadline !== null) {
    forfeitEl.textContent = miniXiangqiForfeitCountdownText();
  }
}

function miniXiangqiAbortCountdownText(isSideToMove: boolean): string {
  const remaining = liveState.abortDeadline === null ? 0 : liveState.abortDeadline - Date.now();
  const seconds = Math.max(0, Math.ceil(remaining / 1000));
  return isSideToMove
    ? `Make your first move, aborting in ${seconds}s`
    : `Waiting for first move, aborting in ${seconds}s`;
}

function miniXiangqiForfeitCountdownText(): string {
  const remaining = liveState.forfeitDeadline === null ? 0 : liveState.forfeitDeadline - Date.now();
  const seconds = Math.max(0, Math.ceil(remaining / 1000));
  return `Opponent left, you win in ${seconds}s`;
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

export function handleDarkMiniXiangqiReplayKeyboard(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)
    return;
  if (isEditableKeyboardTarget(event.target)) return;

  const action = replayActionForKey(event.key);
  if (!action || replayControlDisabled(action)) return;

  event.preventDefault();
  handleReplayControl(action);
  if (lastRefs) renderDarkMiniXiangqiRoom(lastRefs, renderCallbacks);
}

function replayActionForKey(key: string): string | null {
  if (key === 'ArrowLeft') return 'prev';
  if (key === 'ArrowRight') return 'next';
  if (key === 'ArrowUp') return 'first';
  if (key === 'ArrowDown') return 'latest';
  return null;
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function renderActionStatus(
  refs: LiveRefs,
  view: MiniXiangqiPlayerView | null,
  reconnectNow: () => void,
): void {
  refs.actionStatus.replaceChildren();
  refs.actionSection.hidden = false;
  // During normal connected play, hide the turn notice (matches dark chess) — the
  // board, clocks, and turn flash already convey whose move it is, so the
  // "Your move / Red to move" banner is just noise.
  if (
    view?.status.type === 'playing' &&
    isMiniColor(liveState.seat) &&
    liveState.connectionState === 'connected'
  ) {
    refs.actionSection.hidden = true;
    return;
  }
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

// Human phrasing for a finished-game reason, so "Draw" always says WHY (the two
// draw reasons are threefold repetition and the no-capture/progress rule).
function miniXiangqiReasonPhrase(reason: MiniXiangqiGameEndReason): string {
  switch (reason) {
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
    const reason = miniXiangqiReasonPhrase(view.status.reason);
    return view.status.winner
      ? `${capitalize(view.status.winner)} wins by ${reason}.`
      : `Draw by ${reason}.`;
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
    draggingFrom: dragFrom,
  });
  refs.board.querySelectorAll<SVGElement>('[data-square]').forEach((el) => {
    el.addEventListener('click', () => {
      if (suppressNextClick) {
        suppressNextClick = false;
        return; // trailing click from a completed drag — already handled
      }
      const square = el.dataset.square as MiniXiangqiSquare | undefined;
      if (!square) return;
      handleSquareClick(view, square, sendSocket);
      renderBoard(refs, view, sendSocket);
    });
    el.addEventListener('pointerdown', (event) => {
      beginMiniXiangqiDrag(event, refs, view, sendSocket, el);
    });
  });
}

// Drag-to-move. Click-to-move is untouched: a pointerdown that never crosses the
// movement threshold falls through to the click handler. Once it does cross, we
// select the source, float a ghost piece, and commit (or re-select) on drop,
// swallowing the trailing click so it doesn't double-handle.
function beginMiniXiangqiDrag(
  event: PointerEvent,
  refs: LiveRefs,
  view: MiniXiangqiPlayerView,
  sendSocket: (payload: unknown) => boolean,
  el: SVGElement,
): void {
  if (event.button !== 0) return;
  const square = el.dataset.square as MiniXiangqiSquare | undefined;
  if (!square || !canSelect(view, square)) return;
  const entry = view.board[square];
  if (!entry || entry.shrouded !== false) return;

  const from = square;
  const startX = event.clientX;
  const startY = event.clientY;
  let dragging = false;

  const onMove = (move: PointerEvent) => {
    if (!dragging) {
      if (Math.abs(move.clientX - startX) + Math.abs(move.clientY - startY) <= 4) {
        return; // still within tap tolerance
      }
      dragging = true;
      dragFrom = from;
      selectedSquare = from; // show selection ring + legal-move hints
      renderBoard(refs, view, sendSocket);
      dragGhost = document.createElement('div');
      dragGhost.className = 'mini-xq-drag-ghost';
      dragGhost.style.width = `${MINI_XIANGQI_PIECE_PX}px`;
      dragGhost.style.height = `${MINI_XIANGQI_PIECE_PX}px`;
      dragGhost.innerHTML = miniXiangqiPieceGhostSvg(entry.piece);
      document.body.append(dragGhost);
    }
    move.preventDefault();
    positionMiniXiangqiGhost(move.clientX, move.clientY);
  };

  const onUp = (up: PointerEvent) => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    if (!dragging) return; // a tap — let the click handler run click-to-move
    removeMiniXiangqiGhost();
    dragFrom = null;
    suppressNextClick = true;
    setTimeout(() => {
      suppressNextClick = false;
    }, 0);
    const target = miniXiangqiSquareUnderPoint(up.clientX, up.clientY);
    const legal =
      target && target !== from
        ? view.legalMoves.find((m) => m.from === from && m.to === target)
        : undefined;
    if (legal) {
      selectedSquare = null;
      if (sendSocket({ type: 'move', from: legal.from, to: legal.to })) {
        playSound(soundForOwnMiniXiangqiMove(view, legal));
      }
    } else {
      selectedSquare = from; // dropped off-target — keep selected for a follow-up click
    }
    renderBoard(refs, view, sendSocket);
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

function positionMiniXiangqiGhost(clientX: number, clientY: number): void {
  if (!dragGhost) return;
  dragGhost.style.left = `${clientX - MINI_XIANGQI_PIECE_PX / 2}px`;
  dragGhost.style.top = `${clientY - MINI_XIANGQI_PIECE_PX / 2}px`;
}

function removeMiniXiangqiGhost(): void {
  dragGhost?.remove();
  dragGhost = null;
}

function miniXiangqiSquareUnderPoint(clientX: number, clientY: number): MiniXiangqiSquare | null {
  const hit = document
    .elementFromPoint(clientX, clientY)
    ?.closest('[data-square]') as HTMLElement | null;
  return (hit?.dataset.square as MiniXiangqiSquare | undefined) ?? null;
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
    if (sendSocket({ type: 'move', from: move.from, to: move.to })) {
      playSound(soundForOwnMiniXiangqiMove(view, move));
    }
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
  // Dedup by position key alone. The key includes the side to move (and the
  // terminal status), so every ply is a distinct snapshot even when an opponent's
  // hidden move leaves this player's board, vision, and moveNumber unchanged —
  // that case previously collapsed plies and truncated the back-scroll.
  if (positionKey === lastCapturedPositionKey) {
    lastCapturedView = view;
    return;
  }
  latestCapturedPly = replayPlyForView(view);
  viewHistory.push({ ply: latestCapturedPly, view });
  lastCapturedView = view;
  lastCapturedPositionKey = positionKey;
}

// Absolute game ply for a view. Derived from moveNumber/turn for live positions
// (so it is correct even when the client joined mid-game), and one past the last
// captured ply for a terminal frame (the finishing move).
function replayPlyForView(view: MiniXiangqiPlayerView): number {
  if (view.status.type === 'playing') {
    const completedFullMoves = Math.max(0, view.moveNumber - 1);
    return completedFullMoves * 2 + (view.status.turn === 'black' ? 1 : 0);
  }
  return latestCapturedPly + 1;
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
    // Side to move for live positions; status type once the game is over. This is
    // the per-ply discriminator that keeps hidden-move plies from collapsing.
    turn: view.status.type === 'playing' ? view.status.turn : view.status.type,
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
