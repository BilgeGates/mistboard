import type { BanqiColor, BanqiGameStatus, BanqiMove, BanqiPlayerView } from '@mistboard/game';
import './live-xiangqi.css';
import { banqiResultLabel, seatInkLabel } from './banqi-result-label.js';
import './dark-xiangqi-postgame.css';
import { banqiEnabled } from './feature-flags.js';
import { fillCapturedPool } from './live-banqi.js';
import { installBanqiBoardStyles, renderBanqiBoardSvg } from './live-banqi-render.js';
import { buildNav } from './site-shell.js';

// Postgame review for banqi. Banqi is SYMMETRIC-information: a face-down tile is
// hidden from both seats equally, so there is a single "truth" review surface
// (no per-seat split). The server may still ship per-seat masked views for shape
// parity with jieqi; this renderer keys off entry.faceDown either way, so a
// per-seat view renders the still-face-down tiles as neutral backs while the
// truth view reveals every identity.

export type BanqiPostgameViewKey = BanqiColor | 'truth';

const postgameAbortControllers = new WeakMap<HTMLElement, AbortController>();

export type BanqiPostgameResponse = {
  game: {
    roomId: string;
    variant: 'banqi';
    mode: string;
    result: string;
    termination: string;
    plyCount: number;
    startedAt: string;
    endedAt: string;
    rated: boolean;
    visibility: string;
    initialMs: number | null;
    incrementMs: number | null;
  };
  state: {
    status: BanqiGameStatus;
    moveNumber: number;
    clock?: unknown;
    timeControl?: { initialMs: number; incrementMs: number };
  };
  timeline: Array<{
    type: string;
    at: number;
    color?: BanqiColor;
    move?: BanqiMove;
    ply?: number;
    winner?: BanqiColor;
    reason?: string;
  }>;
  view: BanqiPlayerView;
  views?: Partial<Record<BanqiPostgameViewKey, BanqiPlayerView>>;
  history?: Partial<Record<BanqiPostgameViewKey, Array<{ ply: number; view: BanqiPlayerView }>>>;
};

type LoadResult =
  | { ok: true; postgame: BanqiPostgameResponse }
  | { ok: false; status: number; error: string };

export function mountBanqiPostgame(root: HTMLElement, roomId: string): void {
  root.classList.add('landing-page', 'banqi-postgame-route');
  installBanqiBoardStyles();
  // Nav lives INSIDE the .landing-page flex column (crossroads pattern), so the
  // route's 100vh floor accounts for it and the page does not scroll. Each render
  // path rebuilds it as the first child.
  root.replaceChildren(buildNav(), loadingView());
  if (!banqiEnabled()) {
    renderError(root, 'Banqi unavailable', 'This route is not enabled in this build.');
    return;
  }
  void loadBanqiPostgame(roomId)
    .then((result) => {
      if (result.ok) {
        renderPostgame(root, result.postgame);
        return;
      }
      renderError(root, errorTitle(result.status), errorBody(result));
    })
    .catch(() => {
      renderError(root, 'Postgame unavailable', 'The game could not be loaded.');
    });
}

export async function loadBanqiPostgame(roomId: string): Promise<LoadResult> {
  const response = await fetch(banqiPostgameApiUrl(roomId));
  if (!response.ok) {
    const body = await safeJson(response);
    return {
      ok: false,
      status: response.status,
      error: typeof body?.error === 'string' ? body.error : 'request_failed',
    };
  }
  return {
    ok: true,
    postgame: (await response.json()) as BanqiPostgameResponse,
  };
}

export function banqiPostgameApiUrl(roomId: string): string {
  const url = new URL(`/api/banqi/games/${encodeURIComponent(roomId)}`, window.location.href);
  return url.pathname;
}

function renderPostgame(root: HTMLElement, postgame: BanqiPostgameResponse): void {
  const priorAbort = postgameAbortControllers.get(root);
  if (priorAbort) priorAbort.abort();
  const abortController = new AbortController();
  postgameAbortControllers.set(root, abortController);

  const page = document.createElement('main');
  page.className = 'dxq-postgame';

  const header = document.createElement('header');
  header.className = 'dxq-postgame__header';
  const titleBlock = document.createElement('div');
  const eyebrow = document.createElement('p');
  eyebrow.className = 'dxq-postgame__eyebrow';
  eyebrow.textContent = 'Game review';
  const title = document.createElement('h1');
  title.className = 'dxq-postgame__title';
  title.textContent = 'Banqi';
  const summary = document.createElement('p');
  summary.className = 'dxq-postgame__summary';
  summary.textContent = `${banqiResultLabel(postgame.game.result, postgame.view.firstColor)} by ${labelize(postgame.game.termination)} · ${postgame.game.plyCount} plies`;
  titleBlock.append(eyebrow, title, summary);
  header.append(titleBlock, postgameActions(postgame));

  const layout = document.createElement('section');
  layout.className = 'dxq-postgame__layout';
  layout.setAttribute('aria-label', 'Banqi postgame');

  const side = document.createElement('aside');
  side.className = 'dxq-postgame__side';
  side.append(detailsPanel(postgame), timelinePanel(postgame));

  layout.append(boardsPanel(postgame, abortController.signal), side);
  page.append(header, layout);
  root.replaceChildren(buildNav(), page);
}

function boardsPanel(postgame: BanqiPostgameResponse, signal: AbortSignal): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'dxq-postgame__boards';
  const views = postgameViewEntries(postgame);
  const maxPly = postgameReplayMaxPly(postgame);
  let currentPly = maxPly;
  let boardOrientation: BanqiColor = 'red';
  const boardTargets: Array<{
    board: HTMLElement;
    capturesTop: HTMLElement;
    capturesBottom: HTMLElement;
    entry: { key: BanqiPostgameViewKey; label: string; view: BanqiPlayerView };
  }> = [];

  const controls = document.createElement('div');
  controls.className = 'dxq-postgame__replay-controls';
  const first = replayControlButton('|<', 'First ply');
  const previous = replayControlButton('<', 'Previous ply');
  const status = document.createElement('span');
  status.className = 'dxq-postgame__replay-status';
  status.setAttribute('aria-live', 'polite');
  const next = replayControlButton('>', 'Next ply');
  const last = replayControlButton('>|', 'Final ply');
  const flip = replayControlButton('Flip', 'Flip all boards');
  flip.title = 'Flip all boards (f)';

  const syncReplay = () => {
    for (const { board, capturesTop, capturesBottom, entry } of boardTargets) {
      const view = postgameViewAtPly(postgame, entry.key, currentPly) ?? entry.view;
      // Banqi is symmetric: the truth view renders every identity revealed; the
      // per-key views render still-face-down tiles as neutral backs (the renderer
      // keys off entry.faceDown). The board SVG carries no id-based defs, so
      // multiple boards on one page do not collide.
      board.innerHTML = renderBanqiBoardSvg(view, boardOrientation, {});
      renderCapturedPools(capturesTop, capturesBottom, view, boardOrientation);
    }
    status.textContent = `Ply ${currentPly} of ${maxPly}`;
    first.disabled = currentPly <= 0;
    previous.disabled = currentPly <= 0;
    next.disabled = currentPly >= maxPly;
    last.disabled = currentPly >= maxPly;
  };

  first.addEventListener('click', () => {
    currentPly = 0;
    syncReplay();
  });
  previous.addEventListener('click', () => {
    currentPly = Math.max(0, currentPly - 1);
    syncReplay();
  });
  next.addEventListener('click', () => {
    currentPly = Math.min(maxPly, currentPly + 1);
    syncReplay();
  });
  last.addEventListener('click', () => {
    currentPly = maxPly;
    syncReplay();
  });
  flip.addEventListener('click', () => {
    boardOrientation = oppositeBanqiColor(boardOrientation);
    syncReplay();
  });
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.key !== 'f' && event.key !== 'F') return;
      event.preventDefault();
      boardOrientation = oppositeBanqiColor(boardOrientation);
      syncReplay();
    },
    { signal },
  );

  controls.append(first, previous, status, next, last, flip);
  panel.append(controls);

  for (const entry of views) {
    const boardWrap = document.createElement('section');
    boardWrap.className = 'dxq-postgame__board-wrap';
    const heading = document.createElement('h2');
    heading.className = 'dxq-postgame__board-title';
    heading.textContent = entry.label;
    const capturesTop = document.createElement('div');
    capturesTop.className = 'captures-strip';
    const board = document.createElement('div');
    board.className = 'dxq-postgame__board banqi-live-board';
    board.setAttribute('aria-label', `${entry.label} final Banqi board`);
    const capturesBottom = document.createElement('div');
    capturesBottom.className = 'captures-strip';
    boardTargets.push({ board, capturesTop, capturesBottom, entry });
    boardWrap.append(heading, capturesTop, board, capturesBottom);
    panel.append(boardWrap);
  }
  syncReplay();
  return panel;
}

// Lichess convention: a player's captured material sits next to that player. The
// bottom strip is the viewer's side (orientation), so it shows what the viewer
// captured (the opponent's lost pieces); the top strip shows what the opponent
// captured (the viewer's lost pieces). fillCapturedPool filters by former owner.
function renderCapturedPools(
  top: HTMLElement,
  bottom: HTMLElement,
  view: BanqiPlayerView,
  orientation: BanqiColor,
): void {
  top.replaceChildren();
  bottom.replaceChildren();
  const opponent = orientation === 'red' ? 'black' : 'red';
  fillCapturedPool(top, view.captured, orientation);
  fillCapturedPool(bottom, view.captured, opponent);
}

function oppositeBanqiColor(color: BanqiColor): BanqiColor {
  return color === 'red' ? 'black' : 'red';
}

// Exported for any watch-replay surface to reuse the per-ply view selection,
// mirroring the jieqi postgame module's exported helpers. Banqi is symmetric, so
// the review reduces to the single truth surface when per-seat views are absent.
export function postgameViewEntries(
  postgame: BanqiPostgameResponse,
): Array<{ key: BanqiPostgameViewKey; label: string; view: BanqiPlayerView }> {
  const views = postgame.views;
  if (views?.red && views.truth && views.black) {
    return [
      { key: 'red', label: 'Red view', view: views.red },
      { key: 'truth', label: 'Server truth', view: views.truth },
      { key: 'black', label: 'Black view', view: views.black },
    ];
  }
  return [{ key: 'truth', label: 'Server truth', view: postgame.view }];
}

function replayControlButton(text: string, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dxq-postgame__replay-button';
  button.setAttribute('aria-label', label);
  button.textContent = text;
  return button;
}

export function postgameReplayMaxPly(postgame: BanqiPostgameResponse): number {
  const history = Object.values(postgame.history ?? {}).flat();
  return Math.max(postgame.game.plyCount, ...history.map((snapshot) => snapshot.ply), 0);
}

export function postgameViewAtPly(
  postgame: BanqiPostgameResponse,
  key: BanqiPostgameViewKey,
  ply: number,
): BanqiPlayerView | null {
  const history = postgame.history?.[key];
  if (!history || history.length === 0) return null;
  let selected = history[0] ?? null;
  for (const snapshot of history) {
    if (snapshot.ply > ply) break;
    selected = snapshot;
  }
  return selected?.view ?? null;
}

// No banqi play-again room action exists yet (v1), so the review offers only the
// Back home + Room links — no fabricated server action.
function postgameActions(postgame: BanqiPostgameResponse): HTMLElement {
  const actions = document.createElement('nav');
  actions.className = 'dxq-postgame__actions';
  actions.setAttribute('aria-label', 'Game links');
  const home = document.createElement('a');
  home.className = 'dxq-postgame__link';
  home.href = '/';
  home.textContent = 'Back home';
  const room = document.createElement('a');
  room.className = 'dxq-postgame__link';
  room.href = `/room/${encodeURIComponent(postgame.game.roomId)}`;
  room.textContent = 'Room';
  actions.append(home, room);
  return actions;
}

function detailsPanel(postgame: BanqiPostgameResponse): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'dxq-postgame__panel';
  const heading = document.createElement('h2');
  heading.textContent = 'Game';
  const details = document.createElement('dl');
  details.className = 'dxq-postgame__details';
  details.append(
    detailRow('Result', banqiResultLabel(postgame.game.result, postgame.view.firstColor)),
    detailRow('Ending', labelize(postgame.game.termination)),
    detailRow('Clock', timeControlLabel(postgame)),
    detailRow('Ended', dateLabel(postgame.game.endedAt)),
  );
  panel.append(heading, details);
  return panel;
}

function timelinePanel(postgame: BanqiPostgameResponse): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'dxq-postgame__panel';
  const heading = document.createElement('h2');
  heading.textContent = 'Moves';
  const list = document.createElement('ol');
  list.className = 'dxq-postgame__moves';
  const moves = postgame.timeline.filter((entry) => entry.type === 'move-played' && entry.move);
  if (moves.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'dxq-postgame__move';
    empty.textContent = 'No moves';
    list.append(empty);
  } else {
    for (const entry of moves) {
      const item = document.createElement('li');
      item.className = 'dxq-postgame__move';
      const number = document.createElement('span');
      number.className = 'dxq-postgame__move-number';
      number.textContent = String(entry.ply ?? '');
      const move = document.createElement('span');
      const mover = entry.color ? seatInkLabel(entry.color, postgame.view.firstColor) : '';
      move.textContent = `${mover} ${moveLabel(entry.move!)}`.trim();
      item.append(number, move);
      list.append(item);
    }
  }
  panel.append(heading, list);
  return panel;
}

// A flip (self-move) reads as the flipped square; a board move as from-to.
function moveLabel(move: BanqiMove): string {
  return move.from === move.to ? `${move.from} flip` : `${move.from}-${move.to}`;
}

function detailRow(label: string, value: string): HTMLElement {
  const row = document.createElement('div');
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  row.append(dt, dd);
  return row;
}

function loadingView(): HTMLElement {
  const shell = document.createElement('main');
  shell.className = 'dxq-postgame__notice';
  const heading = document.createElement('h1');
  heading.textContent = 'Loading game';
  shell.append(heading);
  return shell;
}

function renderError(root: HTMLElement, titleText: string, bodyText: string): void {
  const shell = document.createElement('main');
  shell.className = 'dxq-postgame__error';
  const title = document.createElement('h1');
  title.textContent = titleText;
  const body = document.createElement('p');
  body.textContent = bodyText;
  shell.append(title, body);
  root.replaceChildren(buildNav(), shell);
}

function errorTitle(status: number): string {
  if (status === 404) return 'Game not found';
  if (status === 503) return 'Postgame unavailable';
  return 'Postgame unavailable';
}

function errorBody(result: Extract<LoadResult, { ok: false }>): string {
  if (result.status === 404) return 'This Banqi game is not available.';
  if (result.status === 503) return 'The postgame service is not available.';
  return result.error;
}

async function safeJson(response: Response): Promise<{ error?: unknown } | null> {
  try {
    return (await response.json()) as { error?: unknown };
  } catch {
    return null;
  }
}

function timeControlLabel(postgame: BanqiPostgameResponse): string {
  const timeControl = postgameTimeControl(postgame);
  const initialMs = timeControl?.initialMs ?? null;
  const incrementMs = timeControl?.incrementMs ?? null;
  if (initialMs === null && incrementMs === null) return 'Untimed';
  return `${clockLabel(initialMs ?? 0)}+${Math.round((incrementMs ?? 0) / 1000)}`;
}

function postgameTimeControl(
  postgame: BanqiPostgameResponse,
): { initialMs: number; incrementMs: number } | null {
  const initialMs = postgame.game.initialMs ?? postgame.state.timeControl?.initialMs ?? null;
  const incrementMs = postgame.game.incrementMs ?? postgame.state.timeControl?.incrementMs ?? null;
  if (initialMs === null || incrementMs === null) return null;
  return { initialMs, incrementMs };
}

function clockLabel(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function labelize(value: string): string {
  return value.split('-').filter(Boolean).map(capitalize).join(' ');
}

function capitalize(value: string): string {
  if (!value) return value;
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
