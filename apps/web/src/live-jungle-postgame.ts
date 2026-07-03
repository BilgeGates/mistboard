import {
  createInitialJungleBoard,
  type JungleBoard,
  type JungleColor,
  type JungleGameStatus,
  type JungleMove,
  type JunglePlayerView,
  type JungleSquare,
} from '@mistboard/game';
import './live-xiangqi.css';
import './landing.css';
import './game-route.css';
import { jungleEnabled } from './feature-flags.js';
import { junglePieceGhostSvg, renderJungleBoardSvg } from './jungle-render.js';
import { createPane } from './replay-board.js';
import { createShareButton } from './replay-meta.js';
import { capturedByDiff } from './review/captured-diff.js';
import { fillCapturedPoolWith } from './review/captured-pool.js';
import { createFlankCaptures } from './review/flank-captures.js';
import { mountReviewLayout } from './review/review-layout.js';
import { buildNav } from './site-shell.js';

// Jungle's perfect-information view carries no captured list, so derive it by
// diffing the standard opening against the current board.
const JUNGLE_INITIAL_PIECES = Object.values(createInitialJungleBoard()).filter(
  (piece): piece is NonNullable<typeof piece> => Boolean(piece),
);

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
        renderPostgame(root, result.postgame);
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

function renderPostgame(root: HTMLElement, postgame: JunglePostgameResponse): void {
  const pane = createPane('', 'truth', false, 'single');
  pane.boardEl.classList.add('jungle-postgame-board', 'jungle-live-board');
  // Flank layout: capture columns beside the board (opponent top-left, near side
  // bottom-right) so the board keeps its full height. Reparent the board into the
  // flank host at its original position.
  const flankAnchor = pane.boardEl.nextSibling;
  const flankParent = pane.boardEl.parentElement;
  const flank = createFlankCaptures(pane.boardEl);
  flankParent?.insertBefore(flank.host, flankAnchor);

  const moves: JungleMoveEntry[] = postgame.timeline
    .filter(
      (entry): entry is typeof entry & { move: JungleMove; ply: number; color: JungleColor } =>
        entry.type === 'move-played' &&
        !!entry.move &&
        typeof entry.ply === 'number' &&
        !!entry.color,
    )
    .map((entry) => ({ move: entry.move, ply: entry.ply, color: entry.color }));

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
    pageClassName: 'jungle-review',
    ariaLabel: 'Jungle postgame',
    title: 'Jungle',
    summary: `${resultLabel(postgame.game.result)} by ${labelize(postgame.game.termination)} · ${postgame.game.plyCount} plies`,
    actions: jungleActions(postgame),
    moves: movesCard,
    boards: [{ key: 'truth', el: pane.el, tier: 'primary' }],
    boardAspect: 366 / 462,
    boardCols: 7,
    maxPly: junglePostgameMaxPly(postgame),
    renderBoards({ ply, flipped }) {
      const orientation: JungleColor = flipped ? 'black' : 'red';
      const view = junglePostgameViewAtPly(postgame, ply) ?? postgame.view;
      pane.boardEl.innerHTML = renderJungleBoardSvg(view.board as JungleBoard, {
        perspective: orientation,
        lastMove: view.lastMove ?? null,
      });
      const current = Object.values(view.board).filter(
        (piece): piece is NonNullable<typeof piece> => Boolean(piece),
      );
      const captured = capturedByDiff(JUNGLE_INITIAL_PIECES, current);
      const opponent: JungleColor = orientation === 'red' ? 'black' : 'red';
      flank.leftColumn.replaceChildren();
      flank.rightColumn.replaceChildren();
      fillCapturedPoolWith(flank.leftColumn, captured, orientation, junglePieceGhostSvg);
      fillCapturedPoolWith(flank.rightColumn, captured, opponent, junglePieceGhostSvg);
    },
    renderMoves({ ply }, jump) {
      renderMoveRows(moveList, moves, ply, jump);
    },
  });
}

function jungleActions(postgame: JunglePostgameResponse): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'review-actions';
  const share = createShareButton();
  const home = reviewActionLink('Home', '/');
  const room = reviewActionLink('Room', `/room/${encodeURIComponent(postgame.game.roomId)}`);
  actions.append(share, home, room);
  return actions;
}

function reviewActionLink(label: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'review-action-link';
  link.href = href;
  link.textContent = label;
  return link;
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

export function initialPlyFromSearch(search: string): number | null {
  const raw = new URLSearchParams(search).get('ply');
  if (raw === null || !/^\d+$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
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
