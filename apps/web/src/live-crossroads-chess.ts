// Live multiplayer room client for perfect-information Crossroads Chess (中西象棋).
//
// Deliberately a self-contained sibling of the shared chess/DMX live room
// (apps/web/src/live.ts), NOT woven into it. Perfect-information is the lighter
// tenant — no fog, no per-seat redaction — so this client renders the server's
// open PlayerView directly and never touches the fog-critical shared shell.
// The connection state machine (reconnects, displacement, seq-gap resync,
// seat-token hand-off) lives in the generic tenant socket client
// (variant-tenant/socket-client.ts, extracted from this module); frame
// application and all rendering stay Crossroads-owned here.
//
// Wire protocol locked by server-ws-crossroads-chess.test.ts: hello / snapshot carry
// the full open view + events; event-appended is the steady-state delta. The
// server re-validates every move, so the client can be optimistic about input.

import {
  applyCrossroadsChessOpenMove,
  CROSSROADS_CHESS_SPEC_ID,
  type CrossroadsChessColor,
  type CrossroadsChessGameState,
  type CrossroadsChessMove,
  type CrossroadsChessPlayerView,
  type CrossroadsChessSquare,
  createInitialCrossroadsChessState,
  getCrossroadsChessOpenView,
} from '@mistboard/game';
import './live-crossroads-chess.css';
import {
  classifyTimeControl,
  createGameLifecycleTracker,
  type GameLifecycleStatusType,
  gameSpecAnalyticsPropsForId,
} from './analytics.js';
import { renderCrossroadsChessBoardSvg } from './crossroads-chess-render.js';
import {
  maybePlayCrossroadsChessSnapshotSound,
  resetCrossroadsChessSoundState,
  soundForOwnCrossroadsChessMove,
} from './live-crossroads-chess-sound.js';
import { createLiveLayout, setLiveLayoutGameSpec } from './live-layout.js';
import {
  initLiveSound,
  maybePlayLowTimeSound,
  playSound,
  resetLiveSoundState,
} from './live-sound.js';
import { clearSeatTokenForRoom, type LiveRefs } from './live-state.js';
import { roomIdFromPath } from './room-url.js';
import {
  createTenantSocketClient,
  type TenantConnectionState,
  type TenantSocketClient,
} from './variant-tenant/socket-client.js';

// ── Wire shapes (the subset this client consumes) ───────────────────────────

type CrossroadsLiveClock = {
  activeColor: CrossroadsChessColor | null;
  incrementMs: number;
  initialMs: number;
  remainingMs: Record<CrossroadsChessColor, number>;
  runningSince: number | null;
};
type CrossroadsChessLiveTimeControl = { initialMs: number; incrementMs: number };

type CrossroadsMovePlayed = {
  type: 'move-played';
  color: CrossroadsChessColor;
  move: CrossroadsChessMove;
  ply?: number;
};
type CrossroadsLiveEvent = CrossroadsMovePlayed | { type: string };
type CrossroadsLiveRematch = {
  offers: Partial<Record<CrossroadsChessColor, boolean>>;
  finalizedRoomId: string | null;
};

type CrossroadsLiveFrame = {
  type: 'hello' | 'snapshot' | 'event-appended';
  clientId?: string;
  seatToken?: string;
  seat: CrossroadsChessColor | 'spectator';
  seats: Partial<Record<CrossroadsChessColor, string>>;
  state: CrossroadsChessPlayerView;
  clock?: CrossroadsLiveClock | null;
  connectedSeats?: Record<CrossroadsChessColor, boolean>;
  abortDeadline?: number | null;
  forfeitDeadline?: number | null;
  timeControl?: { initialMs: number; incrementMs: number } | null;
  rematch?: CrossroadsLiveRematch;
  pveEngineId?: string;
  roomMode?: 'pvp' | 'pve';
  clients?: number;
  events?: CrossroadsLiveEvent[];
  event?: CrossroadsLiveEvent;
  seq?: number;
};

type ReplaySnapshot = { ply: number; view: CrossroadsChessPlayerView };

// ── Module state ─────────────────────────────────────────────────────────────

const state = {
  room: '',
  seat: null as CrossroadsChessColor | 'spectator' | null,
  view: null as CrossroadsChessPlayerView | null,
  clock: null as CrossroadsLiveClock | null,
  timeControl: null as CrossroadsChessLiveTimeControl | null,
  seats: {} as Partial<Record<CrossroadsChessColor, string>>,
  connectedSeats: { white: false, red: false } as Record<CrossroadsChessColor, boolean>,
  moves: [] as CrossroadsMovePlayed[],
  replayHistory: [] as ReplaySnapshot[],
  replayPly: null as number | null,
  selected: null as CrossroadsChessSquare | null,
  playAgainStatus: 'idle' as 'idle' | 'creating' | 'failed',
  pveEngineId: null as string | null,
  roomMode: 'pvp' as 'pvp' | 'pve',
  rematch: {
    offers: {} as Partial<Record<CrossroadsChessColor, boolean>>,
    finalizedRoomId: null as string | null,
    declined: false,
  },
  rematchCancelIntent: false,
};

let client: TenantSocketClient | null = null;
let refs: LiveRefs | null = null;
let boardHost: HTMLElement | null = null;
const lifecycleTracker = createGameLifecycleTracker();

function send(payload: unknown): boolean {
  return client?.send(payload) ?? false;
}

function connection(): TenantConnectionState {
  return client?.connection() ?? 'connecting';
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function bootstrapCrossroadsChessLiveRoom(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('missing #app');

  const params = new URLSearchParams(window.location.search);
  const room = roomIdFromPath(window.location.pathname) ?? params.get('room') ?? 'dchess_dev';
  state.room = room;
  state.playAgainStatus = 'idle';
  state.rematch = { offers: {}, finalizedRoomId: null, declined: false };
  state.rematchCancelIntent = false;
  lifecycleTracker.reset();
  initLiveSound();
  resetLiveSoundState();
  resetCrossroadsChessSoundState();

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
  setLiveLayoutGameSpec(app, 'crossroads-chess');
  boardHost = refs.board;

  boardHost?.addEventListener('click', onBoardClick);

  client = createTenantSocketClient({
    room,
    applyHello: (frame) => applySnapshotFrame(frame as CrossroadsLiveFrame),
    applySnapshot: (frame) => applySnapshotFrame(frame as CrossroadsLiveFrame),
    applyEvent: (frame) => applyEventFrame(frame as CrossroadsLiveFrame),
    onRematchState: (message) => applyRematchState(message as unknown as CrossroadsLiveRematch),
    render: renderAll,
  });
  client.connect();
  client.startPing();
  window.setInterval(tickClocks, 250);
  document.addEventListener('keydown', handleReplayKeyboard);
  renderAll();
}

// ── Frame application (connection mechanics live in the tenant socket client) ─

function applySnapshotFrame(frame: CrossroadsLiveFrame): void {
  applyFrame(frame);
  state.moves = movesFromEvents(frame.events ?? []);
  rebuildReplayHistory();
  maybePlayCrossroadsChessSnapshotSound(state.view, state.seat);
}

function applyEventFrame(frame: CrossroadsLiveFrame): void {
  applyFrame(frame);
  if (frame.event?.type === 'move-played') state.moves.push(frame.event as CrossroadsMovePlayed);
  rebuildReplayHistory();
  maybePlayCrossroadsChessSnapshotSound(state.view, state.seat);
}

function applyFrame(frame: CrossroadsLiveFrame): void {
  state.seat = frame.seat;
  state.view = frame.state;
  state.clock = frame.clock ?? null;
  state.timeControl = frame.timeControl ?? state.timeControl;
  state.roomMode = frame.roomMode ?? state.roomMode;
  state.pveEngineId = frame.pveEngineId ?? state.pveEngineId;
  if (frame.rematch) {
    state.rematch = { ...frame.rematch, declined: state.rematch.declined };
  }
  state.seats = frame.seats ?? state.seats;
  if (frame.connectedSeats) state.connectedSeats = frame.connectedSeats;
  // A fresh frame supersedes the local selection only when the game state moved
  // on (someone played); keep the selection otherwise so a re-render mid-pick
  // doesn't drop it.
}

function applyRematchState(message: CrossroadsLiveRematch): void {
  const mySeat = state.seat;
  const hadMyOffer = isCrossroadsChessColor(mySeat) && Boolean(state.rematch.offers[mySeat]);
  const stillMyOffer = isCrossroadsChessColor(mySeat) && Boolean(message.offers[mySeat]);
  const anyOffer = Boolean(message.offers.white || message.offers.red);
  const iCancelled = state.rematchCancelIntent;
  state.rematchCancelIntent = false;
  const declined =
    hadMyOffer && !stillMyOffer && !message.finalizedRoomId && !iCancelled
      ? true
      : anyOffer
        ? false
        : state.rematch.declined;
  state.rematch = {
    offers: message.offers,
    finalizedRoomId: message.finalizedRoomId,
    declined,
  };
}

function movesFromEvents(events: CrossroadsLiveEvent[]): CrossroadsMovePlayed[] {
  return events.filter((event): event is CrossroadsMovePlayed => event.type === 'move-played');
}

// ── Interaction ──────────────────────────────────────────────────────────────

function onBoardClick(event: MouseEvent): void {
  const view = liveView();
  if (!view) return;
  if (!isReplayLive()) return;
  if (!iAmPlayer() || !isMyTurn()) return;
  const target = (event.target as HTMLElement | null)?.closest('[data-square]');
  if (!target) return;
  const square = target.getAttribute('data-square') as CrossroadsChessSquare | null;
  if (!square) return;

  if (state.selected === null) {
    // Select only a square that has at least one legal move.
    if (legalTargets(square).length === 0) return;
    state.selected = square;
    renderBoard();
    return;
  }
  if (square === state.selected) {
    state.selected = null;
    renderBoard();
    return;
  }
  const targets = legalTargets(state.selected);
  if (targets.includes(square)) {
    const move = { from: state.selected, to: square };
    if (send({ type: 'move', ...move })) {
      playSound(soundForOwnCrossroadsChessMove(view, move));
    }
    state.selected = null;
    renderBoard();
    return;
  }
  // Clicked elsewhere: reselect if the new square has moves, else clear.
  state.selected = legalTargets(square).length > 0 ? square : null;
  renderBoard();
}

function legalTargets(from: CrossroadsChessSquare): CrossroadsChessSquare[] {
  const view = liveView();
  if (!view) return [];
  return view.legalMoves.filter((move) => move.from === from).map((move) => move.to);
}

function iAmPlayer(): boolean {
  return state.seat === 'white' || state.seat === 'red';
}

function isMyTurn(): boolean {
  const view = liveView();
  return (
    !!view &&
    view.status.type === 'playing' &&
    view.status.turn === state.seat &&
    view.legalMoves.length > 0
  );
}

// ── Rendering ────────────────────────────────────────────────────────────────

function renderAll(): void {
  if (!refs) return;
  trackCrossroadsChessLifecycle(state.view);
  resetSharedPanels(refs);
  renderMeta(refs);
  renderBoard();
  renderClocks(refs);
  renderMoves(refs);
  renderActionStatus(refs);
  renderGameControls(refs);
  renderRoomActions(refs);
}

function trackCrossroadsChessLifecycle(view: CrossroadsChessPlayerView | null): void {
  lifecycleTracker.update(
    crossroadsChessLifecycleAnalyticsInput(view, {
      roomMode: state.roomMode,
      timeControl: state.timeControl,
    }),
  );
}

export function crossroadsChessLifecycleAnalyticsInput(
  view: CrossroadsChessPlayerView | null,
  context: {
    roomMode: 'pvp' | 'pve';
    timeControl: CrossroadsChessLiveTimeControl | null;
  },
): {
  statusType: GameLifecycleStatusType;
  baseProps: Record<string, unknown>;
  outcome: { winner: CrossroadsChessColor | null; reason: string; moveNumber: number } | null;
} | null {
  if (!view) return null;
  const tc = context.timeControl;
  const baseProps = {
    gameId: view.id,
    ...gameSpecAnalyticsPropsForId(CROSSROADS_CHESS_SPEC_ID),
    rated: false,
    roomMode: context.roomMode,
    initialMs: tc?.initialMs ?? null,
    incrementMs: tc?.incrementMs ?? null,
    time_class: tc ? classifyTimeControl(tc.initialMs, tc.incrementMs) : null,
  };
  const outcome =
    view.status.type === 'finished'
      ? { winner: view.status.winner, reason: view.status.reason, moveNumber: view.moveNumber }
      : null;
  return { statusType: view.status.type, baseProps, outcome };
}

function renderBoard(): void {
  if (!refs || !boardHost) return;
  const view = displayedView();
  refs.boardStatus.hidden = view !== null;
  boardHost.className = 'board crossroads-live-board';
  boardHost.setAttribute('aria-label', 'Crossroads Chess board');
  if (!view) {
    boardHost.replaceChildren();
    return;
  }
  const targets = state.selected ? legalTargets(state.selected) : [];
  boardHost.innerHTML = renderCrossroadsChessBoardSvg(view, {
    perspective: view.perspective,
    showFog: false,
    interactive: isReplayLive() && iAmPlayer(),
    selected: state.selected,
    targets,
    lastMove: view.lastMove ?? null,
  });
}

function resetSharedPanels(liveRefs: LiveRefs): void {
  liveRefs.offerSection.hidden = true;
  liveRefs.selectionSection.hidden = true;
  liveRefs.devViewsSection.hidden = true;
  liveRefs.draftPicker.hidden = true;
  liveRefs.promotion.hidden = true;
  liveRefs.boardPaused.hidden = true;
  liveRefs.capturesTop.replaceChildren();
  liveRefs.capturesBottom.replaceChildren();
  liveRefs.clockNote.hidden = true;
  liveRefs.clockNote.textContent = '';
}

function renderMeta(liveRefs: LiveRefs): void {
  const timeLabel = crossroadsLiveTimeControlLabel(state.timeControl);
  liveRefs.gameInfo.replaceChildren(
    infoItem('Variant', timeLabel ? `Crossroads Chess · ${timeLabel}` : 'Crossroads Chess'),
    infoItem('Mode', 'Casual'),
    infoItem('Seat', seatLabel()),
    infoItem('Connection', connectionText()),
  );
}

function renderRoomActions(liveRefs: LiveRefs): void {
  liveRefs.roomActions.replaceChildren();
  const row = document.createElement('div');
  row.className = 'room-actions-row';
  const view = state.view;

  if (view?.status.type === 'finished') {
    const review = roomLink('Review game', crossroadsChessReviewUrl(state.room));
    review.className = 'primary';
    row.append(review);
    if (state.roomMode === 'pve') {
      row.append(playAgainButton());
    } else if (isCrossroadsChessColor(state.seat)) {
      row.append(rematchControls(state.seat));
    } else {
      row.append(playAgainButton());
    }
    row.append(roomLink('Home', '/'));
    liveRefs.roomActions.append(row);
    return;
  }
  if (view?.status.type === 'aborted') {
    row.append(roomLink('Home', '/'));
    liveRefs.roomActions.append(row);
    return;
  }

  const copy = document.createElement('button');
  copy.type = 'button';
  if (waitingForOpponent()) copy.className = 'primary';
  copy.textContent = 'Copy invite';
  copy.addEventListener('click', () => {
    navigator.clipboard
      ?.writeText(window.location.href)
      .then(() => {
        copy.textContent = 'Link copied!';
        window.setTimeout(() => {
          copy.textContent = 'Copy invite';
        }, 2000);
      })
      .catch(() => {});
  });
  row.append(copy);
  liveRefs.roomActions.append(row);
}

function renderActionStatus(liveRefs: LiveRefs): void {
  liveRefs.actionStatus.replaceChildren();
  liveRefs.actionSection.hidden = false;

  if (
    state.view?.status.type === 'playing' &&
    iAmPlayer() &&
    connection() === 'connected' &&
    isReplayLive() &&
    !waitingForOpponent()
  ) {
    liveRefs.actionSection.hidden = true;
    return;
  }

  const notice = document.createElement('div');
  notice.className = `action-notice ${actionTone()}`;
  notice.append(noticeTitle(actionTitle()), noticeBody(actionBody()));
  liveRefs.actionStatus.append(notice);
}

function renderGameControls(liveRefs: LiveRefs): void {
  liveRefs.gameControls.replaceChildren();
  liveRefs.gameControlsSection.hidden = true;
  const view = state.view;
  if (!view || view.status.type !== 'playing' || !iAmPlayer()) return;

  if (view.moveNumber < 2) {
    const children: HTMLElement[] = [];
    if (view.status.turn === state.seat) {
      const abort = document.createElement('button');
      abort.type = 'button';
      abort.className = 'danger';
      abort.textContent = 'Abort';
      abort.addEventListener('click', () => send({ type: 'abort' }));
      children.push(abort);
    }
    liveRefs.gameControls.replaceChildren(...children);
    liveRefs.gameControlsSection.hidden = children.length === 0;
    return;
  }

  const resign = document.createElement('button');
  resign.type = 'button';
  resign.className = 'danger';
  resign.textContent = 'Resign';
  resign.addEventListener('click', () => send({ type: 'resign' }));
  liveRefs.gameControls.append(resign);
  liveRefs.gameControlsSection.hidden = false;
}

function playAgainButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = state.playAgainStatus === 'failed' ? 'danger' : '';
  button.disabled = state.playAgainStatus === 'creating';
  button.textContent =
    state.playAgainStatus === 'creating'
      ? 'Creating'
      : state.playAgainStatus === 'failed'
        ? 'Try play again'
        : 'Play again';
  button.addEventListener('click', () => {
    void createCrossroadsLivePlayAgainRoom(state.timeControl, {
      mode: state.roomMode,
      pveEngineId: state.pveEngineId,
      seat: state.seat,
    })
      .then((url) => {
        window.location.assign(url);
      })
      .catch((err) => {
        console.warn(err);
        state.playAgainStatus = 'failed';
        renderAll();
      });
    state.playAgainStatus = 'creating';
    renderAll();
  });
  return button;
}

function rematchControls(mySeat: CrossroadsChessColor): HTMLElement {
  const theirSeat = mySeat === 'white' ? 'red' : 'white';
  const iOffered = Boolean(state.rematch.offers[mySeat]);
  const theyOffered = Boolean(state.rematch.offers[theirSeat]);

  const block = document.createElement('div');
  block.className = 'room-rematch';

  if (iOffered && theyOffered) {
    block.append(rematchButtonRow(disabledButton('Starting rematch...')));
    return block;
  }
  if (iOffered) {
    block.append(
      rematchNote('Waiting for opponent...'),
      rematchButtonRow(
        actionButton('Cancel rematch', () => {
          state.rematchCancelIntent = true;
          send({ type: 'rematch:cancel' });
        }),
      ),
    );
    return block;
  }
  if (theyOffered) {
    block.append(
      rematchNote('Your opponent wants a rematch'),
      rematchButtonRow(
        actionButton('Decline', () => send({ type: 'rematch:decline' })),
        actionButton('Accept', () => send({ type: 'rematch:offer' }), 'primary'),
      ),
    );
    return block;
  }
  if (state.rematch.declined) {
    block.append(rematchNote('Your opponent declined the rematch.'));
  }
  block.append(rematchButtonRow(actionButton('Rematch', () => send({ type: 'rematch:offer' }))));
  return block;
}

function rematchNote(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'room-rematch-note';
  p.textContent = text;
  return p;
}

function rematchButtonRow(...buttons: HTMLElement[]): HTMLElement {
  const row = document.createElement('div');
  row.className = 'room-rematch-buttons';
  row.append(...buttons);
  return row;
}

function actionButton(label: string, onClick: () => void, variant?: 'primary'): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  if (variant) button.className = variant;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function disabledButton(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.disabled = true;
  button.textContent = label;
  return button;
}

export async function createCrossroadsLivePlayAgainRoom(
  timeControl: CrossroadsChessLiveTimeControl | null,
  options: CrossroadsLivePlayAgainOptions = {},
): Promise<string> {
  const response = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(crossroadsLivePlayAgainRequestBody(timeControl, options)),
  });
  if (!response.ok) throw new Error('crossroads_live_play_again_failed');
  const body = (await response.json()) as { url?: unknown };
  if (typeof body.url !== 'string') throw new Error('crossroads_live_play_again_missing_url');
  return body.url;
}

type CrossroadsLivePlayAgainOptions = {
  mode?: 'pvp' | 'pve';
  pveEngineId?: string | null;
  seat?: CrossroadsChessColor | 'spectator' | null;
};

export function crossroadsLivePlayAgainRequestBody(
  timeControl: CrossroadsChessLiveTimeControl | null,
  options: CrossroadsLivePlayAgainOptions = {},
): {
  mode: 'pvp' | 'pve';
  gameSpecId: 'crossroads-chess';
  timeControl: CrossroadsChessLiveTimeControl;
  rated: false;
  preferredColor: 'white' | 'red' | 'random';
  engineId?: string;
} {
  const mode = options.mode === 'pve' ? 'pve' : 'pvp';
  const preferredColor =
    mode === 'pve' && options.seat === 'white'
      ? 'red'
      : mode === 'pve' && options.seat === 'red'
        ? 'white'
        : 'random';
  return {
    mode,
    gameSpecId: 'crossroads-chess',
    timeControl: timeControl ?? defaultTimeControl(),
    rated: false,
    preferredColor,
    ...(mode === 'pve' && options.pveEngineId ? { engineId: options.pveEngineId } : {}),
  };
}

function defaultTimeControl(): CrossroadsChessLiveTimeControl {
  return { initialMs: 300_000, incrementMs: 5_000 };
}

export function crossroadsLiveTimeControlLabel(
  timeControl: CrossroadsChessLiveTimeControl | null,
): string | null {
  if (!timeControl) return null;
  const minutes = Math.round(timeControl.initialMs / 60_000);
  const incrementSeconds = Math.round(timeControl.incrementMs / 1000);
  return incrementSeconds > 0 ? `${minutes}+${incrementSeconds}` : `${minutes}+0`;
}

// Which color sits at the top vs bottom of the board for this viewer.
function bottomColor(): CrossroadsChessColor {
  return state.seat === 'red' ? 'red' : 'white';
}
function topColor(): CrossroadsChessColor {
  return bottomColor() === 'white' ? 'red' : 'white';
}

function renderClocks(liveRefs: LiveRefs): void {
  liveRefs.clockTop.replaceChildren();
  liveRefs.clockBottom.replaceChildren();
  if (!state.clock) return;
  renderClockSlot(liveRefs.clockTop, topColor());
  renderClockSlot(liveRefs.clockBottom, bottomColor());
}

function renderClockSlot(container: HTMLElement, color: CrossroadsChessColor): void {
  if (!state.clock) return;
  const ms = clockRemainingMs(color);
  const active = state.clock.activeColor === color && state.view?.status.type === 'playing';
  const connected = state.connectedSeats[color];
  const playerLine = document.createElement('span');
  playerLine.className = active ? 'clock-player-line active' : 'clock-player-line';
  playerLine.append(presenceDot(connected));
  const name = document.createElement('span');
  name.className = 'clock-name';
  name.textContent = color === state.seat ? 'You' : capitalize(color);
  playerLine.append(name);
  const toMove = document.createElement('span');
  toMove.className = 'clock-to-move';
  toMove.textContent = 'to move';
  toMove.setAttribute('aria-hidden', active ? 'false' : 'true');
  playerLine.append(toMove);

  const row = document.createElement('div');
  row.className = active ? 'clock-time-row active' : 'clock-time-row';
  row.dataset.color = color;
  const time = document.createElement('strong');
  time.dataset.clockTime = color;
  time.textContent = formatClock(ms);
  row.append(time);
  container.append(playerLine, row);
}

function statusText(): string {
  const view = state.view;
  if (!view) return 'Connecting…';
  const status = view.status;
  if (status.type === 'finished') {
    const winner = status.winner ? (status.winner === 'white' ? 'White' : 'Red') : null;
    const reason = crossroadsChessEndReasonLabel(status.reason);
    return winner ? `${winner} wins by ${reason}` : `Draw by ${reason}`;
  }
  if (status.type === 'aborted') return `Game aborted: ${abortReasonLabel(status.reason)}`;
  const turn = status.turn === 'white' ? 'White' : 'Red';
  const mine = status.turn === state.seat ? ', your move' : '';
  return `${turn} to move${mine}`;
}

function crossroadsChessEndReasonLabel(reason: string): string {
  switch (reason) {
    case 'race':
      return 'the Race';
    case 'checkmate':
      return 'checkmate';
    case 'stalemate':
      return 'stalemate';
    case 'repetition':
      return 'repetition';
    case 'progress-clock':
      return 'no progress';
    case 'timeout':
      return 'timeout';
    case 'resignation':
      return 'resignation';
    case 'abandonment':
      return 'disconnect';
    case 'king-captured':
      return 'king capture';
    default:
      return 'game end';
  }
}

function abortReasonLabel(reason: string): string {
  switch (reason) {
    case 'pregame-timeout':
      return 'pregame timeout';
    case 'user-abort':
      return 'aborted by player';
    default:
      return 'aborted';
  }
}

function connectionText(): string {
  switch (connection()) {
    case 'connected':
      return state.seat && state.seat !== 'spectator' ? 'Connected' : 'Spectating';
    case 'connecting':
      return 'Connecting…';
    case 'reconnecting':
      return 'Reconnecting…';
    case 'displaced':
      return 'Opened in another tab';
    case 'rejected': {
      const closeReason = client?.closeReason() ?? '';
      return `Cannot join${closeReason ? `: ${closeReason}` : ''}`;
    }
  }
}

function seatLabel(): string {
  if (state.seat === 'white' || state.seat === 'red') return capitalize(state.seat);
  return 'Spectator';
}

function actionTone(): 'danger' | 'default' | 'pending' | 'success' {
  if (connection() === 'rejected' || connection() === 'displaced') return 'danger';
  if (!state.view || connection() !== 'connected') return 'pending';
  if (state.view.status.type === 'playing' && state.view.status.turn === state.seat) {
    return 'success';
  }
  return 'default';
}

function actionTitle(): string {
  if (connection() === 'rejected') return 'Room unavailable';
  if (connection() === 'displaced') return 'Session moved';
  if (!state.view) return 'Connecting';
  if (!isReplayLive()) return 'Viewing replay';
  if (waitingForOpponent()) return 'Invite opponent';
  if (state.view.status.type === 'finished') return 'Game finished';
  if (state.view.status.type === 'aborted') return 'Game aborted';
  if (state.view.status.turn === state.seat) return 'Your move';
  return `${capitalize(state.view.status.turn)} to move`;
}

function actionBody(): string {
  if (connection() === 'rejected') return 'This Crossroads Chess room is not active.';
  if (connection() === 'displaced') return 'Another tab reclaimed this seat.';
  if (!state.view) return 'Opening the room socket.';
  if (!isReplayLive()) return 'Return to latest before making a move.';
  if (waitingForOpponent()) return 'Copy the invite link and send it to your opponent.';
  if (state.view.status.type === 'finished' || state.view.status.type === 'aborted') {
    return statusText();
  }
  if (state.seat === 'spectator') return 'Watching the full board.';
  if (state.view.status.turn === state.seat) {
    return 'Select one of your pieces, then choose a destination.';
  }
  return 'Waiting for the opponent.';
}

function waitingForOpponent(): boolean {
  const opponent = opponentColor();
  return (
    connection() === 'connected' &&
    state.view?.status.type === 'playing' &&
    opponent !== null &&
    state.connectedSeats[opponent] !== true
  );
}

function opponentColor(): CrossroadsChessColor | null {
  if (state.seat === 'white') return 'red';
  if (state.seat === 'red') return 'white';
  return null;
}

function renderMoves(liveRefs: LiveRefs): void {
  liveRefs.moveList.replaceChildren();
  const currentPly = currentReplayPly();
  const maxPly = maxReplayPly();
  liveRefs.replayMeta.textContent =
    state.moves.length === 0
      ? 'Live'
      : isReplayLive()
        ? `Live · ply ${maxPly} of ${maxPly}`
        : `Replay · ply ${currentPly} of ${maxPly}`;
  for (const button of liveRefs.replayControls) {
    const action = button.dataset.replay ?? '';
    button.disabled = replayControlDisabled(action);
    button.onclick = () => {
      handleReplayControl(action);
      renderAll();
    };
  }
  if (state.moves.length === 0) {
    const row = document.createElement('li');
    row.className = 'move-row';
    const empty = document.createElement('span');
    empty.className = 'move-empty';
    empty.textContent = 'No moves yet';
    row.append(empty);
    liveRefs.moveList.append(row);
    return;
  }
  for (let i = 0; i < state.moves.length; i += 2) {
    const row = document.createElement('li');
    row.className = 'move-row';
    const n = document.createElement('span');
    n.className = 'move-number';
    n.textContent = `${i / 2 + 1}.`;
    row.append(
      n,
      liveMoveCell(state.moves[i], i + 1, currentPly),
      liveMoveCell(state.moves[i + 1], i + 2, currentPly),
    );
    liveRefs.moveList.append(row);
  }
}

function liveMoveCell(
  move: CrossroadsMovePlayed | undefined,
  ply: number,
  currentPly: number,
): HTMLElement {
  if (!move) {
    const empty = document.createElement('span');
    empty.className = 'move-empty';
    return empty;
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = currentPly === ply ? 'active' : '';
  button.textContent = uci(move.move);
  button.title = `${capitalize(move.color)} move ${Math.ceil(ply / 2)}`;
  button.addEventListener('click', () => {
    state.replayPly = ply === maxReplayPly() ? null : ply;
    state.selected = null;
    renderAll();
  });
  return button;
}

function rebuildReplayHistory(): void {
  const perspective = liveView()?.perspective ?? (state.seat === 'red' ? 'red' : 'white');
  let nextState: CrossroadsChessGameState = createInitialCrossroadsChessState(state.room);
  const history: ReplaySnapshot[] = [
    { ply: 0, view: getCrossroadsChessOpenView(nextState, perspective) },
  ];
  state.moves.forEach((event, index) => {
    nextState = applyCrossroadsChessOpenMove(nextState, event.move);
    history.push({ ply: index + 1, view: getCrossroadsChessOpenView(nextState, perspective) });
  });
  state.replayHistory = history;
  if (state.replayPly !== null) {
    state.replayPly = Math.max(0, Math.min(state.replayPly, maxReplayPly()));
  }
}

function displayedView(): CrossroadsChessPlayerView | null {
  if (isReplayLive()) return liveView();
  return (
    state.replayHistory.find((snapshot) => snapshot.ply === state.replayPly)?.view ?? liveView()
  );
}

function liveView(): CrossroadsChessPlayerView | null {
  return state.view;
}

function isReplayLive(): boolean {
  return state.replayPly === null;
}

function currentReplayPly(): number {
  return state.replayPly ?? maxReplayPly();
}

function maxReplayPly(): number {
  return Math.max(0, state.replayHistory.length - 1, state.moves.length);
}

function replayControlDisabled(action: string): boolean {
  const current = currentReplayPly();
  const max = maxReplayPly();
  if (max === 0) return true;
  if (action === 'first' || action === 'prev') return current <= 0;
  if (action === 'next') return isReplayLive() || current >= max;
  if (action === 'latest') return isReplayLive();
  return true;
}

function handleReplayControl(action: string): void {
  const current = currentReplayPly();
  const max = maxReplayPly();
  if (action === 'first') {
    state.replayPly = 0;
  } else if (action === 'prev') {
    state.replayPly = Math.max(0, current - 1);
  } else if (action === 'next') {
    state.replayPly = Math.min(max, current + 1);
  } else if (action === 'latest') {
    state.replayPly = null;
  }
  state.selected = null;
}

function handleReplayKeyboard(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
    return;
  }
  if (isEditableKeyboardTarget(event.target)) return;
  const action = replayActionForKey(event.key);
  if (!action || replayControlDisabled(action)) return;
  event.preventDefault();
  handleReplayControl(action);
  renderAll();
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

export function crossroadsChessTerminalActionsMarkup(
  roomId: string,
  statusType: 'finished' | 'aborted',
): string {
  const review =
    statusType === 'finished'
      ? `<a class="crossroads-live-btn" href="${crossroadsChessReviewUrl(roomId)}">Review game</a>`
      : '';
  const playAgain =
    statusType === 'finished' ? '<button class="crossroads-live-btn">Play again</button>' : '';
  return `<div class="crossroads-live-actions">${review}${playAgain}<a class="crossroads-live-btn" href="/">Home</a></div>`;
}

export function crossroadsChessReviewUrl(roomId: string): string {
  return `/crossroads-chess/game/${encodeURIComponent(roomId)}`;
}

// ── Clocks ───────────────────────────────────────────────────────────────────

function clockRemainingMs(color: CrossroadsChessColor): number {
  const clock = state.clock;
  if (!clock) return 0;
  const base = clock.remainingMs[color];
  if (clock.activeColor !== color || clock.runningSince === null) return base;
  return Math.max(0, base - Math.max(0, Date.now() - clock.runningSince));
}

function tickClocks(): void {
  if (!refs || !state.clock || state.view?.status.type !== 'playing') return;
  for (const color of ['white', 'red'] as CrossroadsChessColor[]) {
    const remainingMs = clockRemainingMs(color);
    if (color === state.seat && state.replayPly === null && state.view) {
      maybePlayLowTimeSound(state.view.id, remainingMs, state.timeControl?.initialMs ?? null);
    }
    const node = refs.board
      .closest('#app')
      ?.querySelector<HTMLElement>(`[data-clock-time="${color}"]`);
    if (node) node.textContent = formatClock(remainingMs);
  }
}

function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function uci(move: CrossroadsChessMove): string {
  return `${move.from}${move.to}${move.promotion ? 'Q' : ''}`;
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

function presenceDot(connected: boolean): HTMLSpanElement {
  const dot = document.createElement('span');
  dot.className = `presence-dot ${connected ? 'is-online' : 'is-offline'}`;
  dot.setAttribute('aria-label', connected ? 'Connected' : 'Disconnected');
  dot.title = connected ? 'Connected' : 'Disconnected';
  return dot;
}

function roomLink(label: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  return link;
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function isCrossroadsChessColor(value: unknown): value is CrossroadsChessColor {
  return value === 'white' || value === 'red';
}
