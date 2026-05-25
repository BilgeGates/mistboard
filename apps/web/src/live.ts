import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import './styles.css';
import type { GameEvent, PlayerView } from '@mistboard/game';
import {
  currentView,
  initRender,
  reconcileInteractionState,
  render,
  tickClockTimers,
  updateAbortCountdown,
} from './live-render.js';
import { handleReplayKeyboard } from './live-replay.js';
import { connectSocket, initSocket, reconnectNow, sendSocket } from './live-socket.js';
import { maybePlaySnapshotSound } from './live-sound.js';
import {
  type ConnectionState,
  clearSeatTokenForRoom,
  clientIdForRoom,
  type DevViews,
  liveState,
  resolveWebSocketBaseUrl,
} from './live-state.js';

declare global {
  interface Window {
    __MISTBOARD_DEBUG__?: () => DebugSnapshot;
    webkitAudioContext?: typeof AudioContext;
  }
}

type DebugSnapshot = {
  clientCount: number;
  currentView: PlayerView | null;
  connectionState: typeof liveState.connectionState;
  devViews: DevViews | null;
  events: GameEvent[];
  seat: typeof liveState.seat;
  solo: boolean;
  state: PlayerView | null;
};

// ── Page setup ────────────────────────────────────────────────────────────────

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('missing #app');

const pageParams = new URLSearchParams(window.location.search);
const pathRoom = roomIdFromPath(window.location.pathname);
const room = pathRoom ?? pageParams.get('room') ?? 'dev-room';
const soloRequested = pageParams.get('dev') === 'solo';
const engineRequested = pageParams.get('dev') === 'engine' || pageParams.get('engine') === 'random';
const allViewsRequested = pageParams.get('views') === 'all';
const debugRequested = engineRequested || allViewsRequested;
const variantRequested = pageParams.get('variant');

if (pageParams.get('reset') === '1') {
  clearSeatTokenForRoom(room);
  pageParams.delete('reset');
  const nextSearch = pageParams.toString();
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`,
  );
}

const socketParams = new URLSearchParams({ room });
socketParams.set('client', clientIdForRoom(room));
if (soloRequested) socketParams.set('dev', 'solo');
if (engineRequested) socketParams.set('dev', 'engine');
if (allViewsRequested) socketParams.set('views', 'all');
if (variantRequested) socketParams.set('variant', variantRequested);

// ── Populate shared state ─────────────────────────────────────────────────────

liveState.room = room;
liveState.socketUrl = `${resolveWebSocketBaseUrl()}?${socketParams}`;
liveState.engineRequested = engineRequested;
liveState.debugRequested = debugRequested;
liveState.variantRequested = variantRequested;
liveState.solo = soloRequested;
liveState.roomMode = engineRequested ? 'pve' : 'pvp';

// ── Initialize render + socket modules ───────────────────────────────────────

initRender(app, { sendSocket, reconnectNow });
initSocket({ render, reconcileInteractionState, maybePlaySnapshotSound });

// ── Dev-only: ?conn= override for static visual checks of connection states ──

const CONN_OVERRIDE_STATES: readonly ConnectionState[] = [
  'connecting',
  'connected',
  'disconnected',
  'reconnecting',
  'displaced',
  'rejected',
];
const connParam = pageParams.get('conn');
const connOverride =
  connParam && (CONN_OVERRIDE_STATES as readonly string[]).includes(connParam)
    ? (connParam as ConnectionState)
    : null;

if (connOverride) {
  liveState.connectionState = connOverride;
  liveState.clientId = liveState.clientId || 'dev-client';
  if (connOverride === 'reconnecting' || connOverride === 'disconnected') {
    liveState.reconnectAttempt = Number(pageParams.get('attempt') ?? '3');
  }
  if (connOverride === 'rejected') {
    liveState.closeReason = pageParams.get('reason') ?? '';
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

if (!connOverride) connectSocket();
window.addEventListener('keydown', handleReplayKeyboard);

if (!connOverride) {
  window.setInterval(() => {
    void sendSocket({ type: 'ping', at: Date.now() });
  }, 5_000);
}

window.setInterval(() => {
  const view = currentView();
  if (view?.clock) tickClockTimers(view);
  updateAbortCountdown();
}, 100);

window.__MISTBOARD_DEBUG__ = () => ({
  clientCount: liveState.clientCount,
  connectionState: liveState.connectionState,
  currentView: currentView(),
  devViews: liveState.devViews,
  events: liveState.events,
  gameSpecId: liveState.gameSpecId,
  roomRegion: liveState.roomRegion,
  seat: liveState.seat,
  solo: liveState.solo,
  state: liveState.state,
});

render();

// ── Helpers ───────────────────────────────────────────────────────────────────

function roomIdFromPath(pathname: string): string | null {
  const normalized = pathname.replace(/\/+$/, '');
  if (normalized === '/room') return 'dev-room';
  const match = normalized.match(/^\/room\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}
