// Live multiplayer room client for perfect-information Dual Chess (中西象棋).
//
// Deliberately a self-contained sibling of the shared chess/DMX live room
// (apps/web/src/live.ts), NOT woven into it. Perfect-information is the lighter
// tenant — no fog, no per-seat redaction — so this client renders the server's
// open PlayerView directly and never touches the fog-critical shared shell.
// It reuses only the variant-agnostic seat-token / ws-url helpers from
// live-state.ts so a returning player's seat token still resolves.
//
// Wire protocol locked by server-ws-dual-chess.test.ts: hello / snapshot carry
// the full open view + events; event-appended is the steady-state delta. The
// server re-validates every move, so the client can be optimistic about input.

import type {
  DualChessColor,
  DualChessMove,
  DualChessPlayerView,
  DualChessSquare,
} from '@mistboard/game';
import './live-dual-chess.css';
import { renderDualChessBoardSvg } from './dual-chess-render.js';
import { roomIdFromPath } from './live-room-bootstrap.js';
import {
  clearSeatTokenForRoom,
  clientIdForRoom,
  resolveWebSocketBaseUrl,
  seatTokenForRoom,
  writeSeatTokenForRoom,
} from './live-state.js';
import { buildNav } from './site-shell.js';

// ── Wire shapes (the subset this client consumes) ───────────────────────────

type DualLiveClock = {
  activeColor: DualChessColor | null;
  incrementMs: number;
  initialMs: number;
  remainingMs: Record<DualChessColor, number>;
  runningSince: number | null;
};

type DualMovePlayed = {
  type: 'move-played';
  color: DualChessColor;
  move: DualChessMove;
  ply?: number;
};
type DualLiveEvent = DualMovePlayed | { type: string };

type DualLiveFrame = {
  type: 'hello' | 'snapshot' | 'event-appended';
  clientId?: string;
  seatToken?: string;
  seat: DualChessColor | 'spectator';
  seats: Partial<Record<DualChessColor, string>>;
  state: DualChessPlayerView;
  clock?: DualLiveClock | null;
  connectedSeats?: Record<DualChessColor, boolean>;
  abortDeadline?: number | null;
  forfeitDeadline?: number | null;
  timeControl?: { initialMs: number; incrementMs: number } | null;
  clients?: number;
  events?: DualLiveEvent[];
  event?: DualLiveEvent;
  seq?: number;
};

type DualServerMessage = DualLiveFrame | { type: 'pong'; at: number; serverAt?: number };

type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'displaced' | 'rejected';

// ── Module state ─────────────────────────────────────────────────────────────

const state = {
  room: '',
  socketUrl: '',
  clientId: '',
  seat: null as DualChessColor | 'spectator' | null,
  view: null as DualChessPlayerView | null,
  clock: null as DualLiveClock | null,
  seats: {} as Partial<Record<DualChessColor, string>>,
  connectedSeats: { white: false, red: false } as Record<DualChessColor, boolean>,
  moves: [] as DualMovePlayed[],
  selected: null as DualChessSquare | null,
  connection: 'connecting' as ConnectionState,
  closeReason: '',
};

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempt = 0;
let lastSeq: number | null = null;
let boardHost: HTMLElement | null = null;
let sideHost: HTMLElement | null = null;

// ── Entry point ──────────────────────────────────────────────────────────────

export function bootstrapDualChessLiveRoom(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('missing #app');

  const params = new URLSearchParams(window.location.search);
  const room = roomIdFromPath(window.location.pathname) ?? params.get('room') ?? 'dchess_dev';
  state.room = room;

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

  const socketParams = new URLSearchParams({ room });
  socketParams.set('client', clientIdForRoom(room));
  state.socketUrl = `${resolveWebSocketBaseUrl()}?${socketParams}`;

  app.before(buildNav());
  const page = document.createElement('main');
  page.className = 'dual-live-page';
  page.innerHTML = `
    <div class="dual-live-head">
      <h1>Dual Chess</h1>
      <div class="dual-live-tagline">Perfect information · live</div>
    </div>
    <div class="dual-live-layout">
      <div class="dual-live-board" data-board></div>
      <aside class="dual-live-side" data-side></aside>
    </div>`;
  app.replaceChildren(page);
  boardHost = page.querySelector<HTMLElement>('[data-board]');
  sideHost = page.querySelector<HTMLElement>('[data-side]');

  boardHost?.addEventListener('click', onBoardClick);

  connect();
  window.setInterval(() => send({ type: 'ping', at: Date.now() }), 5_000);
  window.setInterval(tickClocks, 250);
  renderAll();
}

// ── Socket ───────────────────────────────────────────────────────────────────

function connect(): void {
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.removeEventListener('message', onMessage);
    socket.close();
    socket = null;
  }
  state.connection = state.clientId ? 'reconnecting' : 'connecting';
  renderSide();

  const token = seatTokenForRoom(state.room);
  const next = token
    ? new WebSocket(state.socketUrl, [`mistboard-seat.${token}`])
    : new WebSocket(state.socketUrl);
  socket = next;
  next.addEventListener('message', onMessage);
  next.addEventListener('open', () => {
    if (socket !== next) return;
    reconnectAttempt = 0;
    state.connection = 'connected';
    renderSide();
  });
  next.addEventListener('close', (event) => {
    if (socket !== next) return;
    state.closeReason = event.reason;
    if (event.code === 4000 && event.reason === 'duplicate session') {
      state.connection = 'displaced';
      socket = null;
      renderSide();
      return;
    }
    if (event.code === 1008) {
      state.connection = 'rejected';
      socket = null;
      renderSide();
      return;
    }
    state.connection = 'reconnecting';
    renderSide();
    scheduleReconnect();
  });
  next.addEventListener('error', () => {
    if (socket !== next) return;
    state.connection = 'reconnecting';
    renderSide();
  });
}

function scheduleReconnect(): void {
  if (state.connection === 'displaced' || state.connection === 'rejected') return;
  if (reconnectTimer) return;
  reconnectAttempt += 1;
  const delay = Math.min(10_000, 750 * 2 ** Math.min(reconnectAttempt - 1, 4));
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function send(payload: unknown): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(payload));
  return true;
}

function onMessage(event: MessageEvent<string>): void {
  const message = JSON.parse(event.data) as DualServerMessage;
  if (message.type === 'pong') return;

  if (message.type === 'hello') {
    state.clientId = message.clientId ?? state.clientId;
    if (message.seatToken && (message.seat === 'white' || message.seat === 'red')) {
      writeSeatTokenForRoom(state.room, { seat: message.seat, token: message.seatToken });
    }
    applyFrame(message);
    state.moves = movesFromEvents(message.events ?? []);
    lastSeq = null;
  } else if (message.type === 'snapshot') {
    applyFrame(message);
    state.moves = movesFromEvents(message.events ?? []);
    lastSeq = null;
  } else if (message.type === 'event-appended') {
    // Gap detection: a missed delta means resync from a fresh snapshot.
    if (lastSeq !== null && message.seq !== undefined && message.seq !== lastSeq + 1) {
      send({ type: 'snapshot:request' });
      return;
    }
    applyFrame(message);
    if (message.event?.type === 'move-played') state.moves.push(message.event as DualMovePlayed);
    if (message.seq !== undefined) lastSeq = message.seq;
  }
  renderAll();
}

function applyFrame(frame: DualLiveFrame): void {
  state.connection = 'connected';
  state.seat = frame.seat;
  state.view = frame.state;
  state.clock = frame.clock ?? null;
  state.seats = frame.seats ?? state.seats;
  if (frame.connectedSeats) state.connectedSeats = frame.connectedSeats;
  // A fresh frame supersedes the local selection only when the game state moved
  // on (someone played); keep the selection otherwise so a re-render mid-pick
  // doesn't drop it.
}

function movesFromEvents(events: DualLiveEvent[]): DualMovePlayed[] {
  return events.filter((event): event is DualMovePlayed => event.type === 'move-played');
}

// ── Interaction ──────────────────────────────────────────────────────────────

function onBoardClick(event: MouseEvent): void {
  const view = state.view;
  if (!view) return;
  if (!iAmPlayer() || !isMyTurn()) return;
  const target = (event.target as HTMLElement | null)?.closest('[data-square]');
  if (!target) return;
  const square = target.getAttribute('data-square') as DualChessSquare | null;
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
    send({ type: 'move', from: state.selected, to: square });
    state.selected = null;
    renderBoard();
    return;
  }
  // Clicked elsewhere: reselect if the new square has moves, else clear.
  state.selected = legalTargets(square).length > 0 ? square : null;
  renderBoard();
}

function legalTargets(from: DualChessSquare): DualChessSquare[] {
  const view = state.view;
  if (!view) return [];
  return view.legalMoves.filter((move) => move.from === from).map((move) => move.to);
}

function iAmPlayer(): boolean {
  return state.seat === 'white' || state.seat === 'red';
}

function isMyTurn(): boolean {
  const view = state.view;
  return (
    !!view &&
    view.status.type === 'playing' &&
    view.status.turn === state.seat &&
    view.legalMoves.length > 0
  );
}

// ── Rendering ────────────────────────────────────────────────────────────────

function renderAll(): void {
  renderBoard();
  renderSide();
}

function renderBoard(): void {
  if (!boardHost || !state.view) return;
  const targets = state.selected ? legalTargets(state.selected) : [];
  boardHost.innerHTML = renderDualChessBoardSvg(state.view, {
    perspective: state.view.perspective,
    showFog: false,
    interactive: iAmPlayer(),
    selected: state.selected,
    targets,
    lastMove: state.view.lastMove ?? null,
  });
}

function renderSide(): void {
  if (!sideHost) return;
  sideHost.innerHTML = [
    clockMarkup('top'),
    `<div class="dual-live-status">${statusText()}</div>`,
    `<div class="dual-live-conn">${connectionText()}</div>`,
    movesMarkup(),
    actionsMarkup(),
    clockMarkup('bottom'),
  ].join('');

  const resign = sideHost.querySelector<HTMLButtonElement>('[data-action="resign"]');
  resign?.addEventListener('click', () => send({ type: 'resign' }));
  const abort = sideHost.querySelector<HTMLButtonElement>('[data-action="abort"]');
  abort?.addEventListener('click', () => send({ type: 'abort' }));
}

// Which color sits at the top vs bottom of the board for this viewer.
function bottomColor(): DualChessColor {
  return state.seat === 'red' ? 'red' : 'white';
}
function topColor(): DualChessColor {
  return bottomColor() === 'white' ? 'red' : 'white';
}

function clockMarkup(slot: 'top' | 'bottom'): string {
  if (!state.clock) return '';
  const color = slot === 'top' ? topColor() : bottomColor();
  const ms = clockRemainingMs(color);
  const active = state.clock.activeColor === color && state.view?.status.type === 'playing';
  const connected = state.connectedSeats[color];
  return `<div class="dual-live-clock ${active ? 'is-active' : ''}" data-clock="${color}">
      <span class="dual-live-clock-name">${color === 'white' ? 'White' : 'Red'}${connected ? '' : ' (away)'}</span>
      <span class="dual-live-clock-time" data-clock-time="${color}">${formatClock(ms)}</span>
    </div>`;
}

function statusText(): string {
  const view = state.view;
  if (!view) return 'Connecting…';
  const status = view.status;
  if (status.type === 'finished') {
    const winner = status.winner ? (status.winner === 'white' ? 'White' : 'Red') : null;
    const reason = status.reason ? ` (${status.reason})` : '';
    return winner ? `${winner} wins${reason}` : `Draw${reason}`;
  }
  if (status.type === 'aborted') return 'Game aborted';
  const turn = status.turn === 'white' ? 'White' : 'Red';
  const mine = status.turn === state.seat ? ' — your move' : '';
  return `${turn} to move${mine}`;
}

function connectionText(): string {
  switch (state.connection) {
    case 'connected':
      return state.seat && state.seat !== 'spectator' ? `You are ${state.seat}` : 'Spectating';
    case 'connecting':
      return 'Connecting…';
    case 'reconnecting':
      return 'Reconnecting…';
    case 'displaced':
      return 'Opened in another tab';
    case 'rejected':
      return `Cannot join${state.closeReason ? `: ${state.closeReason}` : ''}`;
  }
}

function movesMarkup(): string {
  if (state.moves.length === 0) return '<div class="dual-live-moves"></div>';
  const rows: string[] = [];
  for (let i = 0; i < state.moves.length; i += 2) {
    const n = i / 2 + 1;
    const white = uci(state.moves[i]!.move);
    const red = state.moves[i + 1] ? uci(state.moves[i + 1]!.move) : '';
    rows.push(`<li><span class="dual-live-movenum">${n}.</span> ${white} ${red}</li>`);
  }
  return `<ol class="dual-live-moves">${rows.join('')}</ol>`;
}

function actionsMarkup(): string {
  const view = state.view;
  if (!view || !iAmPlayer() || view.status.type !== 'playing')
    return '<div class="dual-live-actions"></div>';
  // Abort during the pregame (before both sides have moved once); resign after.
  const button =
    view.moveNumber < 2
      ? `<button type="button" class="dual-live-btn" data-action="abort">Abort</button>`
      : `<button type="button" class="dual-live-btn" data-action="resign">Resign</button>`;
  return `<div class="dual-live-actions">${button}</div>`;
}

// ── Clocks ───────────────────────────────────────────────────────────────────

function clockRemainingMs(color: DualChessColor): number {
  const clock = state.clock;
  if (!clock) return 0;
  const base = clock.remainingMs[color];
  if (clock.activeColor !== color || clock.runningSince === null) return base;
  return Math.max(0, base - Math.max(0, Date.now() - clock.runningSince));
}

function tickClocks(): void {
  if (!sideHost || !state.clock || state.view?.status.type !== 'playing') return;
  for (const color of ['white', 'red'] as DualChessColor[]) {
    const node = sideHost.querySelector<HTMLElement>(`[data-clock-time="${color}"]`);
    if (node) node.textContent = formatClock(clockRemainingMs(color));
  }
}

function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function uci(move: DualChessMove): string {
  return `${move.from}${move.to}${move.promotion ? 'Q' : ''}`;
}
