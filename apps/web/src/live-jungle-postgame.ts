import type {
  JungleBoard,
  JungleColor,
  JungleGameStatus,
  JungleMove,
  JunglePlayerView,
  JungleSquare,
} from '@mistboard/game';
import './live-xiangqi.css';
import './landing.css';
import './game-route.css';
import { jungleEnabled } from './feature-flags.js';
import { renderJungleBoardSvg } from './jungle-render.js';
import { createPane } from './replay-board.js';
import { createShareButton } from './replay-meta.js';
import { createReplayMovesPanel } from './replay-moves-panel.js';
import { buildNav } from './site-shell.js';

// Postgame review for Jungle. Jungle is PERFECT-INFORMATION: the board was always
// fully visible, so there is one review surface and one per-ply history (no
// masked/revealed split, no reveal toggle). Left info rail, one center board, right
// moves panel; arrow keys + first/prev/next/last scrub the replay, `f` flips.

type JungleSnapshot = { ply: number; view: JunglePlayerView };

export type JunglePostgameResponse = {
  game: {
    roomId: string;
    variant: 'jungle';
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
    status: JungleGameStatus;
    moveNumber: number;
    clock?: unknown;
    timeControl?: { initialMs: number; incrementMs: number };
  };
  timeline: Array<{
    type: string;
    at: number;
    color?: JungleColor;
    move?: JungleMove;
    ply?: number;
    winner?: JungleColor;
    reason?: string;
  }>;
  view: JunglePlayerView;
  history: JungleSnapshot[];
};

type JungleMoveEntry = { move: JungleMove; ply: number; color: JungleColor };

type LoadResult =
  | { ok: true; postgame: JunglePostgameResponse }
  | { ok: false; status: number; error: string };

const postgameAbortControllers = new WeakMap<HTMLElement, AbortController>();

export function mountJunglePostgame(root: HTMLElement, roomId: string): void {
  root.classList.add('landing-page', 'game-route');
  root.replaceChildren(buildNav(), loadingView());
  if (!jungleEnabled()) {
    renderError(root, 'Jungle unavailable', 'This route is not enabled in this build.');
    return;
  }
  void loadJunglePostgame(roomId)
    .then((result) => {
      if (result.ok) {
        renderPostgame(root, result.postgame, initialPlyFromSearch(window.location.search));
        return;
      }
      renderError(root, errorTitle(result.status), errorBody(result));
    })
    .catch(() => renderError(root, 'Postgame unavailable', 'The game could not be loaded.'));
}

export async function loadJunglePostgame(roomId: string): Promise<LoadResult> {
  const response = await fetch(junglePostgameApiUrl(roomId));
  if (!response.ok) {
    const body = await safeJson(response);
    return {
      ok: false,
      status: response.status,
      error: typeof body?.error === 'string' ? body.error : 'request_failed',
    };
  }
  return { ok: true, postgame: (await response.json()) as JunglePostgameResponse };
}

export function junglePostgameApiUrl(roomId: string): string {
  return new URL(`/api/jungle/games/${encodeURIComponent(roomId)}`, window.location.href).pathname;
}

function renderPostgame(
  root: HTMLElement,
  postgame: JunglePostgameResponse,
  initialPly: number | null = null,
): void {
  postgameAbortControllers.get(root)?.abort();
  const abortController = new AbortController();
  postgameAbortControllers.set(root, abortController);
  const { signal } = abortController;

  const shell = document.createElement('main');
  shell.className = 'game-shell jungle-postgame-shell';
  const page = document.createElement('div');
  page.className =
    'game-replay replay-page replay-meta-header analysis-tools-collapsed jungle-postgame-page';

  const rail = document.createElement('aside');
  rail.className = 'banqi-review-rail side-panel';
  const railSection = document.createElement('section');
  railSection.className = 'panel-section';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'banqi-review-rail__eyebrow';
  eyebrow.textContent = 'Game review';
  const title = document.createElement('h1');
  title.className = 'banqi-review-rail__title';
  title.textContent = 'Jungle';

  const result = document.createElement('div');
  result.className = 'banqi-review-rail__result';
  const chip = document.createElement('span');
  chip.className = `replay-game-header-result-chip replay-game-header-result-${resultChipKind(postgame.game.result)}`;
  chip.textContent = resultLabel(postgame.game.result);
  const detail = document.createElement('span');
  detail.className = 'replay-game-header-result-detail';
  detail.textContent = `by ${labelize(postgame.game.termination)}`;
  result.append(chip, detail);

  const meta = document.createElement('p');
  meta.className = 'banqi-review-rail__meta';
  meta.textContent = [
    timeControlLabel(postgame),
    `${postgame.game.plyCount} plies`,
    postgame.game.rated ? 'Rated' : 'Casual',
  ].join(' · ');

  const seats = document.createElement('div');
  seats.className = 'banqi-review-rail__seats';
  seats.append(seatCell('Red').el, seatCell('Black').el);

  const actions = document.createElement('div');
  actions.className = 'banqi-review-rail__actions';
  const flipBtn = headerAction('Flip');
  flipBtn.setAttribute('aria-label', 'Flip board');
  flipBtn.title = 'Flip board (f)';
  const share = createShareButton();
  const home = headerLink('Home', '/');
  const room = headerLink('Room', `/room/${encodeURIComponent(postgame.game.roomId)}`);
  actions.append(flipBtn, share, home, room);

  railSection.append(eyebrow, title, result, meta, seats, actions);
  rail.append(railSection);

  const layout = document.createElement('div');
  layout.className = 'replay-layout replay-layout-crossroads';
  const pane = createPane('', 'truth', false, 'single');
  pane.boardEl.classList.add('jungle-postgame-board', 'jungle-live-board');
  layout.append(pane.el);

  const movesPanel = createReplayMovesPanel();
  page.append(rail, layout, movesPanel.el);
  shell.append(page);
  root.replaceChildren(buildNav(), shell);

  const moves: JungleMoveEntry[] = postgame.timeline
    .filter(
      (entry): entry is typeof entry & { move: JungleMove; ply: number; color: JungleColor } =>
        entry.type === 'move-played' &&
        !!entry.move &&
        typeof entry.ply === 'number' &&
        !!entry.color,
    )
    .map((entry) => ({ move: entry.move, ply: entry.ply, color: entry.color }));
  const maxPly = junglePostgameMaxPly(postgame);
  let currentPly = initialPly === null ? maxPly : clampPly(initialPly, maxPly);
  let orientation: JungleColor = 'red';

  const jump = (ply: number, options: { replaceUrl?: boolean } = {}) => {
    currentPly = clampPly(ply, maxPly);
    if (options.replaceUrl !== false) replaceReviewPlyInUrl(currentPly, maxPly);
    sync();
  };

  const sync = () => {
    const view = junglePostgameViewAtPly(postgame, currentPly) ?? postgame.view;
    pane.boardEl.innerHTML = renderJungleBoardSvg(view.board as JungleBoard, {
      perspective: orientation,
      lastMove: view.lastMove ?? null,
    });
    movesPanel.meta.textContent =
      moves.length === 0
        ? 'No moves'
        : `Move ${Math.ceil(currentPly / 2)} · ply ${currentPly} of ${maxPly}`;
    movesPanel.controls.first.disabled = currentPly <= 0;
    movesPanel.controls.prev.disabled = currentPly <= 0;
    movesPanel.controls.next.disabled = currentPly >= maxPly;
    movesPanel.controls.last.disabled = currentPly >= maxPly;
    renderMoveRows(movesPanel.moveList, moves, currentPly, jump);
  };

  movesPanel.controls.first.onclick = () => jump(0);
  movesPanel.controls.prev.onclick = () => jump(currentPly - 1);
  movesPanel.controls.next.onclick = () => jump(currentPly + 1);
  movesPanel.controls.last.onclick = () => jump(maxPly);

  const flip = () => {
    orientation = orientation === 'red' ? 'black' : 'red';
    sync();
  };
  flipBtn.onclick = flip;

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }
      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        flip();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        jump(currentPly - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        jump(currentPly + 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        jump(0);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        jump(maxPly);
      }
    },
    { signal },
  );

  sync();
}

// Exported for the Mistboard TV watch adapter (watch-jungle-replay.ts), which
// reuses the same single per-ply history lookup.
export function junglePostgameViewAtPly(
  postgame: JunglePostgameResponse,
  ply: number,
): JunglePlayerView | null {
  const history = postgame.history;
  if (!history || history.length === 0) return null;
  let selected = history[0] ?? null;
  for (const snapshot of history) {
    if (snapshot.ply > ply) break;
    selected = snapshot;
  }
  return selected?.view ?? null;
}

export function junglePostgameMaxPly(postgame: JunglePostgameResponse): number {
  return Math.max(postgame.game.plyCount, ...postgame.history.map((s) => s.ply), 0);
}

function renderMoveRows(
  list: HTMLOListElement,
  moves: JungleMoveEntry[],
  activePly: number,
  onJump: (ply: number) => void,
): void {
  list.replaceChildren();
  if (moves.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'move-row move-empty';
    empty.textContent = 'No moves';
    list.append(empty);
    return;
  }
  const byPly = new Map<number, JungleMoveEntry>();
  for (const move of moves) byPly.set(move.ply, move);
  const maxPly = Math.max(...moves.map((move) => move.ply));
  const fullMoves = Math.ceil(maxPly / 2);
  for (let moveNumber = 1; moveNumber <= fullMoves; moveNumber += 1) {
    const row = document.createElement('li');
    row.className = 'move-row';
    const number = document.createElement('span');
    number.className = 'move-number';
    number.textContent = String(moveNumber);
    row.append(
      number,
      moveCell(byPly.get(moveNumber * 2 - 1), 'white', moveNumber * 2 - 1, activePly, onJump),
      moveCell(byPly.get(moveNumber * 2), 'black', moveNumber * 2, activePly, onJump),
    );
    list.append(row);
  }
  scrollActiveMoveIntoView(list);
}

function moveCell(
  entry: JungleMoveEntry | undefined,
  cell: 'white' | 'black',
  ply: number,
  activePly: number,
  onJump: (ply: number) => void,
): HTMLElement {
  if (!entry) {
    const empty = document.createElement('span');
    empty.className = `${cell}-ply move-empty`;
    return empty;
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `${cell}-ply${activePly === ply ? ' active' : ''}`;
  button.textContent = `${entry.move.from}-${entry.move.to}`;
  button.title = `${entry.color === 'red' ? 'Red' : 'Black'} ply ${ply}`;
  button.onclick = () => onJump(ply);
  return button;
}

function scrollActiveMoveIntoView(list: HTMLOListElement): void {
  window.requestAnimationFrame(() => {
    const active = list.querySelector<HTMLButtonElement>('button.active');
    if (!active) return;
    const listRect = list.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const centeredDelta =
      activeRect.top - listRect.top - (list.clientHeight - activeRect.height) / 2;
    list.scrollTo({ top: Math.max(0, list.scrollTop + centeredDelta), behavior: 'auto' });
  });
}

function resultLabel(result: string): string {
  if (result === 'red-wins') return 'Red won';
  if (result === 'black-wins') return 'Black won';
  return 'Draw';
}

function resultChipKind(result: string): 'white' | 'black' | 'draw' {
  if (result === 'red-wins') return 'white';
  if (result === 'black-wins') return 'black';
  return 'draw';
}

type SeatCell = { el: HTMLDivElement };

function seatCell(name: string): SeatCell {
  const row = document.createElement('div');
  row.className = 'replay-clock-row';
  const label = document.createElement('span');
  label.className = 'replay-clock-side';
  label.textContent = name;
  const time = document.createElement('span');
  time.className = 'replay-clock-time';
  row.append(label, time);
  return { el: row };
}

function headerAction(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'replay-button replay-game-header-action replay-game-header-action-secondary';
  button.textContent = label;
  return button;
}

function headerLink(label: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'replay-button replay-game-header-action replay-game-header-action-secondary';
  link.href = href;
  link.textContent = label;
  return link;
}

export function initialPlyFromSearch(search: string): number | null {
  const raw = new URLSearchParams(search).get('ply');
  if (raw === null || !/^\d+$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}

function clampPly(ply: number, maxPly: number): number {
  return Math.max(0, Math.min(maxPly, ply));
}

function replaceReviewPlyInUrl(ply: number, maxPly: number): void {
  const url = new URL(window.location.href);
  if (ply >= maxPly) url.searchParams.delete('ply');
  else url.searchParams.set('ply', String(ply));
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function loadingView(): HTMLElement {
  const shell = document.createElement('main');
  shell.className = 'game-shell';
  const heading = document.createElement('h1');
  heading.textContent = 'Loading game';
  shell.append(heading);
  return shell;
}

function renderError(root: HTMLElement, titleText: string, bodyText: string): void {
  const shell = document.createElement('main');
  shell.className = 'game-shell';
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
  if (result.status === 404) return 'This Jungle game is not available.';
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

function timeControlLabel(postgame: JunglePostgameResponse): string {
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

function labelize(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

// Referenced to keep the JungleSquare import meaningful for downstream typing of
// move coordinates in the timeline payload.
export type JunglePostgameSquare = JungleSquare;
