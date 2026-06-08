import {
  DARK_MINI_XIANGQI_SPEC_ID,
  type MiniXiangqiColor,
  type MiniXiangqiGameStatus,
  type MiniXiangqiMove,
  type MiniXiangqiPlayerView,
} from '@mistboard/game';
import './landing.css';
import './game-route.css';
import { darkMiniXiangqiEnabled } from './feature-flags.js';
import {
  installMiniXiangqiBoardStyles,
  renderMiniXiangqiBoardSvg,
} from './live-mini-xiangqi-render.js';
import {
  miniXiangqiCapturesFromTruthView,
  renderMiniXiangqiPaneCaptureSplit,
} from './mini-xiangqi-captures.js';
import { createPane } from './replay-board.js';
import { createGameHeaderStrip } from './replay-meta.js';
import { createReplayMovesPanel } from './replay-moves-panel.js';
import { buildNav } from './site-shell.js';
import { setBoardFamily, xiangqiAppearanceChangedEvent } from './theme.js';

export type DarkMiniXiangqiPostgameViewKey = MiniXiangqiColor | 'truth';

const postgameAbortControllers = new WeakMap<HTMLElement, AbortController>();

type DarkMiniXiangqiTimeControl = { initialMs: number; incrementMs: number };

export type DarkMiniXiangqiPostgameResponse = {
  game: {
    roomId: string;
    variant: 'dark-mini-xiangqi';
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
    timeControl?: DarkMiniXiangqiTimeControl;
  };
  state: {
    status: MiniXiangqiGameStatus;
    moveNumber: number;
    timeControl?: DarkMiniXiangqiTimeControl;
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
  // Remaining time per color, indexed by ply (0 = start). Absent when untimed.
  clocks?: Array<Record<MiniXiangqiColor, number>>;
  view: MiniXiangqiPlayerView;
  views?: Partial<Record<DarkMiniXiangqiPostgameViewKey, MiniXiangqiPlayerView>>;
  history?: Partial<
    Record<DarkMiniXiangqiPostgameViewKey, Array<{ ply: number; view: MiniXiangqiPlayerView }>>
  >;
};

type LoadResult =
  | { ok: true; postgame: DarkMiniXiangqiPostgameResponse }
  | { ok: false; status: number; error: string };

export function mountDarkMiniXiangqiPostgame(root: HTMLElement, roomId: string): void {
  root.classList.add('landing-page', 'game-route');
  setBoardFamily('xiangqi');
  installMiniXiangqiBoardStyles();
  root.replaceChildren(buildNav(), loadingView());
  if (!darkMiniXiangqiEnabled()) {
    renderError(root, 'Dark Mini Xiangqi unavailable', 'This route is not enabled in this build.');
    return;
  }
  void loadDarkMiniXiangqiPostgame(roomId)
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

export async function loadDarkMiniXiangqiPostgame(roomId: string): Promise<LoadResult> {
  const response = await fetch(darkMiniXiangqiPostgameApiUrl(roomId));
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
    postgame: (await response.json()) as DarkMiniXiangqiPostgameResponse,
  };
}

export function darkMiniXiangqiPostgameApiUrl(roomId: string): string {
  const url = new URL(
    `/api/dark-mini-xiangqi/games/${encodeURIComponent(roomId)}`,
    window.location.href,
  );
  return url.pathname;
}

// Renders the Dark Mini Xiangqi review using the same layout/chrome as the Dark
// chess review (replay.ts): a header strip with players + result, a triptych of
// per-POV boards, and a moves rail with replay controls on the right. Only the
// board renderer (7x7 SVG) and the snapshot scrubber are DMX-specific.
function renderPostgame(root: HTMLElement, postgame: DarkMiniXiangqiPostgameResponse): void {
  const priorAbort = postgameAbortControllers.get(root);
  if (priorAbort) priorAbort.abort();
  const abortController = new AbortController();
  postgameAbortControllers.set(root, abortController);
  const signal = abortController.signal;
  // Re-render (resetting to the final ply) when the xiangqi piece set changes.
  window.addEventListener(xiangqiAppearanceChangedEvent, () => renderPostgame(root, postgame), {
    signal,
  });

  const shell = document.createElement('main');
  shell.className = 'game-shell';
  const page = document.createElement('div');
  page.className = 'game-replay replay-page replay-meta-header analysis-tools-collapsed';

  // ── Header strip ──────────────────────────────────────────────────────────
  const header = createGameHeaderStrip();
  header.title.textContent = 'Dark Mini Xiangqi';

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

  header.whiteCell.append(seatCell(postgame.game.redName ?? 'Guest', 'Red'));
  header.blackCell.append(seatCell(postgame.game.blackName ?? 'Guest', 'Black'));

  const flipBtn = headerAction('Flip');
  flipBtn.setAttribute('aria-label', 'Flip all boards');
  flipBtn.title = 'Flip all boards (f)';
  const download = headerLink('Download JSON', exportJsonUrl(postgame.game.roomId));
  download.setAttribute('download', `mistboard-${postgame.game.roomId}.json`);
  const playAgain = headerAction('Play again');
  const home = headerLink('Home', '/');
  header.actions.append(flipBtn, playAgain, download, home);

  // ── Boards (triptych) ─────────────────────────────────────────────────────
  const layout = document.createElement('div');
  layout.className = 'replay-layout replay-layout-all';
  const entries = postgameViewEntries(postgame);
  const boardTargets: Array<{
    pane: ReturnType<typeof createPane>;
    entry: { key: DarkMiniXiangqiPostgameViewKey; label: string; view: MiniXiangqiPlayerView };
  }> = [];
  for (const entry of entries) {
    const pane = createPane(entry.label, paneKindFor(entry.key), true, 'split');
    boardTargets.push({ pane, entry });
    layout.append(pane.el);
  }

  // ── Moves rail ────────────────────────────────────────────────────────────
  const movesPanel = createReplayMovesPanel();

  page.append(header.el, layout, movesPanel.el);
  shell.append(page);
  root.replaceChildren(buildNav(), shell);

  // ── Scrubber ──────────────────────────────────────────────────────────────
  const moves = postgame.timeline.filter(
    (
      entry,
    ): entry is typeof entry & { move: MiniXiangqiMove; ply: number; color: MiniXiangqiColor } =>
      entry.type === 'move-played' &&
      !!entry.move &&
      typeof entry.ply === 'number' &&
      !!entry.color,
  );
  const maxPly = postgameReplayMaxPly(postgame);
  let currentPly = maxPly;
  let boardOrientation: MiniXiangqiColor = 'red';

  const jump = (ply: number) => {
    currentPly = Math.max(0, Math.min(maxPly, ply));
    sync();
  };
  const sync = () => {
    const captures = miniXiangqiCapturesFromTruthView(
      postgameViewAtPly(postgame, 'truth', currentPly),
    );
    for (const { pane, entry } of boardTargets) {
      const view = postgameViewAtPly(postgame, entry.key, currentPly) ?? entry.view;
      pane.boardEl.innerHTML = renderMiniXiangqiBoardSvg(view, boardOrientation, {
        showFog: entry.key !== 'truth',
      });
      renderMiniXiangqiPaneCaptureSplit(pane, captures, boardOrientation);
    }
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
    boardOrientation = oppositeMiniColor(boardOrientation);
    sync();
  };
  flipBtn.onclick = flip;

  let playAgainBusy = false;
  playAgain.onclick = () => {
    if (playAgainBusy) return;
    playAgainBusy = true;
    playAgain.disabled = true;
    playAgain.textContent = 'Creating';
    void createDarkMiniXiangqiPlayAgainRoom()
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

function paneKindFor(key: DarkMiniXiangqiPostgameViewKey): 'white' | 'truth' | 'black' {
  if (key === 'red') return 'white';
  if (key === 'black') return 'black';
  return 'truth';
}

function resultChipKind(result: string): 'white' | 'black' | 'draw' {
  if (result === 'red-wins') return 'white';
  if (result === 'black-wins') return 'black';
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

function exportJsonUrl(roomId: string): string {
  return `/api/dark-mini-xiangqi/games/${encodeURIComponent(roomId)}/export.json`;
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

// Builds the dark-chess-style move list: full-move rows with clickable red/black
// plies (red occupies the "white" cell, black the "black" cell).
export function renderMoveRows(
  list: HTMLOListElement,
  moves: Array<{ move: MiniXiangqiMove; ply: number; color: MiniXiangqiColor }>,
  activePly: number,
  onJump: (ply: number) => void,
): void {
  list.replaceChildren();
  if (moves.length === 0) return;
  const byPly = new Map<number, { move: MiniXiangqiMove; color: MiniXiangqiColor }>();
  for (const m of moves) byPly.set(m.ply, m);
  const maxPly = Math.max(...moves.map((m) => m.ply));
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
  entry: { move: MiniXiangqiMove } | undefined,
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
  button.onclick = () => onJump(ply);
  return button;
}

function oppositeMiniColor(color: MiniXiangqiColor): MiniXiangqiColor {
  return color === 'red' ? 'black' : 'red';
}

export function postgameViewEntries(
  postgame: DarkMiniXiangqiPostgameResponse,
): Array<{ key: DarkMiniXiangqiPostgameViewKey; label: string; view: MiniXiangqiPlayerView }> {
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

export function postgameReplayMaxPly(postgame: DarkMiniXiangqiPostgameResponse): number {
  const history = Object.values(postgame.history ?? {}).flat();
  return Math.max(postgame.game.plyCount, ...history.map((snapshot) => snapshot.ply), 0);
}

export function postgameViewAtPly(
  postgame: DarkMiniXiangqiPostgameResponse,
  key: DarkMiniXiangqiPostgameViewKey,
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

async function createDarkMiniXiangqiPlayAgainRoom(): Promise<string> {
  const response = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'pvp',
      gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
      preferredColor: 'random',
    }),
  });
  if (!response.ok) throw new Error(`play-again failed: ${response.status}`);
  const data = (await response.json()) as { url?: string };
  if (!data.url) throw new Error('play-again did not return a URL');
  return data.url;
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
  if (result.status === 404) return 'This Dark Mini Xiangqi game is not available.';
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

function timeControlLabel(postgame: DarkMiniXiangqiPostgameResponse): string {
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

function labelize(value: string): string {
  return value.split('-').filter(Boolean).map(capitalize).join(' ');
}

function capitalize(value: string): string {
  if (!value) return value;
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
