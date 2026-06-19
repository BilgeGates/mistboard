// Live multiplayer room client for hidden/dev-only Dark Crazyhouse (8x8 chess +
// drops) — a FOG tenant on the same stack as Dark Shogi:
//   * the generic socket client + shared room chrome,
//   * the fog-safe replay CAPTURE controller (replays only the per-seat fog
//     snapshots received; never reconstructs hidden state),
//   * the masked move list (own plies only; opponent plies are redacted off the
//     wire and show a dimmed placeholder),
//   * the bare wire shape (no rematch/roomMode extras).
//
// Crazyhouse-specific surface (the Dark Shogi pattern on the chess board): the
// reserves (hand) strips reusing the capture slots, DROP interaction (select a
// hand piece, then a square), the 4-way chess PROMOTION picker, and the PARACHUTE
// BOUNCE — a drop into the fog onto a hidden piece comes back as a 'drop-rejected'
// message, surfaced as a probe note. Hands are PRIVATE under fog.

import {
  type Color,
  type CrazyhouseDropRole,
  type CrazyhouseHand,
  type CrazyhouseMove,
  type CrazyhousePlayerView,
  isCrazyhouseDrop,
  type PieceRole,
  type Square,
} from '@mistboard/game';
import './live-dark-crazyhouse.css';
import {
  CRAZYHOUSE_HAND_ORDER,
  crazyhouseHandPieceSvg,
  renderCrazyhouseBoardSvg,
} from './crazyhouse-render.js';
import { darkCrazyhouseEnabled } from './feature-flags.js';
import {
  maybePlayDarkCrazyhouseSnapshotSound,
  resetDarkCrazyhouseSoundState,
  soundForOwnDarkCrazyhouseMove,
} from './live-dark-crazyhouse-sound.js';
import { createLiveLayout, setLiveLayoutGameSpec } from './live-layout.js';
import { initLiveSound, playSound, resetLiveSoundState } from './live-sound.js';
import { clearSeatTokenForRoom, type LiveRefs } from './live-state.js';
import { roomIdFromPath } from './room-url.js';
import { boardAppearanceChangedEvent, setBoardFamily } from './theme.js';
import { createTenantReplayController } from './variant-tenant/replay-controller.js';
import { createTenantRoomChrome, type WebVariantTenant } from './variant-tenant/room-chrome.js';
import {
  createTenantSocketClient,
  type TenantConnectionState,
  type TenantSocketClient,
} from './variant-tenant/socket-client.js';

type CrazyhousePromotionRole = Exclude<PieceRole, 'king' | 'pawn'>;
const DROP_LETTER: Record<CrazyhouseDropRole, string> = {
  queen: 'Q',
  rook: 'R',
  bishop: 'B',
  knight: 'N',
  pawn: 'P',
};

// ── Wire shapes (the subset this client consumes) ───────────────────────────

type DarkCrazyhouseLiveClock = {
  activeColor: Color | null;
  incrementMs: number;
  initialMs: number;
  remainingMs: Record<Color, number>;
  runningSince: number | null;
};

type DarkCrazyhouseMovePlayed = {
  type: 'move-played';
  color: Color;
  move: CrazyhouseMove;
  at: number;
  ply?: number;
};
type DarkCrazyhouseLiveEvent = DarkCrazyhouseMovePlayed | { type: string; [key: string]: unknown };
type DarkCrazyhouseVisibleMoveRow = { fullMove: number; white?: string; black?: string };

type DarkCrazyhouseLiveFrame = {
  type: 'hello' | 'snapshot' | 'event-appended';
  clientId?: string;
  seatToken?: string;
  seat: Color | 'spectator';
  seats: Partial<Record<Color, string>>;
  state: CrazyhousePlayerView;
  clock?: DarkCrazyhouseLiveClock | null;
  connectedSeats?: Record<Color, boolean>;
  abortDeadline?: number | null;
  timeControl?: { initialMs: number; incrementMs: number } | null;
  clients?: number;
  events?: DarkCrazyhouseLiveEvent[];
  event?: DarkCrazyhouseLiveEvent;
  seq?: number;
};

// ── Module state ─────────────────────────────────────────────────────────────

const state = {
  room: '',
  seat: null as Color | 'spectator' | null,
  view: null as CrazyhousePlayerView | null,
  clock: null as DarkCrazyhouseLiveClock | null,
  timeControl: null as { initialMs: number; incrementMs: number } | null,
  seats: {} as Partial<Record<Color, string>>,
  connectedSeats: { white: false, black: false } as Record<Color, boolean>,
  events: [] as DarkCrazyhouseLiveEvent[],
  abortDeadline: null as number | null,
  selected: null as Square | null,
  selectedDrop: null as CrazyhouseDropRole | null,
  pendingPromotion: null as { from: Square; to: Square; roles: CrazyhousePromotionRole[] } | null,
  // The square a parachute drop bounced off (a probe: it is occupied). Cleared on
  // the next action.
  bounce: null as Square | null,
};

let client: TenantSocketClient | null = null;
let refs: LiveRefs | null = null;
let boardHost: HTMLElement | null = null;
let lastCapturedView: CrazyhousePlayerView | null = null;
let lastCapturedPositionKey: string | null = null;

const replay = createTenantReplayController<CrazyhousePlayerView>();

function send(payload: unknown): boolean {
  return client?.send(payload) ?? false;
}

function connection(): TenantConnectionState {
  return client?.connection() ?? 'connecting';
}

// ── Shared tenant room chrome ────────────────────────────────────────────────

const darkCrazyhouseWebTenant: WebVariantTenant<Color> = {
  displayName: 'Dark Crazyhouse',
  colors: ['white', 'black'],
  isColor,
  oppositeColor: (color) => (color === 'white' ? 'black' : 'white'),
  enabled: darkCrazyhouseEnabled,
  reviewUrl: (roomId) => `/dark-crazyhouse/game/${encodeURIComponent(roomId)}`,
  reasonPhrase: darkCrazyhouseEndReasonLabel,
  disabledTitle: 'Dark Crazyhouse disabled',
  disabledBody: 'This client build has the room renderer off.',
  rejectedBody: 'This Dark Crazyhouse room is not active. Create a new invite to start a game.',
  spectatorBody: 'Watching without private information.',
  selectInstruction:
    'Select one of your visible pieces (or a reserve piece to drop), then choose a destination.',
};

const chrome = createTenantRoomChrome(darkCrazyhouseWebTenant, {
  view: () => state.view,
  seat: () => state.seat,
  connectionState: () => connection(),
  clock: () => state.clock,
  timeControl: () => state.timeControl,
  connectedSeats: () => state.connectedSeats,
  abortDeadline: () => state.abortDeadline,
  forfeitDeadline: () => null,
  roomMode: () => 'pvp',
  room: () => state.room,
  debugRequested: () => false,
  isReplayLive: () => replay.isLive(),
  orientation: () => orientationFor(state.view),
  playAgainRequestBody: () => ({
    mode: 'pvp',
    gameSpecId: 'dark-crazyhouse',
    preferredColor: 'random',
    ...(state.timeControl ? { timeControl: state.timeControl } : {}),
  }),
  rematchControls: () => null,
});

function darkCrazyhouseEndReasonLabel(reason: string): string {
  switch (reason) {
    case 'king-captured':
      return 'king capture';
    case 'draw':
      return 'a draw';
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

export function bootstrapDarkCrazyhouseLiveRoom(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('missing #app');

  const params = new URLSearchParams(window.location.search);
  const room = roomIdFromPath(window.location.pathname) ?? params.get('room') ?? 'dczh_dev';
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
  resetDarkCrazyhouseSoundState();

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
  setLiveLayoutGameSpec(app, 'dark-crazyhouse');
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
    applyHello: (frame) => applyFrame(frame as DarkCrazyhouseLiveFrame),
    applySnapshot: (frame) => {
      applyFrame(frame as DarkCrazyhouseLiveFrame);
      maybePlayDarkCrazyhouseSnapshotSound(state.view, state.seat);
    },
    applyEvent: (frame) => applyEventFrame(frame as DarkCrazyhouseLiveFrame),
    onServerMessage: onServerMessage,
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

function applyFrame(frame: DarkCrazyhouseLiveFrame): void {
  state.seat = frame.seat;
  state.view = frame.state;
  state.clock = frame.clock ?? null;
  state.timeControl = frame.timeControl ?? state.timeControl;
  state.seats = frame.seats ?? state.seats;
  if (frame.connectedSeats) state.connectedSeats = frame.connectedSeats;
  state.abortDeadline = frame.abortDeadline ?? null;
  if (frame.events) state.events = frame.events;
}

function applyEventFrame(frame: DarkCrazyhouseLiveFrame): void {
  const events = state.events;
  applyFrame(frame);
  state.events = events;
  if (frame.event) state.events = [...events, frame.event];
  maybePlayDarkCrazyhouseSnapshotSound(state.view, state.seat);
}

function onServerMessage(message: { type: string; [key: string]: unknown }): void {
  // The parachute bounce: a drop landed on a hidden piece. Record the square as a
  // probe (it is occupied) and clear the pending drop so the player can retry.
  if (message.type === 'drop-rejected' && typeof message.to === 'string') {
    state.bounce = message.to as Square;
    state.selectedDrop = null;
  }
}

function handleReplayKeyboard(event: KeyboardEvent): void {
  replay.handleKeyboard(event, renderAll);
}

// ── Interaction ──────────────────────────────────────────────────────────────

function onBoardClick(event: MouseEvent): void {
  const view = state.view;
  if (!view) return;
  if (!canActNow(view)) return;
  if (state.pendingPromotion) return;
  const target = (event.target as HTMLElement | null)?.closest('[data-square]');
  if (!target) return;
  const square = target.getAttribute('data-square') as Square | null;
  if (!square) return;
  state.bounce = null;

  if (state.selectedDrop) {
    if (dropTargets(view, state.selectedDrop).includes(square)) {
      if (send({ type: 'move', from: `*${DROP_LETTER[state.selectedDrop]}`, to: square })) {
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
  const matches = boardMovesFromTo(view, state.selected, square);
  if (matches.length > 0) {
    submitBoardMove(state.selected, square, matches);
    return;
  }
  state.selected = moveTargets(view, square).length > 0 ? square : null;
  renderAll();
}

function submitBoardMove(from: Square, to: Square, matches: CrazyhouseMove[]): void {
  const promotions = matches
    .map((move) => (isCrazyhouseDrop(move) ? undefined : move.promotion))
    .filter((role): role is CrazyhousePromotionRole => Boolean(role));
  if (promotions.length > 0) {
    state.pendingPromotion = { from, to, roles: promotions };
    renderAll();
    return;
  }
  if (send({ type: 'move', from, to })) {
    playSound(soundForOwnDarkCrazyhouseMove(state.view, { from, to }));
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
  const role = target.getAttribute('data-drop') as CrazyhouseDropRole | null;
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
  const role = target.getAttribute('data-promote') as CrazyhousePromotionRole | null;
  if (!role || !pending.roles.includes(role)) return;
  if (send({ type: 'move', from: pending.from, to: pending.to, promotion: role })) {
    playSound(soundForOwnDarkCrazyhouseMove(state.view, { from: pending.from, to: pending.to }));
  }
  clearSelection();
  renderAll();
}

function clearSelection(): void {
  state.selected = null;
  state.selectedDrop = null;
  state.pendingPromotion = null;
}

function boardMovesFromTo(view: CrazyhousePlayerView, from: Square, to: Square): CrazyhouseMove[] {
  return view.legalMoves.filter(
    (move) => !isCrazyhouseDrop(move) && move.from === from && move.to === to,
  );
}

function moveTargets(view: CrazyhousePlayerView, from: Square): Square[] {
  const seen = new Set<Square>();
  for (const move of view.legalMoves) {
    if (!isCrazyhouseDrop(move) && move.from === from) seen.add(move.to);
  }
  return [...seen];
}

function dropTargets(view: CrazyhousePlayerView, role: CrazyhouseDropRole): Square[] {
  const seen = new Set<Square>();
  for (const move of view.legalMoves) {
    if (isCrazyhouseDrop(move) && move.drop === role) seen.add(move.to);
  }
  return [...seen];
}

function canActNow(view: CrazyhousePlayerView): boolean {
  return replay.isLive() && iAmPlayer() && isMyTurn(view);
}

function iAmPlayer(): boolean {
  return isColor(state.seat);
}

function isMyTurn(view: CrazyhousePlayerView): boolean {
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

  if (!darkCrazyhouseEnabled()) {
    refs.board.className = 'board crazyhouse-live-board crazyhouse-live-board--disabled';
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

function renderBoard(view: CrazyhousePlayerView | null): void {
  if (!refs) return;
  refs.board.className = 'board crazyhouse-live-board';
  refs.board.setAttribute('aria-label', 'Dark Crazyhouse board');
  if (!view) {
    refs.board.replaceChildren();
    return;
  }
  const perspective = orientationFor(view);
  const interactive = replay.isLive() && iAmPlayer() && isMyTurn(view) && !state.pendingPromotion;
  const selected = interactive ? state.selected : null;
  const targets = interactive ? activeTargets(view) : [];
  refs.board.innerHTML = renderCrazyhouseBoardSvg(view, {
    perspective,
    showFog: true,
    selected,
    targets,
    interactive,
  });
}

function activeTargets(view: CrazyhousePlayerView): Square[] {
  if (state.selectedDrop) return dropTargets(view, state.selectedDrop);
  if (state.selected) return moveTargets(view, state.selected);
  return [];
}

function renderHands(view: CrazyhousePlayerView | null): void {
  if (!refs) return;
  const seat = state.seat;
  refs.capturesTop.replaceChildren(opponentReserveStrip());
  if (!view || !isColor(seat)) {
    refs.capturesBottom.replaceChildren();
    return;
  }
  refs.capturesBottom.replaceChildren(ownReserveStrip(view, seat, canActNow(view)));
}

function ownReserveStrip(view: CrazyhousePlayerView, seat: Color, droppable: boolean): HTMLElement {
  const strip = document.createElement('div');
  strip.className = 'crazyhouse-hands crazyhouse-hands--own';
  const entries = CRAZYHOUSE_HAND_ORDER.filter((role) => (view.hand[role] ?? 0) > 0);
  if (entries.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'crazyhouse-hands__empty';
    empty.textContent = 'No pieces in hand';
    strip.append(empty);
    return strip;
  }
  for (const role of entries) {
    strip.append(handPiece(role, seat, view.hand[role] ?? 0, droppable));
  }
  return strip;
}

function opponentReserveStrip(): HTMLElement {
  const strip = document.createElement('div');
  strip.className = 'crazyhouse-hands crazyhouse-hands--opponent';
  const note = document.createElement('span');
  note.className = 'crazyhouse-hands__empty';
  note.textContent = 'Opponent reserve: hidden';
  strip.append(note);
  return strip;
}

function handPiece(
  role: CrazyhouseDropRole,
  color: Color,
  count: number,
  droppable: boolean,
): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  const selected = state.selectedDrop === role;
  button.className = [
    'crazyhouse-hand-piece',
    droppable ? 'crazyhouse-hand-piece--droppable' : '',
    selected ? 'crazyhouse-hand-piece--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
  button.dataset.drop = role;
  button.disabled = !droppable;
  button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  button.innerHTML = crazyhouseHandPieceSvg(role, color);
  const badge = document.createElement('span');
  badge.className = 'crazyhouse-hand-piece__count';
  badge.textContent = String(count);
  button.append(badge);
  return button;
}

function renderPromotion(view: CrazyhousePlayerView | null): void {
  if (!refs) return;
  const pending = state.pendingPromotion;
  if (!pending || !view || !isColor(state.seat)) {
    refs.promotion.hidden = true;
    refs.promotion.replaceChildren();
    return;
  }
  const color = state.seat;
  refs.promotion.hidden = false;
  refs.promotion.className = 'promotion-picker crazyhouse-promotion';
  const choices = pending.roles
    .map(
      (role) =>
        `<button type="button" class="crazyhouse-promotion__choice" data-promote="${role}">${crazyhouseHandPieceSvg(
          role,
          color,
        )}</button>`,
    )
    .join('');
  refs.promotion.innerHTML = `<div class="crazyhouse-promotion__panel"><div class="crazyhouse-promotion__title">Promote to</div><div class="crazyhouse-promotion__choices">${choices}</div></div>`;
}

function renderVisibleMoveList(liveRefs: LiveRefs): void {
  const moves = state.events.filter((event): event is DarkCrazyhouseMovePlayed =>
    isMoveEvent(event),
  );
  const plyCount = replay.visiblePlyCount();
  liveRefs.moveList.replaceChildren();
  if (state.bounce) {
    const banner = document.createElement('li');
    banner.className = 'crazyhouse-bounce-banner';
    banner.textContent = `Drop bounced: ${state.bounce} is occupied. Try another square.`;
    liveRefs.moveList.append(banner);
  }
  if (plyCount === 0) {
    const item = document.createElement('li');
    item.className = 'dczh-move-row';
    const empty = document.createElement('span');
    empty.className = 'dczh-move-row__move masked';
    empty.textContent = 'No visible moves yet';
    item.append(empty);
    liveRefs.moveList.append(item);
    return;
  }
  const activePly = replay.activePly();
  for (const row of visibleMoveRows(moves, plyCount)) {
    const item = document.createElement('li');
    item.className = 'dczh-move-row';
    const number = document.createElement('span');
    number.className = 'dczh-move-row__number';
    number.textContent = `${row.fullMove}.`;
    item.append(
      number,
      moveCell(row.white, row.fullMove * 2 - 1, activePly, plyCount),
      moveCell(row.black, row.fullMove * 2, activePly, plyCount),
    );
    liveRefs.moveList.append(item);
  }
}

function moveCell(
  text: string | undefined,
  ply: number,
  activePly: number | null,
  plyCount: number,
): HTMLElement {
  const span = document.createElement('span');
  const masked = !text && ply <= plyCount;
  span.className = [
    'dczh-move-row__move',
    masked ? 'masked' : '',
    activePly === ply ? 'active' : '',
  ]
    .filter(Boolean)
    .join(' ');
  span.textContent = ply > plyCount ? '' : (text ?? '...');
  return span;
}

function visibleMoveRows(
  moves: readonly DarkCrazyhouseMovePlayed[],
  plyCount: number,
): DarkCrazyhouseVisibleMoveRow[] {
  const rows = new Map<number, DarkCrazyhouseVisibleMoveRow>();
  for (let fullMove = 1; fullMove <= Math.ceil(plyCount / 2); fullMove += 1) {
    rows.set(fullMove, { fullMove });
  }
  moves.forEach((event, index) => {
    const ply = eventPly(event, index);
    if (ply > plyCount) return;
    const fullMove = Math.floor((ply - 1) / 2) + 1;
    const row = rows.get(fullMove) ?? { fullMove };
    row[event.color] = notateCrazyhouseMove(event.move);
    rows.set(fullMove, row);
  });
  return [...rows.values()].sort((a, b) => a.fullMove - b.fullMove);
}

function notateCrazyhouseMove(move: CrazyhouseMove): string {
  if (isCrazyhouseDrop(move)) return `${DROP_LETTER[move.drop]}@${move.to}`;
  return `${move.from}${move.to}${move.promotion ? `=${DROP_LETTER[move.promotion]}` : ''}`;
}

function eventPly(event: DarkCrazyhouseMovePlayed, fallbackIndex: number): number {
  return Number.isInteger(event.ply) && event.ply && event.ply > 0 ? event.ply : fallbackIndex + 1;
}

// ── Fog-safe replay capture ──────────────────────────────────────────────────

function captureReplayView(view: CrazyhousePlayerView | null): void {
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

function replayPlyForView(view: CrazyhousePlayerView, positionChanged: boolean): number {
  if (view.status.type === 'playing') {
    // White moves first; moveNumber increments after Black completes a full move.
    const completedFullMoves = Math.max(0, view.moveNumber - 1);
    return completedFullMoves * 2 + (view.status.turn === 'black' ? 1 : 0);
  }
  if (positionChanged && view.lastMove) return replay.latestPly() + 1;
  return replay.latestPly();
}

function replayPositionKey(view: CrazyhousePlayerView): string {
  const board = Object.entries(view.board)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([square, piece]) => [square, piece?.color, piece?.role]);
  const hand = CRAZYHOUSE_HAND_ORDER.map((role) => view.hand[role] ?? 0);
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

function isMoveEvent(event: DarkCrazyhouseLiveEvent): event is DarkCrazyhouseMovePlayed {
  const move = (event as { move?: unknown }).move;
  if (event.type !== 'move-played') return false;
  if (!isColor((event as { color?: unknown }).color)) return false;
  if (typeof move !== 'object' || move === null) return false;
  const candidate = move as { from?: unknown; to?: unknown; drop?: unknown };
  if (typeof candidate.to !== 'string') return false;
  return typeof candidate.from === 'string' || typeof candidate.drop === 'string';
}

function orientationFor(view: CrazyhousePlayerView | null): Color {
  if (isColor(state.seat)) return state.seat;
  return view?.perspective ?? 'white';
}

function isColor(value: unknown): value is Color {
  return value === 'white' || value === 'black';
}

export type { CrazyhouseHand };
