import type {
  FortressXiangqiColor,
  FortressXiangqiMove,
  FortressXiangqiPlayerView,
} from '@mistboard/game';
import './drop-mini-xiangqi.css';
import './landing.css';
import './game-route.css';
import { fortressXiangqiEnabled } from './feature-flags.js';
import {
  installFortressXiangqiBoardStyles,
  renderFortressXiangqiBoardSvg,
} from './fortress-xiangqi-render.js';
import { fillFortressXiangqiReserve, fortressXiangqiMoveLabel } from './fortress-xiangqi-view.js';
import { createPane } from './replay-board.js';
import { createShareButton } from './replay-meta.js';
import { buildReviewMeta, labelize, reviewResultLabel } from './review/game-review-meta.js';
import { createMoveList } from './review/move-list.js';
import { mountReviewLayout } from './review/review-layout.js';
import { buildNav } from './site-shell.js';
import { setBoardFamily } from './theme.js';

// Postgame review for Fortress Xiangqi. Perfect-information board (7 files x 8
// ranks) plus per-seat drop RESERVES (top/bottom strips flanking the board). The
// shared review layout owns the shell, scrubber, keyboard, flip, and viewport-
// fill sizing; this module supplies the board host + reserves + move list.

type FortressXiangqiViewKey = 'truth';

export type FortressXiangqiPostgameResponse = {
  game: {
    roomId: string;
    variant: 'fortress-xiangqi';
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
    initialMs: number | null;
    incrementMs: number | null;
    pveEngineId?: string | null;
    players?: Array<{
      color: string;
      name: string;
      rating: number | null;
      kind: 'account' | 'guest' | 'engine';
    }>;
  };
  state: {
    status: { type: string; winner?: FortressXiangqiColor | null; reason?: string };
    moveNumber: number;
    clock?: unknown;
    timeControl?: { initialMs: number; incrementMs: number };
  };
  timeline: Array<{
    type: string;
    at: number;
    color?: FortressXiangqiColor;
    move?: FortressXiangqiMove;
    ply?: number;
    winner?: FortressXiangqiColor;
    reason?: string;
  }>;
  view: FortressXiangqiPlayerView;
  views?: Partial<Record<FortressXiangqiViewKey, FortressXiangqiPlayerView>>;
  history?: Partial<
    Record<FortressXiangqiViewKey, Array<{ ply: number; view: FortressXiangqiPlayerView }>>
  >;
};

type FortressMoveEntry = { move: FortressXiangqiMove; ply: number; color: FortressXiangqiColor };

type LoadResult =
  | { ok: true; postgame: FortressXiangqiPostgameResponse }
  | { ok: false; status: number; error: string };

export function mountFortressXiangqiPostgame(root: HTMLElement, roomId: string): void {
  root.classList.add('landing-page', 'game-route');
  setBoardFamily('xiangqi');
  installFortressXiangqiBoardStyles();
  root.replaceChildren(buildNav(), loadingView());
  if (!fortressXiangqiEnabled()) {
    renderError(root, 'Fortress unavailable', 'This route is not enabled in this build.');
    return;
  }
  void loadFortressXiangqiPostgame(roomId)
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

export async function loadFortressXiangqiPostgame(roomId: string): Promise<LoadResult> {
  const response = await fetch(fortressXiangqiPostgameApiUrl(roomId));
  if (!response.ok) {
    const body = await safeJson(response);
    return {
      ok: false,
      status: response.status,
      error: typeof body?.error === 'string' ? body.error : 'request_failed',
    };
  }
  return { ok: true, postgame: (await response.json()) as FortressXiangqiPostgameResponse };
}

export function fortressXiangqiPostgameApiUrl(roomId: string): string {
  const url = new URL(
    `/api/fortress-xiangqi/games/${encodeURIComponent(roomId)}`,
    window.location.href,
  );
  return url.pathname;
}

function renderPostgame(root: HTMLElement, postgame: FortressXiangqiPostgameResponse): void {
  const pane = createPane('', 'truth', true, 'split');
  pane.boardEl.classList.add('fortress-xiangqi-live-board');

  const moves: FortressMoveEntry[] = postgame.timeline
    .filter(
      (
        entry,
      ): entry is typeof entry & {
        move: FortressXiangqiMove;
        ply: number;
        color: FortressXiangqiColor;
      } =>
        entry.type === 'move-played' &&
        !!entry.move &&
        typeof entry.ply === 'number' &&
        !!entry.color,
    )
    .map((entry) => ({ move: entry.move, ply: entry.ply, color: entry.color }));

  const moveList = createMoveList(
    moves.map((entry) => ({ ply: entry.ply, label: fortressXiangqiMoveLabel(entry.move) })),
    { title: 'Moves' },
  );

  const status = `${reviewResultLabel(postgame.game.result)} by ${labelize(postgame.game.termination)}`;
  const { metaCard, details } = buildReviewMeta({
    markerId: 'fortress-xiangqi',
    variantName: 'Fortress',
    game: postgame.game,
    status,
  });

  root.replaceChildren(buildNav());
  mountReviewLayout(root, {
    pageClassName: 'fortress-xiangqi-review',
    ariaLabel: 'Fortress postgame',
    title: 'Fortress',
    summary: `${status} · ${postgame.game.plyCount} plies`,
    metaCard,
    details,
    actions: fortressXiangqiActions(postgame),
    moves: moveList.el,
    boards: [{ key: 'truth', el: pane.el, tier: 'primary' }],
    boardAspect: 516 / 588,
    maxPly: postgameReplayMaxPly(postgame),
    renderBoards({ ply, flipped }) {
      const orientation: FortressXiangqiColor = flipped ? 'black' : 'red';
      const view =
        postgameViewAtPly(postgame, 'truth', ply) ?? postgame.views?.truth ?? postgame.view;
      pane.boardEl.innerHTML = renderFortressXiangqiBoardSvg(view, orientation);
      const top = orientation === 'red' ? 'black' : 'red';
      fillFortressXiangqiReserve(pane.topCapturesEl, view, top);
      fillFortressXiangqiReserve(pane.capturesEl, view, orientation);
    },
    renderMoves({ ply }, jump) {
      moveList.update(ply, jump);
    },
  });
}

function fortressXiangqiActions(postgame: FortressXiangqiPostgameResponse): HTMLElement {
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
    void createFortressXiangqiPlayAgainRoom(postgame)
      .then((url) => window.location.assign(url))
      .catch((err) => {
        console.warn(err);
        busy = false;
        playAgain.disabled = false;
        playAgain.textContent = 'Try play again';
      });
  };
  const share = createShareButton();
  const home = reviewActionLink('Home', '/');
  const room = reviewActionLink('Room', `/room/${encodeURIComponent(postgame.game.roomId)}`);
  actions.append(playAgain, share, home, room);
  return actions;
}

function reviewActionLink(label: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'review-action-link';
  link.href = href;
  link.textContent = label;
  return link;
}

export async function createFortressXiangqiPlayAgainRoom(
  postgame: FortressXiangqiPostgameResponse,
): Promise<string> {
  const mode =
    postgame.game.mode === 'pve' && typeof postgame.game.pveEngineId === 'string' ? 'pve' : 'pvp';
  const response = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode,
      gameSpecId: 'fortress-xiangqi',
      preferredColor: 'random',
      ...(mode === 'pve' ? { engineId: postgame.game.pveEngineId } : { rated: false }),
      ...(postgameTimeControl(postgame) ? { timeControl: postgameTimeControl(postgame) } : {}),
    }),
  });
  if (!response.ok) throw new Error('fortress_xiangqi_play_again_failed');
  const body = (await response.json()) as { url?: unknown };
  if (typeof body.url !== 'string') throw new Error('fortress_xiangqi_play_again_missing_url');
  return body.url;
}

export function postgameReplayMaxPly(postgame: FortressXiangqiPostgameResponse): number {
  const history = Object.values(postgame.history ?? {}).flat();
  return Math.max(postgame.game.plyCount, ...history.map((snapshot) => snapshot.ply), 0);
}

export function postgameViewAtPly(
  postgame: FortressXiangqiPostgameResponse,
  key: FortressXiangqiViewKey,
  ply: number,
): FortressXiangqiPlayerView | null {
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
  if (result.status === 404) return 'This Fortress game is not available.';
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

function postgameTimeControl(
  postgame: FortressXiangqiPostgameResponse,
): { initialMs: number; incrementMs: number } | null {
  const initialMs = postgame.game.initialMs ?? postgame.state.timeControl?.initialMs ?? null;
  const incrementMs = postgame.game.incrementMs ?? postgame.state.timeControl?.incrementMs ?? null;
  if (initialMs === null || incrementMs === null) return null;
  return { initialMs, incrementMs };
}
