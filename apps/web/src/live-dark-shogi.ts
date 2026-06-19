// Live multiplayer room client for hidden/dev-only Dark Shogi (9x9) — a FOG
// tenant on the same stack as Dark Crossroads / Dark Xiangqi:
//   * the generic socket client + shared room chrome,
//   * the fog-safe replay CAPTURE controller — replays only the per-seat fog
//     snapshots the client actually received, never reconstructing hidden state,
//   * the masked move list — only your own plies are notated; opponent plies are
//     redacted off the wire and show a dimmed placeholder,
//   * the bare wire shape — no rematch/roomMode extras.
//
// Shogi-specific surface (net-new vs the other fog tenants): a 9x9 koma board
// (shogi-render.ts), the reserves (hand) strips reusing the capture slots, DROP
// interaction (select a hand piece, then an empty square), and the PROMOTION
// choice when a board move can optionally promote. Hands are PRIVATE under fog —
// the view carries only your own reserve, so the opponent's strip stays hidden.
//
// Wire shape pinned by dark-shogi-golden-wire.test.ts: tenant core snapshot with
// NO extras, per-seat move-played redaction, own-moves-only lastMove, own-hand
// only.

import {
  isShogiDrop,
  type ShogiColor,
  type ShogiHandRole,
  type ShogiMove,
  type ShogiPlayerView,
  type ShogiSquare,
} from '@mistboard/game';
import './live-dark-shogi.css';
import { darkShogiEnabled } from './feature-flags.js';
import {
  maybePlayDarkShogiSnapshotSound,
  resetDarkShogiSoundState,
  soundForOwnDarkShogiMove,
} from './live-dark-shogi-sound.js';
import { createLiveLayout, setLiveLayoutGameSpec } from './live-layout.js';
import { initLiveSound, playSound, resetLiveSoundState } from './live-sound.js';
import { clearSeatTokenForRoom, type LiveRefs } from './live-state.js';
import { roomIdFromPath } from './room-url.js';
import {
  renderShogiBoardSvg,
  SHOGI_HAND_ORDER,
  shogiHandKomaSvg,
  shogiKomaSvg,
} from './shogi-render.js';
import { boardAppearanceChangedEvent, setBoardFamily } from './theme.js';
import { syncMoveListScroll } from './variant-tenant/chrome-dom.js';
import { createTenantReplayController } from './variant-tenant/replay-controller.js';
import { createTenantRoomChrome, type WebVariantTenant } from './variant-tenant/room-chrome.js';
import {
  createTenantSocketClient,
  type TenantConnectionState,
  type TenantSocketClient,
} from './variant-tenant/socket-client.js';

// ── Wire shapes (the subset this client consumes) ───────────────────────────

type DarkShogiLiveClock = {
  activeColor: ShogiColor | null;
  incrementMs: number;
  initialMs: number;
  remainingMs: Record<ShogiColor, number>;
  runningSince: number | null;
};

type DarkShogiMovePlayed = {
  type: 'move-played';
  color: ShogiColor;
  move: ShogiMove;
  at: number;
  ply?: number;
};
type DarkShogiLiveEvent = DarkShogiMovePlayed | { type: string; [key: string]: unknown };
type DarkShogiVisibleMoveRow = { fullMove: number; black?: string; white?: string };

type DarkShogiLiveFrame = {
  type: 'hello' | 'snapshot' | 'event-appended';
  clientId?: string;
  seatToken?: string;
  seat: ShogiColor | 'spectator';
  seats: Partial<Record<ShogiColor, string>>;
  state: ShogiPlayerView;
  clock?: DarkShogiLiveClock | null;
  connectedSeats?: Record<ShogiColor, boolean>;
  abortDeadline?: number | null;
  timeControl?: { initialMs: number; incrementMs: number } | null;
  clients?: number;
  events?: DarkShogiLiveEvent[];
  event?: DarkShogiLiveEvent;
  seq?: number;
};

// ── Module state ─────────────────────────────────────────────────────────────

const state = {
  room: '',
  seat: null as ShogiColor | 'spectator' | null,
  view: null as ShogiPlayerView | null,
  clock: null as DarkShogiLiveClock | null,
  timeControl: null as { initialMs: number; incrementMs: number } | null,
  seats: {} as Partial<Record<ShogiColor, string>>,
  connectedSeats: { black: false, white: false } as Record<ShogiColor, boolean>,
  events: [] as DarkShogiLiveEvent[],
  abortDeadline: null as number | null,
  selected: null as ShogiSquare | null,
  selectedDrop: null as ShogiHandRole | null,
  pendingPromotion: null as { from: ShogiSquare; to: ShogiSquare } | null,
  // The square a parachute drop bounced off (a probe: it is occupied). Cleared
  // on the next action.
  bounce: null as ShogiSquare | null,
};

let client: TenantSocketClient | null = null;
let refs: LiveRefs | null = null;
let boardHost: HTMLElement | null = null;
let lastCapturedView: ShogiPlayerView | null = null;
let lastCapturedPositionKey: string | null = null;

const replay = createTenantReplayController<ShogiPlayerView>();

function send(payload: unknown): boolean {
  return client?.send(payload) ?? false;
}

function connection(): TenantConnectionState {
  return client?.connection() ?? 'connecting';
}

// ── Shared tenant room chrome ────────────────────────────────────────────────

const darkShogiWebTenant: WebVariantTenant<ShogiColor> = {
  displayName: 'Dark Shogi',
  colors: ['black', 'white'],
  isColor: isShogiColor,
  oppositeColor: (color) => (color === 'black' ? 'white' : 'black'),
  enabled: darkShogiEnabled,
  reviewUrl: (roomId) => `/dark-shogi/game/${encodeURIComponent(roomId)}`,
  reasonPhrase: darkShogiEndReasonLabel,
  disabledTitle: 'Dark Shogi disabled',
  disabledBody: 'This client build has the room renderer off.',
  rejectedBody: 'This Dark Shogi room is not active. Create a new invite to start a game.',
  spectatorBody: 'Watching without private information.',
  selectInstruction:
    'Select one of your visible pieces (or a reserve piece to drop), then choose a destination.',
};

const chrome = createTenantRoomChrome(darkShogiWebTenant, {
  view: () => state.view,
  seat: () => state.seat,
  connectionState: () => connection(),
  clock: () => state.clock,
  timeControl: () => state.timeControl,
  connectedSeats: () => state.connectedSeats,
  abortDeadline: () => state.abortDeadline,
  // Not on the Dark Shogi wire (golden-pinned, no snapshot extras): the forfeit
  // banner and rematch block never arm.
  forfeitDeadline: () => null,
  roomMode: () => 'pvp',
  room: () => state.room,
  debugRequested: () => false,
  isReplayLive: () => replay.isLive(),
  orientation: () => orientationFor(state.view),
  playAgainRequestBody: () => ({
    mode: 'pvp',
    gameSpecId: 'dark-shogi',
    preferredColor: 'random',
    ...(state.timeControl ? { timeControl: state.timeControl } : {}),
  }),
  rematchControls: () => null,
});

function darkShogiEndReasonLabel(reason: string): string {
  switch (reason) {
    case 'king-captured':
      return 'king capture';
    case 'repetition':
      return 'repetition';
    case 'timeout':
      return 'timeout';
    case 'resignation':
      return 'resignation';
    case 'abandonment':
      return 'disconnect';
    default:
      return 'the game rules';
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function bootstrapDarkShogiLiveRoom(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('missing #app');

  const params = new URLSearchParams(window.location.search);
  const room = roomIdFromPath(window.location.pathname) ?? params.get('room') ?? 'dsg_dev';
  state.room = room;
  state.selected = null;
  state.selectedDrop = null;
  state.pendingPromotion = null;
  state.bounce = null;
  lastCapturedView = null;
  lastCapturedPositionKey = null;
  replay.reset();
  chrome.resetState();
  initLiveSound();
  resetLiveSoundState();
  resetDarkShogiSoundState();

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
  setLiveLayoutGameSpec(app, 'dark-shogi');
  setBoardFamily('chess');
  boardHost = refs.board;
  chrome.setRenderTarget(refs, {
    sendSocket: send,
    reconnectNow: () => client?.connect(),
  });

  boardHost?.addEventListener('click', onBoardClick);
  refs.capturesBottom.addEventListener('click', onHandClick);
  refs.promotion.addEventListener('click', onPromotionClick);

  client = createTenantSocketClient({
    room,
    applyHello: (frame) => applyFrame(frame as DarkShogiLiveFrame),
    applySnapshot: (frame) => {
      applyFrame(frame as DarkShogiLiveFrame);
      maybePlayDarkShogiSnapshotSound(state.view, state.seat);
    },
    applyEvent: (frame) => applyEventFrame(frame as DarkShogiLiveFrame),
    onServerMessage,
    render: renderAll,
  });
  client.connect();
  client.startPing();
  window.setInterval(() => {
    chrome.tickClocks();
    chrome.tickCountdowns();
  }, 100);
  document.addEventListener('keydown', handleReplayKeyboard);
  window.addEventListener(boardAppearanceChangedEvent, renderAll);
  renderAll();
}

// ── Frame application ─────────────────────────────────────────────────────────

function applyFrame(frame: DarkShogiLiveFrame): void {
  state.seat = frame.seat;
  state.view = frame.state;
  state.clock = frame.clock ?? null;
  state.timeControl = frame.timeControl ?? state.timeControl;
  state.seats = frame.seats ?? state.seats;
  if (frame.connectedSeats) state.connectedSeats = frame.connectedSeats;
  state.abortDeadline = frame.abortDeadline ?? null;
  if (frame.events) state.events = frame.events;
}

function applyEventFrame(frame: DarkShogiLiveFrame): void {
  const events = state.events;
  applyFrame(frame);
  state.events = events;
  if (frame.event) state.events = [...events, frame.event];
  maybePlayDarkShogiSnapshotSound(state.view, state.seat);
}

function handleReplayKeyboard(event: KeyboardEvent): void {
  replay.handleKeyboard(event, renderAll);
}

function onServerMessage(message: { type: string; [key: string]: unknown }): void {
  // The parachute bounce: a drop landed on a hidden piece. Record the square as a
  // probe (it is occupied) and clear the pending drop so the player can retry.
  if (message.type === 'drop-rejected' && typeof message.to === 'string') {
    state.bounce = message.to as ShogiSquare;
    state.selectedDrop = null;
  }
}

// ── Interaction ──────────────────────────────────────────────────────────────

function onBoardClick(event: MouseEvent): void {
  const view = state.view;
  if (!view) return;
  if (!canActNow(view)) return;
  if (state.pendingPromotion) return; // resolve the promotion choice first
  const target = (event.target as HTMLElement | null)?.closest('[data-square]');
  if (!target) return;
  const square = target.getAttribute('data-square') as ShogiSquare | null;
  if (!square) return;
  state.bounce = null;

  // Drop mode: the next board click places the selected reserve piece.
  if (state.selectedDrop) {
    if (dropTargets(view, state.selectedDrop).includes(square)) {
      if (send({ type: 'move', from: `*${state.selectedDrop}`, to: square })) {
        playSound('drop');
      }
      clearSelection();
      renderAll();
      return;
    }
    state.selectedDrop = null; // clicked off a drop square: cancel, fall through
  }

  if (state.selected === null) {
    if (moveTargets(view, square).length === 0) return;
    state.selected = square;
    renderAll();
    return;
  }
  if (square === state.selected) {
    clearSelection();
    renderAll();
    return;
  }
  const matches = view.legalMoves.filter(
    (move): move is Extract<ShogiMove, { from: ShogiSquare }> =>
      !isShogiDrop(move) && move.from === state.selected && move.to === square,
  );
  if (matches.length > 0) {
    submitBoardMove(state.selected, square, matches);
    return;
  }
  // Clicked elsewhere: reselect if the new square has moves, else clear.
  state.selected = moveTargets(view, square).length > 0 ? square : null;
  renderAll();
}

function submitBoardMove(
  from: ShogiSquare,
  to: ShogiSquare,
  matches: Array<Extract<ShogiMove, { from: ShogiSquare }>>,
): void {
  const canPromote = matches.some((move) => move.promote);
  const canStay = matches.some((move) => !move.promote);
  if (canPromote && canStay) {
    // Optional promotion: ask. Keep the selection until the choice resolves.
    state.pendingPromotion = { from, to };
    renderAll();
    return;
  }
  if (send({ type: 'move', from, to, ...(canPromote ? { promotion: 'promote' } : {}) })) {
    playSound(soundForOwnDarkShogiMove(state.view, { from, to }));
  }
  clearSelection();
  renderAll();
}

function onHandClick(event: MouseEvent): void {
  const view = state.view;
  if (!view) return;
  if (!canActNow(view)) return;
  if (state.pendingPromotion) return;
  const target = (event.target as HTMLElement | null)?.closest('[data-drop]');
  if (!target) return;
  const role = target.getAttribute('data-drop') as ShogiHandRole | null;
  if (!role || (view.hand[role] ?? 0) <= 0) return;
  state.bounce = null;
  state.selected = null;
  state.selectedDrop = state.selectedDrop === role ? null : role;
  renderAll();
}

function onPromotionClick(event: MouseEvent): void {
  const pending = state.pendingPromotion;
  if (!pending) return;
  const target = (event.target as HTMLElement | null)?.closest('[data-promote]');
  if (!target) return;
  const choice = target.getAttribute('data-promote');
  if (choice !== 'yes' && choice !== 'no') return;
  if (
    send({
      type: 'move',
      from: pending.from,
      to: pending.to,
      ...(choice === 'yes' ? { promotion: 'promote' } : {}),
    })
  ) {
    playSound(soundForOwnDarkShogiMove(state.view, { from: pending.from, to: pending.to }));
  }
  clearSelection();
  renderAll();
}

function clearSelection(): void {
  state.selected = null;
  state.selectedDrop = null;
  state.pendingPromotion = null;
}

function moveTargets(view: ShogiPlayerView, from: ShogiSquare): ShogiSquare[] {
  const seen = new Set<ShogiSquare>();
  for (const move of view.legalMoves) {
    if (!isShogiDrop(move) && move.from === from) seen.add(move.to);
  }
  return [...seen];
}

function dropTargets(view: ShogiPlayerView, role: ShogiHandRole): ShogiSquare[] {
  const seen = new Set<ShogiSquare>();
  for (const move of view.legalMoves) {
    if (isShogiDrop(move) && move.drop === role) seen.add(move.to);
  }
  return [...seen];
}

function canActNow(view: ShogiPlayerView): boolean {
  return replay.isLive() && iAmPlayer() && isMyTurn(view);
}

function iAmPlayer(): boolean {
  return isShogiColor(state.seat);
}

function isMyTurn(view: ShogiPlayerView): boolean {
  return view.status.type === 'playing' && view.status.turn === state.seat;
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
  replay.renderShell(refs, renderAll);
  refs.boardStatus.hidden = view !== null;
  chrome.renderActionStatus();
  chrome.renderGameControls();
  chrome.renderRoomActions();

  if (!darkShogiEnabled()) {
    refs.board.className = 'board shogi-live-board shogi-live-board--disabled';
    refs.board.replaceChildren();
    refs.capturesTop.replaceChildren();
    refs.capturesBottom.replaceChildren();
    clearSelection();
    return;
  }

  renderBoard(displayedView);
  renderHands(displayedView);
  renderPromotion(displayedView);
  renderVisibleMoveList(refs);
}

function renderBoard(view: ShogiPlayerView | null): void {
  if (!refs) return;
  refs.board.className = 'board shogi-live-board';
  refs.board.setAttribute('aria-label', 'Dark Shogi board');
  if (!view) {
    refs.board.replaceChildren();
    return;
  }
  const perspective = orientationFor(view);
  const interactive = replay.isLive() && iAmPlayer() && isMyTurn(view) && !state.pendingPromotion;
  const selected = interactive ? state.selected : null;
  const targets = interactive ? activeTargets(view) : [];
  refs.board.innerHTML = renderShogiBoardSvg(view, {
    perspective,
    showFog: true,
    selected,
    targets,
    interactive,
  });
}

function activeTargets(view: ShogiPlayerView): ShogiSquare[] {
  if (state.selectedDrop) return dropTargets(view, state.selectedDrop);
  if (state.selected) return moveTargets(view, state.selected);
  return [];
}

// The reserves strips. Your hand (bottom) is droppable on your turn; the
// opponent's reserve is PRIVATE under fog, so the top strip is a hidden note.
function renderHands(view: ShogiPlayerView | null): void {
  if (!refs) return;
  const seat = state.seat;
  refs.capturesTop.replaceChildren(opponentReserveStrip());
  if (!view || !isShogiColor(seat)) {
    refs.capturesBottom.replaceChildren();
    return;
  }
  const droppable = canActNow(view);
  refs.capturesBottom.replaceChildren(ownReserveStrip(view, seat, droppable));
}

function ownReserveStrip(view: ShogiPlayerView, seat: ShogiColor, droppable: boolean): HTMLElement {
  const strip = document.createElement('div');
  strip.className = 'shogi-hands shogi-hands--own';
  const entries = SHOGI_HAND_ORDER.filter((role) => (view.hand[role] ?? 0) > 0);
  if (entries.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'shogi-hands__empty';
    empty.textContent = 'No pieces in hand';
    strip.append(empty);
    return strip;
  }
  for (const role of entries) {
    strip.append(handKoma(role, seat, view.hand[role] ?? 0, droppable));
  }
  return strip;
}

function opponentReserveStrip(): HTMLElement {
  const strip = document.createElement('div');
  strip.className = 'shogi-hands shogi-hands--opponent';
  const note = document.createElement('span');
  note.className = 'shogi-hands__empty';
  note.textContent = 'Opponent reserve: hidden';
  strip.append(note);
  return strip;
}

function handKoma(
  role: ShogiHandRole,
  color: ShogiColor,
  count: number,
  droppable: boolean,
): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  const selected = state.selectedDrop === role;
  button.className = [
    'shogi-hand-koma',
    droppable ? 'shogi-hand-koma--droppable' : '',
    selected ? 'shogi-hand-koma--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
  button.dataset.drop = role;
  button.disabled = !droppable;
  button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  button.innerHTML = shogiHandKomaSvg(role, color);
  const badge = document.createElement('span');
  badge.className = 'shogi-hand-koma__count';
  badge.textContent = String(count);
  button.append(badge);
  return button;
}

function renderPromotion(view: ShogiPlayerView | null): void {
  if (!refs) return;
  const pending = state.pendingPromotion;
  if (!pending || !view) {
    refs.promotion.hidden = true;
    refs.promotion.replaceChildren();
    return;
  }
  const piece = view.board[pending.from];
  if (!piece) {
    refs.promotion.hidden = true;
    return;
  }
  refs.promotion.hidden = false;
  refs.promotion.className = 'promotion-picker shogi-promotion';
  refs.promotion.innerHTML = `
    <div class="shogi-promotion__panel">
      <div class="shogi-promotion__title">Promote?</div>
      <div class="shogi-promotion__choices">
        <button type="button" class="shogi-promotion__choice" data-promote="yes">
          ${shogiKomaSvg({ color: piece.color, role: piece.role, promoted: true })}
          <span>Promote</span>
        </button>
        <button type="button" class="shogi-promotion__choice" data-promote="no">
          ${shogiKomaSvg({ color: piece.color, role: piece.role, promoted: false })}
          <span>Keep</span>
        </button>
      </div>
    </div>`;
}

function renderVisibleMoveList(liveRefs: LiveRefs): void {
  const moves = state.events.filter((event): event is DarkShogiMovePlayed => isMoveEvent(event));
  const plyCount = replay.visiblePlyCount();
  liveRefs.moveList.replaceChildren();
  if (state.bounce) {
    const banner = document.createElement('li');
    banner.className = 'dsg-bounce-banner';
    banner.textContent = `Drop bounced: ${state.bounce} is occupied. Try another square.`;
    liveRefs.moveList.append(banner);
  }
  if (plyCount === 0) {
    const item = document.createElement('li');
    item.className = 'dsg-move-row';
    const empty = document.createElement('span');
    empty.className = 'dsg-move-row__move masked';
    empty.textContent = 'No visible moves yet';
    item.append(empty);
    liveRefs.moveList.append(item);
    return;
  }
  const activePly = replay.activePly();
  for (const row of visibleMoveRows(moves, plyCount)) {
    const item = document.createElement('li');
    item.className = 'dsg-move-row';
    const number = document.createElement('span');
    number.className = 'dsg-move-row__number';
    number.textContent = `${row.fullMove}.`;
    item.append(
      number,
      moveCell(row.black, row.fullMove * 2 - 1, activePly, plyCount),
      moveCell(row.white, row.fullMove * 2, activePly, plyCount),
    );
    liveRefs.moveList.append(item);
  }
  syncMoveListScroll(liveRefs.moveList, { live: replay.isLive(), plyCount: replay.latestPly() });
}

function moveCell(
  text: string | undefined,
  ply: number,
  activePly: number | null,
  plyCount: number,
): HTMLElement {
  const span = document.createElement('span');
  // A ply within the played range we have no notation for is a redacted
  // opponent move: render the masked placeholder, never the move.
  const masked = !text && ply <= plyCount;
  span.className = ['dsg-move-row__move', masked ? 'masked' : '', activePly === ply ? 'active' : '']
    .filter(Boolean)
    .join(' ');
  span.textContent = ply > plyCount ? '' : (text ?? '...');
  return span;
}

function visibleMoveRows(
  moves: readonly DarkShogiMovePlayed[],
  plyCount: number,
): DarkShogiVisibleMoveRow[] {
  const rows = new Map<number, DarkShogiVisibleMoveRow>();
  for (let fullMove = 1; fullMove <= Math.ceil(plyCount / 2); fullMove += 1) {
    rows.set(fullMove, { fullMove });
  }
  moves.forEach((event, index) => {
    const ply = eventPly(event, index);
    if (ply > plyCount) return;
    const fullMove = Math.floor((ply - 1) / 2) + 1;
    const row = rows.get(fullMove) ?? { fullMove };
    row[event.color] = notateShogiMove(event.move);
    rows.set(fullMove, row);
  });
  return [...rows.values()].sort((a, b) => a.fullMove - b.fullMove);
}

function notateShogiMove(move: ShogiMove): string {
  if (isShogiDrop(move)) return `${move.drop}*${move.to}`;
  return `${move.from}${move.to}${move.promote ? '+' : ''}`;
}

function eventPly(event: DarkShogiMovePlayed, fallbackIndex: number): number {
  return Number.isInteger(event.ply) && event.ply && event.ply > 0 ? event.ply : fallbackIndex + 1;
}

// ── Fog-safe replay capture ──────────────────────────────────────────────────
// Each distinct fog snapshot the client receives is pushed to the replay
// controller keyed by its derived ply. The client only ever holds its OWN fog
// views, so scrubbing can never surface the opponent's hidden state.

function captureReplayView(view: ShogiPlayerView | null): void {
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

function replayPlyForView(view: ShogiPlayerView, positionChanged: boolean): number {
  if (view.status.type === 'playing') {
    // Black moves first; moveNumber increments after White completes a full move.
    const completedFullMoves = Math.max(0, view.moveNumber - 1);
    return completedFullMoves * 2 + (view.status.turn === 'white' ? 1 : 0);
  }
  if (positionChanged && view.lastMove) return replay.latestPly() + 1;
  return replay.latestPly();
}

function replayPositionKey(view: ShogiPlayerView): string {
  const board = Object.entries(view.board)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([square, piece]) => [square, piece?.color, piece?.role, Boolean(piece?.promoted)]);
  const hand = SHOGI_HAND_ORDER.map((role) => view.hand[role] ?? 0);
  return JSON.stringify({
    board,
    hand,
    lastMove: view.lastMove ?? null,
    moveNumber: view.moveNumber,
    perspective: view.perspective,
    visibleSquares: [...view.visibleSquares].sort(),
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isMoveEvent(event: DarkShogiLiveEvent): event is DarkShogiMovePlayed {
  const move = (event as { move?: unknown }).move;
  if (event.type !== 'move-played') return false;
  if (!isShogiColor((event as { color?: unknown }).color)) return false;
  if (typeof move !== 'object' || move === null) return false;
  const candidate = move as { from?: unknown; to?: unknown; drop?: unknown };
  if (typeof candidate.to !== 'string') return false;
  return typeof candidate.from === 'string' || typeof candidate.drop === 'string';
}

function orientationFor(view: ShogiPlayerView | null): ShogiColor {
  if (isShogiColor(state.seat)) return state.seat;
  return view?.perspective ?? 'black';
}

function isShogiColor(value: unknown): value is ShogiColor {
  return value === 'black' || value === 'white';
}
