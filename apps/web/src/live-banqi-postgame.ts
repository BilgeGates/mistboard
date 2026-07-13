import type {
  BanqiColor,
  BanqiGameStatus,
  BanqiMove,
  BanqiPlayerView,
  BanqiSeat,
} from '@mistboard/game';
import './live-xiangqi.css';
import './landing.css';
import './game-route.css';
import { banqiResultLabel } from './banqi-result-label.js';
import { banqiEnabled } from './feature-flags.js';
import { fillCapturedPool } from './live-banqi.js';
import { installBanqiBoardStyles, renderBanqiBoardSvg } from './live-banqi-render.js';
import { createPane } from './replay-board.js';
import { buildReviewMeta, labelize } from './review/game-review-meta.js';
import { createMoveList } from './review/move-list.js';
import { mountReviewLayout } from './review/review-layout.js';
import { buildNav } from './site-shell.js';

// Postgame review for banqi. Banqi is SYMMETRIC-information: a face-down tile is
// hidden from both seats equally, so there is a single review board (no per-seat
// split). The shared review layout owns the shell, scrubber, keyboard, flip, and
// viewport-fill sizing; this module supplies the board host + move list and a
// Reveal toggle (button / `h`) that swaps the as-played masked replay ('truth'
// history) for the spoiler overlay ('revealed' history, every face-down identity
// unmasked at that ply).

export type BanqiPostgameViewKey = BanqiColor | 'truth' | 'revealed';

export type BanqiPostgameResponse = {
  game: {
    roomId: string;
    variant: 'banqi';
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
    status: BanqiGameStatus;
    moveNumber: number;
    clock?: unknown;
    timeControl?: { initialMs: number; incrementMs: number };
  };
  timeline: Array<{
    type: string;
    at: number;
    color?: BanqiColor;
    move?: BanqiMove;
    ply?: number;
    winner?: BanqiColor;
    reason?: string;
  }>;
  view: BanqiPlayerView;
  views?: Partial<Record<BanqiPostgameViewKey, BanqiPlayerView>>;
  history?: Partial<Record<BanqiPostgameViewKey, Array<{ ply: number; view: BanqiPlayerView }>>>;
};

type BanqiMoveEntry = { move: BanqiMove; ply: number; color: BanqiSeat };

type LoadResult =
  | { ok: true; postgame: BanqiPostgameResponse }
  | { ok: false; status: number; error: string };

export function mountBanqiPostgame(root: HTMLElement, roomId: string): void {
  root.classList.add('landing-page', 'game-route');
  installBanqiBoardStyles();
  root.replaceChildren(buildNav(), loadingView());
  if (!banqiEnabled()) {
    renderError(root, 'Flip Xiangqi unavailable', 'This route is not enabled in this build.');
    return;
  }
  void loadBanqiPostgame(roomId)
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

export async function loadBanqiPostgame(roomId: string): Promise<LoadResult> {
  const response = await fetch(banqiPostgameApiUrl(roomId));
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
    postgame: (await response.json()) as BanqiPostgameResponse,
  };
}

export function banqiPostgameApiUrl(roomId: string): string {
  const url = new URL(`/api/banqi/games/${encodeURIComponent(roomId)}`, window.location.href);
  return url.pathname;
}

function renderPostgame(root: HTMLElement, postgame: BanqiPostgameResponse): void {
  const pane = createPane('', 'truth', true, 'split');
  pane.boardEl.classList.add('banqi-postgame-board', 'banqi-live-board');

  const moves: BanqiMoveEntry[] = postgame.timeline
    .filter(
      (entry): entry is typeof entry & { move: BanqiMove; ply: number; color: BanqiSeat } =>
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

  // Default to the as-played board: unflipped tiles show as face-down backs, the
  // way the position actually looked. The toggle (button / `h`) reveals the deal.
  let revealed = false;
  let lastCtx: { ply: number; flipped: boolean } | null = null;

  const revealBtn = document.createElement('button');
  revealBtn.type = 'button';
  revealBtn.className = 'review-action-link';
  revealBtn.textContent = 'Reveal tiles';
  revealBtn.setAttribute('aria-pressed', 'false');
  revealBtn.title = 'Toggle face-down tile identities (h)';

  const paintBoard = (ctx: { ply: number; flipped: boolean }): void => {
    const orientation: BanqiColor = ctx.flipped ? 'black' : 'red';
    // Reveal on → 'revealed' (every face-down identity). Reveal off → 'truth'
    // (the as-played mask). Banqi is symmetric, so both seats render the identical
    // board; only the masking differs.
    const viewKey: BanqiPostgameViewKey = revealed ? 'revealed' : 'truth';
    const view =
      postgameViewAtPly(postgame, viewKey, ctx.ply) ??
      postgameViewAtPly(postgame, 'truth', ctx.ply) ??
      postgame.view;
    pane.boardEl.innerHTML = renderBanqiBoardSvg(view, orientation, {});
    renderCapturedPools(pane.topCapturesEl, pane.capturesEl, view, orientation);
  };

  const toggleReveal = (): void => {
    revealed = !revealed;
    revealBtn.textContent = revealed ? 'Hide tiles' : 'Reveal tiles';
    revealBtn.setAttribute('aria-pressed', String(revealed));
    if (lastCtx) paintBoard(lastCtx);
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

  const status = `${banqiResultLabel(postgame.game.result, postgame.view.firstColor)} by ${labelize(postgame.game.termination)}`;
  const { metaCard, details } = buildReviewMeta({
    markerId: 'banqi',
    variantName: 'Flip Xiangqi',
    game: postgame.game,
    status,
  });
  mountReviewLayout(root, {
    pageClassName: 'banqi-review',
    ariaLabel: 'Flip Xiangqi postgame',
    title: 'Flip Xiangqi',
    summary: `${status} · ${postgame.game.plyCount} plies`,
    metaCard,
    details,
    railFooter: revealFooter(revealBtn),
    moves: moveList.el,
    boards: [{ key: 'truth', el: pane.el, tier: 'primary' }],
    boardAspect: 568 / 312,
    // Banqi discs sit inset within their cell, so size capture tiles a touch under
    // one cell (board width / 10) to match the on-board disc rather than the cell.
    boardCols: 10,
    maxPly: postgameReplayMaxPly(postgame),
    renderBoards(ctx) {
      lastCtx = { ply: ctx.ply, flipped: ctx.flipped };
      paintBoard(lastCtx);
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

// Lichess convention: a player's captured material sits next to that player. The
// bottom strip is the viewer's side (orientation), so it shows what the viewer
// captured (the opponent's lost pieces); the top strip shows what the opponent
// captured (the viewer's lost pieces). fillCapturedPool filters by former owner.
function renderCapturedPools(
  top: HTMLElement,
  bottom: HTMLElement,
  view: BanqiPlayerView,
  orientation: BanqiColor,
): void {
  top.replaceChildren();
  bottom.replaceChildren();
  const opponent = oppositeBanqiColor(orientation);
  fillCapturedPool(top, view.captured, orientation);
  fillCapturedPool(bottom, view.captured, opponent);
}

function oppositeBanqiColor(color: BanqiColor): BanqiColor {
  return color === 'red' ? 'black' : 'red';
}

// Banqi is symmetric, so the review reduces to the single truth surface. Exported
// for the watch-replay surface to reuse the per-ply view selection, mirroring the
// jieqi postgame module's exported helpers.
export function postgameViewEntries(
  postgame: BanqiPostgameResponse,
): Array<{ key: BanqiPostgameViewKey; label: string; view: BanqiPlayerView }> {
  return [{ key: 'truth', label: 'Server truth', view: postgame.view }];
}

export function postgameReplayMaxPly(postgame: BanqiPostgameResponse): number {
  const history = Object.values(postgame.history ?? {}).flat();
  return Math.max(postgame.game.plyCount, ...history.map((snapshot) => snapshot.ply), 0);
}

export function postgameViewAtPly(
  postgame: BanqiPostgameResponse,
  key: BanqiPostgameViewKey,
  ply: number,
): BanqiPlayerView | null {
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
function moveLabel(move: BanqiMove): string {
  return move.from === move.to ? `${move.from} flip` : `${move.from}-${move.to}`;
}

export function banqiInitialPlyFromSearch(search: string): number | null {
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
  if (status === 503) return 'Postgame unavailable';
  return 'Postgame unavailable';
}

function errorBody(result: Extract<LoadResult, { ok: false }>): string {
  if (result.status === 404) return 'This Flip Xiangqi game is not available.';
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
