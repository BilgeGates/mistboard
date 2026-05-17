import {
  algebraicMoveLabels as buildAlgebraicMoveLabels,
  clockRemainingMs,
  replayGameEvents,
  variantForId,
  type Board,
  type Color,
  type GameEvent,
  type GameProjection,
  type Move,
  type PieceRole,
  type PlayerView,
  type Square,
} from '@mistboard/game';
import { fogPatternDefs, renderBoardSvg, type PieceOnBoard } from '@mistboard/board-render';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type * as cg from 'chessground/types';
import { readEffectiveSoundVolume, soundSettingsChangedEvent } from './theme.js';
import { escapeHtml, isColor, formatClock, oppositeColor, files, ranks, allSquares } from './web-utils.js';
import { intermediateBoard } from './board-anim.js';
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
  type SoundController,
  type SoundKind,
} from './live-state.js';
import { primaryNavItems, utilityNavItems } from './nav-items.js';
import { classifyTimeControl, track } from './analytics.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const promotionRoles: PromotionRole[] = ['queen', 'rook', 'bishop', 'knight'];

// ── Module-scope render-only state ────────────────────────────────────────────

let refs!: LiveRefs;
let sound!: SoundController;
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
let postgameFogEnabled = false;
let playAgainStatus: PlayAgainStatus = 'idle';
let replayIndex: number | null = null;
let lastTrackedStatusType: 'pregame' | 'playing' | 'finished' | null = null;
let playingSinceMs: number | null = null;
let lastRenderedView: PlayerView | null = null;
let lastRenderedReplayIndex: number | null = null;
let lastSoundEventCount: number | null = null;
let lastTerminalSound: string | null = null;
let lastSoundView: PlayerView | null = null;
// Fog-view history: stores server-provided PlayerView at each event count
// during live Fog of War PvP. Replaying from fog-filtered events alone
// would produce broken positions since opponent moves are stripped.
let fogViewHistory: Map<number, PlayerView> = new Map();
let lastCapturedEventCount = 0;

// ── Init ──────────────────────────────────────────────────────────────────────

export function initRender(
  target: HTMLDivElement,
  callbacks: { sendSocket: (payload: unknown) => boolean; reconnectNow: () => void },
): void {
  sendSocket = callbacks.sendSocket;
  reconnectNow = callbacks.reconnectNow;
  fogViewHistory = new Map();
  lastCapturedEventCount = 0;
  lastRenderedView = null;
  lastRenderedReplayIndex = null;
  lastTrackedStatusType = null;
  playingSinceMs = null;
  refs = createLayout(target);
  sound = createSoundController();
}

// ── Layout ────────────────────────────────────────────────────────────────────

export function createLayout(target: HTMLDivElement): LiveRefs {
  target.innerHTML = `
    ${buildNavHtml()}
    <main class="shell${liveState.debugRequested ? ' debug-shell' : ''}">
      <section class="topbar">
        <div>
          ${liveState.debugRequested ? '<h1>Fog Debug</h1>' : ''}
          <p data-room-meta>Connecting</p>
        </div>
        <a data-new-room href="/">New room</a>
      </section>

      <section class="play-grid">
        <section class="board-panel">
          <aside class="side-panel meta-panel" aria-label="Game controls">
            <section class="panel-section">
              <h2>Game</h2>
              <div data-action-status class="action-status"></div>
              <div data-clocks class="clocks"></div>
              <div data-game-info class="game-info"></div>
            </section>
            <section class="panel-section">
              <div data-room-actions class="room-actions"></div>
            </section>
            <section data-game-controls-section class="panel-section" hidden>
              <div data-game-controls class="game-controls"></div>
            </section>
            <section data-bid-section class="panel-section">
              <h2>Bid For White</h2>
              <div data-bid-controls class="bid-controls"></div>
              <div data-bid-status class="selection-list"></div>
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
            <div data-board-status class="board-status">Connecting</div>
            <div data-board class="board" aria-label="chess board"></div>
            <div data-board-result class="board-result" hidden></div>
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
              <button type="button" data-fog-toggle class="fog-toggle" hidden>Fog on</button>
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

  const newRoom = target.querySelector<HTMLAnchorElement>('[data-new-room]');
  const roomMeta = target.querySelector<HTMLParagraphElement>('[data-room-meta]');
  const board = target.querySelector<HTMLDivElement>('[data-board]');
  const boardResult = target.querySelector<HTMLDivElement>('[data-board-result]');
  const boardStatus = target.querySelector<HTMLDivElement>('[data-board-status]');
  const actionStatus = target.querySelector<HTMLDivElement>('[data-action-status]');
  const clocks = target.querySelector<HTMLDivElement>('[data-clocks]');
  const gameInfo = target.querySelector<HTMLDivElement>('[data-game-info]');
  const roomActions = target.querySelector<HTMLDivElement>('[data-room-actions]');
  const devViewsSection = target.querySelector<HTMLElement>('[data-dev-views-section]');
  const devViewsPanel = target.querySelector<HTMLDivElement>('[data-dev-views]');
  const bidControls = target.querySelector<HTMLDivElement>('[data-bid-controls]');
  const bidSection = target.querySelector<HTMLElement>('[data-bid-section]');
  const bidStatus = target.querySelector<HTMLDivElement>('[data-bid-status]');
  const offerSection = target.querySelector<HTMLElement>('[data-offer-section]');
  const draftPicker = target.querySelector<HTMLDivElement>('[data-draft-picker]');
  const promotion = target.querySelector<HTMLDivElement>('[data-promotion]');
  const selectionSection = target.querySelector<HTMLElement>('[data-selection-section]');
  const starts = target.querySelector<HTMLDivElement>('[data-starts]');
  const selectionList = target.querySelector<HTMLDivElement>('[data-selections]');
  const replayMeta = target.querySelector<HTMLParagraphElement>('[data-replay-meta]');
  const replayControls = target.querySelectorAll<HTMLButtonElement>('[data-replay]');
  const fogToggle = target.querySelector<HTMLButtonElement>('[data-fog-toggle]');
  const moveList = target.querySelector<HTMLOListElement>('[data-move-list]');
  const gameControls = target.querySelector<HTMLDivElement>('[data-game-controls]');
  const gameControlsSection = target.querySelector<HTMLElement>('[data-game-controls-section]');

  if (!newRoom || !roomMeta || !board || !boardResult || !boardStatus || !actionStatus || !clocks || !gameInfo || !roomActions || !devViewsSection || !devViewsPanel || !bidControls || !bidSection || !bidStatus || !offerSection || !draftPicker || !promotion || !selectionSection || !starts || !selectionList || !replayMeta || !fogToggle || !moveList || !gameControls || !gameControlsSection) {
    throw new Error('missing app region');
  }

  newRoom.href = '/';

  return {
    board,
    boardResult,
    boardStatus,
    draftPicker,
    actionStatus,
    bidControls,
    bidSection,
    bidStatus,
    clocks,
    devViews: devViewsPanel,
    devViewsSection,
    fogToggle,
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
  const nextOrientation = view?.perspective ?? (liveState.seat === 'black' ? 'black' : 'white');
  orientation = nextOrientation;
  const showDraft = shouldShowDraftControls(view, projection);
  const showPickerOverlay = !liveState.solo && isColor(liveState.seat)
    && view?.status.type === 'pregame'
    && draftOfferForColor(liveState.seat, projection).length > 0;

  refs.roomMeta.innerHTML = roomMetaHtml();
  refs.boardStatus.textContent = boardStatusLabel();
  refs.boardStatus.hidden = view !== null;
  refs.offerSection.hidden = !showDraft || showPickerOverlay;
  refs.selectionSection.hidden = !showDraft;
  refs.bidSection.hidden = view?.variant !== 'bid-for-white';

  renderActionStatus(view);
  renderGameInfo(view);
  renderClocks(view);
  renderRoomActions();
  renderGameControls(view);
  renderDevViews();
  renderBid(view);
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
  const gameSummary = liveState.roomMode === 'pvp'
    ? `${liveState.rated ? 'Rated' : 'Casual'} · Playing as ${seatLabel(liveState.seat)}`
    : `${modeLabel()} · Playing as ${seatLabel(liveState.seat)}`;
  const items = [
    infoItem('Game', gameSummary),
    infoItem('Status', turnLabel(view)),
    infoItem('Connection', connectionLabel()),
  ];
  refs.gameInfo.replaceChildren(...items);
}

// ── Room actions ──────────────────────────────────────────────────────────────

// ── Game controls (resign, etc.) ──────────────────────────────────────────────

const RESIGN_CONFIRM_STORAGE_KEY = 'mistboard.resignConfirm';

function resignConfirmEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(RESIGN_CONFIRM_STORAGE_KEY);
    if (raw === null) return true; // default: confirm
    return raw !== 'false';
  } catch {
    return true;
  }
}

function setResignConfirmEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(RESIGN_CONFIRM_STORAGE_KEY, String(enabled));
  } catch {
    /* localStorage unavailable */
  }
}

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
  button.className = 'resign-button';
  button.textContent = 'Resign';
  button.addEventListener('click', () => { requestResign(); });

  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'resign-toggle';
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = resignConfirmEnabled();
  toggle.addEventListener('change', () => { setResignConfirmEnabled(toggle.checked); });
  toggleLabel.append(toggle, document.createTextNode(' Confirm before resigning'));

  refs.gameControls.replaceChildren(button, toggleLabel);
}

function requestResign(): void {
  if (resignConfirmEnabled()) {
    const ok = window.confirm('Resign this game? Your opponent wins.');
    if (!ok) return;
  }
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

  refs.devViews.append(
    devViewCard('Player view', views.player),
    devViewCard(`${capitalize(views.opponent)} view`, views.opponentView),
    devViewCard('True view', views.truth),
  );
}

function devViewCard(label: string, view: PlayerView): HTMLDivElement {
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

  card.append(title, meta, board);
  return card;
}

// ── Bid ───────────────────────────────────────────────────────────────────────

function renderBid(view: PlayerView | null): void {
  refs.bidControls.replaceChildren();
  refs.bidStatus.replaceChildren();

  if (view?.variant === 'bid-for-white') {
    refs.bidStatus.append(bidNotice(view));
  }

  refs.bidStatus.append(
    selectionItem('Your bid', ownBidLabel()),
    selectionItem('White bid', revealedBidLabel('white')),
    selectionItem('Black bid', revealedBidLabel('black')),
    selectionItem('If you win', bidImpactLabel()),
    selectionItem('Winner', bidWinnerLabel()),
  );

  if (view?.variant !== 'bid-for-white' || view.status.type !== 'pregame' || liveState.seat === 'spectator') return;

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.max = '299';
  input.step = '1';
  const ownSeat = liveState.seat;
  input.value = String(Math.floor((ownSeat === 'white' ? liveState.bids.white ?? 0 : liveState.bids.black ?? 0) / 1000));
  input.setAttribute('aria-label', 'Bid seconds');

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = liveState.bids[ownSeat as Color] === undefined ? 'Submit' : 'Update';
  button.disabled = !isLive();
  button.addEventListener('click', () => {
    const seconds = Number(input.value);
    if (!Number.isFinite(seconds)) return;
    sendSocket({
      type: 'submit-bid',
      bidMs: Math.max(0, Math.round(seconds * 1000)),
    });
  });

  refs.bidControls.append(input, button);
}

function bidNotice(view: PlayerView): HTMLDivElement {
  if (view.status.type !== 'pregame') {
    return infoNotice('success', liveState.bidResolution ? 'Bids revealed. The game is underway.' : 'Game underway.');
  }
  if (liveState.seat === 'spectator') return infoNotice('pending', 'Bids are private until both players submit.');
  if (liveState.bids[liveState.seat as Color] === undefined) return infoNotice('default', 'Enter seconds to give up if you win White.');

  const opponent = oppositeColor(liveState.seat as Color);
  if (liveState.bids[opponent] === undefined) return infoNotice('pending', 'Your bid is hidden. Waiting for the opponent.');
  return infoNotice('pending', 'Resolving bids.');
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
    time.textContent = formatClock(clockRemainingMs(view.clock, color, displayAt));
    row.className = isActive ? 'active' : '';
    row.append(label, time);
    refs.clocks.append(row);
  }
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
  const canInteractWithOwnPieces = isLive()
    && view?.status.type === 'playing'
    && (liveState.solo || ownSeat !== null)
    && pendingPromotion === null;
  const boardIsLive = canInteractWithOwnPieces && moveColor !== null;
  const movableColor = boardIsLive ? moveColor : ownSeat;
  refs.board.classList.toggle('finished-board', view?.status.type === 'finished');
  const config = {
    animation: { enabled: true, duration: 140 },
    autoCastle: true,
    coordinates: false,
    coordinatesOnSquares: false,
    fen: view ? boardFen(view) : '8/8/8/8/8/8/8/8',
    highlight: { custom: hiddenSquareClasses(view), lastMove: true },
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
    applyBoardConfig(ground, config, view);
    maybePlayPremove();
    lastRenderedView = view;
    lastRenderedReplayIndex = replayIndex;
    return;
  }

  ground = Chessground(refs.board, config);
  liveState.ground = ground;
  maybePlayPremove();
  lastRenderedView = view;
  lastRenderedReplayIndex = replayIndex;
}

// Apply the new board config to chessground, using a two-phase render in
// fog-of-war when a new lastMove is visible. See `docs-private/DECISIONS.md`
// → 2026-05-12 fog-aware animation.
function applyBoardConfig(
  api: Api,
  config: NonNullable<Parameters<typeof Chessground>[1]>,
  view: PlayerView | null,
): void {
  // Disable animation when stepping backward through replay. Chessground
  // matches piece types between positions to compute movement vectors; going
  // backward with fog-hidden pieces causes spurious animations (e.g. h7 pawn
  // appearing to animate to g6 when replaying a fog-revealed capture backward).
  if (
    lastRenderedReplayIndex !== null
    && replayIndex !== null
    && replayIndex < lastRenderedReplayIndex
  ) {
    api.set({ ...config, animation: { enabled: false, duration: 0 } });
    return;
  }
  if (!shouldTwoPhaseAnimate(view)) {
    api.set(config);
    return;
  }
  const prev = lastRenderedView!;
  const lastMove = view!.lastMove!;
  const intermediate = intermediateBoard(prev, view!, lastMove);
  api.set({
    ...config,
    animation: { enabled: false, duration: 0 },
    fen: boardFen({ ...view!, board: intermediate }),
    lastMove: undefined,
    highlight: { custom: hiddenSquareClasses(view), lastMove: false },
  });
  api.set(config);
}

function shouldTwoPhaseAnimate(view: PlayerView | null): boolean {
  if (!view || view.variant !== 'fog-of-war') return false;
  if (!lastRenderedView || !view.lastMove) return false;
  // Bail on mode transitions (live ↔ replay) and arbitrary replay jumps.
  const wasLive = lastRenderedReplayIndex === null;
  const isLiveNow = replayIndex === null;
  if (wasLive !== isLiveNow) return false;
  if (!isLiveNow && replayIndex !== (lastRenderedReplayIndex ?? -1) + 1) return false;
  const prevMove = lastRenderedView.lastMove;
  if (prevMove && prevMove.from === view.lastMove.from && prevMove.to === view.lastMove.to) return false;
  return true;
}

function maybePlayPremove(): void {
  if (!ground || activeMoveColor() === null || pendingPromotion !== null) return;
  ground.playPremove();
}

function renderBoardResult(view: PlayerView | null): void {
  refs.boardResult.replaceChildren();
  refs.board.classList.remove('king-celebrating-white', 'king-celebrating-black');

  if (view?.status.type !== 'finished' || !isLive()) {
    refs.boardResult.hidden = true;
    refs.boardResult.classList.remove('board-result--outcome');
    return;
  }

  const winner = view.status.winner;
  const seat = liveState.seat;
  let outcome: 'win' | 'loss' | 'draw';
  let headline: string;
  if (!winner) {
    outcome = 'draw';
    headline = 'Draw';
  } else if (seat === 'white' || seat === 'black') {
    outcome = winner === seat ? 'win' : 'loss';
    headline = outcome === 'win' ? 'You won' : 'You lost';
  } else {
    outcome = 'win';
    headline = resultTitle(winner);
  }

  // Win: skip the overlay, animate the winning king instead
  if (outcome === 'win') {
    refs.boardResult.hidden = true;
    refs.boardResult.classList.remove('board-result--outcome');
    const celebratingColor = winner ?? (seat === 'spectator' ? 'white' : seat);
    refs.board.classList.add(`king-celebrating-${celebratingColor}`);
    return;
  }

  refs.boardResult.hidden = false;
  refs.boardResult.classList.add('board-result--outcome');
  refs.boardResult.dataset.outcome = outcome;

  const badge = document.createElement('div');
  badge.className = 'board-result__badge';
  const title = document.createElement('strong');
  title.textContent = headline;
  const body = document.createElement('span');
  body.textContent = resultReasonLabel(view.status.reason);
  badge.append(title, body);
  refs.boardResult.append(badge);
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

export function hiddenSquareClasses(view: PlayerView | null): cg.SquareClasses {
  const classes = new Map<cg.Key, string>();
  if (!view || view.variant !== 'fog-of-war') return classes;

  const visible = new Set(view.visibleSquares);
  for (const square of allSquares) {
    if (!visible.has(square)) classes.set(square as cg.Key, 'fog-hidden');
  }
  return classes;
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
  sound.play(soundForOwnMove(view, move));
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

export function boardFen(view: PlayerView): string {
  const rankNums = [8, 7, 6, 5, 4, 3, 2, 1];
  return rankNums.map((rank) => boardRankFen(view, rank)).join('/');
}

function boardRankFen(view: PlayerView, rank: number): string {
  let empty = 0;
  let fen = '';

  for (const file of files) {
    const piece = view.board[`${file}${rank}` as Square];
    if (!piece) {
      empty += 1;
      continue;
    }

    if (empty > 0) {
      fen += String(empty);
      empty = 0;
    }
    fen += pieceFen(piece.role, piece.color);
  }

  return empty > 0 ? `${fen}${empty}` : fen;
}

function pieceFen(role: PieceRole, color: Color): string {
  const pieces = {
    bishop: 'b',
    king: 'k',
    knight: 'n',
    pawn: 'p',
    queen: 'q',
    rook: 'r',
  } satisfies Record<PieceRole, string>;
  const piece = pieces[role];
  return color === 'white' ? piece.toUpperCase() : piece;
}

// ── Replay ────────────────────────────────────────────────────────────────────

function renderReplay(): void {
  refs.replayMeta.textContent = replayMetaLabel();
  refs.fogToggle.hidden = !canTogglePostgameFog();
  refs.fogToggle.textContent = 'Fog';
  refs.fogToggle.setAttribute('aria-pressed', postgameFogEnabled ? 'true' : 'false');
  refs.fogToggle.onclick = () => {
    postgameFogEnabled = !postgameFogEnabled;
    render();
  };

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
    item.append(moveListCell(whitePly, 'white', entriesByPly.get(whitePly), masked, visibleColor, plyCount, labelsByEventIndex));
    item.append(moveListCell(blackPly, 'black', entriesByPly.get(blackPly), masked, visibleColor, plyCount, labelsByEventIndex));
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
  if (liveState.state.status.type === 'finished') return postgameFogEnabled && canTogglePostgameFog();
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

function moveListCell(
  ply: number,
  color: Color,
  entry: MoveListEntry | undefined,
  masked: boolean,
  visibleColor: Color | null,
  plyCount: number,
  labelsByEventIndex: Map<number, string>,
): HTMLElement {
  if (ply > plyCount) {
    const empty = document.createElement('span');
    empty.className = `${color}-ply move-empty`;
    return empty;
  }

  const hidden = masked && color !== visibleColor;
  if (!entry || hidden) {
    const placeholder = document.createElement('span');
    placeholder.className = `${color}-ply move-placeholder`;
    placeholder.textContent = '..';
    return placeholder;
  }

  if (masked) {
    const label = document.createElement('span');
    label.className = `${color}-ply move-visible`;
    label.textContent = moveLabel(entry, labelsByEventIndex);
    return label;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = moveLabel(entry, labelsByEventIndex);
  button.className = [
    color === 'white' ? 'white-ply' : 'black-ply',
    replayIndex === entry.eventIndex ? 'active' : '',
  ].filter(Boolean).join(' ');
  button.addEventListener('click', () => {
    replayIndex = entry.eventIndex;
    reconcileInteractionState();
    render();
  });
  return button;
}

function canTogglePostgameFog(): boolean {
  return liveState.state?.variant === 'fog-of-war'
    && liveState.state.status.type === 'finished'
    && liveState.events.some((event) => event.type === 'move-played');
}

function algebraicMoveLabels(): Map<number, string> {
  return buildAlgebraicMoveLabels(liveState.events, liveState.events[0]?.roomId ?? liveState.room);
}

function moveLabel(entry: MoveListEntry, labelsByEventIndex: Map<number, string>): string {
  return labelsByEventIndex.get(entry.eventIndex) ?? coordinateMoveLabel(entry.event.move);
}

function coordinateMoveLabel(move: Move): string {
  const promotion = move.promotion ? `=${pieceLetter(move.promotion)}` : '';
  return `${move.from}${move.to}${promotion}`;
}

function pieceLetter(role: PromotionRole): string {
  const letters: Record<PromotionRole, string> = {
    bishop: 'B',
    knight: 'N',
    queen: 'Q',
    rook: 'R',
  };
  return letters[role];
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
    replayIndex = next === null || next >= liveState.events.length ? null : next;
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
  if (nextIndex === null) return; // returning to live — live sound system handles it
  const effectivePrev = prevIndex ?? liveState.events.length;
  if (nextIndex <= effectivePrev) return; // backward step or no change — no sound
  const eventIndex = nextIndex - 1;
  const event = liveState.events[eventIndex];
  if (!event || event.type !== 'move-played') return;
  sound.play(soundForMove(liveState.events.slice(0, eventIndex), event));
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
  if (action === 'first' || action === 'prev') return previousReplayHistoryIndex(currentIndex, history) === currentIndex;
  return false;
}

function isFogLivePvp(): boolean {
  return liveState.roomMode === 'pvp'
    && liveState.state?.variant === 'fog-of-war'
    && liveState.state?.status.type !== 'finished';
}

function captureFogView(): void {
  if (!isFogLivePvp() || !liveState.state) return;
  if (liveState.events.length <= lastCapturedEventCount) return;
  fogViewHistory.set(liveState.events.length, liveState.state);
  lastCapturedEventCount = liveState.events.length;
}

function replayHistoryIndexes(): number[] {
  if (isFogLivePvp() && fogViewHistory.size > 0) {
    return Array.from(fogViewHistory.keys()).sort((a, b) => a - b);
  }
  const indexes: number[] = [];
  for (const [index, event] of liveState.events.entries()) {
    if (isReplayHistoryEvent(event)) indexes.push(index + 1);
  }
  return indexes;
}

function isReplayHistoryEvent(event: GameEvent): boolean {
  return event.type === 'room-created'
    || event.type === 'draft-start-resolved'
    || event.type === 'bid-resolved'
    || event.type === 'move-played'
    || event.type === 'clock-expired';
}

function previousReplayHistoryIndex(currentIndex: number, history: number[]): number {
  const currentHistoryIndex = latestReplayHistoryIndexAtOrBefore(currentIndex, history);
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const historyIndex = history[index]!;
    if (historyIndex < currentHistoryIndex) return historyIndex;
  }
  return currentHistoryIndex;
}

function nextReplayHistoryIndex(currentIndex: number, history: number[]): number | null {
  for (const historyIndex of history) {
    if (historyIndex > currentIndex) return historyIndex;
  }
  return currentIndex < liveState.events.length ? liveState.events.length : null;
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
  if (liveState.events.length === 0) return null;
  return replayGameEvents(liveState.events.slice(0, currentReplayIndex()));
}

export function currentView(): PlayerView | null {
  const projection = currentProjection();
  const perspective = liveState.seat === 'black' ? 'black' : 'white';
  if (isLive() && (!projection || projection.state.variant !== 'fog-of-war' || projection.state.status.type !== 'finished')) return liveState.state;
  // Historical position during live fog pvp: events are fog-filtered so
  // projection is incomplete — use stored server-provided view instead.
  if (!isLive() && replayIndex !== null && isFogLivePvp()) {
    return fogViewHistory.get(replayIndex) ?? liveState.state;
  }
  if (!projection) return liveState.state;
  const gameFinished = liveState.state?.status.type === 'finished';
  if (projection.state.variant === 'fog-of-war' && gameFinished && !postgameFogEnabled) {
    return fullTruthViewForProjection(projection, perspective);
  }
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
  return replayIndex ?? liveState.events.length;
}

export function isLive(): boolean {
  return replayIndex === null || replayIndex >= liveState.events.length;
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
  const view = currentView();
  const status = view?.status.type === 'playing'
    ? `${capitalize(view.status.turn)} to move`
    : view?.status.type ?? 'connecting';
  const replayLabel = isLive() ? '' : ' · replay';
  return `${escapeHtml(modeLabel())} · <code>${escapeHtml(liveState.room)}</code> · ${liveState.clientCount} connected · ${seatLabel(liveState.seat)} · ${escapeHtml(status)}${replayLabel}`;
}

function replayMetaLabel(): string {
  if (liveState.events.length === 0) return 'No events';
  if (isLive()) return `Live · ${liveState.events.length} events`;
  return `Replay · event ${currentReplayIndex()} of ${liveState.events.length}`;
}

function actionTone(view: PlayerView | null): InfoTone {
  if (liveState.connectionState === 'rejected') return 'danger';
  if (liveState.connectionState === 'displaced') return 'danger';
  if (liveState.connectionState === 'disconnected') return 'danger';
  if (!view || liveState.connectionState === 'connecting' || liveState.connectionState === 'reconnecting') return 'pending';
  if (view.status.type === 'finished') return 'success';
  if (liveState.seat === 'spectator') return 'default';
  if (view.status.type === 'playing' && liveState.roomMode === 'pve' && view.status.turn === 'black') return 'pending';
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
  if (view.status.type === 'playing' && liveState.roomMode === 'pve' && view.status.turn === 'black') return 'Engine thinking';
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
  if (view.status.type === 'playing' && liveState.roomMode === 'pve' && view.status.turn === 'black') {
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

function rejectedBody(): string {
  if (liveState.closeReason === 'private room') return 'This live room is private to the seated players.';
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

function turnLabel(view: PlayerView | null): string {
  if (!view) return 'Connecting';
  if (view.status.type === 'playing') return `${capitalize(view.status.turn)} to move`;
  if (view.status.type === 'finished') return resultTitle(view.status.winner);
  return 'Pregame';
}

function connectionLabel(): string {
  if (liveState.connectionState === 'rejected') return 'Access rejected';
  if (liveState.connectionState === 'displaced') return 'Session moved';
  if (liveState.connectionState === 'connected' && liveState.latencyMs !== null) return `Connected · ${liveState.latencyMs}ms`;
  if (liveState.connectionState === 'reconnecting') return `Reconnecting · attempt ${liveState.reconnectAttempt}`;
  return capitalize(liveState.connectionState);
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

function ownBidLabel(): string {
  if (liveState.seat === 'spectator') return 'none';
  const bid = liveState.bids[liveState.seat as Color];
  return bid === undefined ? 'not submitted' : formatBid(bid);
}

function bidImpactLabel(): string {
  if (liveState.state?.variant !== 'bid-for-white') return 'none';
  if (liveState.seat === 'spectator') return 'hidden';
  if (liveState.bidResolution) return `${liveState.bidResolution.whiteSeat} pays ${formatBid(liveState.bidResolution.winningBidMs)}`;

  const bid = liveState.bids[liveState.seat as Color];
  if (bid === undefined) return 'set a bid';
  return `${formatClock(Math.max(0, 300_000 - bid))} as White`;
}

function revealedBidLabel(color: Color): string {
  if (!liveState.bidResolution && liveState.state?.variant === 'bid-for-white') {
    if (liveState.seat === color && liveState.bids[color] !== undefined) return formatBid(liveState.bids[color]!);
    return liveState.bids[color] === undefined ? 'pending' : 'hidden';
  }
  return liveState.bids[color] === undefined ? 'none' : formatBid(liveState.bids[color]!);
}

function bidWinnerLabel(): string {
  if (liveState.state?.variant !== 'bid-for-white') return 'none';
  if (!liveState.bidResolution) return liveState.state.status.type === 'pregame' ? 'pending' : 'none';
  if (liveState.bidResolution.winner === null) return `tie (${liveState.bidResolution.whiteSeat} gets white)`;
  return `${liveState.bidResolution.winner} bid ${formatBid(liveState.bidResolution.winningBidMs)}`;
}

function formatBid(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}

function selectionLabel(startId: number | null | undefined): string {
  return startId === null || startId === undefined ? 'none' : `#${startId}`;
}

// ── Sound ─────────────────────────────────────────────────────────────────────

export function createSoundController(): SoundController {
  let ctx: AudioContext | null = null;
  let unlocked = false;
  let volume = readEffectiveSoundVolume();

  const ensureContext = (): AudioContext | null => {
    const AudioCtor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AudioCtor) return null;
    ctx ??= new AudioCtor();
    return ctx;
  };

  const unlock = () => {
    const audio = ensureContext();
    if (!audio) return;
    unlocked = true;
    void audio.resume();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };

  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  window.addEventListener(soundSettingsChangedEvent, () => {
    volume = readEffectiveSoundVolume();
  });
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key.startsWith('mistboard.sound')) {
      volume = readEffectiveSoundVolume();
    }
  });

  return {
    play(kind) {
      const audio = ensureContext();
      if (!audio || !unlocked) return;
      if (volume <= 0) return;
      void audio.resume();
      const now = audio.currentTime;
      for (const tone of tonesForSound(kind)) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = tone.type;
        osc.frequency.setValueAtTime(tone.frequency, now + tone.delay);
        gain.gain.setValueAtTime(0.0001, now + tone.delay);
        gain.gain.exponentialRampToValueAtTime(tone.gain * volume, now + tone.delay + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.delay + tone.duration);
        osc.connect(gain).connect(audio.destination);
        osc.start(now + tone.delay);
        osc.stop(now + tone.delay + tone.duration + 0.03);
      }
    },
  };
}

function tonesForSound(kind: SoundKind): Array<{
  delay: number;
  duration: number;
  frequency: number;
  gain: number;
  type: OscillatorType;
}> {
  if (kind === 'capture') return [{ delay: 0, duration: 0.11, frequency: 180, gain: 0.075, type: 'triangle' }];
  if (kind === 'captured') return [{ delay: 0, duration: 0.16, frequency: 120, gain: 0.08, type: 'sawtooth' }];
  if (kind === 'castle') {
    return [
      { delay: 0, duration: 0.1, frequency: 260, gain: 0.055, type: 'square' },
      { delay: 0.08, duration: 0.12, frequency: 390, gain: 0.05, type: 'square' },
    ];
  }
  if (kind === 'win') {
    return [
      { delay: 0, duration: 0.12, frequency: 440, gain: 0.06, type: 'sine' },
      { delay: 0.1, duration: 0.16, frequency: 660, gain: 0.06, type: 'sine' },
      { delay: 0.22, duration: 0.2, frequency: 880, gain: 0.055, type: 'sine' },
    ];
  }
  if (kind === 'lose') {
    return [
      { delay: 0, duration: 0.16, frequency: 220, gain: 0.06, type: 'triangle' },
      { delay: 0.14, duration: 0.24, frequency: 146.8, gain: 0.055, type: 'triangle' },
    ];
  }
  return [{ delay: 0, duration: 0.09, frequency: 320, gain: 0.055, type: 'sine' }];
}

export function maybePlaySnapshotSound(nextEvents: GameEvent[], nextView: PlayerView | null): void {
  if (lastSoundEventCount === null) {
    lastSoundEventCount = nextEvents.length;
    lastTerminalSound = terminalSoundKey(nextEvents, nextView);
    lastSoundView = nextView;
    return;
  }

  const terminal = terminalSoundKey(nextEvents, nextView);
  if (terminal && terminal !== lastTerminalSound) {
    lastTerminalSound = terminal;
    sound.play(terminal.startsWith('win') ? 'win' : 'lose');
    lastSoundEventCount = nextEvents.length;
    lastSoundView = nextView;
    return;
  }

  if (shouldUseRevealedEventSounds(nextView)) {
    playRevealedEventSound(nextEvents);
  } else {
    playSanitizedOpponentSound(lastSoundView, nextView);
  }

  lastSoundEventCount = nextEvents.length;
  lastSoundView = nextView;
}

function shouldUseRevealedEventSounds(nextView: PlayerView | null): boolean {
  return liveState.roomMode === 'eve' || nextView?.status.type === 'finished';
}

function playRevealedEventSound(nextEvents: GameEvent[]): void {
  if (nextEvents.length <= (lastSoundEventCount ?? 0)) return;

  let latestMoveIndex = -1;
  for (let index = nextEvents.length - 1; index >= (lastSoundEventCount ?? 0); index -= 1) {
    if (nextEvents[index]?.type === 'move-played') {
      latestMoveIndex = index;
      break;
    }
  }
  if (latestMoveIndex >= 0) {
    const moveEvent = nextEvents[latestMoveIndex]!;
    if (moveEvent.type === 'move-played') {
      sound.play(soundForMove(nextEvents.slice(0, latestMoveIndex), moveEvent));
    }
  }
}

function soundForMove(beforeEvents: GameEvent[], event: Extract<GameEvent, { type: 'move-played' }>): SoundKind {
  const before = replayGameEvents(beforeEvents).state;
  if (isCastleMoveOnBoard(before.board, event.move, event.color)) return 'castle';
  const captured = before.board[event.move.to];
  if (!captured) return 'move';
  if (captured.color === event.color) return 'move';
  if (liveState.seat !== 'spectator' && captured.color === liveState.seat) return 'captured';
  return 'capture';
}

function playSanitizedOpponentSound(previousView: PlayerView | null, nextView: PlayerView | null): void {
  if (!isColor(liveState.seat) || !previousView || !nextView) return;
  if (previousView.status.type !== 'playing') return;
  if (previousView.status.turn === liveState.seat) return;
  if (nextView.status.type === 'playing' && nextView.status.turn !== liveState.seat) return;

  sound.play(ownPieceCount(nextView, liveState.seat) < ownPieceCount(previousView, liveState.seat) ? 'captured' : 'move');
}

function soundForOwnMove(view: PlayerView | null, move: Move): SoundKind {
  if (!view) return 'move';
  const piece = view.board[move.from];
  if (!piece) return 'move';
  if (isCastleMoveInView(view, move, piece.color)) return 'castle';

  const target = view.board[move.to];
  if (target && target.color !== piece.color) return 'capture';
  if (piece.role === 'pawn' && squareFileIndex(move.from) !== squareFileIndex(move.to)) return 'capture';
  return 'move';
}

function isCastleMoveInView(view: PlayerView, move: Move, color: Color): boolean {
  return isCastleMoveOnBoard(view.board, move, color);
}

function isCastleMoveOnBoard(board: Board, move: Move, color: Color): boolean {
  const piece = board[move.from];
  if (!piece || piece.role !== 'king' || piece.color !== color) return false;
  const target = board[move.to];
  if (target?.role === 'rook' && target.color === color) return true;
  return rankOf(move.from) === rankOf(move.to)
    && Math.abs(squareFileIndex(move.to) - squareFileIndex(move.from)) > 1
    && (move.to[0] === 'c' || move.to[0] === 'g');
}

function ownPieceCount(view: PlayerView, color: Color): number {
  return Object.values(view.board).filter((piece) => piece?.color === color).length;
}

function terminalSoundKey(nextEvents: GameEvent[], nextView: PlayerView | null): string | null {
  const status = nextView?.status ?? replayGameEvents(nextEvents).state.status;
  if (status.type !== 'finished' || liveState.seat === 'spectator' || status.winner === null) return null;
  return status.winner === liveState.seat ? `win:${nextEvents.length}` : `lose:${nextEvents.length}`;
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
