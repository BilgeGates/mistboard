import type {
  JungleFlipColor,
  JungleFlipGameStatus,
  JungleFlipMove,
  JungleFlipPlayerView,
  JungleFlipSeat,
} from '@mistboard/game';
import './live-xiangqi.css';
import './landing.css';
import './game-route.css';
import { jungleFlipEnabled } from './feature-flags.js';
import {
  type JungleFlipRenderBoard,
  jungleFlipPieceGhostSvg,
  renderJungleFlipBoardSvg,
} from './jungle-flip-render.js';
import { jungleFlipResultLabel, jungleFlipSeatInkLabel } from './jungle-flip-result-label.js';
import { createPane } from './replay-board.js';
import { createShareButton } from './replay-meta.js';
import { fillCapturedPoolWith } from './review/captured-pool.js';
import { mountReviewLayout } from './review/review-layout.js';
import { buildNav } from './site-shell.js';

// Postgame review for Flip Jungle. Flip Jungle is SYMMETRIC hidden-identity (the
// banqi pattern on 16 animals): a face-down tile is hidden from both seats equally,
// so there is a single review board and no sides to flip. The shared review layout
// owns the shell, scrubber, keyboard, and viewport-fill sizing; this module supplies
// the board host + move list and a Reveal toggle (button / `h`) that swaps the
// as-played masked replay ('truth') for the spoiler overlay ('revealed').

type ViewKey = 'truth' | 'revealed';

export type JungleFlipPostgameResponse = {
  game: {
    roomId: string;
    variant: 'jungle-flip';
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
    status: JungleFlipGameStatus;
    moveNumber: number;
    clock?: unknown;
    timeControl?: { initialMs: number; incrementMs: number };
  };
  timeline: Array<{
    type: string;
    at: number;
    color?: JungleFlipSeat;
    move?: JungleFlipMove;
    ply?: number;
    winner?: JungleFlipSeat;
    reason?: string;
  }>;
  view: JungleFlipPlayerView;
  history?: Partial<Record<ViewKey, Array<{ ply: number; view: JungleFlipPlayerView }>>>;
};

type JungleFlipMoveEntry = { move: JungleFlipMove; ply: number; color: JungleFlipSeat };

type LoadResult =
  | { ok: true; postgame: JungleFlipPostgameResponse }
  | { ok: false; status: number; error: string };

export function mountJungleFlipPostgame(root: HTMLElement, roomId: string): void {
  root.classList.add('landing-page', 'game-route');
  root.replaceChildren(buildNav(), loadingView());
  if (!jungleFlipEnabled()) {
    renderError(root, 'Flip Jungle unavailable', 'This route is not enabled in this build.');
    return;
  }
  void loadJungleFlipPostgame(roomId)
    .then((result) => {
      if (result.ok) {
        renderPostgame(root, result.postgame);
        return;
      }
      renderError(root, errorTitle(result.status), errorBody(result));
    })
    .catch(() => renderError(root, 'Postgame unavailable', 'The game could not be loaded.'));
}

export async function loadJungleFlipPostgame(roomId: string): Promise<LoadResult> {
  const response = await fetch(jungleFlipPostgameApiUrl(roomId));
  if (!response.ok) {
    const body = await safeJson(response);
    return {
      ok: false,
      status: response.status,
      error: typeof body?.error === 'string' ? body.error : 'request_failed',
    };
  }
  return { ok: true, postgame: (await response.json()) as JungleFlipPostgameResponse };
}

export function jungleFlipPostgameApiUrl(roomId: string): string {
  return new URL(`/api/jungle-flip/games/${encodeURIComponent(roomId)}`, window.location.href)
    .pathname;
}

function renderPostgame(root: HTMLElement, postgame: JungleFlipPostgameResponse): void {
  const pane = createPane('', 'truth', true, 'split');
  pane.boardEl.classList.add('jungle-flip-postgame-board', 'jungle-flip-live-board');

  const firstColor = postgame.view.firstColor;

  const moves: JungleFlipMoveEntry[] = postgame.timeline
    .filter(
      (
        entry,
      ): entry is typeof entry & { move: JungleFlipMove; ply: number; color: JungleFlipSeat } =>
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

  // Default to the as-played board: unflipped tiles show as face-down backs. The
  // toggle (button / `h`) reveals the deal. The deal has no sides, so the board
  // renderer ignores orientation (the layout's flip control is a no-op here).
  let revealed = false;
  let lastPly = replayMaxPly(postgame);

  const revealBtn = document.createElement('button');
  revealBtn.type = 'button';
  revealBtn.className = 'review-action-link';
  revealBtn.textContent = 'Reveal tiles';
  revealBtn.setAttribute('aria-pressed', 'false');
  revealBtn.title = 'Toggle face-down tile identities (h)';

  const paintBoard = (ply: number): void => {
    const viewKey: ViewKey = revealed ? 'revealed' : 'truth';
    const view =
      viewAtPly(postgame, viewKey, ply) ?? viewAtPly(postgame, 'truth', ply) ?? postgame.view;
    pane.boardEl.innerHTML = renderJungleFlipBoardSvg(view.board as JungleFlipRenderBoard, {
      lastMove: view.lastMove ?? null,
    });
    // Flip Jungle's view carries the captured list directly (no board diff). The
    // board renders red at the bottom, so red's losses sit on the top strip and
    // black's on the bottom (each side's captured material near the other player).
    const captured = view.captured;
    pane.topCapturesEl.replaceChildren();
    pane.capturesEl.replaceChildren();
    fillCapturedPoolWith(pane.topCapturesEl, captured, 'red', jungleFlipPieceGhostSvg);
    fillCapturedPoolWith(pane.capturesEl, captured, 'black', jungleFlipPieceGhostSvg);
  };

  const toggleReveal = (): void => {
    revealed = !revealed;
    revealBtn.textContent = revealed ? 'Hide tiles' : 'Reveal tiles';
    revealBtn.setAttribute('aria-pressed', String(revealed));
    paintBoard(lastPly);
  };
  revealBtn.onclick = toggleReveal;

  root.replaceChildren(buildNav());
  // The shared review layout binds its playback keys on `document`; the reveal
  // toggle joins them there (typing targets are ignored, like the layout does).
  document.addEventListener('keydown', (event) => {
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
    if (event.key === 'h' || event.key === 'H') {
      event.preventDefault();
      toggleReveal();
    }
  });

  mountReviewLayout(root, {
    pageClassName: 'jungle-flip-review',
    ariaLabel: 'Flip Jungle postgame',
    title: 'Flip Jungle',
    summary: `${jungleFlipResultLabel(postgame.game.result, firstColor)} by ${labelize(postgame.game.termination)} · ${postgame.game.plyCount} plies`,
    actions: jungleFlipActions(postgame, revealBtn),
    moves: movesCard,
    boards: [{ key: 'truth', el: pane.el, tier: 'primary' }],
    boardAspect: 64 / 64,
    boardCols: 5,
    maxPly: replayMaxPly(postgame),
    renderBoards({ ply }) {
      lastPly = ply;
      paintBoard(ply);
    },
    renderMoves({ ply }, jump) {
      renderMoveRows(moveList, moves, ply, firstColor, jump);
    },
  });
}

function jungleFlipActions(
  postgame: JungleFlipPostgameResponse,
  revealBtn: HTMLButtonElement,
): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'review-actions';
  const share = createShareButton();
  const home = reviewActionLink('Home', '/');
  const room = reviewActionLink('Room', `/room/${encodeURIComponent(postgame.game.roomId)}`);
  actions.append(revealBtn, share, home, room);
  return actions;
}

function reviewActionLink(label: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'review-action-link';
  link.href = href;
  link.textContent = label;
  return link;
}

export function replayMaxPly(postgame: JungleFlipPostgameResponse): number {
  const history = Object.values(postgame.history ?? {}).flat();
  return Math.max(postgame.game.plyCount, ...history.map((snapshot) => snapshot.ply), 0);
}

export function viewAtPly(
  postgame: JungleFlipPostgameResponse,
  key: ViewKey,
  ply: number,
): JungleFlipPlayerView | null {
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
  moves: JungleFlipMoveEntry[],
  activePly: number,
  firstColor: JungleFlipColor | null,
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
  const byPly = new Map<number, JungleFlipMoveEntry>();
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
      moveCell(
        byPly.get(moveNumber * 2 - 1),
        'white',
        moveNumber * 2 - 1,
        activePly,
        firstColor,
        onJump,
      ),
      moveCell(byPly.get(moveNumber * 2), 'black', moveNumber * 2, activePly, firstColor, onJump),
    );
    list.append(row);
  }
  scrollActiveMoveIntoView(list);
}

function moveCell(
  entry: JungleFlipMoveEntry | undefined,
  cell: 'white' | 'black',
  ply: number,
  activePly: number,
  firstColor: JungleFlipColor | null,
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
  button.title = `${jungleFlipSeatInkLabel(entry.color, firstColor)} ply ${ply}: ${moveLabel(entry.move)}`;
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

// A flip (self-move) reads as the flipped square; a board move as from-to.
function moveLabel(move: JungleFlipMove): string {
  return move.from === move.to ? `${move.from} flip` : `${move.from}-${move.to}`;
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
  if (result.status === 404) return 'This Flip Jungle game is not available.';
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

function labelize(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
