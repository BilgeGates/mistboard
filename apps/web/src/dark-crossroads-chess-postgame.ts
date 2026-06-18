import type {
  CrossroadsChessColor,
  CrossroadsChessGameStatus,
  CrossroadsChessMove,
  CrossroadsChessPlayerView,
} from '@mistboard/game';
import './live-crossroads-chess.css';
// Reuse the shared dxq-postgame scaffold (.dxq-postgame__*); jieqi/banqi reuse it
// the same way. The route-scoped theme + board overrides live in our own file.
import './dark-xiangqi-postgame.css';
import './dark-crossroads-chess-postgame.css';
import {
  readCrossroadsChessAppearance,
  renderCrossroadsChessBoardSvg,
} from './crossroads-chess-render.js';
import { createDarkCrossroadsChessPlayAgainRoom } from './dark-crossroads-chess-room-actions.js';
import { darkCrossroadsChessEnabled } from './feature-flags.js';
import { setBoardFamily } from './theme.js';

export type DarkCrossroadsChessPostgameViewKey = CrossroadsChessColor | 'truth';

const postgameAbortControllers = new WeakMap<HTMLElement, AbortController>();

export type DarkCrossroadsChessPostgameResponse = {
  game: {
    roomId: string;
    variant: 'dark-crossroads-chess';
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
    status: CrossroadsChessGameStatus;
    moveNumber: number;
    clock?: unknown;
    timeControl?: { initialMs: number; incrementMs: number };
  };
  timeline: Array<{
    type: string;
    at: number;
    color?: CrossroadsChessColor;
    move?: CrossroadsChessMove;
    ply?: number;
    winner?: CrossroadsChessColor;
    reason?: string;
  }>;
  view: CrossroadsChessPlayerView;
  views?: Partial<Record<DarkCrossroadsChessPostgameViewKey, CrossroadsChessPlayerView>>;
  history?: Partial<
    Record<
      DarkCrossroadsChessPostgameViewKey,
      Array<{ ply: number; view: CrossroadsChessPlayerView }>
    >
  >;
};

type LoadResult =
  | { ok: true; postgame: DarkCrossroadsChessPostgameResponse }
  | { ok: false; status: number; error: string };

export function mountDarkCrossroadsChessPostgame(root: HTMLElement, roomId: string): void {
  root.classList.add('landing-page', 'dark-crossroads-chess-postgame-route');
  setBoardFamily('chess');
  root.replaceChildren(loadingView());
  if (!darkCrossroadsChessEnabled()) {
    renderError(
      root,
      'Dark Crossroads Chess unavailable',
      'This route is not enabled in this build.',
    );
    return;
  }
  void loadDarkCrossroadsChessPostgame(roomId)
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

export async function loadDarkCrossroadsChessPostgame(roomId: string): Promise<LoadResult> {
  const response = await fetch(darkCrossroadsChessPostgameApiUrl(roomId));
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
    postgame: (await response.json()) as DarkCrossroadsChessPostgameResponse,
  };
}

export function darkCrossroadsChessPostgameApiUrl(roomId: string): string {
  const url = new URL(
    `/api/dark-crossroads-chess/games/${encodeURIComponent(roomId)}`,
    window.location.href,
  );
  return url.pathname;
}

function renderPostgame(root: HTMLElement, postgame: DarkCrossroadsChessPostgameResponse): void {
  const priorAbort = postgameAbortControllers.get(root);
  if (priorAbort) priorAbort.abort();
  const abortController = new AbortController();
  postgameAbortControllers.set(root, abortController);

  root.replaceChildren();
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
  title.textContent = 'Dark Crossroads Chess';
  const summary = document.createElement('p');
  summary.className = 'dxq-postgame__summary';
  summary.textContent = `${resultLabel(postgame.game.result)} by ${labelize(postgame.game.termination)} · ${postgame.game.plyCount} plies`;
  titleBlock.append(eyebrow, title, summary);
  header.append(titleBlock, postgameActions(postgame));

  const layout = document.createElement('section');
  layout.className = 'dxq-postgame__layout';
  layout.setAttribute('aria-label', 'Dark Crossroads Chess postgame');

  const side = document.createElement('aside');
  side.className = 'dxq-postgame__side';
  side.append(detailsPanel(postgame), timelinePanel(postgame));

  layout.append(boardsPanel(postgame, abortController.signal), side);
  page.append(header, layout);
  root.append(page);
}

function boardsPanel(
  postgame: DarkCrossroadsChessPostgameResponse,
  signal: AbortSignal,
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'dxq-postgame__boards';
  const views = postgameViewEntries(postgame);
  const maxPly = postgameReplayMaxPly(postgame);
  let currentPly = maxPly;
  let boardOrientation: CrossroadsChessColor = 'white';
  const appearance = readCrossroadsChessAppearance();
  const boardTargets: Array<{
    board: HTMLElement;
    entry: {
      key: DarkCrossroadsChessPostgameViewKey;
      label: string;
      view: CrossroadsChessPlayerView;
    };
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
    for (const { board, entry } of boardTargets) {
      const view = postgameViewAtPly(postgame, entry.key, currentPly) ?? entry.view;
      board.innerHTML = renderCrossroadsChessBoardSvg(view, {
        perspective: boardOrientation,
        showFog: entry.key !== 'truth',
        ...appearance,
      });
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
    boardOrientation = boardOrientation === 'white' ? 'red' : 'white';
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
      boardOrientation = boardOrientation === 'white' ? 'red' : 'white';
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
    const board = document.createElement('div');
    board.className = 'dxq-postgame__board crossroads-live-board';
    board.setAttribute('aria-label', `${entry.label} final Dark Crossroads Chess board`);
    boardTargets.push({ board, entry });
    boardWrap.append(heading, board);
    panel.append(boardWrap);
  }
  syncReplay();
  return panel;
}

export function postgameViewEntries(postgame: DarkCrossroadsChessPostgameResponse): Array<{
  key: DarkCrossroadsChessPostgameViewKey;
  label: string;
  view: CrossroadsChessPlayerView;
}> {
  const views = postgame.views;
  if (views?.white && views.truth && views.red) {
    return [
      { key: 'white', label: 'White view', view: views.white },
      { key: 'truth', label: 'Server truth', view: views.truth },
      { key: 'red', label: 'Red view', view: views.red },
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

export function postgameReplayMaxPly(postgame: DarkCrossroadsChessPostgameResponse): number {
  const history = Object.values(postgame.history ?? {}).flat();
  return Math.max(postgame.game.plyCount, ...history.map((snapshot) => snapshot.ply), 0);
}

export function postgameViewAtPly(
  postgame: DarkCrossroadsChessPostgameResponse,
  key: DarkCrossroadsChessPostgameViewKey,
  ply: number,
): CrossroadsChessPlayerView | null {
  const history = postgame.history?.[key];
  if (!history || history.length === 0) return null;
  let selected = history[0] ?? null;
  for (const snapshot of history) {
    if (snapshot.ply > ply) break;
    selected = snapshot;
  }
  return selected?.view ?? null;
}

function postgameActions(postgame: DarkCrossroadsChessPostgameResponse): HTMLElement {
  const actions = document.createElement('nav');
  actions.className = 'dxq-postgame__actions';
  actions.setAttribute('aria-label', 'Game links');
  let playAgainStatus: 'creating' | 'failed' | 'idle' = 'idle';
  const playAgain = document.createElement('button');
  playAgain.type = 'button';
  playAgain.className = 'dxq-postgame__link dxq-postgame__link--primary';
  const syncPlayAgain = () => {
    playAgain.disabled = playAgainStatus === 'creating';
    playAgain.textContent =
      playAgainStatus === 'creating'
        ? 'Creating'
        : playAgainStatus === 'failed'
          ? 'Try play again'
          : 'Play again';
  };
  playAgain.addEventListener('click', () => {
    playAgainStatus = 'creating';
    syncPlayAgain();
    void createDarkCrossroadsChessPlayAgainRoom({ timeControl: postgameTimeControl(postgame) })
      .then((url) => {
        window.location.assign(url);
      })
      .catch((err) => {
        console.warn(err);
        playAgainStatus = 'failed';
        syncPlayAgain();
      });
  });
  syncPlayAgain();
  const home = document.createElement('a');
  home.className = 'dxq-postgame__link';
  home.href = '/';
  home.textContent = 'Back home';
  const room = document.createElement('a');
  room.className = 'dxq-postgame__link';
  room.href = `/room/${encodeURIComponent(postgame.game.roomId)}`;
  room.textContent = 'Room';
  actions.append(playAgain, home, room);
  return actions;
}

function detailsPanel(postgame: DarkCrossroadsChessPostgameResponse): HTMLElement {
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

function timelinePanel(postgame: DarkCrossroadsChessPostgameResponse): HTMLElement {
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
    // One numbered row per White+Red pair (White moves first). Fall back to array
    // index / ply parity when the wire entry omits ply or color.
    const rows = new Map<number, { white?: string; red?: string }>();
    moves.forEach((entry, index) => {
      const ply = entry.ply ?? index + 1;
      const color = entry.color ?? (ply % 2 === 1 ? 'white' : 'red');
      const moveNumber = Math.max(1, Math.ceil(ply / 2));
      const row = rows.get(moveNumber) ?? {};
      const text = `${entry.move!.from}-${entry.move!.to}`;
      if (color === 'red') row.red = text;
      else row.white = text;
      rows.set(moveNumber, row);
    });
    for (const [moveNumber, row] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
      const item = document.createElement('li');
      item.className = 'dxq-postgame__move';
      const number = document.createElement('span');
      number.className = 'dxq-postgame__move-number';
      number.textContent = String(moveNumber);
      const white = document.createElement('span');
      white.className = 'dxq-postgame__move-ply dxq-postgame__move-ply--white';
      white.textContent = row.white ?? '';
      const red = document.createElement('span');
      red.className = 'dxq-postgame__move-ply dxq-postgame__move-ply--red';
      red.textContent = row.red ?? '';
      item.append(number, white, red);
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
  root.replaceChildren();
  const shell = document.createElement('main');
  shell.className = 'dxq-postgame__error';
  const title = document.createElement('h1');
  title.textContent = titleText;
  const body = document.createElement('p');
  body.textContent = bodyText;
  shell.append(title, body);
  root.append(shell);
}

function errorTitle(status: number): string {
  if (status === 404) return 'Game not found';
  return 'Postgame unavailable';
}

function errorBody(result: Extract<LoadResult, { ok: false }>): string {
  if (result.status === 404) return 'This Dark Crossroads Chess game is not available.';
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
  if (result === 'red-wins') return 'Red wins';
  if (result === 'draw') return 'Draw';
  return labelize(result);
}

function timeControlLabel(postgame: DarkCrossroadsChessPostgameResponse): string {
  const timeControl = postgameTimeControl(postgame);
  const initialMs = timeControl?.initialMs ?? null;
  const incrementMs = timeControl?.incrementMs ?? null;
  if (initialMs === null && incrementMs === null) return 'Untimed';
  return `${clockLabel(initialMs ?? 0)}+${Math.round((incrementMs ?? 0) / 1000)}`;
}

function postgameTimeControl(
  postgame: DarkCrossroadsChessPostgameResponse,
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
