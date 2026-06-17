import type {
  RevealChessColor,
  RevealChessGameStatus,
  RevealChessMove,
  RevealChessPlayerView,
} from '@mistboard/game';
import './landing.css';
import './game-route.css';
import './live-reveal-chess.css';
import { revealChessEnabled } from './feature-flags.js';
import { fillCapturedPool } from './live-reveal-chess.js';
import { renderRevealChessBoardSvg } from './reveal-chess-render.js';
import { buildNav } from './site-shell.js';
import { boardAppearanceChangedEvent, setBoardFamily } from './theme.js';

export type RevealChessPostgameViewKey = RevealChessColor | 'truth';

const postgameAbortControllers = new WeakMap<HTMLElement, AbortController>();

export type RevealChessPostgameResponse = {
  game: {
    roomId: string;
    variant: 'reveal-chess';
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
    status: RevealChessGameStatus;
    moveNumber: number;
    clock?: unknown;
    timeControl?: { initialMs: number; incrementMs: number };
  };
  timeline: Array<{
    type: string;
    at: number;
    color?: RevealChessColor;
    move?: RevealChessMove;
    ply?: number;
    winner?: RevealChessColor;
    reason?: string;
  }>;
  view: RevealChessPlayerView;
  views?: Partial<Record<RevealChessPostgameViewKey, RevealChessPlayerView>>;
  history?: Partial<
    Record<RevealChessPostgameViewKey, Array<{ ply: number; view: RevealChessPlayerView }>>
  >;
};

type LoadResult =
  | { ok: true; postgame: RevealChessPostgameResponse }
  | { ok: false; status: number; error: string };

export function mountRevealChessPostgame(root: HTMLElement, roomId: string): void {
  root.classList.add('landing-page', 'reveal-chess-postgame-route');
  setBoardFamily('chess');
  root.replaceChildren(buildNav(), loadingView());
  if (!revealChessEnabled()) {
    renderError(root, 'Reveal Chess unavailable', 'This route is not enabled in this build.');
    return;
  }
  void loadRevealChessPostgame(roomId)
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

export async function loadRevealChessPostgame(roomId: string): Promise<LoadResult> {
  const response = await fetch(revealChessPostgameApiUrl(roomId));
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
    postgame: (await response.json()) as RevealChessPostgameResponse,
  };
}

export function revealChessPostgameApiUrl(roomId: string): string {
  const url = new URL(
    `/api/reveal-chess/games/${encodeURIComponent(roomId)}`,
    window.location.href,
  );
  return url.pathname;
}

function renderPostgame(root: HTMLElement, postgame: RevealChessPostgameResponse): void {
  const priorAbort = postgameAbortControllers.get(root);
  if (priorAbort) priorAbort.abort();
  const abortController = new AbortController();
  postgameAbortControllers.set(root, abortController);

  root.replaceChildren();
  const page = document.createElement('main');
  page.className = 'dxq-postgame reveal-chess-postgame';

  const header = document.createElement('header');
  header.className = 'dxq-postgame__header';
  const titleBlock = document.createElement('div');
  const eyebrow = document.createElement('p');
  eyebrow.className = 'dxq-postgame__eyebrow';
  eyebrow.textContent = 'Game review';
  const title = document.createElement('h1');
  title.className = 'dxq-postgame__title';
  title.textContent = 'Reveal Chess';
  const summary = document.createElement('p');
  summary.className = 'dxq-postgame__summary';
  summary.textContent = `${resultLabel(postgame.game.result)} by ${labelize(postgame.game.termination)} · ${postgame.game.plyCount} plies`;
  titleBlock.append(eyebrow, title, summary);
  header.append(titleBlock, postgameActions(postgame));

  const layout = document.createElement('section');
  layout.className = 'dxq-postgame__layout';
  layout.setAttribute('aria-label', 'Reveal Chess postgame');

  const side = document.createElement('aside');
  side.className = 'dxq-postgame__side';
  side.append(detailsPanel(postgame), timelinePanel(postgame));

  layout.append(boardsPanel(postgame, abortController.signal), side);
  page.append(header, layout);
  root.replaceChildren(buildNav(), page);
}

function boardsPanel(postgame: RevealChessPostgameResponse, signal: AbortSignal): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'dxq-postgame__boards';
  const views = postgameViewEntries(postgame);
  const maxPly = postgameReplayMaxPly(postgame);
  let currentPly = maxPly;
  let boardOrientation: RevealChessColor = 'white';
  const boardTargets: Array<{
    board: HTMLElement;
    capturesTop: HTMLElement;
    capturesBottom: HTMLElement;
    entry: { key: RevealChessPostgameViewKey; label: string; view: RevealChessPlayerView };
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
      // Reveal Chess has NO fog: the truth view renders every identity revealed;
      // the per-color views render the opponent's face-down pieces as discs (the
      // renderer keys off entry.faceDown), with no showFog option.
      board.innerHTML = renderRevealChessBoardSvg(view, { perspective: boardOrientation });
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
    boardOrientation = oppositeRevealColor(boardOrientation);
    syncReplay();
  });
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        boardOrientation = oppositeRevealColor(boardOrientation);
        syncReplay();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        currentPly = Math.max(0, currentPly - 1);
        syncReplay();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        currentPly = Math.min(maxPly, currentPly + 1);
        syncReplay();
      }
    },
    { signal },
  );
  window.addEventListener(boardAppearanceChangedEvent, syncReplay, { signal });

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
    board.className = 'dxq-postgame__board reveal-chess-live-board';
    board.setAttribute('aria-label', `${entry.label} final Reveal Chess board`);
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
  view: RevealChessPlayerView,
  orientation: RevealChessColor,
): void {
  top.replaceChildren();
  bottom.replaceChildren();
  const opponent = oppositeRevealColor(orientation);
  fillCapturedPool(top, view.captured, orientation);
  fillCapturedPool(bottom, view.captured, opponent);
}

function oppositeRevealColor(color: RevealChessColor): RevealChessColor {
  return color === 'white' ? 'black' : 'white';
}

// Exported for the watch-replay surface to reuse the per-ply view selection,
// mirroring the Jieqi postgame module's exported helpers.
export function postgameViewEntries(
  postgame: RevealChessPostgameResponse,
): Array<{ key: RevealChessPostgameViewKey; label: string; view: RevealChessPlayerView }> {
  const views = postgame.views;
  if (views?.white && views.truth && views.black) {
    return [
      { key: 'white', label: 'White view', view: views.white },
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

export function postgameReplayMaxPly(postgame: RevealChessPostgameResponse): number {
  const history = Object.values(postgame.history ?? {}).flat();
  return Math.max(postgame.game.plyCount, ...history.map((snapshot) => snapshot.ply), 0);
}

export function postgameViewAtPly(
  postgame: RevealChessPostgameResponse,
  key: RevealChessPostgameViewKey,
  ply: number,
): RevealChessPlayerView | null {
  const history = postgame.history?.[key];
  if (!history || history.length === 0) return null;
  let selected = history[0] ?? null;
  for (const snapshot of history) {
    if (snapshot.ply > ply) break;
    selected = snapshot;
  }
  return selected?.view ?? null;
}

// No Reveal Chess play-again room action exists yet (PvP-only, no engine), so the
// review offers only the Back home + Room links — no fabricated server action.
function postgameActions(postgame: RevealChessPostgameResponse): HTMLElement {
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

function detailsPanel(postgame: RevealChessPostgameResponse): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'dxq-postgame__panel';
  const heading = document.createElement('h2');
  heading.textContent = 'Game';
  const details = document.createElement('dl');
  details.className = 'dxq-postgame__details';
  details.append(
    detailRow('Result', resultLabel(postgame.game.result)),
    detailRow('Ending', labelize(postgame.game.termination)),
    detailRow('Clock', timeControlLabel(postgame)),
    detailRow('Ended', dateLabel(postgame.game.endedAt)),
  );
  panel.append(heading, details);
  return panel;
}

function timelinePanel(postgame: RevealChessPostgameResponse): HTMLElement {
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
      const promotion = entry.move?.promotion ? `=${entry.move.promotion[0].toUpperCase()}` : '';
      move.textContent = `${capitalize(entry.color ?? '')} ${entry.move!.from}-${entry.move!.to}${promotion}`;
      item.append(number, move);
      list.append(item);
    }
  }
  panel.append(heading, list);
  return panel;
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
  return 'Postgame unavailable';
}

function errorBody(result: Extract<LoadResult, { ok: false }>): string {
  if (result.status === 404) return 'This Reveal Chess game is not available.';
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

function resultLabel(result: string): string {
  if (result === 'white-wins') return 'White wins';
  if (result === 'black-wins') return 'Black wins';
  if (result === 'draw') return 'Draw';
  return labelize(result);
}

function timeControlLabel(postgame: RevealChessPostgameResponse): string {
  const initialMs = postgame.game.initialMs ?? postgame.state.timeControl?.initialMs ?? null;
  const incrementMs = postgame.game.incrementMs ?? postgame.state.timeControl?.incrementMs ?? null;
  if (initialMs === null && incrementMs === null) return 'Untimed';
  return `${clockLabel(initialMs ?? 0)}+${Math.round((incrementMs ?? 0) / 1000)}`;
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
