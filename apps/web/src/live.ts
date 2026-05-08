import {
  clockRemainingMs,
  replayGameEvents,
  variantForId,
  type BidResolution,
  type Chess960Start,
  type Color,
  type GameEvent,
  type GameProjection,
  type Move,
  type PieceRole,
  type PlayerView,
  type Square,
} from '@bichess/game';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type * as cg from 'chessground/types';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import './styles.css';

type Seat = Color | 'spectator';
type RoomMode = 'pvp' | 'pve' | 'eve' | 'imported' | 'manual';
type ConnectionState = 'connecting' | 'connected' | 'disconnected';
type PromotionRole = Exclude<PieceRole, 'king' | 'pawn'>;
type PendingPromotion = {
  color: Color;
  from: Square;
  moves: Move[];
  to: Square;
};
type InfoTone = 'danger' | 'default' | 'pending' | 'success';
type DevViews = {
  opponent: Color;
  opponentView: PlayerView;
  player: PlayerView;
  truth: PlayerView;
};
type DebugSnapshot = {
  clientCount: number;
  currentView: PlayerView | null;
  connectionState: ConnectionState;
  devViews: DevViews | null;
  bids: Partial<Record<Color, number>>;
  bidResolution: BidResolution | null;
  events: GameEvent[];
  seat: Seat;
  solo: boolean;
  state: PlayerView | null;
};

declare global {
  interface Window {
    __BICHESS_DEBUG__?: () => DebugSnapshot;
  }
}

type ServerMessage =
  | {
    type: 'hello';
    clientId: string;
    clients: number;
    mode?: RoomMode;
    roomId: string;
    serverAt?: number;
    seat: Seat;
    solo: boolean;
    offer: Chess960Start[];
    bids: Partial<Record<Color, number>>;
    bidResolution: BidResolution | null;
    devViews: DevViews | null;
    events: GameEvent[];
    state: PlayerView;
  }
  | {
    type: 'snapshot';
    roomId: string;
    clients: number;
    mode?: RoomMode;
    serverAt?: number;
    seat: Seat;
    solo: boolean;
    seats: Partial<Record<Color, string>>;
    selections: Partial<Record<Color, number>>;
    bids: Partial<Record<Color, number>>;
    bidResolution: BidResolution | null;
    devViews: DevViews | null;
    resolvedStartId: number | null;
    events: GameEvent[];
    state: PlayerView;
  }
  | { type: 'pong'; at: number };

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const ranks = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const allSquares = ranks.flatMap((rank) => files.map((file) => `${file}${rank}` as Square));
const promotionRoles: PromotionRole[] = ['queen', 'rook', 'bishop', 'knight'];

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('missing #app');
const root = app;

const pageParams = new URLSearchParams(window.location.search);
const pathRoom = roomIdFromPath(window.location.pathname);
const room = pathRoom ?? pageParams.get('room') ?? 'dev-room';
const socketParams = new URLSearchParams({ room });
socketParams.set('client', clientIdForRoom(room));
const soloRequested = pageParams.get('dev') === 'solo';
const engineRequested = pageParams.get('dev') === 'engine' || pageParams.get('engine') === 'random';
const allViewsRequested = pageParams.get('views') === 'all';
const debugRequested = engineRequested || allViewsRequested;
const variantRequested = pageParams.get('variant');
if (pageParams.get('reset') === '1') {
  socketParams.set('reset', '1');
  pageParams.delete('reset');
  const nextSearch = pageParams.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`);
}
if (soloRequested) socketParams.set('dev', 'solo');
if (engineRequested) socketParams.set('dev', 'engine');
if (allViewsRequested) socketParams.set('views', 'all');
if (variantRequested) socketParams.set('variant', variantRequested);
const socket = new WebSocket(`${resolveWebSocketBaseUrl()}?${socketParams}`);
const refs = createLayout(root);

let offer: Chess960Start[] = [];
let clientId = '';
let clientCount = 0;
let connectionState: ConnectionState = 'connecting';
let latencyMs: number | null = null;
let lastServerAt: number | null = null;
let lastSnapshotAt: number | null = null;
let roomMode: RoomMode = engineRequested ? 'pve' : 'pvp';
let seat: Seat = 'spectator';
let solo = soloRequested;
let selections: Partial<Record<Color, number>> = {};
let bids: Partial<Record<Color, number>> = {};
let bidResolution: BidResolution | null = null;
let devViews: DevViews | null = null;
let resolvedStartId: number | null = null;
let state: PlayerView | null = null;
let events: GameEvent[] = [];
let replayIndex: number | null = null;
let orientation: Color = 'white';
let ground: Api | null = null;
let pendingPromotion: PendingPromotion | null = null;
let shareCopyStatus: 'idle' | 'copied' | 'failed' = 'idle';

function resolveWebSocketBaseUrl(): string {
  const configured = import.meta.env.VITE_BICHESS_WS_URL;
  if (configured) return configured.replace(/\?$/, '');
  if (import.meta.env.DEV) return 'ws://localhost:3001';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data) as ServerMessage;
  if (message.type === 'pong') {
    latencyMs = Math.max(0, Date.now() - message.at);
    render();
    return;
  }
  lastSnapshotAt = Date.now();
  if (message.type === 'hello') {
    clientId = message.clientId;
    clientCount = message.clients;
    connectionState = 'connected';
    roomMode = message.mode ?? roomMode;
    lastServerAt = message.serverAt ?? null;
    seat = message.seat;
    solo = message.solo;
    offer = message.offer;
    bids = message.bids;
    bidResolution = message.bidResolution;
    devViews = message.devViews;
    events = message.events;
    state = message.state;
  }
  if (message.type === 'snapshot') {
    clientCount = message.clients;
    connectionState = 'connected';
    roomMode = message.mode ?? roomMode;
    lastServerAt = message.serverAt ?? null;
    seat = message.seat;
    solo = message.solo;
    selections = message.selections;
    bids = message.bids;
    bidResolution = message.bidResolution;
    devViews = message.devViews;
    resolvedStartId = message.resolvedStartId;
    events = message.events;
    state = message.state;
  }
  reconcileInteractionState();
  render();
});

socket.addEventListener('open', () => {
  connectionState = 'connected';
  render();
});

socket.addEventListener('close', () => {
  connectionState = 'disconnected';
  render();
});

socket.addEventListener('error', () => {
  connectionState = 'disconnected';
  render();
});

window.setInterval(() => {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: 'ping' }));
}, 5_000);

window.setInterval(() => {
  const view = currentView();
  if (view?.clock) renderClocks(view);
}, 250);

function createLayout(target: HTMLDivElement) {
  target.innerHTML = `
    <main class="shell${debugRequested ? ' debug-shell' : ''}">
      <section class="topbar">
        <div>
          <h1>${debugRequested ? 'Fog Debug' : 'Bichess'}</h1>
          <p data-room-meta>Connecting</p>
        </div>
        <a data-new-room href="/">New room</a>
      </section>

      <section class="play-grid">
        <section class="board-panel">
          <div class="board-shell">
            <div data-board-status class="board-status">Connecting</div>
            <div data-board class="board" aria-label="chess board"></div>
            <div data-promotion class="promotion-picker" hidden></div>
          </div>
          <aside class="side-panel" aria-label="Game controls">
            <section class="panel-section">
              <h2>Game</h2>
              <div data-action-status class="action-status"></div>
              <div data-clocks class="clocks"></div>
              <div data-game-info class="game-info"></div>
            </section>
            <section class="panel-section">
              <h2>Invite</h2>
              <div data-share-room class="share-room"></div>
            </section>
            <section class="panel-section">
              <h2>Next</h2>
              <div data-room-actions class="room-actions"></div>
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

  const newRoom = target.querySelector<HTMLAnchorElement>('[data-new-room]');
  const roomMeta = target.querySelector<HTMLParagraphElement>('[data-room-meta]');
  const board = target.querySelector<HTMLDivElement>('[data-board]');
  const boardStatus = target.querySelector<HTMLDivElement>('[data-board-status]');
  const actionStatus = target.querySelector<HTMLDivElement>('[data-action-status]');
  const clocks = target.querySelector<HTMLDivElement>('[data-clocks]');
  const gameInfo = target.querySelector<HTMLDivElement>('[data-game-info]');
  const shareRoom = target.querySelector<HTMLDivElement>('[data-share-room]');
  const roomActions = target.querySelector<HTMLDivElement>('[data-room-actions]');
  const devViewsSection = target.querySelector<HTMLElement>('[data-dev-views-section]');
  const devViewsPanel = target.querySelector<HTMLDivElement>('[data-dev-views]');
  const bidControls = target.querySelector<HTMLDivElement>('[data-bid-controls]');
  const bidSection = target.querySelector<HTMLElement>('[data-bid-section]');
  const bidStatus = target.querySelector<HTMLDivElement>('[data-bid-status]');
  const offerSection = target.querySelector<HTMLElement>('[data-offer-section]');
  const promotion = target.querySelector<HTMLDivElement>('[data-promotion]');
  const selectionSection = target.querySelector<HTMLElement>('[data-selection-section]');
  const starts = target.querySelector<HTMLDivElement>('[data-starts]');
  const selectionList = target.querySelector<HTMLDivElement>('[data-selections]');
  const replayMeta = target.querySelector<HTMLParagraphElement>('[data-replay-meta]');
  const replayControls = target.querySelectorAll<HTMLButtonElement>('[data-replay]');
  const moveList = target.querySelector<HTMLOListElement>('[data-move-list]');

  if (!newRoom || !roomMeta || !board || !boardStatus || !actionStatus || !clocks || !gameInfo || !shareRoom || !roomActions || !devViewsSection || !devViewsPanel || !bidControls || !bidSection || !bidStatus || !offerSection || !promotion || !selectionSection || !starts || !selectionList || !replayMeta || !moveList) {
    throw new Error('missing app region');
  }

  newRoom.href = '/play';

  return {
    board,
    boardStatus,
    actionStatus,
    bidControls,
    bidSection,
    bidStatus,
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
    shareRoom,
    roomMeta,
    selectionList,
    starts,
  };
}

function render(): void {
  const view = currentView();
  const projection = currentProjection();
  const nextOrientation = view?.perspective ?? (seat === 'black' ? 'black' : 'white');
  orientation = nextOrientation;

  refs.roomMeta.innerHTML = roomMetaHtml();
  refs.boardStatus.textContent = boardStatusLabel();
  refs.boardStatus.hidden = view !== null;
  refs.offerSection.hidden = view?.variant !== 'draft960';
  refs.selectionSection.hidden = view?.variant !== 'draft960';
  refs.bidSection.hidden = view?.variant !== 'bid-for-white';

  renderActionStatus(view);
  renderGameInfo(view);
  renderClocks(view);
  renderShareRoom();
  renderRoomActions();
  renderDevViews();
  renderBid(view);
  renderOffer(projection);
  renderSelections(projection);
  renderReplay();
  renderBoard(view);
  renderPromotion();
}

function renderOffer(projection: GameProjection | null): void {
  refs.starts.replaceChildren();
  const view = currentView();

  for (const start of offer) {
    const row = document.createElement('div');
    row.className = 'start-row';

    const button = document.createElement('button');
    const selected = projection?.selections[pickColorForSeat()] === start.id;
    const resolved = projection?.resolvedStartId === start.id;
    button.type = 'button';
    button.className = ['start-card', selected ? 'selected' : '', resolved ? 'resolved' : ''].filter(Boolean).join(' ');
    button.disabled = !isLive() || view?.status.type !== 'pregame' || seat === 'spectator';
    button.dataset.start = String(start.id);
    button.addEventListener('click', () => {
      socket.send(JSON.stringify({ type: 'select-start', startId: start.id }));
    });

    const id = document.createElement('strong');
    id.textContent = `#${start.id}`;
    const placement = document.createElement('span');
    placement.textContent = start.fenPlacement.toUpperCase();
    button.append(id, placement);
    row.append(button);

    if (solo) {
      const soloActions = document.createElement('div');
      soloActions.className = 'solo-picks';
      soloActions.append(
        soloPickButton('White', 'white', start.id, projection),
        soloPickButton('Black', 'black', start.id, projection),
      );
      row.append(soloActions);
    }

    refs.starts.append(row);
  }
}

function soloPickButton(label: string, color: Color, startId: number, projection: GameProjection | null): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.className = projection?.selections[color] === startId ? 'selected' : '';
  button.disabled = !isLive() || currentView()?.status.type !== 'pregame';
  button.addEventListener('click', () => {
    socket.send(JSON.stringify({ type: 'select-start', color, startId }));
  });
  return button;
}

function renderSelections(projection: GameProjection | null): void {
  refs.selectionList.replaceChildren(
    selectionItem('White', projection?.selections.white),
    selectionItem('Black', projection?.selections.black),
    selectionItem('Resolved', projection?.resolvedStartId),
  );
}

function renderActionStatus(view: PlayerView | null): void {
  refs.actionStatus.replaceChildren();
  const notice = document.createElement('div');
  const tone = actionTone(view);
  notice.className = `action-notice ${tone}`;

  const title = document.createElement('strong');
  title.textContent = actionTitle(view);
  const body = document.createElement('span');
  body.textContent = actionBody(view);
  notice.append(title, body);

  if (view?.status.type === 'finished') {
    const review = document.createElement('a');
    review.href = `/game/${encodeURIComponent(room)}`;
    review.textContent = 'Review game';
    notice.append(review);
  }

  refs.actionStatus.append(notice);
}

function renderGameInfo(view: PlayerView | null): void {
  refs.gameInfo.replaceChildren(
    infoItem('Mode', modeLabel()),
    infoItem('Seat', seatLabel(seat)),
    infoItem('Turn', turnLabel(view)),
    infoItem('Connection', connectionLabel()),
    infoItem('Server', serverTimeLabel()),
    infoItem('Clients', String(clientCount)),
  );
}

function renderRoomActions(): void {
  const actions = [roomAction('Back to Play', '/play')];
  if (currentView()?.status.type === 'finished') {
    actions.unshift(roomAction('Review game', `/game/${encodeURIComponent(room)}`, 'primary'));
  }
  if (engineRequested) actions.push(roomAction('New Debug Room', 'fog-of-war', 'engine'));
  refs.roomActions.replaceChildren(...actions);
}

function renderShareRoom(): void {
  refs.shareRoom.replaceChildren();

  const input = document.createElement('input');
  input.type = 'url';
  input.readOnly = true;
  input.value = shareRoomUrl();
  input.setAttribute('aria-label', 'Room link');

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = shareCopyStatus === 'copied'
    ? 'Copied'
    : shareCopyStatus === 'failed'
      ? 'Copy Failed'
      : 'Copy Link';
  button.addEventListener('click', () => copyShareLink(input));

  refs.shareRoom.append(input, button);
}

function roomAction(label: string, href: string, toneOrDev?: 'primary' | 'engine'): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = toneOrDev === 'engine' ? roomUrl('fog-of-war', 'engine') : href;
  if (toneOrDev === 'primary') link.className = 'primary';
  link.textContent = label;
  return link;
}

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

  if (view?.variant !== 'bid-for-white' || view.status.type !== 'pregame' || seat === 'spectator') return;

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.max = '299';
  input.step = '1';
  input.value = String(Math.floor((seat === 'white' ? bids.white ?? 0 : bids.black ?? 0) / 1000));
  input.setAttribute('aria-label', 'Bid seconds');

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = bids[seat] === undefined ? 'Submit' : 'Update';
  button.disabled = !isLive();
  button.addEventListener('click', () => {
    const seconds = Number(input.value);
    if (!Number.isFinite(seconds)) return;
    socket.send(JSON.stringify({
      type: 'submit-bid',
      bidMs: Math.max(0, Math.round(seconds * 1000)),
    }));
  });

  refs.bidControls.append(input, button);
}

function bidNotice(view: PlayerView): HTMLDivElement {
  if (view.status.type !== 'pregame') {
    return infoNotice('success', bidResolution ? 'Bids revealed. The game is underway.' : 'Game underway.');
  }
  if (seat === 'spectator') return infoNotice('pending', 'Bids are private until both players submit.');
  if (bids[seat] === undefined) return infoNotice('default', 'Enter seconds to give up if you win White.');

  const opponent = oppositeColor(seat);
  if (bids[opponent] === undefined) return infoNotice('pending', 'Your bid is hidden. Waiting for the opponent.');
  return infoNotice('pending', 'Resolving bids.');
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

function renderClocks(view: PlayerView | null): void {
  refs.clocks.replaceChildren();
  if (!view?.clock) {
    refs.clocks.append(infoNotice('default', 'Server clock will appear here when time controls are active.'));
    return;
  }

  const displayAt = isLive() ? Date.now() : view.clock.runningSince ?? Date.now();
  const colors: Color[] = view.perspective === 'white' ? ['black', 'white'] : ['white', 'black'];
  for (const color of colors) {
    const row = document.createElement('div');
    const label = document.createElement('span');
    const time = document.createElement('strong');
    label.textContent = `${capitalize(color)}${view.clock.activeColor === color && view.status.type === 'playing' ? ' clock' : ''}`;
    time.textContent = formatClock(clockRemainingMs(view.clock, color, displayAt));
    row.className = view.clock.activeColor === color && view.status.type === 'playing' ? 'active' : '';
    row.append(label, time);
    refs.clocks.append(row);
  }
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

function renderBoard(view: PlayerView | null): void {
  const moveColor = activeMoveColor();
  const boardIsLive = isLive() && view?.status.type === 'playing' && moveColor !== null && pendingPromotion === null;
  const config = {
    animation: { enabled: true, duration: 140 },
    autoCastle: true,
    coordinates: false,
    coordinatesOnSquares: false,
    fen: view ? boardFen(view) : '8/8/8/8/8/8/8/8',
    highlight: { custom: hiddenSquareClasses(view), lastMove: true },
    lastMove: view?.lastMove ? ([view.lastMove.from, view.lastMove.to] as cg.Key[]) : undefined,
    movable: {
      color: moveColor ?? undefined,
      dests: view ? legalDests(view) : new Map<cg.Key, cg.Key[]>(),
      free: false,
      rookCastle: true,
      showDests: true,
      events: {
        after: (from: cg.Key, to: cg.Key) => sendBoardMove(from, to),
      },
    },
    orientation,
    premovable: { enabled: false },
    selectable: { enabled: boardIsLive },
    draggable: { enabled: boardIsLive, showGhost: true },
    turnColor: view?.status.type === 'playing' ? view.status.turn : undefined,
    // Keep chessground interactive at the wrapper level so later live snapshots
    // can enable movement without rebuilding the board and losing resize state.
    viewOnly: false,
  } satisfies Parameters<typeof Chessground>[1];

  if (ground) {
    ground.set(config);
    return;
  }

  ground = Chessground(refs.board, config);
}

function reconcileInteractionState(): void {
  const view = currentView();
  if (!isLive() || !view || view.status.type !== 'playing') {
    pendingPromotion = null;
    ground?.cancelMove();
    return;
  }

  if (pendingPromotion && !promotionMovesFor(pendingPromotion.from, pendingPromotion.to).length) {
    pendingPromotion = null;
    ground?.cancelMove();
  }
}

function legalDests(view: PlayerView): cg.Dests {
  const dests = new Map<cg.Key, cg.Key[]>();
  for (const move of view.legalMoves) {
    const from = move.from as cg.Key;
    const to = move.to as cg.Key;
    dests.set(from, [...(dests.get(from) ?? []), to]);
  }
  return dests;
}

function hiddenSquareClasses(view: PlayerView | null): cg.SquareClasses {
  const classes = new Map<cg.Key, string>();
  if (!view || view.variant !== 'fog-of-war' || view.status.type === 'finished') return classes;

  const visible = new Set(view.visibleSquares);
  for (const square of allSquares) {
    if (!visible.has(square)) classes.set(square as cg.Key, 'fog-hidden');
  }
  return classes;
}

function sendBoardMove(from: cg.Key, to: cg.Key): void {
  const fromSquare = from as Square;
  const toSquare = to as Square;
  const promotions = promotionMovesFor(fromSquare, toSquare);
  if (promotions.length > 1) {
    pendingPromotion = {
      color: currentView()?.board[fromSquare]?.color ?? activeMoveColor() ?? 'white',
      from: fromSquare,
      moves: promotions,
      to: toSquare,
    };
    renderBoard(currentView());
    renderPromotion();
    return;
  }

  const move = promotions[0] ?? bestMove(fromSquare, toSquare);
  if (!move) {
    renderBoard(currentView());
    return;
  }
  socket.send(JSON.stringify({ type: 'move', ...move }));
}

function bestMove(from: Square, to: Square) {
  return movesFor(from, to)[0];
}

function promotionMovesFor(from: Square, to: Square): Move[] {
  return movesFor(from, to).filter((move) => move.promotion);
}

function movesFor(from: Square, to: Square): Move[] {
  return currentView()?.legalMoves.filter((move) => move.from === from && move.to === to) ?? [];
}

function renderPromotion(): void {
  refs.promotion.replaceChildren();
  refs.promotion.hidden = pendingPromotion === null;
  if (!pendingPromotion) return;

  refs.promotion.className = `promotion-picker ${pendingPromotion.color}`;
  for (const role of promotionRoles) {
    const move = pendingPromotion.moves.find((candidate) => candidate.promotion === role);
    if (!move) continue;

    const button = document.createElement('button');
    button.type = 'button';
    button.title = role;
    button.setAttribute('aria-label', `Promote to ${role}`);
    button.append(promotionLabel(role, pendingPromotion.color));
    button.addEventListener('click', () => {
      pendingPromotion = null;
      refs.promotion.hidden = true;
      socket.send(JSON.stringify({ type: 'move', ...move }));
    });
    refs.promotion.append(button);
  }
}

function promotionLabel(role: PromotionRole, color: Color): HTMLSpanElement {
  const label = document.createElement('span');
  label.className = `promotion-piece ${color}`;
  label.textContent = pieceGlyph(role, color);
  return label;
}

function pieceGlyph(role: PromotionRole, color: Color): string {
  const labels = {
    white: {
      bishop: '♗',
      knight: '♘',
      queen: '♕',
      rook: '♖',
    },
    black: {
      bishop: '♝',
      knight: '♞',
      queen: '♛',
      rook: '♜',
    },
  } satisfies Record<Color, Record<PromotionRole, string>>;
  return labels[color][role];
}

function boardFen(view: PlayerView): string {
  const ranks = [8, 7, 6, 5, 4, 3, 2, 1];
  return ranks.map((rank) => boardRankFen(view, rank)).join('/');
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

function renderReplay(): void {
  refs.replayMeta.textContent = replayMetaLabel();
  for (const control of refs.replayControls) {
    control.disabled = replayControlDisabled(control.dataset.replay ?? '');
    control.onclick = () => {
      applyReplayControl(control.dataset.replay ?? '');
      reconcileInteractionState();
      render();
    };
  }

  refs.moveList.replaceChildren();
  events.forEach((event, index) => {
    if (event.type !== 'move-played') return;
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${event.move.from}-${event.move.to}`;
    button.className = replayIndex === index + 1 ? 'active' : '';
    button.addEventListener('click', () => {
      replayIndex = index + 1;
      reconcileInteractionState();
      render();
    });
    item.append(button);
    refs.moveList.append(item);
  });
}

function applyReplayControl(action: string): void {
  if (action === 'latest') {
    replayIndex = null;
    return;
  }

  const currentIndex = currentReplayIndex();
  if (action === 'first') replayIndex = Math.min(events.length, 1);
  if (action === 'prev') replayIndex = Math.max(1, currentIndex - 1);
  if (action === 'next') {
    const next = Math.min(events.length, currentIndex + 1);
    replayIndex = next === events.length ? null : next;
  }
}

function replayControlDisabled(action: string): boolean {
  if (events.length <= 1) return action !== 'latest';
  const currentIndex = currentReplayIndex();
  if (action === 'latest') return isLive();
  if (action === 'next') return isLive();
  if (action === 'first' || action === 'prev') return currentIndex <= 1;
  return false;
}

function currentProjection(): GameProjection | null {
  if (events.length === 0) return null;
  return replayGameEvents(events.slice(0, currentReplayIndex()));
}

function currentView(): PlayerView | null {
  if (isLive()) return state;
  const projection = currentProjection();
  if (!projection) return state;
  const perspective = seat === 'black' ? 'black' : 'white';
  if (projection.state.variant === 'fog-of-war' && projection.state.status.type === 'finished') {
    return fullTruthViewForProjection(projection, perspective);
  }
  return viewForProjection(projection, perspective);
}

function currentDevViews(): DevViews | null {
  if (!devViews) return null;
  if (isLive()) return devViews;

  const projection = currentProjection();
  if (!projection || projection.state.variant !== 'fog-of-war') return devViews;

  const perspective = seat === 'black' ? 'black' : 'white';
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
  return replayIndex ?? events.length;
}

function isLive(): boolean {
  return replayIndex === null || replayIndex >= events.length;
}

function activeMoveColor(): Color | null {
  const status = currentView()?.status;
  if (status?.type !== 'playing') return null;
  if (solo) return status.turn;
  return seat === status.turn ? seat : null;
}

function viewForProjection(projection: GameProjection, perspective: Color): PlayerView {
  const variant = variantForId(projection.state.variant);
  const view = variant.getPlayerView(projection.state, perspective);
  if (!solo || projection.state.status.type !== 'playing') return view;
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

window.__BICHESS_DEBUG__ = () => ({
  bids,
  bidResolution,
  clientCount,
  connectionState,
  currentView: currentView(),
  devViews: currentDevViews(),
  events,
  seat,
  solo,
  state,
});

function replayMetaLabel(): string {
  if (events.length === 0) return 'No events';
  if (isLive()) return `Live · ${events.length} events`;
  return `Replay · event ${currentReplayIndex()} of ${events.length}`;
}

function actionTone(view: PlayerView | null): InfoTone {
  if (connectionState === 'disconnected') return 'danger';
  if (!view || connectionState === 'connecting') return 'pending';
  if (view.status.type === 'finished') return 'success';
  if (seat === 'spectator') return 'default';
  if (view.status.type === 'playing' && roomMode === 'pve' && view.status.turn === 'black') return 'pending';
  if (view.status.type === 'playing' && view.status.turn === seat) return 'success';
  return 'default';
}

function actionTitle(view: PlayerView | null): string {
  if (connectionState === 'disconnected') return 'Reconnecting';
  if (!view || connectionState === 'connecting') return 'Connecting';
  if (view.status.type === 'finished') return resultTitle(view.status.winner);
  if (seat === 'spectator') return 'Watching';
  if (view.status.type === 'pregame') return roomMode === 'pvp' ? 'Waiting for opponent' : 'Preparing game';
  if (view.status.type === 'playing' && roomMode === 'pve' && view.status.turn === 'black') return 'Engine thinking';
  if (view.status.type === 'playing' && view.status.turn === seat) return 'Your move';
  return 'Opponent move';
}

function actionBody(view: PlayerView | null): string {
  if (connectionState === 'disconnected') return 'The socket is closed. Refresh if it does not recover.';
  if (!view || connectionState === 'connecting') return 'Opening the room and loading the current server state.';
  if (view.status.type === 'finished') {
    return `Board is fully revealed. ${resultReasonLabel(view.status.reason)}.`;
  }
  if (seat === 'spectator') return spectatorBody(view);
  if (view.status.type === 'pregame') return 'Share the room link when you are ready.';
  if (view.status.type === 'playing' && roomMode === 'pve' && view.status.turn === 'black') {
    return 'The engine has the move. Your clock is not active.';
  }
  if (view.status.type === 'playing' && view.status.turn === seat) {
    return 'Move one of your visible pieces on the board.';
  }
  return `${capitalize(view.status.turn)} is on move.`;
}

function spectatorBody(view: PlayerView): string {
  if (view.status.type === 'finished') return 'Review the fully revealed final position.';
  if (clientCount < 3 && roomMode === 'pvp') return 'Waiting for both player seats to be filled.';
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

function modeLabel(): string {
  if (solo) return 'Solo dev';
  if (roomMode === 'pve') return 'Play engine';
  if (roomMode === 'pvp') return 'Friend challenge';
  if (roomMode === 'eve') return 'Engine game';
  return capitalize(roomMode);
}

function turnLabel(view: PlayerView | null): string {
  if (!view) return 'Connecting';
  if (view.status.type === 'playing') return `${capitalize(view.status.turn)} to move`;
  if (view.status.type === 'finished') return resultTitle(view.status.winner);
  return 'Pregame';
}

function connectionLabel(): string {
  if (connectionState === 'connected' && latencyMs !== null) return `Connected · ${latencyMs}ms`;
  return capitalize(connectionState);
}

function serverTimeLabel(): string {
  if (!lastServerAt || !lastSnapshotAt) return 'Waiting';
  const ageSeconds = Math.max(0, Math.round((Date.now() - lastSnapshotAt) / 1000));
  const label = ageSeconds <= 1 ? 'just now' : `${ageSeconds}s ago`;
  return `Snapshot ${label}`;
}

function formatClock(ms: number): string {
  const bounded = Math.max(0, ms);
  const totalSeconds = Math.ceil(bounded / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function seatLabel(value: Seat): string {
  if (solo) return 'Solo dev';
  if (value === 'spectator') return 'Spectator';
  return capitalize(value);
}

function ownBidLabel(): string {
  if (seat === 'spectator') return 'none';
  const bid = bids[seat];
  return bid === undefined ? 'not submitted' : formatBid(bid);
}

function bidImpactLabel(): string {
  if (state?.variant !== 'bid-for-white') return 'none';
  if (seat === 'spectator') return 'hidden';
  if (bidResolution) return `${bidResolution.whiteSeat} pays ${formatBid(bidResolution.winningBidMs)}`;

  const bid = bids[seat];
  if (bid === undefined) return 'set a bid';
  return `${formatClock(Math.max(0, 300_000 - bid))} as White`;
}

function revealedBidLabel(color: Color): string {
  if (!bidResolution && state?.variant === 'bid-for-white') {
    if (seat === color && bids[color] !== undefined) return formatBid(bids[color]);
    return bids[color] === undefined ? 'pending' : 'hidden';
  }
  return bids[color] === undefined ? 'none' : formatBid(bids[color]);
}

function bidWinnerLabel(): string {
  if (state?.variant !== 'bid-for-white') return 'none';
  if (!bidResolution) return state.status.type === 'pregame' ? 'pending' : 'none';
  if (bidResolution.winner === null) return `tie (${bidResolution.whiteSeat} gets white)`;
  return `${bidResolution.winner} bid ${formatBid(bidResolution.winningBidMs)}`;
}

function formatBid(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}

function oppositeColor(color: Color): Color {
  return color === 'white' ? 'black' : 'white';
}

function selectionLabel(startId: number | null | undefined): string {
  return startId === null || startId === undefined ? 'none' : `#${startId}`;
}

function roomMetaHtml(): string {
  const view = currentView();
  const status = view?.status.type === 'playing'
    ? `${capitalize(view.status.turn)} to move`
    : view?.status.type ?? 'connecting';
  const replayLabel = isLive() ? '' : ' · replay';
  return `${escapeHtml(modeLabel())} · <code>${escapeHtml(room)}</code> · ${clientCount} connected · ${seatLabel(seat)} · ${escapeHtml(status)}${replayLabel}`;
}

function pickColorForSeat(): Color {
  return seat === 'black' ? 'black' : 'white';
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

function shareRoomUrl(): string {
  if (pathRoom) return `${window.location.origin}/room/${encodeURIComponent(room)}`;

  const params = new URLSearchParams({ room });
  const variant = currentView()?.variant ?? state?.variant ?? variantRequested ?? 'fog-of-war';
  params.set('variant', variant);
  if (engineRequested) params.set('dev', 'engine');
  if (allViewsRequested) params.set('views', 'all');
  return `${window.location.origin}${window.location.pathname}?${params}`;
}

function roomIdFromPath(pathname: string): string | null {
  const match = pathname.replace(/\/+$/, '').match(/^\/room\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

function clientIdForRoom(roomId: string): string {
  const key = `bichess.client.${roomId}`;
  const existing = readLocalStorage(key);
  if (existing && /^[a-zA-Z0-9:_-]{8,80}$/.test(existing)) return existing;
  const next = window.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
  writeLocalStorage(key, next);
  return next;
}

function readLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The room still works without seat recovery if storage is unavailable.
  }
}

async function copyShareLink(input: HTMLInputElement): Promise<void> {
  const url = input.value;
  try {
    await navigator.clipboard.writeText(url);
    shareCopyStatus = 'copied';
  } catch {
    input.select();
    shareCopyStatus = document.execCommand('copy') ? 'copied' : 'failed';
  }
  renderShareRoom();
  window.setTimeout(() => {
    if (shareCopyStatus === 'idle') return;
    shareCopyStatus = 'idle';
    renderShareRoom();
  }, 1600);
}

function boardStatusLabel(): string {
  if (connectionState === 'disconnected') return 'Reconnecting';
  return clientId ? 'Waiting for board' : 'Connecting';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function pieceGlyphForRole(role: PieceRole, color: Color): string {
  const labels = {
    white: {
      bishop: '♗',
      king: '♔',
      knight: '♘',
      pawn: '♙',
      queen: '♕',
      rook: '♖',
    },
    black: {
      bishop: '♝',
      king: '♚',
      knight: '♞',
      pawn: '♟',
      queen: '♛',
      rook: '♜',
    },
  } satisfies Record<Color, Record<PieceRole, string>>;
  return labels[color][role];
}

function fileOrdinal(file: typeof files[number]): number {
  return files.indexOf(file);
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

render();
