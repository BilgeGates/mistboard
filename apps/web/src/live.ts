import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import './styles.css';
import type { GameEvent, PlayerView } from '@mistboard/game';
import {
  liveState,
  clientIdForRoom,
  clearSeatTokenForRoom,
  resolveWebSocketBaseUrl,
  type DevViews,
} from './live-state.js';
import {
  initSocket,
  connectSocket,
  sendSocket,
  reconnectNow,
} from './live-socket.js';
import {
  initRender,
  render,
  reconcileInteractionState,
  maybePlaySnapshotSound,
  currentView,
  renderClocks,
  handleReplayKeyboard,
} from './live-render.js';

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
  window.history.replaceState(null, '', `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`);
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

// ── Start ─────────────────────────────────────────────────────────────────────

connectSocket();
window.addEventListener('keydown', handleReplayKeyboard);

window.setInterval(() => {
  void sendSocket({ type: 'ping' });
}, 5_000);

window.setInterval(() => {
  const view = currentView();
  if (view?.clock) renderClocks(view);
}, 100);

window.__MISTBOARD_DEBUG__ = () => ({
  clientCount: liveState.clientCount,
  connectionState: liveState.connectionState,
  currentView: currentView(),
  devViews: liveState.devViews,
  events: liveState.events,
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
