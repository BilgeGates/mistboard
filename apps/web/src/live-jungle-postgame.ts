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
import { rectangularGridAspect } from './board-metrics.js';
import { jungleEnabled } from './feature-flags.js';
import { JUNGLE_BOARD_VIEW, junglePieceGhostSvg, renderJungleBoardSvg } from './jungle-render.js';
import { createPane } from './replay-board.js';
import { capturedByDiff } from './review/captured-diff.js';
import { fillCapturedPoolWith } from './review/captured-pool.js';
import { createFlankCaptures } from './review/flank-captures.js';
import { buildReviewMeta, labelize, reviewResultLabel } from './review/game-review-meta.js';
import { createMoveList } from './review/move-list.js';
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
    players?: Array<{
      color: string;
      name: string;
      rating: number | null;
      kind: 'account' | 'guest' | 'engine';
    }>;
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

  const moveList = createMoveList(
    moves.map((entry) => ({ ply: entry.ply, label: `${entry.move.from}-${entry.move.to}` })),
    { title: 'Moves' },
  );

  const status = `${reviewResultLabel(postgame.game.result)} by ${labelize(postgame.game.termination)}`;
  const { metaCard, details } = buildReviewMeta({
    markerId: 'jungle',
    variantName: 'Jungle Chess',
    game: postgame.game,
    status,
  });

  root.replaceChildren(buildNav());
  mountReviewLayout(root, {
    pageClassName: 'jungle-review',
    ariaLabel: 'Jungle postgame',
    title: 'Jungle Chess',
    summary: `${status} · ${postgame.game.plyCount} plies`,
    metaCard,
    details,
    moves: moveList.el,
    boards: [{ key: 'truth', el: pane.el, tier: 'primary' }],
    boardAspect: rectangularGridAspect(JUNGLE_BOARD_VIEW),
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
      moveList.update(ply, jump);
    },
  });
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

// Referenced to keep the JungleSquare import meaningful for downstream typing of
// move coordinates in the timeline payload.
export type JunglePostgameSquare = JungleSquare;
