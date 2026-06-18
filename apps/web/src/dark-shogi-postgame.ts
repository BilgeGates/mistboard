import type {
  ShogiColor,
  ShogiGameStatus,
  ShogiHand,
  ShogiHandRole,
  ShogiMove,
  ShogiPlayerView,
} from '@mistboard/game';
import { isShogiDrop } from '@mistboard/game';
import './live-dark-shogi.css';
// Reuse the shared dxq-postgame scaffold (.dxq-postgame__*); the route-scoped
// theme + board/reserve overrides live in our own file.
import './dark-xiangqi-postgame.css';
import './dark-shogi-postgame.css';
import { createDarkShogiPlayAgainRoom } from './dark-shogi-room-actions.js';
import { darkShogiEnabled } from './feature-flags.js';
import { renderShogiBoardSvg, SHOGI_HAND_ORDER, shogiHandKomaSvg } from './shogi-render.js';
import { setBoardFamily } from './theme.js';

export type DarkShogiPostgameViewKey = ShogiColor | 'truth';

const postgameAbortControllers = new WeakMap<HTMLElement, AbortController>();

export type DarkShogiPostgameResponse = {
  game: {
    roomId: string;
    variant: 'dark-shogi';
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
    status: ShogiGameStatus;
    moveNumber: number;
    clock?: unknown;
    timeControl?: { initialMs: number; incrementMs: number };
  };
  timeline: Array<{
    type: string;
    at: number;
    color?: ShogiColor;
    move?: ShogiMove;
    ply?: number;
    winner?: ShogiColor;
    reason?: string;
  }>;
  view: ShogiPlayerView;
  views?: Partial<Record<DarkShogiPostgameViewKey, ShogiPlayerView>>;
  history?: Partial<
    Record<DarkShogiPostgameViewKey, Array<{ ply: number; view: ShogiPlayerView }>>
  >;
};

type LoadResult =
  | { ok: true; postgame: DarkShogiPostgameResponse }
  | { ok: false; status: number; error: string };

type PostgameEntry = { key: DarkShogiPostgameViewKey; label: string; view: ShogiPlayerView };

export function mountDarkShogiPostgame(root: HTMLElement, roomId: string): void {
  root.classList.add('landing-page', 'dark-shogi-postgame-route');
  setBoardFamily('chess');
  root.replaceChildren(loadingView());
  if (!darkShogiEnabled()) {
    renderError(root, 'Dark Shogi unavailable', 'This route is not enabled in this build.');
    return;
  }
  void loadDarkShogiPostgame(roomId)
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

export async function loadDarkShogiPostgame(roomId: string): Promise<LoadResult> {
  const response = await fetch(darkShogiPostgameApiUrl(roomId));
  if (!response.ok) {
    const body = await safeJson(response);
    return {
      ok: false,
      status: response.status,
      error: typeof body?.error === 'string' ? body.error : 'request_failed',
    };
  }
  return { ok: true, postgame: (await response.json()) as DarkShogiPostgameResponse };
}

export function darkShogiPostgameApiUrl(roomId: string): string {
  const url = new URL(`/api/dark-shogi/games/${encodeURIComponent(roomId)}`, window.location.href);
  return url.pathname;
}

function renderPostgame(root: HTMLElement, postgame: DarkShogiPostgameResponse): void {
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
  title.textContent = 'Dark Shogi';
  const summary = document.createElement('p');
  summary.className = 'dxq-postgame__summary';
  summary.textContent = `${resultLabel(postgame.game.result)} by ${labelize(postgame.game.termination)} · ${postgame.game.plyCount} plies`;
  titleBlock.append(eyebrow, title, summary);
  header.append(titleBlock, postgameActions(postgame));

  const layout = document.createElement('section');
  layout.className = 'dxq-postgame__layout';
  layout.setAttribute('aria-label', 'Dark Shogi postgame');

  const side = document.createElement('aside');
  side.className = 'dxq-postgame__side';
  side.append(detailsPanel(postgame), timelinePanel(postgame));

  layout.append(boardsPanel(postgame, abortController.signal), side);
  page.append(header, layout);
  root.append(page);
}

function boardsPanel(postgame: DarkShogiPostgameResponse, signal: AbortSignal): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'dxq-postgame__boards';
  const views = postgameViewEntries(postgame);
  const maxPly = postgameReplayMaxPly(postgame);
  let currentPly = maxPly;
  let boardOrientation: ShogiColor = 'black';
  const boardTargets: Array<{
    board: HTMLElement;
    topReserve: HTMLElement;
    bottomReserve: HTMLElement;
    entry: PostgameEntry;
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
    const topColor: ShogiColor = boardOrientation === 'black' ? 'white' : 'black';
    for (const { board, topReserve, bottomReserve, entry } of boardTargets) {
      const view = postgameViewAtPly(postgame, entry.key, currentPly) ?? entry.view;
      board.innerHTML = renderShogiBoardSvg(view, {
        perspective: boardOrientation,
        showFog: entry.key !== 'truth',
      });
      const revealed: readonly ShogiColor[] =
        entry.key === 'truth' ? ['black', 'white'] : [entry.key];
      renderReserve(topReserve, topColor, currentPly, postgame, revealed, false);
      renderReserve(bottomReserve, boardOrientation, currentPly, postgame, revealed, true);
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
    boardOrientation = boardOrientation === 'black' ? 'white' : 'black';
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
      boardOrientation = boardOrientation === 'black' ? 'white' : 'black';
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
    const topReserve = document.createElement('div');
    topReserve.className = 'dsg-postgame__reserve dsg-postgame__reserve--top';
    const board = document.createElement('div');
    board.className = 'dxq-postgame__board shogi-live-board';
    board.setAttribute('aria-label', `${entry.label} final Dark Shogi board`);
    const bottomReserve = document.createElement('div');
    bottomReserve.className = 'dsg-postgame__reserve dsg-postgame__reserve--bottom';
    boardTargets.push({ board, topReserve, bottomReserve, entry });
    boardWrap.append(heading, topReserve, board, bottomReserve);
    panel.append(boardWrap);
  }
  syncReplay();
  return panel;
}

function renderReserve(
  host: HTMLElement,
  color: ShogiColor,
  ply: number,
  postgame: DarkShogiPostgameResponse,
  revealed: readonly ShogiColor[],
  pointsUp: boolean,
): void {
  host.replaceChildren();
  if (!revealed.includes(color)) {
    const note = document.createElement('span');
    note.className = 'dsg-postgame__reserve-empty';
    note.textContent = 'hidden';
    host.append(note);
    return;
  }
  const hand = handForColorAtPly(postgame, color, ply);
  const entries = SHOGI_HAND_ORDER.filter((role) => (hand[role] ?? 0) > 0);
  if (entries.length === 0) {
    const note = document.createElement('span');
    note.className = 'dsg-postgame__reserve-empty';
    note.textContent = '(no pieces in hand)';
    host.append(note);
    return;
  }
  for (const role of entries) {
    host.append(reserveKoma(role, color, hand[role] ?? 0, pointsUp));
  }
}

function reserveKoma(
  role: ShogiHandRole,
  color: ShogiColor,
  count: number,
  pointsUp: boolean,
): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'dsg-postgame__reserve-koma';
  wrap.innerHTML = shogiHandKomaSvg(role, color, pointsUp);
  const badge = document.createElement('span');
  badge.className = 'dsg-postgame__reserve-count';
  badge.textContent = String(count);
  wrap.append(badge);
  return wrap;
}

// The reserve carried by a side at a given ply. The per-color fog views carry
// that side's own hand; the truth view carries no hand, so hands come from the
// color histories / final color views.
function handForColorAtPly(
  postgame: DarkShogiPostgameResponse,
  color: ShogiColor,
  ply: number,
): ShogiHand {
  const history = postgame.history?.[color];
  if (history && history.length > 0) {
    let selected = history[0] ?? null;
    for (const snapshot of history) {
      if (snapshot.ply > ply) break;
      selected = snapshot;
    }
    if (selected) return selected.view.hand;
  }
  return postgame.views?.[color]?.hand ?? {};
}

export function postgameViewEntries(postgame: DarkShogiPostgameResponse): PostgameEntry[] {
  const views = postgame.views;
  if (views?.black && views.truth && views.white) {
    return [
      { key: 'black', label: 'Black view', view: views.black },
      { key: 'truth', label: 'Server truth', view: views.truth },
      { key: 'white', label: 'White view', view: views.white },
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

export function postgameReplayMaxPly(postgame: DarkShogiPostgameResponse): number {
  const history = Object.values(postgame.history ?? {}).flat();
  return Math.max(postgame.game.plyCount, ...history.map((snapshot) => snapshot.ply), 0);
}

export function postgameViewAtPly(
  postgame: DarkShogiPostgameResponse,
  key: DarkShogiPostgameViewKey,
  ply: number,
): ShogiPlayerView | null {
  const history = postgame.history?.[key];
  if (!history || history.length === 0) return null;
  let selected = history[0] ?? null;
  for (const snapshot of history) {
    if (snapshot.ply > ply) break;
    selected = snapshot;
  }
  return selected?.view ?? null;
}

function postgameActions(postgame: DarkShogiPostgameResponse): HTMLElement {
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
    void createDarkShogiPlayAgainRoom({ timeControl: postgameTimeControl(postgame) })
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

function detailsPanel(postgame: DarkShogiPostgameResponse): HTMLElement {
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

function timelinePanel(postgame: DarkShogiPostgameResponse): HTMLElement {
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
    // One numbered row per Black+White pair (Black moves first). Fall back to
    // array index / ply parity when the wire entry omits ply or color.
    const rows = new Map<number, { black?: string; white?: string }>();
    moves.forEach((entry, index) => {
      const ply = entry.ply ?? index + 1;
      const color = entry.color ?? (ply % 2 === 1 ? 'black' : 'white');
      const moveNumber = Math.max(1, Math.ceil(ply / 2));
      const row = rows.get(moveNumber) ?? {};
      const text = notateShogiMove(entry.move!);
      if (color === 'white') row.white = text;
      else row.black = text;
      rows.set(moveNumber, row);
    });
    for (const [moveNumber, row] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
      const item = document.createElement('li');
      item.className = 'dxq-postgame__move';
      const number = document.createElement('span');
      number.className = 'dxq-postgame__move-number';
      number.textContent = String(moveNumber);
      const black = document.createElement('span');
      black.className = 'dxq-postgame__move-ply dxq-postgame__move-ply--white';
      black.textContent = row.black ?? '';
      const white = document.createElement('span');
      white.className = 'dxq-postgame__move-ply dxq-postgame__move-ply--red';
      white.textContent = row.white ?? '';
      item.append(number, black, white);
      list.append(item);
    }
  }
  panel.append(heading, list);
  return panel;
}

function notateShogiMove(move: ShogiMove): string {
  if (isShogiDrop(move)) return `${move.drop}*${move.to}`;
  return `${move.from}${move.to}${move.promote ? '+' : ''}`;
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
  if (result.status === 404) return 'This Dark Shogi game is not available.';
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
  if (result === 'black-wins') return 'Black wins';
  if (result === 'white-wins') return 'White wins';
  if (result === 'draw') return 'Draw';
  return labelize(result);
}

function timeControlLabel(postgame: DarkShogiPostgameResponse): string {
  const timeControl = postgameTimeControl(postgame);
  const initialMs = timeControl?.initialMs ?? null;
  const incrementMs = timeControl?.incrementMs ?? null;
  if (initialMs === null && incrementMs === null) return 'Untimed';
  return `${clockLabel(initialMs ?? 0)}+${Math.round((incrementMs ?? 0) / 1000)}`;
}

function postgameTimeControl(
  postgame: DarkShogiPostgameResponse,
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
