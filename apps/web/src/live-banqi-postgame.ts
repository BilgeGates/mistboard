import type { BanqiColor, BanqiGameStatus, BanqiMove, BanqiPlayerView } from '@mistboard/game';
import './live-xiangqi.css';
import './landing.css';
import './game-route.css';
import { banqiResultLabel } from './banqi-result-label.js';
import { banqiEnabled } from './feature-flags.js';
import { installBanqiBoardStyles } from './live-banqi-render.js';
import { mountBanqiReview } from './review/banqi-review.js';
import { recoverBanqiDeal } from './review/banqi-tree-adapter.js';
import { buildReviewMeta, labelize } from './review/game-review-meta.js';
import { buildNav } from './site-shell.js';

// Postgame review for banqi (Flip Xiangqi). Banqi is a SYMMETRIC hidden-deal
// variant: a face-down tile is hidden from both seats equally, so there is a single
// review board. As of the review standardization it rides the shared interactive
// tree (mountBanqiReview → mountTreeReview): the deal is reconstructed from the
// fully-revealed history (history.revealed), baked into the truth, and the client
// replays the move list + lets you branch. The board renders MASKED as-played;
// flipping a tile in a line reveals what the fixed deal placed there. The server
// per-ply snapshots are used only by the watch adapter (postgameViewAtPly below).

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
  // Reconstruct the fixed deal from the earliest fully-revealed snapshot, then let
  // the tree replay the move list + branch client-side. If the revealed stream is
  // missing/incomplete, recoverBanqiDeal throws and the outer .catch renders an
  // error rather than a wrong board.
  const revealedHistory = postgame.history?.revealed ?? [];
  const earliestRevealed = revealedHistory.reduce<{ ply: number; view: BanqiPlayerView } | null>(
    (best, snapshot) => (!best || snapshot.ply < best.ply ? snapshot : best),
    null,
  );
  if (!earliestRevealed) {
    throw new Error('banqi postgame: no revealed history to reconstruct the deal');
  }
  const deal = recoverBanqiDeal(earliestRevealed.view);

  const moves: BanqiMove[] = postgame.timeline
    .filter(
      (entry): entry is typeof entry & { move: BanqiMove } =>
        entry.type === 'move-played' && !!entry.move,
    )
    .map((entry) => entry.move);

  const status = `${banqiResultLabel(postgame.game.result, postgame.view.firstColor)} by ${labelize(postgame.game.termination)}`;
  const { metaCard, details } = buildReviewMeta({
    markerId: 'banqi',
    variantName: 'Flip Xiangqi',
    game: postgame.game,
    status,
  });

  root.replaceChildren(buildNav());
  mountBanqiReview(root, postgame.game.roomId, deal, {
    pageClassName: 'banqi-review',
    ariaLabel: 'Flip Xiangqi postgame',
    title: 'Flip Xiangqi',
    summary: `${status} · ${postgame.game.plyCount} plies`,
    metaCard,
    details,
    moves,
    // No banqi whole-game analysis engine is wired; the interactive board + move
    // tree stand on their own (no eval gauge, no computer-analysis underboard).
    analysis: null,
  });
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
