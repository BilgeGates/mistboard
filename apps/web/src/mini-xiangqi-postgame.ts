import type { MiniXiangqiColor, MiniXiangqiMove, MiniXiangqiPlayerView } from '@mistboard/game';
import './landing.css';
import './game-route.css';
import {
  installMiniXiangqiBoardStyles,
  renderMiniXiangqiBoardSvg,
} from './live-mini-xiangqi-render.js';
import { type MiniXiangqiViewKey, miniXiangqiMoveLabel } from './mini-xiangqi-view.js';
import { createPane } from './replay-board.js';
import { createShareButton } from './replay-meta.js';
import { createReplayMovesPanel } from './replay-moves-panel.js';
import { buildNav } from './site-shell.js';
import { setBoardFamily, xiangqiAppearanceChangedEvent } from './theme.js';

const postgameAbortControllers = new WeakMap<HTMLElement, AbortController>();

export type MiniXiangqiPostgameResponse = {
  game: {
    roomId: string;
    variant: 'mini-xiangqi';
    mode: string;
    redName?: string | null;
    blackName?: string | null;
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
    status: { type: string; winner?: MiniXiangqiColor | null; reason?: string };
    moveNumber: number;
    clock?: unknown;
    timeControl?: { initialMs: number; incrementMs: number };
  };
  timeline: Array<{
    type: string;
    at: number;
    color?: MiniXiangqiColor;
    move?: MiniXiangqiMove;
    ply?: number;
    winner?: MiniXiangqiColor;
    reason?: string;
  }>;
  view: MiniXiangqiPlayerView;
  views?: Partial<Record<MiniXiangqiViewKey, MiniXiangqiPlayerView>>;
  history?: Partial<
    Record<MiniXiangqiViewKey, Array<{ ply: number; view: MiniXiangqiPlayerView }>>
  >;
};

type MiniMoveEntry = { move: MiniXiangqiMove; ply: number; color: MiniXiangqiColor };

type LoadResult =
  | { ok: true; postgame: MiniXiangqiPostgameResponse }
  | { ok: false; status: number; error: string };

export function mountMiniXiangqiPostgame(root: HTMLElement, roomId: string): void {
  root.classList.add('landing-page', 'game-route');
  setBoardFamily('xiangqi');
  installMiniXiangqiBoardStyles();
  root.replaceChildren(buildNav(), loadingView());
  void loadMiniXiangqiPostgame(roomId)
    .then((result) => {
      if (result.ok) {
        renderPostgame(root, result.postgame, initialPlyFromSearch(window.location.search));
        return;
      }
      renderError(root, errorTitle(result.status), errorBody(result));
    })
    .catch(() => {
      renderError(root, 'Postgame unavailable', 'The game could not be loaded.');
    });
}

export async function loadMiniXiangqiPostgame(roomId: string): Promise<LoadResult> {
  const response = await fetch(miniXiangqiPostgameApiUrl(roomId));
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
    postgame: (await response.json()) as MiniXiangqiPostgameResponse,
  };
}

export function miniXiangqiPostgameApiUrl(roomId: string): string {
  const url = new URL(
    `/api/mini-xiangqi/games/${encodeURIComponent(roomId)}`,
    window.location.href,
  );
  return url.pathname;
}

function renderPostgame(
  root: HTMLElement,
  postgame: MiniXiangqiPostgameResponse,
  initialPly: number | null = null,
): void {
  const priorAbort = postgameAbortControllers.get(root);
  if (priorAbort) priorAbort.abort();
  const abortController = new AbortController();
  postgameAbortControllers.set(root, abortController);
  const signal = abortController.signal;
  window.addEventListener(xiangqiAppearanceChangedEvent, () => renderPostgame(root, postgame), {
    signal,
  });

  const shell = document.createElement('main');
  shell.className = 'game-shell banqi-postgame-shell';
  const page = document.createElement('div');
  page.className =
    'game-replay replay-page replay-meta-header analysis-tools-collapsed banqi-postgame-page';

  const rail = document.createElement('aside');
  rail.className = 'banqi-review-rail side-panel';
  const railSection = document.createElement('section');
  railSection.className = 'panel-section';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'banqi-review-rail__eyebrow';
  eyebrow.textContent = 'Game review';
  const title = document.createElement('h1');
  title.className = 'banqi-review-rail__title';
  title.textContent = 'Mini Xiangqi';

  const result = document.createElement('div');
  result.className = 'banqi-review-rail__result';
  const chip = document.createElement('span');
  chip.className = `replay-game-header-result-chip replay-game-header-result-${resultChipKind(
    postgame.game.result,
  )}`;
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
  ].join(' - ');

  const seats = document.createElement('div');
  seats.className = 'banqi-review-rail__seats';
  seats.append(seatCell(postgame.game.redName ?? 'Guest', 'Red').el);
  seats.append(seatCell(postgame.game.blackName ?? 'Guest', 'Black').el);

  const actions = document.createElement('div');
  actions.className = 'banqi-review-rail__actions';
  const flipBtn = headerAction('Flip');
  flipBtn.setAttribute('aria-label', 'Flip board');
  flipBtn.title = 'Flip board (f)';
  const playAgain = headerAction('Play again');
  const share = createShareButton();
  const home = headerLink('Home', '/');
  const room = headerLink('Room', `/room/${encodeURIComponent(postgame.game.roomId)}`);
  actions.append(flipBtn, playAgain, share, home, room);

  railSection.append(eyebrow, title, result, meta, seats, actions);
  rail.append(railSection);

  const layout = document.createElement('div');
  layout.className = 'replay-layout replay-layout-crossroads';
  const pane = createPane('', 'truth', true, 'split');
  pane.boardEl.classList.add('mini-xiangqi-live-board');
  layout.append(pane.el);

  const movesPanel = createReplayMovesPanel();

  page.append(rail, layout, movesPanel.el);
  shell.append(page);
  root.replaceChildren(buildNav(), shell);

  const moves: MiniMoveEntry[] = postgame.timeline
    .filter(
      (
        entry,
      ): entry is typeof entry & {
        move: MiniXiangqiMove;
        ply: number;
        color: MiniXiangqiColor;
      } =>
        entry.type === 'move-played' &&
        !!entry.move &&
        typeof entry.ply === 'number' &&
        !!entry.color,
    )
    .map((entry) => ({ move: entry.move, ply: entry.ply, color: entry.color }));
  const maxPly = postgameReplayMaxPly(postgame);
  let currentPly = initialPly === null ? maxPly : clampPly(initialPly, maxPly);
  let boardOrientation: MiniXiangqiColor = 'red';

  const jump = (ply: number, options: { replaceUrl?: boolean } = {}) => {
    currentPly = clampPly(ply, maxPly);
    if (options.replaceUrl !== false) replaceReviewPlyInUrl(currentPly, maxPly);
    sync();
  };

  const sync = () => {
    const view =
      postgameViewAtPly(postgame, 'truth', currentPly) ?? postgame.views?.truth ?? postgame.view;
    pane.boardEl.innerHTML = renderMiniXiangqiBoardSvg(view, boardOrientation, { showFog: false });
    pane.topCapturesEl.replaceChildren();
    pane.capturesEl.replaceChildren();
    movesPanel.meta.textContent =
      moves.length === 0
        ? 'No moves'
        : `Move ${Math.ceil(currentPly / 2)} - ply ${currentPly} of ${maxPly}`;
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
    boardOrientation = boardOrientation === 'red' ? 'black' : 'red';
    sync();
  };
  flipBtn.onclick = flip;

  let playAgainBusy = false;
  playAgain.onclick = () => {
    if (playAgainBusy) return;
    playAgainBusy = true;
    playAgain.disabled = true;
    playAgain.textContent = 'Creating';
    void createMiniXiangqiPlayAgainRoom(postgame)
      .then((url) => window.location.assign(url))
      .catch((err) => {
        console.warn(err);
        playAgainBusy = false;
        playAgain.disabled = false;
        playAgain.textContent = 'Try play again';
      });
  };

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

async function createMiniXiangqiPlayAgainRoom(
  postgame: MiniXiangqiPostgameResponse,
): Promise<string> {
  const response = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'pvp',
      gameSpecId: 'mini-xiangqi',
      preferredColor: 'random',
      rated: false,
      ...(postgameTimeControl(postgame) ? { timeControl: postgameTimeControl(postgame) } : {}),
    }),
  });
  if (!response.ok) throw new Error('mini_xiangqi_play_again_failed');
  const body = (await response.json()) as { url?: unknown };
  if (typeof body.url !== 'string') throw new Error('mini_xiangqi_play_again_missing_url');
  return body.url;
}

export function postgameViewEntries(
  postgame: MiniXiangqiPostgameResponse,
): Array<{ key: MiniXiangqiViewKey; label: string; view: MiniXiangqiPlayerView }> {
  return [{ key: 'truth', label: 'Server truth', view: postgame.views?.truth ?? postgame.view }];
}

export function postgameReplayMaxPly(postgame: MiniXiangqiPostgameResponse): number {
  const history = Object.values(postgame.history ?? {}).flat();
  return Math.max(postgame.game.plyCount, ...history.map((snapshot) => snapshot.ply), 0);
}

export function postgameViewAtPly(
  postgame: MiniXiangqiPostgameResponse,
  key: MiniXiangqiViewKey,
  ply: number,
): MiniXiangqiPlayerView | null {
  const history = postgame.history?.[key];
  if (!history || history.length === 0) return null;
  let selected = history[0] ?? null;
  for (const snapshot of history) {
    if (snapshot.ply > ply) break;
    selected = snapshot;
  }
  return selected?.view ?? null;
}

function renderMoveRows(
  list: HTMLOListElement,
  moves: MiniMoveEntry[],
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
  const byPly = new Map<number, MiniMoveEntry>();
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
  entry: MiniMoveEntry | undefined,
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
  const label = miniXiangqiMoveLabel(entry.move);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `${cell}-ply${activePly === ply ? ' active' : ''}`;
  button.textContent = label;
  button.title = `${entry.color} ply ${ply}: ${label}`;
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

function resultChipKind(result: string): 'white' | 'black' | 'draw' {
  if (result === 'red-wins') return 'white';
  if (result === 'black-wins') return 'black';
  return 'draw';
}

function resultLabel(result: string): string {
  if (result === 'red-wins') return 'Red wins';
  if (result === 'black-wins') return 'Black wins';
  return 'Draw';
}

type SeatCell = { el: HTMLDivElement };

function seatCell(name: string, side: string): SeatCell {
  const row = document.createElement('div');
  row.className = 'replay-clock-row';
  const label = document.createElement('span');
  label.className = 'replay-clock-side';
  label.textContent = side;
  const player = document.createElement('span');
  player.className = 'replay-clock-time';
  player.textContent = name;
  row.append(label, player);
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

function initialPlyFromSearch(search: string): number | null {
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
  if (result.status === 404) return 'This Mini Xiangqi game is not available.';
  if (result.status === 503) return 'The postgame service is not available.';
  return result.error === 'request_failed' ? 'The request failed.' : `Error: ${result.error}`;
}

async function safeJson(response: Response): Promise<{ error?: unknown } | null> {
  try {
    return (await response.json()) as { error?: unknown };
  } catch {
    return null;
  }
}

function labelize(value: string): string {
  const spaced = value.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function postgameTimeControl(
  postgame: MiniXiangqiPostgameResponse,
): { initialMs: number; incrementMs: number } | null {
  const fromState = postgame.state.timeControl;
  if (fromState) return fromState;
  if (postgame.game.initialMs === null) return null;
  return {
    initialMs: postgame.game.initialMs,
    incrementMs: postgame.game.incrementMs ?? 0,
  };
}

function timeControlLabel(postgame: MiniXiangqiPostgameResponse): string {
  const tc = postgameTimeControl(postgame);
  if (!tc) return 'Untimed';
  const minutes = tc.initialMs / 60_000;
  const increment = tc.incrementMs / 1000;
  const minuteLabel = Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
  return `${minuteLabel}+${increment}`;
}
