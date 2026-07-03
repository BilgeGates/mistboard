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
import { createShareButton } from './replay-meta.js';
import { mountReviewLayout } from './review/review-layout.js';
import { buildNav } from './site-shell.js';
import { setBoardFamily } from './theme.js';

// Postgame review for Dark Mini Xiangqi. Fog variant: truth board plus the two
// per-seat fogged views. The shared review layout arranges them (truth dominant,
// red/black views as click-to-promote secondaries) and owns the scrubber,
// keyboard, flip, and viewport-fill sizing; this module supplies the board hosts
// (7x7 SVG renderer + captured pools) and the move list.

export type DarkMiniXiangqiPostgameViewKey = MiniXiangqiColor | 'truth';

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

function renderPostgame(root: HTMLElement, postgame: DarkMiniXiangqiPostgameResponse): void {
  const entries = postgameViewEntries(postgame);
  // Each board host is a pane carrying its own label + captured pools; the review
  // layout arranges them (truth dominant, per-seat views as click-to-promote
  // secondaries) and owns the scrubber, keyboard, flip, and viewport-fill sizing.
  const targets = entries.map((entry) => {
    const pane = createPane(entry.label, paneKindFor(entry.key), true, 'split');
    pane.boardEl.classList.add('mini-xiangqi-live-board');
    return { entry, pane };
  });

  const moves = postgame.timeline.filter(
    (
      entry,
    ): entry is typeof entry & { move: MiniXiangqiMove; ply: number; color: MiniXiangqiColor } =>
      entry.type === 'move-played' &&
      !!entry.move &&
      typeof entry.ply === 'number' &&
      !!entry.color,
  );

  const movesCard = document.createElement('section');
  movesCard.className = 'review-moves-card';
  const movesHeading = document.createElement('h2');
  movesHeading.className = 'review-moves-card__title';
  movesHeading.textContent = 'Moves';
  const moveList = document.createElement('ol');
  moveList.className = 'move-list';
  movesCard.append(movesHeading, moveList);

  root.replaceChildren(buildNav());
  mountReviewLayout(root, {
    pageClassName: 'dark-mini-xiangqi-review',
    ariaLabel: 'Dark Mini Xiangqi postgame',
    title: 'Dark Mini Xiangqi',
    summary: `${resultLabel(postgame.game.result)} by ${labelize(postgame.game.termination)} · ${postgame.game.plyCount} plies`,
    actions: postgameActions(postgame),
    moves: movesCard,
    boards: targets.map((target) => ({
      key: target.entry.key,
      el: target.pane.el,
      tier: target.entry.key === 'truth' ? 'primary' : 'secondary',
    })),
    boardAspect: 516 / 516,
    boardCols: 7,
    maxPly: postgameReplayMaxPly(postgame),
    renderBoards({ ply, flipped }) {
      const orientation: MiniXiangqiColor = flipped ? 'black' : 'red';
      const captures = miniXiangqiCapturesFromTruthView(postgameViewAtPly(postgame, 'truth', ply));
      for (const { entry, pane } of targets) {
        const view = postgameViewAtPly(postgame, entry.key, ply) ?? entry.view;
        pane.boardEl.innerHTML = renderMiniXiangqiBoardSvg(view, orientation, {
          showFog: entry.key !== 'truth',
        });
        renderMiniXiangqiPaneCaptureSplit(pane, captures, orientation);
      }
    },
    renderMoves({ ply }, jump) {
      renderMoveRows(moveList, moves, ply, jump);
    },
  });
}

function postgameActions(postgame: DarkMiniXiangqiPostgameResponse): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'review-actions';
  const playAgain = document.createElement('button');
  playAgain.type = 'button';
  playAgain.className = 'review-action-link';
  playAgain.textContent = 'Play again';
  let busy = false;
  playAgain.onclick = () => {
    if (busy) return;
    busy = true;
    playAgain.disabled = true;
    playAgain.textContent = 'Creating';
    void createDarkMiniXiangqiPlayAgainRoom()
      .then((url) => window.location.assign(url))
      .catch((err) => {
        console.warn(err);
        busy = false;
        playAgain.disabled = false;
        playAgain.textContent = 'Try play again';
      });
  };
  const share = createShareButton();
  const download = reviewActionLink('Download JSON', exportJsonUrl(postgame.game.roomId));
  download.setAttribute('download', `mistboard-${postgame.game.roomId}.json`);
  const home = reviewActionLink('Home', '/');
  const room = reviewActionLink('Room', `/room/${encodeURIComponent(postgame.game.roomId)}`);
  actions.append(playAgain, share, download, home, room);
  return actions;
}

function reviewActionLink(label: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'review-action-link';
  link.href = href;
  link.textContent = label;
  return link;
}

function paneKindFor(key: DarkMiniXiangqiPostgameViewKey): 'white' | 'truth' | 'black' {
  if (key === 'red') return 'white';
  if (key === 'black') return 'black';
  return 'truth';
}

function exportJsonUrl(roomId: string): string {
  return `/api/dark-mini-xiangqi/games/${encodeURIComponent(roomId)}/export.json`;
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

function labelize(value: string): string {
  return value.split('-').filter(Boolean).map(capitalize).join(' ');
}

function capitalize(value: string): string {
  if (!value) return value;
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
