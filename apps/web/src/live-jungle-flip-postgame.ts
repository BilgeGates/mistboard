import type {
  JungleFlipGameStatus,
  JungleFlipMove,
  JungleFlipPlayerView,
  JungleFlipSeat,
} from '@mistboard/game';
import './live-xiangqi.css';
import './landing.css';
import './game-route.css';
import { rectangularGridAspect } from './board-metrics.js';
import { jungleFlipEnabled } from './feature-flags.js';
import {
  JUNGLE_FLIP_BOARD_VIEW,
  type JungleFlipRenderBoard,
  jungleFlipPieceGhostSvg,
  renderJungleFlipBoardSvg,
} from './jungle-flip-render.js';
import { jungleFlipResultLabel } from './jungle-flip-result-label.js';
import { createPane } from './replay-board.js';
import { fillCapturedPoolWith } from './review/captured-pool.js';
import { buildReviewMeta, labelize } from './review/game-review-meta.js';
import { createMoveList } from './review/move-list.js';
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
    players?: Array<{
      color: string;
      name: string;
      rating: number | null;
      kind: 'account' | 'guest' | 'engine';
    }>;
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

  // Two ply per row (one full move): ply 1 (the first mover) takes the left cell,
  // ply 2 the right, keyed by ply parity. That is `createMoveList`'s default
  // (`firstMover: 'a'`), so the first mover's move lands in the left column exactly
  // as the old hand-rolled list placed it.
  const moveList = createMoveList(
    moves.map((entry) => ({ ply: entry.ply, label: moveLabel(entry.move) })),
    { title: 'Moves' },
  );

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

  const status = `${jungleFlipResultLabel(postgame.game.result, firstColor)} by ${labelize(postgame.game.termination)}`;
  const { metaCard, details } = buildReviewMeta({
    markerId: 'jungle-flip',
    variantName: 'Flip Jungle',
    game: postgame.game,
    status,
  });
  mountReviewLayout(root, {
    pageClassName: 'jungle-flip-review',
    ariaLabel: 'Flip Jungle postgame',
    title: 'Flip Jungle',
    summary: `${status} · ${postgame.game.plyCount} plies`,
    metaCard,
    details,
    railFooter: revealFooter(revealBtn),
    moves: moveList.el,
    boards: [{ key: 'truth', el: pane.el, tier: 'primary' }],
    boardAspect: rectangularGridAspect(JUNGLE_FLIP_BOARD_VIEW),
    // 4x4 board: cap the review fit so four cells keep a sensible size.
    boardMaxPx: 560,
    // Compact capture tiles (board width / 8) so the top/bottom strips stay short
    // and the board grows to fill the height.
    boardCols: 8,
    maxPly: replayMaxPly(postgame),
    renderBoards({ ply }) {
      lastPly = ply;
      paintBoard(ply);
    },
    renderMoves({ ply }, jump) {
      moveList.update(ply, jump);
    },
  });
}

// The Reveal toggle is the only control that survives on the review page; pin it
// to the bottom of the right rail so the left column stays button-free.
function revealFooter(revealBtn: HTMLButtonElement): HTMLElement {
  const footer = document.createElement('div');
  footer.className = 'review-rail-footer';
  footer.append(revealBtn);
  return footer;
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
