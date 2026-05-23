import {
  algebraicMoveLabels as buildAlgebraicMoveLabels,
  clockRemainingMs,
  coordinateMoveLabel,
  promotionLetter,
  replayGameEvents,
  variantForId,
  type Color,
  type GameEvent,
  type GameProjection,
  type Move,
  type PieceRole,
  type PlayerView,
  type Square,
} from '@mistboard/game';
import { fogPatternDefs, renderBoardSvg, type PieceOnBoard } from '@mistboard/board-render';
import { boardFen, fogHiddenClass, hiddenSquareClasses } from '@mistboard/board-render/interactive';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type * as cg from 'chessground/types';
import { readEffectiveSoundVolume, soundSettingsChangedEvent } from './theme.js';
import { escapeHtml, isColor, formatClock, oppositeColor, files, ranks, allSquares } from './web-utils.js';
import {
  liveState,
  type DevViews,
  type DraftOffers,
  type InfoTone,
  type LiveRefs,
  type MoveListEntry,
  type MovePlayedEvent,
  type PendingPromotion,
  type PlayAgainStatus,
  type PromotionRole,
  type Seat,
} from './live-state.js';
import {
  initLiveSound,
  maybePlaySnapshotSound,
  ownPieceCount,
  playSound,
  resetLiveSoundState,
  soundForMove,
  soundForOwnMove,
} from './live-sound.js';
import { primaryNavItems, utilityNavItems } from './nav-items.js';
import { classifyTimeControl, track } from './analytics.js';
import { computeCaptures, sortCaptureRoles, type CaptureTally } from './captures.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const promotionRoles: PromotionRole[] = ['queen', 'rook', 'bishop', 'knight'];

// ── Module-scope render-only state ────────────────────────────────────────────

let refs!: LiveRefs;
let sendSocket: (payload: unknown) => boolean = () => false;
let reconnectNow: () => void = () => {};
let ground: Api | null = null;
let pendingPromotion: PendingPromotion | null = null;
let orientation: Color = 'white';

// Fog squares for the Draft960 pick overlay — opponent's half is always hidden.
const PICKER_FOG_WHITE: Square[] = [
  'a5','b5','c5','d5','e5','f5','g5','h5',
  'a6','b6','c6','d6','e6','f6','g6','h6',
  'a7','b7','c7','d7','e7','f7','g7','h7',
  'a8','b8','c8','d8','e8','f8','g8','h8',
];
const PICKER_FOG_BLACK: Square[] = [
  'a1','b1','c1','d1','e1','f1','g1','h1',
  'a2','b2','c2','d2','e2','f2','g2','h2',
  'a3','b3','c3','d3','e3','f3','g3','h3',
  'a4','b4','c4','d4','e4','f4','g4','h4',
];
const FEN_CHAR_TO_ROLE: Partial<Record<string, PieceRole>> = {
  r: 'rook', n: 'knight', b: 'bishop', q: 'queen', k: 'king',
};

function fenToPickerPieces(fenPlacement: string, color: Color): PieceOnBoard[] {
  const pieces: PieceOnBoard[] = [];
  const backRank = color === 'white' ? 0 : 7;
  const pawnRank = color === 'white' ? 1 : 6;
  for (let i = 0; i < 8; i++) {
    const role = FEN_CHAR_TO_ROLE[fenPlacement[i] ?? ''];
    if (role) pieces.push({ file: i, rank: backRank, color, role });
    pieces.push({ file: i, rank: pawnRank, color, role: 'pawn' });
  }
  return pieces;
}
let playAgainStatus: PlayAgainStatus = 'idle';
let replayIndex: number | null = null;
let lastTrackedStatusType: 'pregame' | 'playing' | 'finished' | null = null;
let playingSinceMs: number | null = null;
// Fog-view history: server-provided PlayerView snapshots keyed by capture sequence number.
// Opponent moves are absent from liveState.events (fog-filtered), so eventsLen is not a
// reliable key — it only increments on own moves. Instead we capture on every server state
// change (liveState.state reference change) and key by a monotonic counter so both own and
// opponent moves produce distinct navigable positions.
let fogViewHistory: Map<number, PlayerView> = new Map();
let fogSnapshotToEventsLen: Map<number, number> = new Map();
let fogSnapshotSeq = 0;
let lastCapturedFogState: PlayerView | null = null;
let fogFirstMoveSnapshotIndex: number | null = null;

// ── Init ──────────────────────────────────────────────────────────────────────

export function initRender(
  target: HTMLDivElement,
  callbacks: { sendSocket: (payload: unknown) => boolean; reconnectNow: () => void },
): void {
  sendSocket = callbacks.sendSocket;
  reconnectNow = callbacks.reconnectNow;
  fogViewHistory = new Map();
  fogSnapshotToEventsLen = new Map();
  fogSnapshotSeq = 0;
  lastCapturedFogState = null;
  fogFirstMoveSnapshotIndex = null;
  lastTrackedStatusType = null;
  playingSinceMs = null;
  refs = createLayout(target);
  initLiveSound();
  resetLiveSoundState();
}

// ── Layout ────────────────────────────────────────────────────────────────────

export function createLayout(target: HTMLDivElement): LiveRefs {
  target.innerHTML = `
    ${buildNavHtml()}
    <main class="shell${liveState.debugRequested ? ' debug-shell' : ''}">
      ${liveState.debugRequested ? `
      <section class="topbar">
        <div>
          <h1>Fog Debug</h1>
          <p data-room-meta>Connecting</p>
        </div>
      </section>` : '<p data-room-meta hidden></p>'}

      <section class="play-grid">
        <section class="board-panel">
          <aside class="side-panel meta-panel" aria-label="Game controls">
            <section class="panel-section">
              <div data-action-status class="action-status"></div>
              <div data-clocks class="clocks"></div>
            </section>
            <section class="panel-section">
              <h2>About</h2>
              <div data-game-info class="game-info"></div>
            </section>
            <section class="panel-section">
              <div data-room-actions class="room-actions"></div>
            </section>
            <section data-game-controls-section class="panel-section" hidden>
              <div data-game-controls class="game-controls"></div>
            </section>
            <section data-offer-section class="panel-section">
              <h2>Draft960 Offer</h2>
              <div data-starts class="starts"></div>
            </section>
            <section data-selection-section class="panel-section">
              <h2>Selections</h2>
              <div data-selections class="selection-list"></div>
            </section>
          </aside>
          <div class="board-shell">
            <div data-board-status class="board-status">
              <div class="board-status__inner">
                <span data-board-status-spinner class="board-status__spinner" aria-hidden="true"></span>
                <p data-board-status-label class="board-status__label">Connecting</p>
              </div>
            </div>
            <div data-board class="board" aria-label="chess board"></div>
            <div data-captures class="captures-strip" aria-label="Pieces captured"></div>
            <div data-board-paused class="board-paused" hidden role="status" aria-live="polite">
              <div class="board-paused__badge">
                <strong>Game paused</strong>
                <span>Server is restarting — your game will resume shortly</span>
              </div>
            </div>
            <div data-draft-picker class="draft-picker" hidden></div>
            <div data-promotion class="promotion-picker" hidden></div>
          </div>
          <aside class="side-panel moves-panel" aria-label="Replay and move list">
            <section class="panel-section">
              <h2>Replay</h2>
              <div class="replay-controls">
                <button type="button" data-replay="first" title="First position">|&lt;</button>
                <button type="button" data-replay="prev" title="Previous event">&lt;</button>
                <button type="button" data-replay="next" title="Next event">&gt;</button>
                <button type="button" data-replay="latest" title="Latest position">&gt;|</button>
              </div>
              <p data-replay-meta class="replay-meta">Live</p>
              <ol data-move-list class="move-list"></ol>
            </section>
          </aside>
        </section>
        <section data-dev-views-section class="debug-page" hidden>
          <div class="debug-header">
            <h2>Debug Views</h2>
          </div>
          <div data-dev-views class="debug-views"></div>
        </section>
      </section>
    </main>
  `;

  const roomMeta = target.querySelector<HTMLParagraphElement>('[data-room-meta]');
  const gameInfo = target.querySelector<HTMLDivElement>('[data-game-info]');
  const board = target.querySelector<HTMLDivElement>('[data-board]');
  const boardPaused = target.querySelector<HTMLDivElement>('[data-board-paused]');
  const boardStatus = target.querySelector<HTMLDivElement>('[data-board-status]');
  const actionStatus = target.querySelector<HTMLDivElement>('[data-action-status]');
  const clocks = target.querySelector<HTMLDivElement>('[data-clocks]');
  const captures = target.querySelector<HTMLDivElement>('[data-captures]');
  const roomActions = target.querySelector<HTMLDivElement>('[data-room-actions]');
  const devViewsSection = target.querySelector<HTMLElement>('[data-dev-views-section]');
  const devViewsPanel = target.querySelector<HTMLDivElement>('[data-dev-views]');
  const offerSection = target.querySelector<HTMLElement>('[data-offer-section]');
  const draftPicker = target.querySelector<HTMLDivElement>('[data-draft-picker]');
  const promotion = target.querySelector<HTMLDivElement>('[data-promotion]');
  const selectionSection = target.querySelector<HTMLElement>('[data-selection-section]');
  const starts = target.querySelector<HTMLDivElement>('[data-starts]');
  const selectionList = target.querySelector<HTMLDivElement>('[data-selections]');
  const replayMeta = target.querySelector<HTMLParagraphElement>('[data-replay-meta]');
  const replayControls = target.querySelectorAll<HTMLButtonElement>('[data-replay]');
  const moveList = target.querySelector<HTMLOListElement>('[data-move-list]');
  const gameControls = target.querySelector<HTMLDivElement>('[data-game-controls]');
  const gameControlsSection = target.querySelector<HTMLElement>('[data-game-controls-section]');

  if (!roomMeta || !gameInfo || !board || !boardPaused || !boardStatus || !actionStatus || !captures || !clocks || !roomActions || !devViewsSection || !devViewsPanel || !offerSection || !draftPicker || !promotion || !selectionSection || !starts || !selectionList || !replayMeta || !moveList || !gameControls || !gameControlsSection) {
    throw new Error('missing app region');
  }

  return {
    board,
    boardPaused,
    boardStatus,
    draftPicker,
    actionStatus,
    captures,
    clocks,
    devViews: devViewsPanel,
    devViewsSection,
    gameInfo,
    moveList,
    offerSection,
    promotion,
    replayControls,
    replayMeta,
    roomActions,
    selectionSection,
    roomMeta,
    selectionList,
    starts,
    gameControls,
    gameControlsSection,
  };
}

function buildNavHtml(): string {
  return `
    <nav class="site-nav" aria-label="Primary">
      <a class="site-nav-brand" href="/">
        <img class="site-nav-logo" src="/logo.svg" alt="" width="28" height="28">
        <span>MISTBOARD</span>
      </a>
      <div class="site-nav-links">
        ${primaryNavItems()
          .map((item) => `<a class="site-nav-link" href="${item.href}">${escapeHtml(item.label)}</a>`)
          .join('')}
      </div>
      <div class="site-nav-utilities">
        ${utilityNavItems()
          .map((item) => `<a class="site-nav-link" href="${item.href}">${escapeHtml(item.label)}</a>`)
          .join('')}
        <div class="site-nav-auth" data-account-slot>
          <a class="site-nav-link site-nav-link-signin" href="/account?tab=login">Sign in</a>
          <a class="site-nav-link-primary" href="/account?tab=register">Register</a>
        </div>
      </div>
    </nav>
  `;
}

// ── Main render ───────────────────────────────────────────────────────────────

export function render(): void {
  captureFogView();
  const view = currentView();
  const projection = currentProjection();
  trackGameLifecycle(view);
  // For seated players, lock orientation to their own seat regardless of what
  // the view's perspective field says — fog history views can carry a stale or
  // mismatched perspective if the server state was captured before the seat was
  // confirmed. Spectators fall back to the view's perspective.
  const nextOrientation = isColor(liveState.seat) ? liveState.seat : (view?.perspective ?? 'white');
  orientation = nextOrientation;
  const showDraft = shouldShowDraftControls(view, projection);
  const showPickerOverlay = !liveState.solo && isColor(liveState.seat)
    && view?.status.type === 'pregame'
    && draftOfferForColor(liveState.seat, projection).length > 0;

  if (liveState.debugRequested) refs.roomMeta.innerHTML = roomMetaHtml();
  renderBoardStatus(view);
  refs.offerSection.hidden = !showDraft || showPickerOverlay;
  refs.selectionSection.hidden = !showDraft;

  renderActionStatus(view);
  renderGameInfo(view);
  renderClocks(view);
  renderCaptures(view);
  renderRoomActions();
  renderGameControls(view);
  renderDevViews();
  renderOffer(projection);
  renderSelections(projection);
  renderDraftPicker();
  renderReplay();
  renderBoard(view);
  renderBoardResult(view);
  renderPromotion();
}

function trackGameLifecycle(view: PlayerView | null): void {
  if (!view || !isLive()) return;
  const statusType = view.status.type;
  if (statusType === lastTrackedStatusType) return;
  const baseProps = {
    gameId: view.id,
    variant: view.variant,
    rated: liveState.rated,
    roomMode: liveState.roomMode,
    initialMs: view.clock?.initialMs ?? null,
    incrementMs: view.clock?.incrementMs ?? null,
    time_class: view.clock != null ? classifyTimeControl(view.clock.initialMs, view.clock.incrementMs) : null,
  };
  if (statusType === 'playing' && lastTrackedStatusType !== 'playing') {
    playingSinceMs = Date.now();
    track('game_started', baseProps);
  }
  if (statusType === 'finished') {
    const finished = view.status as { type: 'finished'; winner: 'white' | 'black' | null; reason: string };
    track('game_finished', {
      ...baseProps,
      winner: finished.winner,
      reason: finished.reason,
      moveNumber: view.moveNumber,
      durationMs: playingSinceMs !== null ? Date.now() - playingSinceMs : null,
    });
    playingSinceMs = null;
  }
  lastTrackedStatusType = statusType;
}

// ── Offer / draft ─────────────────────────────────────────────────────────────

function renderOffer(projection: GameProjection | null): void {
  refs.starts.replaceChildren();
  const view = currentView();

  if (liveState.solo) {
    refs.starts.append(
      draftOfferGroup('White offer', 'white', draftOfferForColor('white', projection), projection),
      draftOfferGroup('Black offer', 'black', draftOfferForColor('black', projection), projection),
    );
    return;
  }

  if (liveState.seat === 'spectator') {
    refs.starts.append(infoNotice('pending', 'Draft choices are private while the game is live.'));
    return;
  }

  const color = pickColorForSeat();
  const visibleOffer = draftOfferForColor(color, projection);
  if (visibleOffer.length === 0) {
    refs.starts.append(infoNotice('pending', 'Waiting for the draft offer.'));
    return;
  }

  for (const start of visibleOffer) {
    const row = document.createElement('div');
    row.className = 'start-row';

    const button = document.createElement('button');
    const selected = selectedStartId(color, projection) === start.id;
    const resolved = resolvedStartIdForColor(color, projection) === start.id
      || sharedResolvedStartId(projection) === start.id;
    button.type = 'button';
    button.className = ['start-card', selected ? 'selected' : '', resolved ? 'resolved' : ''].filter(Boolean).join(' ');
    button.disabled = !isLive() || view?.status.type !== 'pregame';
    button.dataset.start = String(start.id);
    button.addEventListener('click', () => {
      sendSocket({ type: 'select-start', startId: start.id });
    });

    const id = document.createElement('strong');
    id.textContent = `#${start.id}`;
    const placement = document.createElement('span');
    placement.textContent = start.fenPlacement.toUpperCase();
    button.append(id, placement);
    row.append(button);

    refs.starts.append(row);
  }
}

function draftOfferGroup(
  label: string,
  color: Color,
  starts: ReturnType<typeof draftOfferForColor>,
  projection: GameProjection | null,
): HTMLDivElement {
  const group = document.createElement('div');
  group.className = 'start-group';

  const heading = document.createElement('h3');
  heading.textContent = label;
  group.append(heading);

  if (starts.length === 0) {
    group.append(infoNotice('pending', 'No offer visible.'));
    return group;
  }

  for (const start of starts) {
    const button = draftPickButton(color, start, projection);
    group.append(button);
  }

  return group;
}

function draftPickButton(
  color: Color,
  start: { id: number; fenPlacement: string },
  projection: GameProjection | null,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = [
    'start-card',
    selectedStartId(color, projection) === start.id ? 'selected' : '',
    resolvedStartIdForColor(color, projection) === start.id || sharedResolvedStartId(projection) === start.id ? 'resolved' : '',
  ].filter(Boolean).join(' ');
  button.disabled = !isLive() || currentView()?.status.type !== 'pregame';
  const id = document.createElement('strong');
  id.textContent = `#${start.id}`;
  const placement = document.createElement('span');
  placement.textContent = start.fenPlacement.toUpperCase();
  button.append(id, placement);
  button.addEventListener('click', () => {
    sendSocket({ type: 'select-start', color, startId: start.id });
  });
  return button;
}

function renderSelections(projection: GameProjection | null): void {
  const view = currentView();
  if (!liveState.solo && liveState.seat !== 'spectator' && view?.variant === 'fog-of-war' && hasVisibleDraftData(projection)) {
    const color = pickColorForSeat();
    refs.selectionList.replaceChildren(
      selectionItem('Your pick', selectedStartId(color, projection)),
      selectionItem('Your start', resolvedStartIdForColor(color, projection)),
    );
    return;
  }

  const resolvedWhite = resolvedStartIdForColor('white', projection);
  const resolvedBlack = resolvedStartIdForColor('black', projection);
  refs.selectionList.replaceChildren(
    selectionItem('White', selectedStartId('white', projection)),
    selectionItem('Black', selectedStartId('black', projection)),
    resolvedWhite !== undefined || resolvedBlack !== undefined
      ? selectionItem('Resolved White', resolvedWhite)
      : selectionItem('Resolved', sharedResolvedStartId(projection)),
    resolvedWhite !== undefined || resolvedBlack !== undefined
      ? selectionItem('Resolved Black', resolvedBlack)
      : document.createDocumentFragment(),
  );
}

// ── Action status / game info ─────────────────────────────────────────────────

function renderDraftPicker(): void {
  const view = currentView();
  const projection = currentProjection();
  if (liveState.solo || !isColor(liveState.seat) || view?.status.type !== 'pregame') {
    refs.draftPicker.hidden = true;
    return;
  }
  const color = liveState.seat;
  const offers = draftOfferForColor(color, projection);
  if (offers.length === 0) {
    refs.draftPicker.hidden = true;
    return;
  }
  refs.draftPicker.hidden = false;

  const mySelection = selectedStartId(color, projection);
  const fogSquares = color === 'white' ? PICKER_FOG_WHITE : PICKER_FOG_BLACK;

  if (mySelection !== undefined) {
    const selected = offers.find((o) => o.id === mySelection);
    if (!selected) { refs.draftPicker.hidden = true; return; }
    const pieces = fenToPickerPieces(selected.fenPlacement, color);
    const size = 200;
    const svgHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${fogPatternDefs(size)}${renderBoardSvg(pieces, fogSquares, 0, 0, size, color)}</svg>`;
    refs.draftPicker.replaceChildren();
    const waiting = document.createElement('div');
    waiting.className = 'draft-picker-waiting';
    waiting.innerHTML = `<div class="draft-picker-waiting-board">${svgHtml}</div>`;
    const label = document.createElement('p');
    label.className = 'draft-picker-waiting-label';
    label.textContent = 'Waiting for opponent…';
    waiting.append(label);
    refs.draftPicker.append(waiting);
    return;
  }

  refs.draftPicker.replaceChildren();
  const inner = document.createElement('div');
  inner.className = 'draft-picker-inner';
  const heading = document.createElement('p');
  heading.className = 'draft-picker-heading';
  heading.textContent = 'Choose your starting position';
  const boardsEl = document.createElement('div');
  boardsEl.className = 'draft-picker-boards';
  const size = 160;

  ['A', 'B', 'C'].slice(0, offers.length).forEach((letter, i) => {
    const offer = offers[i]!;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'draft-pick-board';
    const pieces = fenToPickerPieces(offer.fenPlacement, color);
    const svgHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${fogPatternDefs(size)}${renderBoardSvg(pieces, fogSquares, 0, 0, size, color)}</svg>`;
    btn.innerHTML = svgHtml;
    const lbl = document.createElement('span');
    lbl.className = 'draft-pick-label';
    lbl.textContent = letter;
    btn.append(lbl);
    btn.addEventListener('click', () => { sendSocket({ type: 'select-start', color, startId: offer.id }); });
    boardsEl.append(btn);
  });

  inner.append(heading, boardsEl);
  refs.draftPicker.append(inner);
}

function renderActionStatus(view: PlayerView | null): void {
  refs.actionStatus.replaceChildren();
  if (view?.status.type === 'finished' && isLive()) {
    refs.actionStatus.hidden = true;
    return;
  }
  if (
    view?.status.type === 'playing'
    && isLive()
    && isColor(liveState.seat)
    && liveState.connectionState === 'connected'
  ) {
    refs.actionStatus.hidden = true;
    return;
  }
  refs.actionStatus.hidden = false;
  const notice = document.createElement('div');
  const tone = actionTone(view);
  notice.className = `action-notice ${tone}`;

  const title = document.createElement('strong');
  title.textContent = actionTitle(view);
  const body = document.createElement('span');
  body.textContent = actionBody(view);
  notice.append(title, body);

  if (liveState.connectionState === 'disconnected' || liveState.connectionState === 'reconnecting') {
    const reconnect = document.createElement('button');
    reconnect.type = 'button';
    reconnect.textContent = 'Reconnect now';
    reconnect.addEventListener('click', reconnectNow);
    notice.append(reconnect);
  }

  refs.actionStatus.append(notice);
}

function renderGameInfo(view: PlayerView | null): void {
  const items: HTMLDivElement[] = [];
  items.push(infoItem('Format', formatLabel(view)));
  const timeLabel = timeControlLabel(view);
  if (timeLabel) items.push(infoItem('Time', timeLabel));
  items.push(infoItem('Mode', modeDetailLabel()));
  const connLabel = connectionDetailLabel();
  if (connLabel) items.push(infoItem('Connection', connLabel));
  refs.gameInfo.replaceChildren(...items);
}

function formatLabel(view: PlayerView | null): string {
  const variant = view?.variant ?? liveState.state?.variant ?? liveState.variantRequested;
  const base = variant === 'fog-of-war' ? 'Dark chess' : capitalize(variant ?? 'dark chess');
  const isDraft960 = liveState.variantRequested === 'fog-draft960'
    || Object.values(liveState.offers).some((arr) => arr && arr.length > 0)
    || Object.keys(liveState.resolvedStartIds).length > 0;
  return isDraft960 ? `${base} · Draft960` : base;
}

function timeControlLabel(view: PlayerView | null): string | null {
  let initialMs: number | null = null;
  let incrementMs: number | null = null;
  if (view?.clock) {
    initialMs = view.clock.initialMs;
    incrementMs = view.clock.incrementMs;
  } else {
    const roomCreated = liveState.events.find(
      (e): e is Extract<GameEvent, { type: 'room-created' }> => e.type === 'room-created',
    );
    if (roomCreated?.timeControl) {
      initialMs = roomCreated.timeControl.initialMs;
      incrementMs = roomCreated.timeControl.incrementMs;
    }
  }
  if (initialMs === null || incrementMs === null) return null;
  const minutes = Math.round(initialMs / 60_000);
  const incSec = Math.round(incrementMs / 1000);
  const compact = incSec > 0 ? `${minutes}+${incSec}` : `${minutes}+0`;
  const klass = classifyTimeControl(initialMs, incrementMs);
  return klass ? `${compact} · ${capitalize(klass)}` : compact;
}

function modeDetailLabel(): string {
  if (liveState.solo) return 'Solo dev';
  if (liveState.roomMode === 'pve') {
    const engine = liveState.pveEngineName ?? 'Engine';
    return `vs ${engine}`;
  }
  if (liveState.roomMode === 'eve') return 'Engine vs engine';
  if (liveState.roomMode === 'imported') return 'Imported game';
  if (liveState.roomMode === 'manual') return 'Manual setup';
  return liveState.rated ? 'Rated' : 'Casual';
}

function connectionDetailLabel(): string | null {
  switch (liveState.connectionState) {
    case 'connected':
      return liveState.latencyMs !== null ? `Connected · ${liveState.latencyMs}ms` : 'Connected';
    case 'connecting':
      return 'Connecting';
    case 'reconnecting':
      return `Reconnecting · attempt ${liveState.reconnectAttempt}`;
    case 'disconnected':
      return 'Disconnected';
    case 'displaced':
      return 'Session moved';
    case 'rejected':
      return 'Rejected';
    default:
      return null;
  }
}

// ── Room actions ──────────────────────────────────────────────────────────────

// ── Game controls (resign, etc.) ──────────────────────────────────────────────

function renderGameControls(view: PlayerView | null): void {
  const canResign = liveState.roomMode === 'pvp'
    && isColor(liveState.seat)
    && view?.status.type === 'playing'
    && !liveState.solo;
  refs.gameControlsSection.hidden = !canResign;
  if (!canResign) {
    refs.gameControls.replaceChildren();
    return;
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'danger';
  button.textContent = 'Resign';
  button.addEventListener('click', () => { requestResign(); });

  refs.gameControls.replaceChildren(button);
}

function requestResign(): void {
  const ok = window.confirm('Resign this game? Your opponent wins.');
  if (!ok) return;
  sendSocket({ type: 'resign' });
}

function copyLinkButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'primary';
  btn.textContent = 'Copy invite link';
  btn.addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      btn.textContent = 'Link copied!';
      setTimeout(() => { btn.textContent = 'Copy invite link'; }, 2000);
    }).catch(() => {});
  });
  return btn;
}

function renderRoomActions(): void {
  const view = currentView();
  const actions: HTMLElement[] = [roomAction('Back home', '/')];
  if (view?.status.type === 'finished') {
    if (liveState.roomMode === 'pvp' && isColor(liveState.seat)) {
      for (const el of rematchButtons()) actions.unshift(el);
    } else if (liveState.roomMode === 'pve') {
      actions.unshift(playAgainButton());
    }
    actions.unshift(roomAction('Review game', `/game/${encodeURIComponent(liveState.room)}`, 'primary'));
    refs.roomActions.replaceChildren(...actions);
    return;
  }
  if (liveState.roomMode === 'pvp' && view?.status.type === 'pregame' && isColor(liveState.seat)) {
    actions.unshift(copyLinkButton());
  }
  if (liveState.engineRequested) actions.push(roomAction('New Debug Room', 'fog-of-war', 'engine'));
  refs.roomActions.replaceChildren(...actions);
}

function rematchButtons(): HTMLElement[] {
  const mySeat = liveState.seat;
  if (mySeat !== 'white' && mySeat !== 'black') return [];
  const theirSeat: 'white' | 'black' = mySeat === 'white' ? 'black' : 'white';
  const offers = liveState.rematch.offers;
  const iOffered = offers[mySeat];
  const theyOffered = offers[theirSeat];

  if (iOffered && theyOffered) {
    // Both confirmed — redirect is imminent. Show a brief "Starting…" affordance.
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.disabled = true;
    btn.textContent = 'Starting rematch…';
    return [btn];
  }
  if (iOffered) {
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = '';
    cancel.textContent = 'Cancel rematch';
    cancel.addEventListener('click', () => { sendSocket({ type: 'rematch:cancel' }); });
    const waiting = document.createElement('span');
    waiting.className = 'room-actions-note';
    waiting.textContent = 'Waiting for opponent…';
    return [waiting, cancel];
  }
  if (theyOffered) {
    const accept = document.createElement('button');
    accept.type = 'button';
    accept.className = 'primary';
    accept.textContent = 'Accept rematch';
    accept.addEventListener('click', () => { sendSocket({ type: 'rematch:offer' }); });
    const decline = document.createElement('button');
    decline.type = 'button';
    decline.textContent = 'Decline';
    decline.addEventListener('click', () => { sendSocket({ type: 'rematch:decline' }); });
    return [decline, accept];
  }
  const offer = document.createElement('button');
  offer.type = 'button';
  offer.textContent = 'Rematch';
  offer.addEventListener('click', () => { sendSocket({ type: 'rematch:offer' }); });
  return [offer];
}

function roomAction(label: string, href: string, toneOrDev?: 'primary' | 'engine'): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = toneOrDev === 'engine' ? roomUrl('fog-of-war', 'engine') : href;
  if (toneOrDev === 'primary') link.className = 'primary';
  link.textContent = label;
  return link;
}

function playAgainButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = playAgainStatus === 'failed' ? 'danger' : '';
  button.disabled = playAgainStatus === 'creating';
  button.textContent = playAgainStatus === 'creating'
    ? 'Creating'
    : playAgainStatus === 'failed'
      ? 'Try play again'
      : 'Play again';
  button.addEventListener('click', () => {
    void createPlayAgainRoom();
  });
  return button;
}

async function createPlayAgainRoom(): Promise<void> {
  if (liveState.roomMode !== 'pvp' && liveState.roomMode !== 'pve') return;
  playAgainStatus = 'creating';
  renderRoomActions();
  try {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: liveState.roomMode,
        variant: currentView()?.variant ?? liveState.state?.variant ?? liveState.variantRequested ?? 'fog-of-war',
        hiddenDraft960: shouldRequestHiddenDraft960ForPlayAgain(),
        ...(liveState.roomMode === 'pve' && liveState.pveEngineId ? { engineId: liveState.pveEngineId } : {}),
      }),
    });
    if (!response.ok) throw new Error(`room creation failed: ${response.status}`);
    const data = await response.json() as { url?: string };
    if (!data.url) throw new Error('room creation response missing url');
    window.location.assign(data.url);
  } catch (err) {
    console.warn(err);
    playAgainStatus = 'failed';
    renderRoomActions();
  }
}

// ── Dev views ─────────────────────────────────────────────────────────────────

function renderDevViews(): void {
  const views = currentDevViews();
  refs.devViews.replaceChildren();
  refs.devViewsSection.hidden = views === null;
  if (!views) return;

  const tally = currentCaptures();
  refs.devViews.append(
    devViewCard('Player view', views.player, tally, [views.player.perspective]),
    devViewCard(`${capitalize(views.opponent)} view`, views.opponentView, tally, [views.opponent]),
    devViewCard('True view', views.truth, tally, ['white', 'black']),
  );
}

function devViewCard(
  label: string,
  view: PlayerView,
  tally: CaptureTally,
  capturingColors: Color[],
): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'dev-view-card';

  const title = document.createElement('strong');
  title.textContent = label;

  const meta = document.createElement('span');
  meta.textContent = `${view.perspective} · ${view.status.type === 'playing' ? `${view.status.turn} to move` : view.status.type}`;

  const board = document.createElement('div');
  board.className = 'dev-board';
  board.setAttribute('aria-label', label);

  const visible = new Set(view.visibleSquares);
  const rankOrder = view.perspective === 'white' ? [...ranks].reverse() : [...ranks];
  const fileOrder = view.perspective === 'white' ? files : [...files].reverse();
  for (const rank of rankOrder) {
    for (const file of fileOrder) {
      const square = `${file}${rank}` as Square;
      const cell = document.createElement('span');
      const hidden = !visible.has(square);
      cell.className = [
        'dev-square',
        (fileOrdinal(file) + rank) % 2 === 0 ? 'dark' : 'light',
        hidden ? 'hidden' : '',
      ].filter(Boolean).join(' ');
      const piece = view.board[square];
      cell.textContent = piece && !hidden ? pieceGlyphForRole(piece.role, piece.color) : '';
      board.append(cell);
    }
  }

  const captures = document.createElement('div');
  captures.className = 'dev-captures captures-strip';
  for (const color of capturingColors) {
    if (tally[color].length === 0) continue;
    const row = document.createElement('div');
    row.className = 'captures-row';
    for (const role of sortCaptureRoles(tally[color])) {
      row.append(capturePieceEl(role, oppositeColor(color)));
    }
    captures.append(row);
  }

  card.append(title, meta, board, captures);
  return card;
}

// ── Clocks ────────────────────────────────────────────────────────────────────

export function renderClocks(view: PlayerView | null): void {
  refs.clocks.replaceChildren();
  if (!view?.clock) {
    const roomCreated = liveState.events.find((e): e is Extract<GameEvent, { type: 'room-created' }> => e.type === 'room-created');
    const tc = roomCreated?.timeControl;
    if (tc) {
      const incrementSec = Math.round(tc.incrementMs / 1000);
      const tcLabel = incrementSec > 0 ? `${formatClock(tc.initialMs)}+${incrementSec}` : formatClock(tc.initialMs);
      const colors: Color[] = ['black', 'white'];
      for (const color of colors) {
        const row = document.createElement('div');
        row.className = 'pregame';
        const label = document.createElement('span');
        label.textContent = capitalize(color);
        const time = document.createElement('strong');
        time.textContent = formatClock(tc.initialMs);
        row.append(label, time);
        refs.clocks.append(row);
      }
      const note = document.createElement('p');
      note.className = 'clocks-pregame-note';
      note.textContent = `${tcLabel} · clock starts when both players are ready`;
      refs.clocks.append(note);
    }
    return;
  }

  const displayAt = isLive() ? Date.now() : view.clock.runningSince ?? Date.now();
  const colors: Color[] = view.perspective === 'white' ? ['black', 'white'] : ['white', 'black'];
  const isPvp = liveState.roomMode === 'pvp';
  const humanColor = isColor(liveState.seat) ? liveState.seat : null;
  for (const color of colors) {
    const isActive = view.clock.activeColor === color && view.status.type === 'playing';
    const row = document.createElement('div');
    const label = document.createElement('span');
    const time = document.createElement('strong');
    if (isPvp) label.append(presenceDot(liveState.connectedSeats[color]));
    // Prefer server-supplied display name; fall back to "You"/"Bot"/color
    const serverName = liveState.seatDisplayNames[color];
    const playerName = serverName
      ?? (color === humanColor ? 'You' : (liveState.roomMode === 'pve' ? 'Bot' : capitalize(color)));
    label.append(document.createTextNode(playerName));
    if (isActive) {
      const toMove = document.createElement('span');
      toMove.className = 'clock-to-move';
      toMove.textContent = ' to move';
      label.append(toMove);
    }
    const remainingMs = clockRemainingMs(view.clock, color, displayAt);
    time.textContent = formatClock(remainingMs, isActive && remainingMs < 10_000);
    row.className = isActive ? 'active' : '';
    row.append(label, time);
    refs.clocks.append(row);
  }
}

// ── Captures strip ────────────────────────────────────────────────────────────
//
// Renders pieces the viewer has personally captured. For a seated player, that's
// their own color only — fog-filtered events naturally exclude the opponent's
// captures, and the rule (see rulesets.md) is that no other material is revealed.
// EVE spectators see both sides (no fog filtering applied server-side).
function renderCaptures(view: PlayerView | null): void {
  refs.captures.replaceChildren();
  refs.captures.classList.toggle('has-captures', false);
  if (!view) return;

  const tally = currentCaptures();
  const seat = liveState.seat;

  const renderRow = (capturedRoles: PieceRole[], capturedColor: Color): HTMLDivElement | null => {
    if (capturedRoles.length === 0) return null;
    const row = document.createElement('div');
    row.className = 'captures-row';
    for (const role of sortCaptureRoles(capturedRoles)) {
      row.append(capturePieceEl(role, capturedColor));
    }
    return row;
  };

  // Seated player: show only their own captures (the opponent pieces they took).
  // EVE spectator: show both sides.
  let any = false;
  if (isColor(seat)) {
    const row = renderRow(tally[seat], oppositeColor(seat));
    if (row) {
      refs.captures.append(row);
      any = true;
    }
  } else {
    for (const color of ['white', 'black'] as Color[]) {
      const row = renderRow(tally[color], oppositeColor(color));
      if (row) {
        refs.captures.append(row);
        any = true;
      }
    }
  }
  refs.captures.classList.toggle('has-captures', any);
}

// Builds a chessground-styled piece sprite for the capture strip. The outer span
// carries the cg-wrap class so chessground.cburnett.css applies its background-image
// rules; the inner <piece> element matches the .role.color selector chessground uses.
function capturePieceEl(role: PieceRole, color: Color): HTMLSpanElement {
  const wrap = document.createElement('span');
  wrap.className = `captures-piece cg-wrap`;
  wrap.setAttribute('aria-label', `${color} ${role}`);
  const piece = document.createElement('piece');
  piece.className = `${color} ${role}`;
  wrap.append(piece);
  return wrap;
}

function presenceDot(connected: boolean): HTMLSpanElement {
  const dot = document.createElement('span');
  dot.className = `presence-dot ${connected ? 'is-online' : 'is-offline'}`;
  dot.setAttribute('aria-label', connected ? 'Connected' : 'Disconnected');
  dot.title = connected ? 'Connected' : 'Disconnected';
  return dot;
}

// ── Board ─────────────────────────────────────────────────────────────────────

function renderBoard(view: PlayerView | null): void {
  const moveColor = activeMoveColor();
  const ownSeat = isColor(liveState.seat) ? liveState.seat : null;
  const paused = liveState.paused === true && view?.status.type === 'playing';
  const canInteractWithOwnPieces = isLive()
    && view?.status.type === 'playing'
    && !paused
    && (liveState.solo || ownSeat !== null)
    && pendingPromotion === null;
  const boardIsLive = canInteractWithOwnPieces && moveColor !== null;
  const movableColor = boardIsLive ? moveColor : ownSeat;
  refs.board.classList.toggle('finished-board', view?.status.type === 'finished');
  refs.board.classList.toggle('paused-board', paused);
  renderPausedOverlay(paused);
  const config = {
    animation: { enabled: false, duration: 0 },
    autoCastle: true,
    coordinates: false,
    coordinatesOnSquares: false,
    fen: view ? boardFen(view.board) : '8/8/8/8/8/8/8/8',
    highlight: {
      custom: view
        ? hiddenSquareClasses(view, orientation, { preserveFogOnFinished: true })
        : new Map(),
      lastMove: true,
    },
    lastMove: view?.lastMove ? ([view.lastMove.from, view.lastMove.to] as cg.Key[]) : undefined,
    movable: {
      color: movableColor ?? undefined,
      dests: view ? legalDests(view) : new Map<cg.Key, cg.Key[]>(),
      free: false,
      rookCastle: true,
      showDests: true,
      events: {
        after: (from: cg.Key, to: cg.Key) => sendBoardMove(from, to),
      },
    },
    orientation,
    premovable: {
      castle: true,
      enabled: canInteractWithOwnPieces && !boardIsLive && ownSeat !== null,
      showDests: true,
    },
    selectable: { enabled: canInteractWithOwnPieces },
    draggable: { enabled: canInteractWithOwnPieces, showGhost: true },
    turnColor: view?.status.type === 'playing' ? view.status.turn : undefined,
    viewOnly: false,
  } satisfies Parameters<typeof Chessground>[1];

  if (ground) {
    ground.set(config);
    maybePlayPremove();
    return;
  }

  ground = Chessground(refs.board, config);
  liveState.ground = ground;
  maybePlayPremove();
}

function maybePlayPremove(): void {
  if (!ground || activeMoveColor() === null || pendingPromotion !== null) return;
  ground.playPremove();
}

function renderPausedOverlay(paused: boolean): void {
  refs.boardPaused.hidden = !paused;
}

function renderBoardResult(view: PlayerView | null): void {
  refs.board.classList.remove('king-celebrating-white', 'king-celebrating-black');

  if (view?.status.type !== 'finished' || !isLive()) return;

  const winner = view.status.winner;
  if (!winner) return;

  const seat = liveState.seat;
  if ((seat === 'white' || seat === 'black') && winner !== seat) return;

  refs.board.classList.add(`king-celebrating-${winner}`);
}

// ── Interaction state ─────────────────────────────────────────────────────────

export function reconcileInteractionState(): void {
  const view = currentView();
  if (!isLive() || !view || view.status.type !== 'playing') {
    pendingPromotion = null;
    ground?.cancelMove();
    ground?.cancelPremove();
    return;
  }

  if (pendingPromotion && !promotionMovesFor(pendingPromotion.from, pendingPromotion.to).length) {
    pendingPromotion = null;
    ground?.cancelMove();
    ground?.cancelPremove();
  }
}

// ── Legal dests / board helpers ───────────────────────────────────────────────

export function legalDests(view: PlayerView): cg.Dests {
  const dests = new Map<cg.Key, cg.Key[]>();
  for (const move of view.legalMoves) {
    const from = move.from as cg.Key;
    const to = move.to as cg.Key;
    dests.set(from, [...(dests.get(from) ?? []), to]);
  }
  addCastlingDestinationAliases(view, dests);
  return dests;
}

function addCastlingDestinationAliases(view: PlayerView, dests: cg.Dests): void {
  for (const move of view.legalMoves) {
    const alias = castlingKingDestinationFromView(view, move);
    if (!alias) continue;
    const from = move.from as cg.Key;
    const current = dests.get(from) ?? [];
    if (!current.includes(alias as cg.Key)) dests.set(from, [...current, alias as cg.Key]);
  }
}

function castlingKingDestinationFromView(view: PlayerView, move: Move): Square | null {
  const piece = view.board[move.from];
  const rook = view.board[move.to];
  if (!piece || piece.role !== 'king' || !rook || rook.role !== 'rook' || rook.color !== piece.color) return null;
  if (rankOf(move.from) !== rankOf(move.to)) return null;
  return `${squareFileIndex(move.to) > squareFileIndex(move.from) ? 'g' : 'c'}${rankOf(move.from)}` as Square;
}

function sendBoardMove(from: cg.Key, to: cg.Key): void {
  const view = currentView();
  const fromSquare = from as Square;
  const toSquare = to as Square;
  const promotions = promotionMovesFor(fromSquare, toSquare);
  if (promotions.length > 1) {
    pendingPromotion = {
      color: view?.board[fromSquare]?.color ?? activeMoveColor() ?? 'white',
      from: fromSquare,
      moves: promotions,
      to: toSquare,
    };
    renderBoard(view);
    renderPromotion();
    return;
  }

  const move = promotions[0] ?? bestMove(fromSquare, toSquare);
  if (!move) {
    renderBoard(view);
    return;
  }
  submitBoardMove(move, view);
}

function submitBoardMove(move: Move, view: PlayerView | null): void {
  if (!sendSocket({ type: 'move', ...move })) return;
  playSound(soundForOwnMove(view, move));
}

// Dev-only hook for browser-driven verification (synthetic chessground events
// are rejected because trustAllEvents is off). Remove or wall behind a stricter
// guard before flipping production builds.
if (import.meta.env.DEV) {
  (window as unknown as { __mbDev?: object }).__mbDev = {
    move: (from: Square, to: Square, promotion?: PromotionRole) =>
      submitBoardMove({ from, to, ...(promotion ? { promotion } : {}) }, currentView()),
    view: () => currentView(),
    captures: () => currentCaptures(),
    events: () => liveState.events,
    render: () => render(),
  };
}

function bestMove(from: Square, to: Square) {
  return movesFor(from, to)[0];
}

function promotionMovesFor(from: Square, to: Square): Move[] {
  return movesFor(from, to).filter((move) => move.promotion);
}

function movesFor(from: Square, to: Square): Move[] {
  const view = currentView();
  if (!view) return [];
  const castlingAlias = view.legalMoves.filter((move) => (
    move.from === from && castlingKingDestinationFromView(view, move) === to
  ));
  if (castlingAlias.length > 0) return castlingAlias;
  return view.legalMoves.filter((move) => move.from === from && move.to === to);
}

// ── Promotion picker ──────────────────────────────────────────────────────────

function renderPromotion(): void {
  refs.promotion.replaceChildren();
  refs.promotion.hidden = pendingPromotion === null;
  refs.promotion.onclick = null;
  if (!pendingPromotion) return;

  refs.promotion.className = `promotion-picker cg-wrap ${pendingPromotion.color}`;
  refs.promotion.setAttribute('aria-label', 'Choose promotion piece');
  refs.promotion.onclick = (event) => {
    if (event.target !== refs.promotion) return;
    pendingPromotion = null;
    refs.promotion.hidden = true;
    renderBoard(currentView());
  };

  const fileIndex = squareFileIndex(pendingPromotion.to);
  const visualFile = orientation === 'white' ? fileIndex : 7 - fileIndex;
  const startsAtTop = pendingPromotion.color === orientation;

  for (const [index, role] of promotionRoles.entries()) {
    const move = pendingPromotion.moves.find((candidate) => candidate.promotion === role);
    if (!move) continue;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'promotion-choice';
    button.title = role;
    button.setAttribute('aria-label', `Promote to ${role}`);
    button.style.left = `${visualFile * 12.5}%`;
    button.style.top = `${(startsAtTop ? index : 7 - index) * 12.5}%`;
    button.append(promotionLabel(role, pendingPromotion.color));
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      pendingPromotion = null;
      refs.promotion.hidden = true;
      submitBoardMove(move, currentView());
    });
    refs.promotion.append(button);
  }
}

function promotionLabel(role: PromotionRole, color: Color): HTMLElement {
  const label = document.createElement('piece');
  label.className = `promotion-piece ${role} ${color}`;
  label.setAttribute('aria-hidden', 'true');
  return label;
}

// ── Board FEN / piece helpers ─────────────────────────────────────────────────

// ── Replay ────────────────────────────────────────────────────────────────────

function renderReplay(): void {
  refs.replayMeta.textContent = replayMetaLabel();

  for (const control of refs.replayControls) {
    control.disabled = replayControlDisabled(control.dataset.replay ?? '');
    control.onclick = () => {
      const prevReplayIndex = replayIndex;
      applyReplayControl(control.dataset.replay ?? '');
      maybeSoundForReplayStep(prevReplayIndex, replayIndex);
      reconcileInteractionState();
      render();
    };
  }

  refs.moveList.replaceChildren();
  const masked = shouldMaskMoveList();
  const entries = masked ? liveMoveListEntries() : revealedMoveListEntries();
  const entriesByPly = new Map(entries.map((entry) => [entry.ply, entry]));
  const labelsByEventIndex = algebraicMoveLabels();
  const plyCount = moveListPlyCount(masked, entries);
  const visibleColor = moveListVisibleColor(masked);
  const activePly = computeActivePly();
  const rows: HTMLLIElement[] = [];

  for (let row = 0; row < Math.ceil(plyCount / 2); row += 1) {
    const item = document.createElement('li');
    item.className = 'move-row';

    const number = document.createElement('span');
    number.className = 'move-number';
    number.textContent = `${row + 1}.`;
    item.append(number);

    const whitePly = row * 2 + 1;
    const blackPly = row * 2 + 2;
    item.append(moveListCell(whitePly, 'white', entriesByPly.get(whitePly), masked, visibleColor, plyCount, labelsByEventIndex, activePly));
    item.append(moveListCell(blackPly, 'black', entriesByPly.get(blackPly), masked, visibleColor, plyCount, labelsByEventIndex, activePly));
    rows.push(item);
  }
  refs.moveList.append(...rows);
}

function shouldMaskMoveList(): boolean {
  if (liveState.state?.variant !== 'fog-of-war' || liveState.roomMode === 'eve') return false;
  // PvE spectators already receive only the human player's fog view — the
  // engine's moves are filtered server-side, so the human's moves are not
  // secret. Show the move list so spectators can follow along.
  if (liveState.roomMode === 'pve' && liveState.seat === 'spectator') return false;
  // Rooms never reveal — even after finish, fog stays on. Players who want the
  // full board click through to /game/:id.
  return true;
}

function revealedMoveListEntries(): MoveListEntry[] {
  const entries: MoveListEntry[] = [];
  for (const [index, event] of liveState.events.entries()) {
    if (event.type !== 'move-played') continue;
    entries.push({ event: event as MovePlayedEvent, eventIndex: index + 1, ply: entries.length + 1 });
  }
  return entries;
}

function liveMoveListEntries(): MoveListEntry[] {
  const entries: MoveListEntry[] = [];
  const counts: Record<Color, number> = { black: 0, white: 0 };
  for (const [index, event] of liveState.events.entries()) {
    if (event.type !== 'move-played') continue;
    counts[event.color] += 1;
    const ply = event.color === 'white' ? counts.white * 2 - 1 : counts.black * 2;
    entries.push({ event: event as MovePlayedEvent, eventIndex: index + 1, ply });
  }
  return entries;
}

function liveMoveListPlyCount(view: PlayerView | null): number {
  if (!view) return 0;
  if (view.status.type !== 'playing') return 0;
  const completedFullMoves = Math.max(0, view.moveNumber - 1);
  return completedFullMoves * 2 + (view.status.turn === 'black' ? 1 : 0);
}

function moveListPlyCount(masked: boolean, entries: MoveListEntry[]): number {
  if (!masked) return entries.length;
  if (liveState.state?.status.type === 'playing') return liveMoveListPlyCount(liveState.state);
  return Math.max(0, ...entries.map((entry) => entry.ply));
}

function moveListVisibleColor(masked: boolean): Color | null {
  if (!masked) return null;
  if (isColor(liveState.seat)) return liveState.seat;
  return currentView()?.status.type === 'finished' ? currentView()?.perspective ?? 'white' : null;
}

function computeActivePly(): number | null {
  if (replayIndex === null) return null;
  // Fog: replayIndex is a fog-snapshot number; snapshotToPly converts to a chess ply (1-based,
  // odd = white, even = black, 0 = pre-first-move).
  if (liveState.state?.variant === 'fog-of-war' && fogViewHistory.size > 0) {
    return snapshotToPly(replayIndex);
  }
  // Non-fog: replayIndex is an events-list index; count move-played events up to it.
  let plies = 0;
  for (let i = 0; i < replayIndex && i < liveState.events.length; i += 1) {
    if (liveState.events[i]?.type === 'move-played') plies += 1;
  }
  return plies;
}

function fogSnapshotForEventIndex(eventIndex: number): number | null {
  // Find the earliest fog snapshot whose eventsLen covers this eventIndex.
  let best: number | null = null;
  for (const [snap, evLen] of fogSnapshotToEventsLen) {
    if (evLen >= eventIndex && (best === null || snap < best)) best = snap;
  }
  return best;
}

function moveListCell(
  ply: number,
  color: Color,
  entry: MoveListEntry | undefined,
  masked: boolean,
  visibleColor: Color | null,
  plyCount: number,
  labelsByEventIndex: Map<number, string>,
  activePly: number | null = null,
): HTMLElement {
  if (ply > plyCount) {
    const empty = document.createElement('span');
    empty.className = `${color}-ply move-empty`;
    return empty;
  }

  const isActive = activePly === ply;
  const hidden = masked && color !== visibleColor;
  if (!entry || hidden) {
    const placeholder = document.createElement('span');
    placeholder.className = [
      `${color}-ply`,
      'move-placeholder',
      isActive ? 'active' : '',
    ].filter(Boolean).join(' ');
    placeholder.textContent = '..';
    return placeholder;
  }

  if (masked) {
    const label = document.createElement('span');
    label.className = [
      `${color}-ply`,
      'move-visible',
      isActive ? 'active' : '',
    ].filter(Boolean).join(' ');
    label.textContent = moveLabel(entry, labelsByEventIndex);
    return label;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = moveLabel(entry, labelsByEventIndex);
  button.className = [
    color === 'white' ? 'white-ply' : 'black-ply',
    isActive ? 'active' : '',
  ].filter(Boolean).join(' ');
  button.addEventListener('click', () => {
    if (liveState.state?.variant === 'fog-of-war' && fogViewHistory.size > 0) {
      replayIndex = fogSnapshotForEventIndex(entry.eventIndex);
    } else {
      replayIndex = entry.eventIndex;
    }
    reconcileInteractionState();
    render();
  });
  return button;
}

function algebraicMoveLabels(): Map<number, string> {
  return buildAlgebraicMoveLabels(liveState.events, liveState.events[0]?.roomId ?? liveState.room);
}

function moveLabel(entry: MoveListEntry, labelsByEventIndex: Map<number, string>): string {
  return labelsByEventIndex.get(entry.eventIndex) ?? coordinateMoveLabel(entry.event.move);
}

// ── Replay controls / keyboard ────────────────────────────────────────────────

function applyReplayControl(action: string): void {
  const history = replayHistoryIndexes();
  if (action === 'latest') {
    replayIndex = null;
    return;
  }
  if (history.length === 0) {
    replayIndex = null;
    return;
  }

  const currentIndex = currentReplayIndex();
  if (action === 'first') replayIndex = history[0] ?? null;
  if (action === 'prev') replayIndex = previousReplayHistoryIndex(currentIndex, history);
  if (action === 'next') {
    const next = nextReplayHistoryIndex(currentIndex, history);
    const livePos = fogLivePos();
    replayIndex = next === null || next >= livePos ? null : next;
  }
}

export function handleReplayKeyboard(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;
  if (isEditableKeyboardTarget(event.target)) return;

  const action = replayActionForKey(event.key);
  if (!action || replayControlDisabled(action)) return;

  event.preventDefault();
  const prevReplayIndex = replayIndex;
  applyReplayControl(action);
  maybeSoundForReplayStep(prevReplayIndex, replayIndex);
  reconcileInteractionState();
  render();
}

function maybeSoundForReplayStep(prevIndex: number | null, nextIndex: number | null): void {
  // Both prevIndex and nextIndex use `null` to mean "live position". Map both to the concrete
  // live snapshot index so a forward step into live (the final ply reveal) still plays a sound —
  // the WS-driven sound system only fires on new server messages, not on keyboard navigation.
  const livePos = fogLivePos();
  const effectiveNext = nextIndex ?? livePos;
  const effectivePrev = prevIndex ?? livePos;
  if (effectiveNext <= effectivePrev) return; // backward step or no change — no sound

  if (liveState.state?.variant === 'fog-of-war' && fogViewHistory.size > 0) {
    // replayIndex is a fog snapshot number, not an events index. Use fog view comparison to
    // determine the sound — the same logic playSanitizedOpponentSound uses for live moves.
    const prevView = fogViewHistory.get(effectivePrev);
    const nextView = fogViewHistory.get(effectiveNext);
    if (!prevView || !nextView) return;
    const seat = isColor(liveState.seat) ? liveState.seat : 'white';
    playSound(ownPieceCount(nextView, seat) < ownPieceCount(prevView, seat) ? 'captured' : 'move');
    return;
  }

  const eventIndex = effectiveNext - 1;
  const event = liveState.events[eventIndex];
  if (!event || event.type !== 'move-played') return;
  playSound(soundForMove(liveState.events.slice(0, eventIndex), event));
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
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement;
}

function replayControlDisabled(action: string): boolean {
  const history = replayHistoryIndexes();
  if (history.length === 0) return action !== 'latest';
  const currentIndex = currentReplayIndex();
  if (action === 'latest') return isLive();
  if (action === 'next') return isLive() || nextReplayHistoryIndex(currentIndex, history) === null;
  if (action === 'first') return previousReplayHistoryIndex(currentIndex, history) === currentIndex;
  if (action === 'prev') {
    // Disable prev one step before the first move so the user can still step back to the initial
    // board but not further. < (not <=) so the first-move position itself allows one more step.
    const firstMove = firstMoveHistoryIndex();
    if (firstMove !== null && currentIndex < firstMove) return true;
    return previousReplayHistoryIndex(currentIndex, history) === currentIndex;
  }
  return false;
}

function isFogLivePvp(): boolean {
  return liveState.roomMode === 'pvp'
    && isColor(liveState.seat)
    && liveState.state?.variant === 'fog-of-war'
    && liveState.state?.status.type !== 'finished';
}

function captureFogView(): void {
  if (!liveState.state || liveState.state.variant !== 'fog-of-war') return;
  // Capture on every server state change, not just when eventsLen increases. Opponent moves
  // don't appear in liveState.events (fog-filtered), so eventsLen stays constant after them —
  // using it as the key would collapse own-move and opponent-move positions into one entry.
  if (liveState.state === lastCapturedFogState) return;
  if (fogFirstMoveSnapshotIndex === null && liveState.state.lastMove !== undefined) {
    fogFirstMoveSnapshotIndex = fogSnapshotSeq;
  }
  fogViewHistory.set(fogSnapshotSeq, liveState.state);
  fogSnapshotToEventsLen.set(fogSnapshotSeq, liveState.events.length);
  fogSnapshotSeq++;
  lastCapturedFogState = liveState.state;
}

function replayHistoryIndexes(): number[] {
  // For fog-of-war games, navigate through fogViewHistory keys rather than the events list.
  // Events are fog-filtered: opponent moves are excluded from liveState.events, so events-based
  // history only has the current player's moves — each step would span 2 chess ply. fogViewHistory
  // is captured on every snapshot render (including after hidden opponent moves), giving 1-ply
  // granularity.
  //
  // Skip transient pregame snapshots so the chess-viewer convention holds: |< lands on a single
  // "starting position" (ply 0), not on whichever seat-assigned/clock-started snapshot happened
  // to fire first. Keep the snapshot immediately before the first move as the ply-0 anchor;
  // every snapshot from the first move onward is a real ply position.
  if (liveState.state?.variant === 'fog-of-war' && fogViewHistory.size > 0) {
    const allKeys = Array.from(fogViewHistory.keys()).sort((a, b) => a - b);
    if (fogFirstMoveSnapshotIndex === null) {
      // No moves played yet — expose only the latest pregame snapshot so |< / > don't walk
      // through redundant setup states.
      return allKeys.length > 0 ? [allKeys[allKeys.length - 1]!] : [];
    }
    const firstMove = fogFirstMoveSnapshotIndex;
    const startAnchor = firstMove - 1;
    return allKeys.filter((k) => k === startAnchor || k >= firstMove);
  }
  const indexes: number[] = [];
  for (const [index, event] of liveState.events.entries()) {
    if (isReplayHistoryEvent(event)) indexes.push(index + 1);
  }
  return indexes;
}

function snapshotToPly(snapshot: number): number {
  if (fogFirstMoveSnapshotIndex === null) return 0;
  return Math.max(0, snapshot - fogFirstMoveSnapshotIndex + 1);
}

function totalPlies(): number {
  return snapshotToPly(fogLivePos());
}

function isReplayHistoryEvent(event: GameEvent): boolean {
  // clock-expired is excluded: it ends the game but doesn't move pieces, so navigating to it
  // always shows the same board as the last move-played. Stepping backward would burn a key press
  // with no visible board change.
  return event.type === 'room-created'
    || event.type === 'draft-start-resolved'
    || event.type === 'move-played';
}

function firstMoveHistoryIndex(): number | null {
  if (liveState.state?.variant === 'fog-of-war' && fogViewHistory.size > 0) {
    return fogFirstMoveSnapshotIndex;
  }
  for (const [index, event] of liveState.events.entries()) {
    if (event.type === 'move-played') return index + 1;
  }
  return null;
}

function previousReplayHistoryIndex(currentIndex: number, history: number[]): number {
  const currentHistoryIndex = latestReplayHistoryIndexAtOrBefore(currentIndex, history);
  // If currentIndex is not itself a history entry (e.g. the live position is one past the last
  // snapshot), the nearest earlier history entry IS the previous position — don't step back again.
  if (currentHistoryIndex !== currentIndex) return currentHistoryIndex;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const historyIndex = history[index]!;
    if (historyIndex < currentHistoryIndex) return historyIndex;
  }
  return currentHistoryIndex;
}

function fogLivePos(): number {
  // For fog games, the live position IS the last captured snapshot (fogSnapshotSeq - 1), not
  // one past it. This eliminates the redundant extra right-press from "last snapshot" to "live"
  // since both show the same board.
  return liveState.state?.variant === 'fog-of-war' && fogViewHistory.size > 0
    ? fogSnapshotSeq - 1
    : liveState.events.length;
}

function nextReplayHistoryIndex(currentIndex: number, history: number[]): number | null {
  for (const historyIndex of history) {
    if (historyIndex > currentIndex) return historyIndex;
  }
  const livePos = fogLivePos();
  return currentIndex < livePos ? livePos : null;
}

function latestReplayHistoryIndexAtOrBefore(currentIndex: number, history: number[]): number {
  let latest = history[0] ?? currentIndex;
  for (const historyIndex of history) {
    if (historyIndex > currentIndex) break;
    latest = historyIndex;
  }
  return latest;
}

// ── View / projection helpers ─────────────────────────────────────────────────

export function currentProjection(): GameProjection | null {
  const slice = currentEventsSlice();
  return slice ? replayGameEvents(slice) : null;
}

export function currentCaptures(): CaptureTally {
  const slice = currentEventsSlice();
  if (!slice) return { white: [], black: [] };
  return computeCaptures(slice);
}

function currentEventsSlice(): GameEvent[] | null {
  const events = liveState.events;
  if (events.length === 0) return null;
  // Fog replay uses fogSnapshotSeq as replayIndex — not an events index. Map through
  // fogSnapshotToEventsLen in fog mode; otherwise use the replay index directly.
  const sliceAt = (fogViewHistory.size > 0 && liveState.state?.variant === 'fog-of-war')
    ? (isLive() ? events.length : (fogSnapshotToEventsLen.get(currentReplayIndex()) ?? events.length))
    : currentReplayIndex();
  return events.slice(0, sliceAt);
}

export function currentView(): PlayerView | null {
  const projection = currentProjection();
  const perspective = liveState.seat === 'black' ? 'black' : 'white';
  if (isLive() && (!projection || projection.state.variant !== 'fog-of-war' || projection.state.status.type !== 'finished')) return liveState.state;
  // Historical fog position: use the server-provided snapshot captured at that event count.
  // viewForProjection cannot reconstruct accurate historical fog views — events from WebSocket
  // snapshots are fog-filtered and structured differently from what replayGameEvents expects,
  // so the projection's moveNumber stays wrong. Walking back through fogViewHistory is correct
  // for both PvP and PvE fog games.
  const gameFinished = liveState.state?.status.type === 'finished';
  if (!isLive() && replayIndex !== null && liveState.state?.variant === 'fog-of-war') {
    return fogViewHistory.get(replayIndex) ?? liveState.state;
  }
  if (!projection) return liveState.state;
  if (projection.state.variant === 'fog-of-war' && projection.state.status.type === 'finished') {
    return terminalFogViewForProjection(projection, perspective);
  }
  if (projection.state.variant === 'fog-of-war' && gameFinished && replayIndex !== null) {
    const captured = fogViewHistory.get(replayIndex);
    if (captured) return captured;
  }
  return viewForProjection(projection, perspective);
}

export function currentDevViews(): DevViews | null {
  if (!liveState.devViews) return null;
  if (isLive()) return liveState.devViews;

  const projection = currentProjection();
  if (!projection || projection.state.variant !== 'fog-of-war') return liveState.devViews;

  const perspective = liveState.seat === 'black' ? 'black' : 'white';
  const opponent = oppositeColor(perspective);
  const player = projection.state.status.type === 'finished'
    ? fullTruthViewForProjection(projection, perspective)
    : viewForProjection(projection, perspective);
  const opponentView = projection.state.status.type === 'finished'
    ? fullTruthViewForProjection(projection, opponent)
    : viewForProjection(projection, opponent);
  return {
    opponent,
    opponentView,
    player,
    truth: fullTruthViewForProjection(projection, perspective),
  };
}

function currentReplayIndex(): number {
  return replayIndex ?? fogLivePos();
}

export function isLive(): boolean {
  return replayIndex === null || replayIndex >= fogLivePos();
}

function activeMoveColor(): Color | null {
  const status = currentView()?.status;
  if (status?.type !== 'playing') return null;
  if (liveState.solo) return status.turn;
  return liveState.seat === status.turn ? liveState.seat : null;
}

function viewForProjection(projection: GameProjection, perspective: Color): PlayerView {
  const variant = variantForId(projection.state.variant);
  const view = variant.getPlayerView(projection.state, perspective);
  if (!liveState.solo || projection.state.status.type !== 'playing') return view;
  return {
    ...view,
    legalMoves: variant.getLegalMoves(projection.state, projection.state.status.turn),
  };
}

function fullTruthViewForProjection(projection: GameProjection, perspective: Color): PlayerView {
  return {
    id: projection.state.id,
    variant: projection.state.variant,
    board: projection.state.board,
    visibleSquares: allSquares,
    legalMoves: [],
    status: projection.state.status,
    perspective,
    moveNumber: projection.state.moveNumber,
    lastMove: projection.state.lastMove,
    clock: projection.state.clock,
  };
}

function terminalFogViewForProjection(projection: GameProjection, perspective: Color): PlayerView {
  const variant = variantForId(projection.state.variant);
  const reviewState = {
    ...projection.state,
    status: { type: 'playing', turn: perspective } as const,
  };
  const view = variant.getPlayerView(reviewState, perspective);
  return {
    ...view,
    legalMoves: [],
    status: projection.state.status,
    lastMove: projection.state.lastMove,
    clock: projection.state.clock,
  };
}

// ── Draft data helpers ────────────────────────────────────────────────────────

function draftOfferForColor(color: Color, projection: GameProjection | null): { id: number; fenPlacement: string }[] {
  return projection?.offers[color]
    ?? liveState.offers[color]
    ?? (projection?.offer.length ? projection.offer : liveState.offer);
}

function selectedStartId(color: Color, projection: GameProjection | null): number | undefined {
  return projection?.selections[color] ?? liveState.selections[color];
}

function sharedResolvedStartId(projection: GameProjection | null): number | null {
  return projection?.resolvedStartId ?? liveState.resolvedStartId;
}

function resolvedStartIdForColor(color: Color, projection: GameProjection | null): number | undefined {
  return projection?.resolvedStartIds[color] ?? liveState.resolvedStartIds[color];
}

function shouldShowDraftControls(view: PlayerView | null, projection: GameProjection | null): boolean {
  // Only show Draft960 UI for actual draft960 games — never for fog-of-war,
  // regardless of what hasVisibleDraftData returns (avoids spurious "Draft960
  // Offer" section on fog-of-war spectator views).
  const variant = view?.variant ?? liveState.state?.variant;
  if (variant && variant !== 'draft960') return false;
  if (view?.variant === 'draft960') return true;
  return hasVisibleDraftData(projection);
}

function hasVisibleDraftData(projection: GameProjection | null): boolean {
  if (liveState.solo) {
    return draftOfferForColor('white', projection).length > 0
      || draftOfferForColor('black', projection).length > 0
      || selectedStartId('white', projection) !== undefined
      || selectedStartId('black', projection) !== undefined
      || resolvedStartIdForColor('white', projection) !== undefined
      || resolvedStartIdForColor('black', projection) !== undefined
      || sharedResolvedStartId(projection) !== null;
  }
  if (liveState.seat === 'spectator') return liveState.offer.length > 0 || Object.keys(liveState.offers).length > 0;
  return draftOfferForColor(pickColorForSeat(), projection).length > 0
    || selectedStartId(pickColorForSeat(), projection) !== undefined
    || resolvedStartIdForColor(pickColorForSeat(), projection) !== undefined;
}

function shouldRequestHiddenDraft960ForPlayAgain(): boolean {
  const variant = currentView()?.variant ?? liveState.state?.variant ?? liveState.variantRequested;
  return variant === 'fog-of-war' && hasVisibleDraftData(currentProjection());
}

// ── Labels ────────────────────────────────────────────────────────────────────

function roomMetaHtml(): string {
  const mode = escapeHtml(modeLabel());
  const seat = isColor(liveState.seat)
    ? ` · Playing as ${escapeHtml(seatLabel(liveState.seat))}`
    : liveState.seat === 'spectator'
      ? ' · Spectating'
      : '';
  const replayLabel = isLive() ? '' : ' · replay';
  return `${mode}${seat}${replayLabel}`;
}

function replayMetaLabel(): string {
  if (liveState.events.length === 0) return 'No events';
  const isFog = liveState.state?.variant === 'fog-of-war' && fogViewHistory.size > 0;
  if (isFog) {
    const total = totalPlies();
    if (isLive()) return `Live · ply ${total} of ${total}`;
    return `Replay · ply ${snapshotToPly(currentReplayIndex())} of ${total}`;
  }
  if (isLive()) return `Live · ${liveState.events.length} events`;
  return `Replay · event ${currentReplayIndex()} of ${fogLivePos()}`;
}

/**
 * Returns the seat color the engine is playing in a PvE room, or null if not
 * PvE or the user isn't seated. Used to replace hardcoded `=== 'black'` checks
 * that broke when engineColor='white' games landed.
 */
function pveEngineSeat(): Color | null {
  if (liveState.roomMode !== 'pve') return null;
  if (!isColor(liveState.seat)) return null;
  return liveState.seat === 'white' ? 'black' : 'white';
}

function actionTone(view: PlayerView | null): InfoTone {
  if (liveState.connectionState === 'rejected') return 'danger';
  if (liveState.connectionState === 'displaced') return 'danger';
  if (liveState.connectionState === 'disconnected') return 'danger';
  if (!view || liveState.connectionState === 'connecting' || liveState.connectionState === 'reconnecting') return 'pending';
  if (view.status.type === 'finished') return 'success';
  if (liveState.seat === 'spectator') return 'default';
  if (view.status.type === 'playing' && view.status.turn === pveEngineSeat()) return 'pending';
  if (view.status.type === 'playing' && view.status.turn === liveState.seat) return 'success';
  return 'default';
}

function actionTitle(view: PlayerView | null): string {
  if (liveState.connectionState === 'rejected') return 'Access rejected';
  if (liveState.connectionState === 'displaced') return 'Session moved';
  if (liveState.connectionState === 'disconnected' || liveState.connectionState === 'reconnecting') return 'Reconnecting';
  if (!view || liveState.connectionState === 'connecting') return 'Connecting';
  if (view.status.type === 'finished') return resultTitle(view.status.winner);
  if (liveState.seat === 'spectator') return 'Watching';
  if (view.status.type === 'pregame') {
    if (liveState.roomMode === 'pvp' && isColor(liveState.seat)) {
      const theirSeat: Color = liveState.seat === 'white' ? 'black' : 'white';
      if (liveState.connectedSeats[theirSeat]) return 'Opponent connected';
    }
    return liveState.roomMode === 'pvp' ? 'Waiting for opponent' : 'Preparing game';
  }
  if (view.status.type === 'playing' && view.status.turn === pveEngineSeat()) return 'Engine thinking';
  if (view.status.type === 'playing' && view.status.turn === liveState.seat) return 'Your move';
  return 'Opponent move';
}

function actionBody(view: PlayerView | null): string {
  if (liveState.connectionState === 'rejected') return rejectedBody();
  if (liveState.connectionState === 'displaced') return 'A newer tab is now controlling this seat.';
  if (liveState.connectionState === 'disconnected') return 'The socket closed. Mistboard will retry automatically.';
  if (liveState.connectionState === 'reconnecting') return 'Trying to restore your room state and seat.';
  if (!view || liveState.connectionState === 'connecting') return 'Opening the room and loading the current server state.';
  if (view.status.type === 'finished') {
    return `Board is fully revealed. ${resultReasonLabel(view.status.reason)}.`;
  }
  if (liveState.seat === 'spectator') return spectatorBody(view);
  if (view.status.type === 'pregame') {
    if (liveState.roomMode === 'pvp' && isColor(liveState.seat)) {
      const theirSeat: Color = liveState.seat === 'white' ? 'black' : 'white';
      if (liveState.connectedSeats[theirSeat]) {
        return hasVisibleDraftData(currentProjection())
          ? 'Choose your starting position from the options on the board.'
          : 'Both players connected. Game starting.';
      }
      return 'Share the invite link below to invite your opponent.';
    }
    return 'Share the room link when you are ready.';
  }
  if (view.status.type === 'playing' && view.status.turn === pveEngineSeat()) {
    return 'The engine is on its own clock. Your clock resumes after its move.';
  }
  if (view.status.type === 'playing' && view.status.turn === liveState.seat) {
    return 'Move one of your visible pieces on the board.';
  }
  return `${capitalize(view.status.turn)} is on move.`;
}

function spectatorBody(view: PlayerView): string {
  if (view.status.type === 'finished') return 'Review the fully revealed final position.';
  if (liveState.clientCount < 3 && liveState.roomMode === 'pvp') return 'Waiting for both player seats to be filled.';
  return 'Spectators receive a public Fog view while the game is live.';
}

function resultTitle(winner: Color | null): string {
  if (winner === 'white') return 'White wins';
  if (winner === 'black') return 'Black wins';
  return 'Draw';
}

function resultReasonLabel(reason: string): string {
  return reason.replace(/-/g, ' ');
}

function boardStatusLabel(): string {
  if (liveState.connectionState === 'rejected') return 'Access rejected';
  if (liveState.connectionState === 'displaced') return 'Session moved';
  if (liveState.connectionState === 'disconnected' || liveState.connectionState === 'reconnecting') return 'Reconnecting';
  return liveState.clientId ? 'Waiting for board' : 'Connecting';
}

function boardStatusTone(): 'pending' | 'danger' {
  if (liveState.connectionState === 'rejected') return 'danger';
  if (liveState.connectionState === 'displaced') return 'danger';
  if (liveState.connectionState === 'disconnected') return 'danger';
  return 'pending';
}

function renderBoardStatus(view: PlayerView | null): void {
  refs.boardStatus.hidden = view !== null;
  refs.boardStatus.dataset.tone = boardStatusTone();
  const label = refs.boardStatus.querySelector<HTMLParagraphElement>('[data-board-status-label]');
  if (label) label.textContent = boardStatusLabel();
  const spinner = refs.boardStatus.querySelector<HTMLSpanElement>('[data-board-status-spinner]');
  if (spinner) {
    const showSpinner = liveState.connectionState === 'connecting'
      || liveState.connectionState === 'reconnecting'
      || liveState.connectionState === 'disconnected';
    spinner.hidden = !showSpinner;
  }
}

function rejectedBody(): string {
  if (liveState.closeReason === 'private room') return 'This game is in progress. Mistboard never shares live game state with anyone but the seated players. The full replay will be here once the game finishes.';
  if (liveState.closeReason === 'origin not allowed') return 'This browser origin is not allowed to open the room.';
  if (liveState.closeReason === 'rate limit') return 'The room connection was closed after too many messages.';
  return 'The server rejected this room connection.';
}

function modeLabel(): string {
  if (liveState.solo) return 'Solo dev';
  if (liveState.roomMode === 'pve') return 'Play engine';
  if (liveState.roomMode === 'pvp') return 'Friend challenge';
  if (liveState.roomMode === 'eve') return 'Engine game';
  return capitalize(liveState.roomMode);
}

function serverTimeLabel(): string {
  if (!liveState.lastServerAt || !liveState.lastSnapshotAt) return 'Waiting';
  const ageSeconds = Math.max(0, Math.round((Date.now() - liveState.lastSnapshotAt) / 1000));
  const label = ageSeconds <= 1 ? 'just now' : `${ageSeconds}s ago`;
  return `Snapshot ${label}`;
}

function seatLabel(value: Seat): string {
  if (liveState.solo) return 'Solo dev';
  if (value === 'spectator') return 'Spectator';
  return capitalize(value);
}

function selectionLabel(startId: number | null | undefined): string {
  return startId === null || startId === undefined ? 'none' : `#${startId}`;
}


// ── Small utilities ───────────────────────────────────────────────────────────

function squareFileIndex(square: Square): number {
  return files.indexOf(square[0] as typeof files[number]);
}

function rankOf(square: Square): string {
  return square[1] ?? '';
}

function fileOrdinal(file: typeof files[number]): number {
  return files.indexOf(file);
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function infoNotice(tone: InfoTone, text: string): HTMLDivElement {
  const notice = document.createElement('div');
  notice.className = `info-notice ${tone}`;
  notice.textContent = text;
  return notice;
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


function selectionItem(label: string, value: number | string | null | undefined): HTMLDivElement {
  const item = document.createElement('div');
  const key = document.createElement('span');
  const val = document.createElement('strong');
  key.textContent = label;
  val.textContent = typeof value === 'number' ? selectionLabel(value) : value ?? 'none';
  item.append(key, val);
  return item;
}

function pieceGlyphForRole(role: PieceRole, color: Color): string {
  const labels = {
    white: {
      bishop: '♗', king: '♔', knight: '♘', pawn: '♙', queen: '♕', rook: '♖',
    },
    black: {
      bishop: '♝', king: '♚', knight: '♞', pawn: '♟', queen: '♛', rook: '♜',
    },
  } satisfies Record<Color, Record<PieceRole, string>>;
  return labels[color][role];
}

function roomUrl(variant: PlayerView['variant'], dev?: 'engine'): string {
  const params = new URLSearchParams({
    reset: '1',
    room: crypto.randomUUID(),
  });
  params.set('variant', variant);
  if (dev) params.set('dev', dev);
  return `/?${params}`;
}

function pickColorForSeat(): Color {
  return liveState.seat === 'black' ? 'black' : 'white';
}
