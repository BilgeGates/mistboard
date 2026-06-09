import type {
  DUAL_CHESS_SPEC_ID,
  DualChessColor,
  DualChessGameStatus,
  DualChessMove,
  DualChessPlayerView,
} from '@mistboard/game';
import './landing.css';
import './game-route.css';
import { renderDualChessBoardSvg } from './dual-chess-render.js';
import { dualChessEnabled } from './feature-flags.js';
import { createPane } from './replay-board.js';
import { createGameHeaderStrip } from './replay-meta.js';
import { createReplayMovesPanel } from './replay-moves-panel.js';
import { buildNav } from './site-shell.js';

type DualChessTimeControl = { initialMs: number; incrementMs: number };
export type DualChessPostgameViewKey = DualChessColor | 'truth';

export type DualChessPostgameResponse = {
  game: {
    roomId: string;
    variant: typeof DUAL_CHESS_SPEC_ID;
    mode: string;
    whiteName?: string | null;
    redName?: string | null;
    result: string;
    termination: string;
    plyCount: number;
    startedAt: string;
    endedAt: string;
    rated: boolean;
    visibility: string;
    timeControl?: DualChessTimeControl;
  };
  state: {
    status: DualChessGameStatus;
    moveNumber: number;
    progressClock: number;
    timeControl?: DualChessTimeControl;
  };
  timeline: Array<{
    type: string;
    at: number;
    color?: DualChessColor;
    move?: DualChessMove;
    ply?: number;
    winner?: DualChessColor;
    reason?: string;
  }>;
  clocks?: Array<Record<DualChessColor, number>>;
  view: DualChessPlayerView;
  views?: Partial<Record<DualChessPostgameViewKey, DualChessPlayerView>>;
  history?: Partial<
    Record<DualChessPostgameViewKey, Array<{ ply: number; view: DualChessPlayerView }>>
  >;
};

type LoadResult =
  | { ok: true; postgame: DualChessPostgameResponse }
  | { ok: false; status: number; error: string };

const postgameAbortControllers = new WeakMap<HTMLElement, AbortController>();

export function mountDualChessPostgame(root: HTMLElement, roomId: string): void {
  root.classList.add('landing-page', 'game-route');
  root.replaceChildren(buildNav(), loadingView());
  if (!dualChessEnabled()) {
    renderError(root, 'Crossroads Chess unavailable', 'This route is not enabled in this build.');
    return;
  }
  void loadDualChessPostgame(roomId)
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

export async function loadDualChessPostgame(roomId: string): Promise<LoadResult> {
  const response = await fetch(dualChessPostgameApiUrl(roomId));
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
    postgame: (await response.json()) as DualChessPostgameResponse,
  };
}

export function dualChessPostgameApiUrl(roomId: string): string {
  const url = new URL(`/api/dual-chess/games/${encodeURIComponent(roomId)}`, window.location.href);
  return url.pathname;
}

function renderPostgame(root: HTMLElement, postgame: DualChessPostgameResponse): void {
  const priorAbort = postgameAbortControllers.get(root);
  if (priorAbort) priorAbort.abort();
  const abortController = new AbortController();
  postgameAbortControllers.set(root, abortController);
  const signal = abortController.signal;

  const shell = document.createElement('main');
  shell.className = 'game-shell';
  const page = document.createElement('div');
  page.className = 'game-replay replay-page replay-meta-header analysis-tools-collapsed';

  const header = createGameHeaderStrip();
  header.title.textContent = 'Crossroads Chess';

  const chip = document.createElement('span');
  chip.className = `replay-game-header-result-chip replay-game-header-result-${resultChipKind(postgame.game.result)}`;
  chip.textContent = resultLabel(postgame.game.result);
  const detail = document.createElement('span');
  detail.className = 'replay-game-header-result-detail';
  detail.textContent = `by ${labelize(postgame.game.termination)}`;
  header.result.append(chip, detail);

  const plies = document.createElement('span');
  plies.textContent = `${postgame.game.plyCount} plies`;
  const clock = document.createElement('span');
  clock.textContent = timeControlLabel(postgame);
  const rated = document.createElement('span');
  rated.textContent = postgame.game.rated ? 'Rated' : 'Casual';
  appendHeaderMeta(header.meta, [plies, clock, rated]);

  header.whiteCell.append(seatCell(postgame.game.whiteName ?? 'Guest', 'White'));
  header.blackCell.append(seatCell(postgame.game.redName ?? 'Guest', 'Red'));

  const flipBtn = headerAction('Flip');
  flipBtn.setAttribute('aria-label', 'Flip board');
  flipBtn.title = 'Flip board (f)';
  const playAgain = headerAction('Play again');
  const home = headerLink('Home', '/');
  header.actions.append(flipBtn, playAgain, home);

  const layout = document.createElement('div');
  layout.className = 'replay-layout replay-layout-crossroads';
  const pane = createPane('Full board', 'truth', false);
  layout.append(pane.el);

  const movesPanel = createReplayMovesPanel();

  page.append(header.el, layout, movesPanel.el);
  shell.append(page);
  root.replaceChildren(buildNav(), shell);

  const moves = postgame.timeline.filter(
    (entry): entry is typeof entry & { move: DualChessMove; ply: number; color: DualChessColor } =>
      entry.type === 'move-played' &&
      !!entry.move &&
      typeof entry.ply === 'number' &&
      !!entry.color,
  );
  const maxPly = postgameReplayMaxPly(postgame);
  let currentPly = maxPly;
  let boardOrientation: DualChessColor = 'white';

  const jump = (ply: number) => {
    currentPly = Math.max(0, Math.min(maxPly, ply));
    sync();
  };
  const sync = () => {
    const view = postgameViewAtPly(postgame, boardOrientation, currentPly) ?? postgame.view;
    pane.boardEl.innerHTML = renderDualChessBoardSvg(view, {
      perspective: boardOrientation,
      showFog: false,
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
    boardOrientation = boardOrientation === 'white' ? 'red' : 'white';
    sync();
  };
  flipBtn.onclick = flip;

  let playAgainBusy = false;
  playAgain.onclick = () => {
    if (playAgainBusy) return;
    playAgainBusy = true;
    playAgain.disabled = true;
    playAgain.textContent = 'Creating';
    void createCrossroadsPlayAgainRoom(postgame)
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

function resultChipKind(result: string): 'white' | 'red' | 'draw' {
  if (result === 'white-wins') return 'white';
  if (result === 'red-wins') return 'red';
  return 'draw';
}

function seatCell(name: string, side: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'replay-clock-row';
  const label = document.createElement('span');
  label.className = 'replay-clock-side';
  label.textContent = name;
  label.title = side;
  row.append(label);
  return row;
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

function appendHeaderMeta(container: HTMLElement, items: HTMLElement[]): void {
  container.replaceChildren();
  items.forEach((item, index) => {
    if (index > 0) {
      const sep = document.createElement('span');
      sep.className = 'replay-game-header-sep';
      sep.textContent = '·';
      container.append(sep);
    }
    container.append(item);
  });
}

export async function createCrossroadsPlayAgainRoom(
  postgame: Pick<DualChessPostgameResponse, 'game' | 'state'>,
): Promise<string> {
  const response = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'pvp',
      gameSpecId: 'dual-chess',
      timeControl: postgame.game.timeControl ?? postgame.state.timeControl ?? defaultTimeControl(),
      rated: false,
      preferredColor: 'random',
    }),
  });
  if (!response.ok) throw new Error('crossroads_play_again_failed');
  const body = (await response.json()) as { url?: unknown };
  if (typeof body.url !== 'string') throw new Error('crossroads_play_again_missing_url');
  return body.url;
}

function defaultTimeControl(): DualChessTimeControl {
  return { initialMs: 180_000, incrementMs: 2_000 };
}

export function renderMoveRows(
  list: HTMLOListElement,
  moves: Array<{ move: DualChessMove; ply: number; color: DualChessColor }>,
  activePly: number,
  onJump: (ply: number) => void,
): void {
  list.replaceChildren();
  if (moves.length === 0) return;
  const byPly = new Map<number, { move: DualChessMove; color: DualChessColor }>();
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
}

function moveCell(
  entry: { move: DualChessMove } | undefined,
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
  button.onclick = () => onJump(ply);
  return button;
}

export function postgameReplayMaxPly(postgame: DualChessPostgameResponse): number {
  const history = Object.values(postgame.history ?? {}).flat();
  return Math.max(postgame.game.plyCount, ...history.map((snapshot) => snapshot.ply), 0);
}

export function postgameViewAtPly(
  postgame: DualChessPostgameResponse,
  key: DualChessPostgameViewKey,
  ply: number,
): DualChessPlayerView | null {
  const history = postgame.history?.[key];
  if (!history || history.length === 0) return null;
  let selected = history[0] ?? null;
  for (const snapshot of history) {
    if (snapshot.ply > ply) break;
    selected = snapshot;
  }
  return selected?.view ?? null;
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
  if (result.status === 404) return 'This Crossroads Chess game is not available.';
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

function timeControlLabel(postgame: DualChessPostgameResponse): string {
  const timeControl = postgame.game.timeControl ?? postgame.state.timeControl ?? null;
  if (!timeControl) return 'Untimed';
  return `${clockLabel(timeControl.initialMs)}+${Math.round(timeControl.incrementMs / 1000)}`;
}

function clockLabel(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function moveLabel(move: DualChessMove): string {
  return `${move.from}-${move.to}${move.promotion ? `=${move.promotion[0].toUpperCase()}` : ''}`;
}

function labelize(value: string): string {
  return value.split('-').filter(Boolean).map(capitalize).join(' ');
}

function capitalize(value: string): string {
  if (!value) return value;
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
