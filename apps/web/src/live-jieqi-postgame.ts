import type { JieqiColor, JieqiGameStatus, JieqiMove, JieqiPlayerView } from '@mistboard/game';
import './live-xiangqi.css';
import './landing.css';
import './game-route.css';
import { jieqiEnabled } from './feature-flags.js';
import { installJieqiBoardStyles } from './live-jieqi-render.js';
import { buildReviewMeta, labelize, reviewResultLabel } from './review/game-review-meta.js';
import { mountJieqiReview } from './review/jieqi-review.js';
import { recoverJieqiDeal } from './review/jieqi-tree-adapter.js';
import { buildNav } from './site-shell.js';

// Postgame review for Jieqi (Reveal Xiangqi). Jieqi hides piece IDENTITIES
// symmetrically (positions are public), so there is a single review board. As of the
// review standardization it rides the shared interactive tree (mountJieqiReview →
// mountTreeReview): the deal is reconstructed from the fully-revealed `history.truth`
// stream (jieqi's spoiler key is 'truth'), baked into the truth, and the client
// replays the move list + lets you branch. The board renders MASKED as-played; a
// dark piece reveals when a move in a line moves it. The server per-ply snapshots are
// used only by the watch adapter (postgameViewAtPly below).

export type JieqiPostgameViewKey = JieqiColor | 'truth';

export type JieqiPostgameResponse = {
  game: {
    roomId: string;
    variant: 'jieqi';
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
    status: JieqiGameStatus;
    moveNumber: number;
    clock?: unknown;
    timeControl?: { initialMs: number; incrementMs: number };
  };
  timeline: Array<{
    type: string;
    at: number;
    color?: JieqiColor;
    move?: JieqiMove;
    ply?: number;
    winner?: JieqiColor;
    reason?: string;
  }>;
  view: JieqiPlayerView;
  views?: Partial<Record<JieqiPostgameViewKey, JieqiPlayerView>>;
  history?: Partial<Record<JieqiPostgameViewKey, Array<{ ply: number; view: JieqiPlayerView }>>>;
};

type LoadResult =
  | { ok: true; postgame: JieqiPostgameResponse }
  | { ok: false; status: number; error: string };

export function mountJieqiPostgame(root: HTMLElement, roomId: string): void {
  root.classList.add('landing-page', 'game-route');
  installJieqiBoardStyles();
  root.replaceChildren(buildNav(), loadingView());
  if (!jieqiEnabled()) {
    renderError(root, 'Jieqi unavailable', 'This route is not enabled in this build.');
    return;
  }
  void loadJieqiPostgame(roomId)
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

export async function loadJieqiPostgame(roomId: string): Promise<LoadResult> {
  const response = await fetch(jieqiPostgameApiUrl(roomId));
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
    postgame: (await response.json()) as JieqiPostgameResponse,
  };
}

export function jieqiPostgameApiUrl(roomId: string): string {
  const url = new URL(`/api/jieqi/games/${encodeURIComponent(roomId)}`, window.location.href);
  return url.pathname;
}

function renderPostgame(root: HTMLElement, postgame: JieqiPostgameResponse): void {
  // Reconstruct the fixed deal from the earliest fully-revealed truth snapshot, then
  // let the tree replay the move list + branch client-side. If the truth stream is
  // missing/incomplete, recoverJieqiDeal throws and the outer .catch renders an
  // error rather than a wrong board.
  const truthHistory = postgame.history?.truth ?? [];
  const earliestTruth = truthHistory.reduce<{ ply: number; view: JieqiPlayerView } | null>(
    (best, snapshot) => (!best || snapshot.ply < best.ply ? snapshot : best),
    null,
  );
  const truthSeed = earliestTruth?.view ?? postgame.views?.truth ?? null;
  if (!truthSeed) {
    throw new Error('jieqi postgame: no truth history to reconstruct the deal');
  }
  const deal = recoverJieqiDeal(truthSeed);

  const moves: JieqiMove[] = postgame.timeline
    .filter(
      (entry): entry is typeof entry & { move: JieqiMove } =>
        entry.type === 'move-played' && !!entry.move,
    )
    .map((entry) => entry.move);

  const status = `${reviewResultLabel(postgame.game.result)} by ${labelize(postgame.game.termination)}`;
  const { metaCard, details } = buildReviewMeta({
    markerId: 'jieqi',
    variantName: 'Reveal Xiangqi',
    game: postgame.game,
    status,
  });

  root.replaceChildren(buildNav());
  mountJieqiReview(root, postgame.game.roomId, deal, {
    pageClassName: 'jieqi-review',
    ariaLabel: 'Jieqi postgame',
    title: 'Reveal Xiangqi',
    summary: `${status} · ${postgame.game.plyCount} plies`,
    metaCard,
    details,
    moves,
    // No jieqi whole-game analysis engine is wired; the interactive board + move
    // tree stand on their own (no eval gauge, no computer-analysis underboard).
    analysis: null,
  });
}

// Exported for the watch-replay surface to reuse the per-ply view selection,
// mirroring the Dark Mini Xiangqi postgame module's exported helpers.
export function postgameViewEntries(
  postgame: JieqiPostgameResponse,
): Array<{ key: JieqiPostgameViewKey; label: string; view: JieqiPlayerView }> {
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

export function postgameReplayMaxPly(postgame: JieqiPostgameResponse): number {
  const history = Object.values(postgame.history ?? {}).flat();
  return Math.max(postgame.game.plyCount, ...history.map((snapshot) => snapshot.ply), 0);
}

export function postgameViewAtPly(
  postgame: JieqiPostgameResponse,
  key: JieqiPostgameViewKey,
  ply: number,
): JieqiPlayerView | null {
  const history = postgame.history?.[key];
  if (!history || history.length === 0) return null;
  let selected = history[0] ?? null;
  for (const snapshot of history) {
    if (snapshot.ply > ply) break;
    selected = snapshot;
  }
  return selected?.view ?? null;
}

export function jieqiInitialPlyFromSearch(search: string): number | null {
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
  if (result.status === 404) return 'This Jieqi game is not available.';
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
