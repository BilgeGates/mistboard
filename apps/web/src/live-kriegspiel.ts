// Live multiplayer room client for hidden/dev-only Kriegspiel (standard chess
// played blind). A hidden-info tenant on the same stack as Dark Crazyhouse /
// Dark Shogi:
//   * the generic socket client + shared room chrome,
//   * the fog-safe replay CAPTURE controller (replays only the per-seat
//     snapshots received; never reconstructs hidden state),
//   * the bare wire shape (no rematch/roomMode extras).
//
// Kriegspiel is stricter than fog, so the surface is different from the other
// tenants: the board shows ONLY the viewer's own pieces (everything else is
// shrouded), and the opponent's move never arrives — only the UMPIRE
// ANNOUNCEMENT does. This client renders that umpire voice in three places:
//   * the top strip — the umpire's latest call (a prominent CHECK banner when
//     the opponent's move put the viewer in check, else a capture / "moved"
//     line);
//   * the bottom strip — the viewer's turn state and PAWN-TRY count, plus the
//     TRY-LOOP bounce ("illegal, try again") when a pseudo-legal probe is
//     refused by the umpire;
//   * the move list — a two-column umpire log: the viewer's own plies in full,
//     the opponent's plies as the announcement alone.

import {
  type Color,
  type KriegspielCheckType,
  type KriegspielPlayerView,
  kriegspielCheckCandidateSquares,
  type Move,
  type PieceRole,
  type Square,
} from '@mistboard/game';
import './live-kriegspiel.css';
import { kriegspielEnabled } from './feature-flags.js';
import {
  KRIEGSPIEL_PIECE_PX,
  kriegspielPieceGhostSvg,
  kriegspielPromotionPieceSvg,
  renderKriegspielBoardSvg,
} from './kriegspiel-render.js';
import { createLiveLayout, setLiveLayoutGameSpec } from './live-layout.js';
import { initLiveSound, playSound, resetLiveSoundState } from './live-sound.js';
import { clearSeatTokenForRoom, type LiveRefs } from './live-state.js';
import { roomIdFromPath } from './room-url.js';
import { boardAppearanceChangedEvent, setBoardFamily } from './theme.js';
import { installBoardDrag } from './variant-tenant/board-drag.js';
import { createTenantReplayController } from './variant-tenant/replay-controller.js';
import { createTenantRoomChrome, type WebVariantTenant } from './variant-tenant/room-chrome.js';
import {
  createTenantSocketClient,
  type TenantConnectionState,
  type TenantSocketClient,
} from './variant-tenant/socket-client.js';

type KriegspielPromotionRole = Exclude<PieceRole, 'king' | 'pawn'>;

// The umpire's announcement, as it rides a move-played event.
type KriegspielAnnouncement = {
  capture?: { square: Square; kind: 'pawn' | 'piece' };
  check?: KriegspielCheckType[];
};

// A wire move. The viewer's own move carries from/to; the opponent's is redacted
// down to the announcement alone (from/to stripped server-side).
type KriegspielWireMove = {
  from?: Square;
  to?: Square;
  promotion?: KriegspielPromotionRole;
  announcement?: KriegspielAnnouncement;
};

const CHECK_LABELS: Record<KriegspielCheckType, string> = {
  file: 'file',
  rank: 'rank',
  'long-diagonal': 'long diagonal',
  'short-diagonal': 'short diagonal',
  knight: 'knight',
};

// ── Wire shapes (the subset this client consumes) ───────────────────────────

type KriegspielLiveClock = {
  activeColor: Color | null;
  incrementMs: number;
  initialMs: number;
  remainingMs: Record<Color, number>;
  runningSince: number | null;
};

type KriegspielMovePlayed = {
  type: 'move-played';
  color: Color;
  move: KriegspielWireMove;
  at: number;
  ply?: number;
};
type KriegspielLiveEvent = KriegspielMovePlayed | { type: string; [key: string]: unknown };
type KriegspielMoveRow = { fullMove: number; white?: string; black?: string };

type KriegspielLiveFrame = {
  type: 'hello' | 'snapshot' | 'event-appended';
  clientId?: string;
  seatToken?: string;
  seat: Color | 'spectator';
  seats: Partial<Record<Color, string>>;
  state: KriegspielPlayerView;
  clock?: KriegspielLiveClock | null;
  connectedSeats?: Record<Color, boolean>;
  abortDeadline?: number | null;
  timeControl?: { initialMs: number; incrementMs: number } | null;
  clients?: number;
  events?: KriegspielLiveEvent[];
  event?: KriegspielLiveEvent;
  seq?: number;
};

// ── Module state ─────────────────────────────────────────────────────────────

const state = {
  room: '',
  seat: null as Color | 'spectator' | null,
  view: null as KriegspielPlayerView | null,
  clock: null as KriegspielLiveClock | null,
  timeControl: null as { initialMs: number; incrementMs: number } | null,
  seats: {} as Partial<Record<Color, string>>,
  connectedSeats: { white: false, black: false } as Record<Color, boolean>,
  events: [] as KriegspielLiveEvent[],
  abortDeadline: null as number | null,
  selected: null as Square | null,
  pendingPromotion: null as { from: Square; to: Square; roles: KriegspielPromotionRole[] } | null,
  // The from/to of a try the umpire refused (illegal). Cleared on the next
  // action. This is the only feedback a refused try yields — no "why".
  bounce: null as { from?: Square; to?: Square } | null,
  // The square a piece is being dragged from (its piece is lifted off the board
  // so only the floating ghost shows). Null when not dragging.
  draggingFrom: null as Square | null,
};

let client: TenantSocketClient | null = null;
let refs: LiveRefs | null = null;
let lastCapturedView: KriegspielPlayerView | null = null;
let lastCapturedPositionKey: string | null = null;

const replay = createTenantReplayController<KriegspielPlayerView>();

function send(payload: unknown): boolean {
  return client?.send(payload) ?? false;
}

function connection(): TenantConnectionState {
  return client?.connection() ?? 'connecting';
}

// ── Shared tenant room chrome ────────────────────────────────────────────────

const kriegspielWebTenant: WebVariantTenant<Color> = {
  displayName: 'Kriegspiel',
  colors: ['white', 'black'],
  isColor,
  oppositeColor: (color) => (color === 'white' ? 'black' : 'white'),
  enabled: kriegspielEnabled,
  reviewUrl: (roomId) => `/kriegspiel/game/${encodeURIComponent(roomId)}`,
  reasonPhrase: kriegspielEndReasonLabel,
  disabledTitle: 'Kriegspiel disabled',
  disabledBody: 'This client build has the room renderer off.',
  rejectedBody: 'This Kriegspiel room is not active. Create a new invite to start a game.',
  spectatorBody: 'Watching without private information.',
  selectInstruction:
    'Select one of your pieces, then a destination. You see only your own army; the umpire calls captures and checks.',
};

const chrome = createTenantRoomChrome(kriegspielWebTenant, {
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
    gameSpecId: 'kriegspiel',
    preferredColor: 'random',
    ...(state.timeControl ? { timeControl: state.timeControl } : {}),
  }),
  rematchControls: () => null,
});

function kriegspielEndReasonLabel(reason: string): string {
  switch (reason) {
    case 'checkmate':
      return 'checkmate';
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

export function bootstrapKriegspielLiveRoom(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('missing #app');

  const params = new URLSearchParams(window.location.search);
  const room = roomIdFromPath(window.location.pathname) ?? params.get('room') ?? 'kr_dev';
  state.room = room;
  state.selected = null;
  state.pendingPromotion = null;
  state.bounce = null;
  state.draggingFrom = null;
  lastCapturedView = null;
  lastCapturedPositionKey = null;
  replay.reset();
  chrome.resetState();
  initLiveSound();
  resetLiveSoundState();

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
  setLiveLayoutGameSpec(app, 'kriegspiel');
  setBoardFamily('chess');
  chrome.setRenderTarget(refs, {
    sendSocket: send,
    reconnectNow: () => client?.connect(),
  });

  installBoardInteraction(refs);
  refs.promotion.addEventListener('click', onPromotionClick);

  client = createTenantSocketClient({
    room,
    applyHello: (frame) => applyFrame(frame as KriegspielLiveFrame),
    applySnapshot: (frame) => applyFrame(frame as KriegspielLiveFrame),
    applyEvent: (frame) => applyEventFrame(frame as KriegspielLiveFrame),
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

function applyFrame(frame: KriegspielLiveFrame): void {
  state.seat = frame.seat;
  state.view = frame.state;
  state.clock = frame.clock ?? null;
  state.timeControl = frame.timeControl ?? state.timeControl;
  state.seats = frame.seats ?? state.seats;
  if (frame.connectedSeats) state.connectedSeats = frame.connectedSeats;
  state.abortDeadline = frame.abortDeadline ?? null;
  if (frame.events) state.events = frame.events;
}

function applyEventFrame(frame: KriegspielLiveFrame): void {
  const events = state.events;
  applyFrame(frame);
  state.events = events;
  if (frame.event) {
    state.events = [...events, frame.event];
    if (isMoveEvent(frame.event)) playMoveSound(frame.event);
  }
}

// The drama beat for a single move. In Kriegspiel a capture is heard, not seen —
// the opponent's move that takes one of your pieces plays a distinct "captured"
// cue, the closest thing to feeling the blow land in the dark. Check has no
// dedicated cue; its red banner + threat squares carry that moment visually.
function playMoveSound(event: KriegspielMovePlayed): void {
  const captured = Boolean(event.move.announcement?.capture);
  if (isColor(state.seat) && event.color !== state.seat) {
    playSound(captured ? 'captured' : 'move');
  } else {
    playSound(captured ? 'capture' : 'move');
  }
}

function onServerMessage(message: { type: string; [key: string]: unknown }): void {
  // The try-loop bounce: the umpire refused an illegal try. Record the attempt
  // so the player can pick another; this is the only feedback they get.
  if (message.type === 'kriegspiel-illegal') {
    state.bounce = {
      from: typeof message.from === 'string' ? (message.from as Square) : undefined,
      to: typeof message.to === 'string' ? (message.to as Square) : undefined,
    };
    state.selected = null;
    state.pendingPromotion = null;
    renderAll();
  }
}

function handleReplayKeyboard(event: KeyboardEvent): void {
  replay.handleKeyboard(event, renderAll);
}

// ── Interaction ──────────────────────────────────────────────────────────────

// Click + drag, delegated to the persistent board container once at mount so they
// survive every innerHTML re-render. Click is the existing select-then-move; drag
// lifts a piece and drops it on a target (routing promotions through the same
// picker). A tap that never crosses the movement threshold falls through to the
// click handler.
function installBoardInteraction(liveRefs: LiveRefs): void {
  installBoardDrag({
    board: liveRefs.board,
    ghostSizePx: KRIEGSPIEL_PIECE_PX,
    onSquareClick: (square) => handleSquareClick(square as Square),
    canDragFrom: (square) => canDragPiece(square as Square),
    ghostHtml: (square) => {
      const piece = state.view?.board[square as Square];
      if (!piece) return null;
      return kriegspielPieceGhostSvg(piece.role, piece.color);
    },
    onDragStart: (from) => {
      state.selected = from as Square;
      state.draggingFrom = from as Square;
      state.bounce = null;
      renderAll();
    },
    onDrop: (from, to) => dropPiece(from as Square, to as Square | null),
  });
}

function handleSquareClick(square: Square): void {
  const view = state.view;
  if (!view) return;
  if (!canActNow(view)) return;
  if (state.pendingPromotion) return;
  state.bounce = null;

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
  const matches = movesFromTo(view, state.selected, square);
  if (matches.length > 0) {
    submitMove(state.selected, square, matches);
    return;
  }
  state.selected = moveTargets(view, square).length > 0 ? square : null;
  renderAll();
}

// Every piece on the viewer's board is the viewer's own (the opponent's army is
// never sent under Kriegspiel fog), so any of them can be lifted on your turn —
// it snaps back if dropped somewhere it cannot move. Verify the seat colour
// defensively regardless.
function canDragPiece(square: Square): boolean {
  const view = state.view;
  if (!view || !canActNow(view) || state.pendingPromotion) return false;
  const piece = view.board[square];
  return !!piece && piece.color === state.seat;
}

// A drag ended over `to` (null if dropped off-board or back on `from`). Run the
// exact click-to-move path for from→to, including the promotion picker — a drag
// that lands a promotion routes through the SAME picker (it never auto-sends a
// promotion). Snap-back keeps the piece selected only if it has a legal target.
function dropPiece(from: Square, to: Square | null): void {
  state.draggingFrom = null;
  const view = state.view;
  if (!view || !canActNow(view)) {
    state.selected = null;
    renderAll();
    return;
  }
  const matches = to ? movesFromTo(view, from, to) : [];
  if (to && matches.length > 0) {
    // submitMove handles promotion: it opens the picker instead of sending when
    // the move set carries promotions, so a dragged promotion lands in the picker.
    submitMove(from, to, matches);
    return;
  }
  // Dropped off a legal target: keep it selected only if it has moves (so a
  // follow-up click can complete one); otherwise snap back deselected.
  state.selected = moveTargets(view, from).length > 0 ? from : null;
  renderAll();
}

function submitMove(from: Square, to: Square, matches: Move[]): void {
  const promotions = matches
    .map((move) => move.promotion)
    .filter((role): role is KriegspielPromotionRole => Boolean(role));
  if (promotions.length > 0) {
    state.pendingPromotion = { from, to, roles: promotions };
    renderAll();
    return;
  }
  send({ type: 'move', from, to });
  clearSelection();
  renderAll();
}

function onPromotionClick(event: MouseEvent): void {
  const pending = state.pendingPromotion;
  if (!pending) return;
  const target = (event.target as HTMLElement | null)?.closest('[data-promote]');
  if (!target) return;
  const role = target.getAttribute('data-promote') as KriegspielPromotionRole | null;
  if (!role || !pending.roles.includes(role)) return;
  send({ type: 'move', from: pending.from, to: pending.to, promotion: role });
  clearSelection();
  renderAll();
}

function clearSelection(): void {
  state.selected = null;
  state.pendingPromotion = null;
  state.draggingFrom = null;
}

function movesFromTo(view: KriegspielPlayerView, from: Square, to: Square): Move[] {
  return view.legalMoves.filter((move) => move.from === from && move.to === to);
}

function moveTargets(view: KriegspielPlayerView, from: Square): Square[] {
  const seen = new Set<Square>();
  for (const move of view.legalMoves) if (move.from === from) seen.add(move.to);
  return [...seen];
}

function canActNow(view: KriegspielPlayerView): boolean {
  return replay.isLive() && iAmPlayer() && isMyTurn(view);
}

function iAmPlayer(): boolean {
  return isColor(state.seat);
}

function isMyTurn(view: KriegspielPlayerView): boolean {
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

  if (!kriegspielEnabled()) {
    refs.board.className = 'board kriegspiel-live-board kriegspiel-live-board--disabled';
    refs.board.replaceChildren();
    refs.capturesTop.replaceChildren();
    refs.capturesBottom.replaceChildren();
    clearSelection();
    return;
  }

  renderBoard(displayedView);
  renderUmpireZones(displayedView);
  renderPromotion(displayedView);
  renderUmpireLog(refs);
}

function renderBoard(view: KriegspielPlayerView | null): void {
  if (!refs) return;
  refs.board.className = 'board kriegspiel-live-board';
  refs.board.setAttribute('aria-label', 'Kriegspiel board');
  if (!view) {
    refs.board.replaceChildren();
    return;
  }
  const perspective = orientationFor(view);
  const interactive = replay.isLive() && iAmPlayer() && isMyTurn(view) && !state.pendingPromotion;
  const selected = interactive ? state.selected : null;
  const targets = interactive && state.selected ? moveTargets(view, state.selected) : [];
  // When the opponent's move checked us, draw the squares the checker could be
  // on (the umpire's call, in board-space). Live position only.
  const threats = replay.isLive() ? checkThreats(view) : [];
  refs.board.innerHTML = renderKriegspielBoardSvg(view, {
    perspective,
    showFog: true,
    selected,
    targets,
    threats,
    interactive,
    draggingFrom: state.draggingFrom,
  });
  // Click + drag are delegated to the persistent board container once at mount
  // (installBoardInteraction), so they survive these innerHTML re-renders.
}

// The squares a checking piece could occupy, derived purely from the umpire's
// latest call against us + our own (visible) pieces. Empty unless the opponent's
// most recent move announced a check.
function checkThreats(view: KriegspielPlayerView): Square[] {
  const seat = state.seat;
  if (!isColor(seat)) return [];
  const latest = latestMoveEvent();
  if (!latest || latest.color === seat) return [];
  const categories = latest.move.announcement?.check;
  if (!categories || categories.length === 0) return [];
  const king = kingSquareFor(view, seat);
  if (!king) return [];
  return kriegspielCheckCandidateSquares(king, categories, Object.keys(view.board) as Square[]);
}

function kingSquareFor(view: KriegspielPlayerView, color: Color): Square | null {
  for (const [square, piece] of Object.entries(view.board)) {
    if (piece && piece.color === color && piece.role === 'king') return square as Square;
  }
  return null;
}

// The two umpire zones: the top strip is the umpire's latest call (the check
// banner lives here); the bottom strip is the viewer's turn state, pawn-try
// count, and the try-loop bounce.
function renderUmpireZones(view: KriegspielPlayerView | null): void {
  if (!refs) return;
  refs.capturesTop.replaceChildren(umpireCallZone(view));
  refs.capturesBottom.replaceChildren(turnStateZone(view));
}

function umpireCallZone(view: KriegspielPlayerView | null): HTMLElement {
  const zone = document.createElement('div');
  zone.className = 'kriegspiel-umpire';
  const latest = latestMoveEvent();
  if (!view || !latest) {
    zone.append(umpireLine('The umpire calls captures and checks aloud.', 'muted'));
    return zone;
  }
  const announcement = latest.move.announcement;
  const fromOpponent = latest.color !== state.seat;
  const cats = announcement?.check?.length
    ? announcement.check.map((c) => CHECK_LABELS[c]).join(' and ')
    : '';
  const mated = view.status.type === 'finished' && view.status.reason === 'checkmate';

  // Checkmate ends the game — announce the mate, not a bare check.
  if (mated) {
    const banner = document.createElement('div');
    banner.className = 'kriegspiel-umpire__check kriegspiel-umpire__check--mate';
    banner.textContent = fromOpponent
      ? `Checkmate${cats ? ` — by ${cats}` : ''}.`
      : 'Checkmate. You win.';
    zone.append(banner);
    if (announcement?.capture)
      zone.append(umpireLine(captureLine(announcement.capture, fromOpponent)));
    return zone;
  }

  // A check against the viewer (the opponent's move checked me) is the loudest
  // signal — surface it as a banner.
  if (fromOpponent && cats) {
    const banner = document.createElement('div');
    banner.className = 'kriegspiel-umpire__check';
    banner.textContent = `Check — by ${cats}`;
    zone.append(banner);
    if (announcement?.capture)
      zone.append(umpireLine(captureLine(announcement.capture, fromOpponent)));
    return zone;
  }
  zone.append(umpireLine(umpireCallText(latest, fromOpponent), 'call'));
  return zone;
}

function umpireCallText(event: KriegspielMovePlayed, fromOpponent: boolean): string {
  const announcement = event.move.announcement;
  const subject = fromOpponent ? 'Opponent' : 'You';
  const captured = announcement?.capture;
  const check = announcement?.check?.length
    ? ` ${fromOpponent ? '' : 'and gave '}check (${announcement.check.map((c) => CHECK_LABELS[c]).join(', ')})`
    : '';
  if (captured) {
    const verb = fromOpponent ? 'captured' : 'captured';
    return `${subject} ${verb} a ${captured.kind} on ${captured.square}${check}.`;
  }
  if (announcement?.check?.length) {
    return fromOpponent
      ? `Check (${announcement.check.map((c) => CHECK_LABELS[c]).join(', ')}).`
      : `You gave check (${announcement.check.map((c) => CHECK_LABELS[c]).join(', ')}).`;
  }
  return fromOpponent ? 'Opponent moved.' : 'You moved.';
}

function captureLine(
  capture: { square: Square; kind: 'pawn' | 'piece' },
  fromOpponent: boolean,
): string {
  return `${fromOpponent ? 'Opponent' : 'You'} captured a ${capture.kind} on ${capture.square}.`;
}

function umpireLine(text: string, variant: 'muted' | 'call' = 'call'): HTMLElement {
  const line = document.createElement('div');
  line.className = `kriegspiel-umpire__line kriegspiel-umpire__line--${variant}`;
  line.textContent = text;
  return line;
}

function turnStateZone(view: KriegspielPlayerView | null): HTMLElement {
  const zone = document.createElement('div');
  zone.className = 'kriegspiel-turn';
  if (!view) return zone;
  if (state.bounce) {
    const bounce = document.createElement('div');
    bounce.className = 'kriegspiel-turn__bounce';
    const attempt =
      state.bounce.from && state.bounce.to ? ` (${state.bounce.from}–${state.bounce.to})` : '';
    bounce.textContent = `Illegal${attempt} — the umpire says no. Try another move.`;
    zone.append(bounce);
  }
  if (!iAmPlayer()) {
    zone.append(turnLine('Watching without private information.', 'muted'));
    return zone;
  }
  if (view.status.type !== 'playing') return zone;
  if (isMyTurn(view)) {
    zone.append(turnLine('Your move.', 'active'));
    const tries = view.pawnTries ?? 0;
    const pawn = document.createElement('div');
    pawn.className = `kriegspiel-turn__tries${tries > 0 ? ' kriegspiel-turn__tries--has' : ''}`;
    pawn.textContent =
      tries === 0 ? 'No pawn tries.' : `${tries} pawn ${tries === 1 ? 'try' : 'tries'}.`;
    zone.append(pawn);
  } else {
    zone.append(turnLine('Waiting for opponent…', 'muted'));
  }
  return zone;
}

function turnLine(text: string, variant: 'active' | 'muted'): HTMLElement {
  const line = document.createElement('div');
  line.className = `kriegspiel-turn__line kriegspiel-turn__line--${variant}`;
  line.textContent = text;
  return line;
}

function renderPromotion(view: KriegspielPlayerView | null): void {
  if (!refs) return;
  const pending = state.pendingPromotion;
  if (!pending || !view || !isColor(state.seat)) {
    refs.promotion.hidden = true;
    refs.promotion.replaceChildren();
    return;
  }
  const color = state.seat;
  refs.promotion.hidden = false;
  refs.promotion.className = 'promotion-picker kriegspiel-promotion';
  const choices = pending.roles
    .map(
      (role) =>
        `<button type="button" class="kriegspiel-promotion__choice" data-promote="${role}">${kriegspielPromotionPieceSvg(role, color)}</button>`,
    )
    .join('');
  refs.promotion.innerHTML = `<div class="kriegspiel-promotion__panel"><div class="kriegspiel-promotion__title">Promote to</div><div class="kriegspiel-promotion__choices">${choices}</div></div>`;
}

// ── Umpire log (the move list) ────────────────────────────────────────────────

function renderUmpireLog(liveRefs: LiveRefs): void {
  const moves = state.events.filter((event): event is KriegspielMovePlayed => isMoveEvent(event));
  const plyCount = replay.visiblePlyCount();
  liveRefs.moveList.replaceChildren();
  if (plyCount === 0) {
    const item = document.createElement('li');
    item.className = 'ksg-move-row';
    const empty = document.createElement('span');
    empty.className = 'ksg-move-row__move masked';
    empty.textContent = 'No moves yet';
    item.append(empty);
    liveRefs.moveList.append(item);
    return;
  }
  const activePly = replay.activePly();
  for (const row of moveRows(moves, plyCount)) {
    const item = document.createElement('li');
    item.className = 'ksg-move-row';
    const number = document.createElement('span');
    number.className = 'ksg-move-row__number';
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
  const pending = !text && ply <= plyCount;
  span.className = [
    'ksg-move-row__move',
    pending ? 'masked' : '',
    activePly === ply ? 'active' : '',
  ]
    .filter(Boolean)
    .join(' ');
  span.textContent = ply > plyCount ? '' : (text ?? '·');
  return span;
}

function moveRows(moves: readonly KriegspielMovePlayed[], plyCount: number): KriegspielMoveRow[] {
  const rows = new Map<number, KriegspielMoveRow>();
  for (let fullMove = 1; fullMove <= Math.ceil(plyCount / 2); fullMove += 1) {
    rows.set(fullMove, { fullMove });
  }
  moves.forEach((event, index) => {
    const ply = eventPly(event, index);
    if (ply > plyCount) return;
    const fullMove = Math.floor((ply - 1) / 2) + 1;
    const row = rows.get(fullMove) ?? { fullMove };
    row[event.color] = notateUmpireMove(event, event.color === state.seat);
    rows.set(fullMove, row);
  });
  return [...rows.values()].sort((a, b) => a.fullMove - b.fullMove);
}

// The viewer's own ply is shown in full (they know their move); the opponent's
// is the umpire call alone — a capture mark, a check mark, or a quiet dot.
function notateUmpireMove(event: KriegspielMovePlayed, own: boolean): string {
  const announcement = event.move.announcement;
  const marks = `${announcement?.capture ? '×' : ''}${announcement?.check?.length ? '+' : ''}`;
  if (own && event.move.from && event.move.to) {
    const promo = event.move.promotion ? `=${event.move.promotion[0]?.toUpperCase()}` : '';
    return `${event.move.from}${event.move.to}${promo}${marks}`;
  }
  if (announcement?.capture)
    return `× ${announcement.capture.square}${announcement.check?.length ? ' +' : ''}`;
  if (announcement?.check?.length) return '+ check';
  return '·';
}

function eventPly(event: KriegspielMovePlayed, fallbackIndex: number): number {
  return Number.isInteger(event.ply) && event.ply && event.ply > 0 ? event.ply : fallbackIndex + 1;
}

function latestMoveEvent(): KriegspielMovePlayed | null {
  for (let index = state.events.length - 1; index >= 0; index -= 1) {
    const event = state.events[index]!;
    if (isMoveEvent(event)) return event;
  }
  return null;
}

// ── Fog-safe replay capture ──────────────────────────────────────────────────

function captureReplayView(view: KriegspielPlayerView | null): void {
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

function replayPlyForView(view: KriegspielPlayerView, positionChanged: boolean): number {
  if (view.status.type === 'playing') {
    const completedFullMoves = Math.max(0, view.moveNumber - 1);
    return completedFullMoves * 2 + (view.status.turn === 'black' ? 1 : 0);
  }
  if (positionChanged && view.lastMove) return replay.latestPly() + 1;
  return replay.latestPly();
}

function replayPositionKey(view: KriegspielPlayerView): string {
  const board = Object.entries(view.board)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([square, piece]) => [square, piece?.color, piece?.role]);
  return JSON.stringify({
    board,
    lastMove: view.lastMove ?? null,
    moveNumber: view.moveNumber,
    perspective: view.perspective,
    visibleSquares: [...view.visibleSquares].sort(),
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isMoveEvent(event: KriegspielLiveEvent): event is KriegspielMovePlayed {
  if (event.type !== 'move-played') return false;
  if (!isColor((event as { color?: unknown }).color)) return false;
  const move = (event as { move?: unknown }).move;
  return typeof move === 'object' && move !== null;
}

function orientationFor(view: KriegspielPlayerView | null): Color {
  if (isColor(state.seat)) return state.seat;
  return view?.perspective ?? 'white';
}

function isColor(value: unknown): value is Color {
  return value === 'white' || value === 'black';
}
