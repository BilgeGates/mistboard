import type { JieqiColor, JieqiGameStatus, JieqiMove, JieqiPlayerView } from '@mistboard/game';
import './live-xiangqi.css';
import './landing.css';
import './game-route.css';
import { jieqiEnabled } from './feature-flags.js';
import { fillCapturedPool } from './live-jieqi.js';
import { installJieqiBoardStyles, renderJieqiBoardSvg } from './live-jieqi-render.js';
import { createPane } from './replay-board.js';
import { createShareButton } from './replay-meta.js';
import { createReplayMovesPanel } from './replay-moves-panel.js';
import { buildNav } from './site-shell.js';

export type JieqiPostgameViewKey = JieqiColor | 'truth';

const postgameAbortControllers = new WeakMap<HTMLElement, AbortController>();

export type JieqiPostgameResponse = {
  game: {
    roomId: string;
    variant: 'jieqi';
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
    status: JieqiGameStatus;
    moveNumber: number;
    clock?: unknown;
    timeControl?: { initialMs: number; incrementMs: number };
  };
  timeline: Array<{
    type: string;
    at: number;
    color?: JieqiColor;
    move?: JieqiMove;
    ply?: number;
    winner?: JieqiColor;
    reason?: string;
  }>;
  view: JieqiPlayerView;
  views?: Partial<Record<JieqiPostgameViewKey, JieqiPlayerView>>;
  history?: Partial<Record<JieqiPostgameViewKey, Array<{ ply: number; view: JieqiPlayerView }>>>;
};

type JieqiMoveEntry = { move: JieqiMove; ply: number; color: JieqiColor };

type LoadResult =
  | { ok: true; postgame: JieqiPostgameResponse }
  | { ok: false; status: number; error: string };

export function mountJieqiPostgame(root: HTMLElement, roomId: string): void {
  root.classList.add('landing-page', 'game-route');
  installJieqiBoardStyles();
  root.replaceChildren(buildNav(), loadingView());
  if (!jieqiEnabled()) {
    renderError(root, 'Jieqi unavailable', 'This route is not enabled in this build.');
    return;
  }
  void loadJieqiPostgame(roomId)
    .then((result) => {
      if (result.ok) {
        renderPostgame(root, result.postgame, jieqiInitialPlyFromSearch(window.location.search));
        return;
      }
      renderError(root, errorTitle(result.status), errorBody(result));
    })
    .catch(() => {
      renderError(root, 'Postgame unavailable', 'The game could not be loaded.');
    });
}

export async function loadJieqiPostgame(roomId: string): Promise<LoadResult> {
  const response = await fetch(jieqiPostgameApiUrl(roomId));
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
    postgame: (await response.json()) as JieqiPostgameResponse,
  };
}

export function jieqiPostgameApiUrl(roomId: string): string {
  const url = new URL(`/api/jieqi/games/${encodeURIComponent(roomId)}`, window.location.href);
  return url.pathname;
}

function renderPostgame(
  root: HTMLElement,
  postgame: JieqiPostgameResponse,
  initialPly: number | null = null,
): void {
  const priorAbort = postgameAbortControllers.get(root);
  if (priorAbort) priorAbort.abort();
  const abortController = new AbortController();
  postgameAbortControllers.set(root, abortController);
  const signal = abortController.signal;

  const shell = document.createElement('main');
  shell.className = 'game-shell jieqi-postgame-shell';
  const page = document.createElement('div');
  page.className =
    'game-replay replay-page replay-meta-header analysis-tools-collapsed jieqi-postgame-page';

  // Info rail on the LEFT (not a full-width top strip) so the board claims the
  // full column height. The rail carries the title, result, time control, seats,
  // and the review actions.
  const rail = document.createElement('aside');
  rail.className = 'jieqi-review-rail side-panel';
  const railSection = document.createElement('section');
  railSection.className = 'panel-section';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'jieqi-review-rail__eyebrow';
  eyebrow.textContent = 'Game review';
  const title = document.createElement('h1');
  title.className = 'jieqi-review-rail__title';
  title.textContent = 'Jieqi';

  const result = document.createElement('div');
  result.className = 'jieqi-review-rail__result';
  const chip = document.createElement('span');
  chip.className = `replay-game-header-result-chip replay-game-header-result-${resultChipKind(postgame.game.result)}`;
  chip.textContent = resultLabel(postgame.game.result);
  const detail = document.createElement('span');
  detail.className = 'replay-game-header-result-detail';
  detail.textContent = `by ${labelize(postgame.game.termination)}`;
  result.append(chip, detail);

  const meta = document.createElement('p');
  meta.className = 'jieqi-review-rail__meta';
  meta.textContent = [
    timeControlLabel(postgame),
    `${postgame.game.plyCount} plies`,
    postgame.game.rated ? 'Rated' : 'Casual',
  ].join(' · ');

  // Jieqi postgame payloads carry no seat names, so the rows fall back to the
  // color labels (Red moves first, like White in chess).
  const seats = document.createElement('div');
  seats.className = 'jieqi-review-rail__seats';
  seats.append(seatCell('Red').el, seatCell('Black').el);

  const actions = document.createElement('div');
  actions.className = 'jieqi-review-rail__actions';
  const revealBtn = headerAction('Reveal identities');
  revealBtn.setAttribute('aria-pressed', 'true');
  revealBtn.title = 'Toggle hidden-piece identities (h)';
  const flipBtn = headerAction('Flip');
  flipBtn.setAttribute('aria-label', 'Flip board');
  flipBtn.title = 'Flip board (f)';
  const share = createShareButton();
  const home = headerLink('Home', '/');
  const room = headerLink('Room', `/room/${encodeURIComponent(postgame.game.roomId)}`);
  actions.append(revealBtn, flipBtn, share, home, room);

  railSection.append(eyebrow, title, result, meta, seats, actions);
  rail.append(railSection);

  const layout = document.createElement('div');
  layout.className = 'replay-layout replay-layout-crossroads';
  // Empty pane label: no caption strip above the board, so it gets the full height.
  const pane = createPane('', 'truth', true, 'split');
  pane.boardEl.classList.add('jieqi-postgame-board');
  // With no top strip, the board can take the freed column height; cap by viewport
  // height (and a px ceiling) since jieqi's board is ~10% taller than wide.
  pane.boardEl.style.width = 'min(66vh, 540px)';
  pane.boardEl.style.maxWidth = '540px';
  pane.boardEl.style.margin = '0 auto';
  layout.append(pane.el);

  const movesPanel = createReplayMovesPanel();

  page.append(rail, layout, movesPanel.el);
  shell.append(page);
  root.replaceChildren(buildNav(), shell);

  const moves: JieqiMoveEntry[] = postgame.timeline
    .filter(
      (entry): entry is typeof entry & { move: JieqiMove; ply: number; color: JieqiColor } =>
        entry.type === 'move-played' &&
        !!entry.move &&
        typeof entry.ply === 'number' &&
        !!entry.color,
    )
    .map((entry) => ({ move: entry.move, ply: entry.ply, color: entry.color }));
  const maxPly = postgameReplayMaxPly(postgame);
  let currentPly = initialPly === null ? maxPly : clampPly(initialPly, maxPly);
  let boardOrientation: JieqiColor = 'red';
  // Default to the as-played board: unmoved pieces show as face-down backs, the way
  // the position actually looked. The toggle (button / `h`) reveals server truth.
  let revealed = false;

  const jump = (ply: number, options: { replaceUrl?: boolean } = {}) => {
    currentPly = clampPly(ply, maxPly);
    if (options.replaceUrl !== false) replaceReviewPlyInUrl(currentPly, maxPly);
    sync();
  };

  const sync = () => {
    // Reveal on → truth (every identity). Reveal off → the orientation seat's
    // as-played view: identical board to the other seat (jieqi hides identities
    // symmetrically), differing only in captured-tray knowledge.
    const viewKey: JieqiPostgameViewKey = revealed ? 'truth' : boardOrientation;
    const fallback = revealed
      ? (postgame.views?.truth ?? postgame.view)
      : (postgame.views?.[boardOrientation] ?? postgame.view);
    const view = postgameViewAtPly(postgame, viewKey, currentPly) ?? fallback;
    pane.boardEl.innerHTML = renderJieqiBoardSvg(view, boardOrientation, {});
    renderCapturedPools(pane.topCapturesEl, pane.capturesEl, view, boardOrientation);
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
    boardOrientation = oppositeJieqiColor(boardOrientation);
    sync();
  };
  flipBtn.onclick = flip;

  const toggleReveal = () => {
    revealed = !revealed;
    revealBtn.textContent = revealed ? 'Hide identities' : 'Reveal identities';
    revealBtn.setAttribute('aria-pressed', String(!revealed));
    sync();
  };
  revealBtn.onclick = toggleReveal;

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
      } else if (event.key === 'h' || event.key === 'H') {
        event.preventDefault();
        toggleReveal();
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

// Lichess convention: a player's captured material sits next to that player. The
// bottom strip is the viewer's side (orientation), so it shows what the viewer
// captured (the opponent's lost pieces); the top strip shows what the opponent
// captured (the viewer's lost pieces). fillCapturedPool filters by former owner.
function renderCapturedPools(
  top: HTMLElement,
  bottom: HTMLElement,
  view: JieqiPlayerView,
  orientation: JieqiColor,
): void {
  top.replaceChildren();
  bottom.replaceChildren();
  const opponent = oppositeJieqiColor(orientation);
  fillCapturedPool(top, view.captured, orientation);
  fillCapturedPool(bottom, view.captured, opponent);
}

function oppositeJieqiColor(color: JieqiColor): JieqiColor {
  return color === 'red' ? 'black' : 'red';
}

// Exported for the watch-replay surface to reuse the per-ply view selection,
// mirroring the Dark Mini Xiangqi postgame module's exported helpers.
export function postgameViewEntries(
  postgame: JieqiPostgameResponse,
): Array<{ key: JieqiPostgameViewKey; label: string; view: JieqiPlayerView }> {
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

export function postgameReplayMaxPly(postgame: JieqiPostgameResponse): number {
  const history = Object.values(postgame.history ?? {}).flat();
  return Math.max(postgame.game.plyCount, ...history.map((snapshot) => snapshot.ply), 0);
}

export function postgameViewAtPly(
  postgame: JieqiPostgameResponse,
  key: JieqiPostgameViewKey,
  ply: number,
): JieqiPlayerView | null {
  const history = postgame.history?.[key];
  if (!history || history.length === 0) return null;
  let selected = history[0] ?? null;
  for (const snapshot of history) {
    if (snapshot.ply > ply) break;
    selected = snapshot;
  }
  return selected?.view ?? null;
}

export function renderMoveRows(
  list: HTMLOListElement,
  moves: JieqiMoveEntry[],
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
  const byPly = new Map<number, JieqiMoveEntry>();
  for (const move of moves) byPly.set(move.ply, move);
  const maxPly = Math.max(...moves.map((move) => move.ply));
  const fullMoves = Math.ceil(maxPly / 2);
  for (let moveNumber = 1; moveNumber <= fullMoves; moveNumber += 1) {
    const row = document.createElement('li');
    row.className = 'move-row';
    const number = document.createElement('span');
    number.className = 'move-number';
    number.textContent = String(moveNumber);
    // Red is the first mover, so it takes the left ("white") cell; Black the right.
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
  entry: JieqiMoveEntry | undefined,
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
  button.textContent = moveLabel(entry.move);
  button.title = `${capitalize(entry.color)} ply ${ply}: ${moveLabel(entry.move)}`;
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

function moveLabel(move: JieqiMove): string {
  return `${move.from}-${move.to}`;
}

function resultChipKind(result: string): 'white' | 'black' | 'draw' {
  // Red is the first mover, so it maps to the "white" chip in the shared header
  // palette (matching the Jieqi watch surface).
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

export function jieqiInitialPlyFromSearch(search: string): number | null {
  const raw = new URLSearchParams(search).get('ply');
  if (raw === null || !/^\d+$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}

function clampPly(ply: number, maxPly: number): number {
  return Math.max(0, Math.min(maxPly, ply));
}

function replaceReviewPlyInUrl(ply: number, maxPly: number): void {
  const url = new URL(window.location.href);
  if (ply >= maxPly) {
    url.searchParams.delete('ply');
  } else {
    url.searchParams.set('ply', String(ply));
  }
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
  if (status === 503) return 'Postgame unavailable';
  return 'Postgame unavailable';
}

function errorBody(result: Extract<LoadResult, { ok: false }>): string {
  if (result.status === 404) return 'This Jieqi game is not available.';
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
  if (result === 'red-wins') return 'Red wins';
  if (result === 'black-wins') return 'Black wins';
  if (result === 'draw') return 'Draw';
  return labelize(result);
}

function timeControlLabel(postgame: JieqiPostgameResponse): string {
  const timeControl = postgameTimeControl(postgame);
  const initialMs = timeControl?.initialMs ?? null;
  const incrementMs = timeControl?.incrementMs ?? null;
  if (initialMs === null && incrementMs === null) return 'Untimed';
  return `${clockLabel(initialMs ?? 0)}+${Math.round((incrementMs ?? 0) / 1000)}`;
}

function postgameTimeControl(
  postgame: JieqiPostgameResponse,
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

function labelize(value: string): string {
  return value.split('-').filter(Boolean).map(capitalize).join(' ');
}

function capitalize(value: string): string {
  if (!value) return value;
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
