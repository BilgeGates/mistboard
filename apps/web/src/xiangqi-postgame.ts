// Postgame review for standard Xiangqi — OPEN INFORMATION, so there is a single
// truth board (no red/truth/black fog triptych). Rides the shared review layout
// (mountReviewLayout) like every other variant; the board comes from
// renderXiangqiBoardSvg with no fog mask.

import type { StandardXiangqiPlayerView, XiangqiColor, XiangqiMove } from '@mistboard/game';
import './game-shell.css';
import './live-xiangqi.css';
// Reuse the shared dxq-postgame scaffold (.dxq-postgame__*) the other variants ride.
import './dark-xiangqi-postgame.css';
import './xiangqi-postgame.css';
import { xiangqiEnabled } from './feature-flags.js';
import { fetchCachedGameAnalysis, requestGameAnalysis } from './review/game-analysis.js';
import { createGameMetaCard, timeAgoLabel } from './review/game-meta-card.js';
import { buildSpectatorChat } from './review/spectator-chat.js';
import { mountXiangqiReview } from './review/xiangqi-review.js';
import { buildNav } from './site-shell.js';

// Open information: the only meaningful board is the shared truth board.
export type XiangqiPostgameViewKey = 'truth';

export type XiangqiPostgameResponse = {
  game: {
    roomId: string;
    variant: 'xiangqi';
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
    /** Persisted participants (server includes them for persisted games). */
    players?: Array<{
      color: string;
      name: string;
      rating: number | null;
      kind: 'account' | 'guest' | 'engine';
    }>;
  };
  state: {
    status: StandardXiangqiPlayerView['status'];
    moveNumber: number;
    clock?: unknown;
    timeControl?: { initialMs: number; incrementMs: number };
  };
  timeline: Array<{
    type: string;
    at: number;
    color?: XiangqiColor;
    move?: XiangqiMove;
    ply?: number;
    winner?: XiangqiColor;
    reason?: string;
  }>;
  view: StandardXiangqiPlayerView;
  views?: Partial<Record<XiangqiPostgameViewKey, StandardXiangqiPlayerView>>;
  history?: Partial<
    Record<XiangqiPostgameViewKey, Array<{ ply: number; view: StandardXiangqiPlayerView }>>
  >;
};

type LoadResult =
  | { ok: true; postgame: XiangqiPostgameResponse }
  | { ok: false; status: number; error: string };

export function mountXiangqiPostgame(root: HTMLElement, roomId: string): void {
  root.classList.add('landing-page', 'xiangqi-postgame-route');
  root.replaceChildren(buildNav(), loadingView());
  if (!xiangqiEnabled()) {
    renderError(root, 'Xiangqi unavailable', 'This route is not enabled in this build.');
    return;
  }
  void loadXiangqiPostgame(roomId)
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

export async function loadXiangqiPostgame(roomId: string): Promise<LoadResult> {
  const response = await fetch(xiangqiPostgameApiUrl(roomId));
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
    postgame: (await response.json()) as XiangqiPostgameResponse,
  };
}

export function xiangqiPostgameApiUrl(roomId: string): string {
  const url = new URL(`/api/xiangqi/games/${encodeURIComponent(roomId)}`, window.location.href);
  return url.pathname;
}

function renderPostgame(root: HTMLElement, postgame: XiangqiPostgameResponse): void {
  const moves = postgame.timeline
    .filter((item) => item.type === 'move-played' && item.move)
    .map((item) => item.move as XiangqiMove);

  const metaCard = createGameMetaCard({
    markerId: 'xiangqi',
    glyph: '象',
    headline: [timeControlLabel(postgame), postgame.game.rated ? 'Rated' : 'Casual'],
    variantName: 'Elephant Chess',
    subline: timeAgoLabel(postgame.game.endedAt),
    players: (postgame.game.players ?? []).map((player) => ({
      color: player.color,
      name: player.name,
      rating: player.rating,
      isEngine: player.kind === 'engine',
    })),
    status: `${resultLabel(postgame.game.result)} by ${labelize(postgame.game.termination)}`,
  });

  root.replaceChildren(buildNav());
  mountXiangqiReview(root, {
    pageClassName: 'xiangqi-review',
    ariaLabel: 'Xiangqi postgame',
    title: 'Elephant Chess',
    summary: `${resultLabel(postgame.game.result)} by ${labelize(postgame.game.termination)} · ${postgame.game.plyCount} plies`,
    metaCard: metaCard.el,
    details: buildSpectatorChat(postgame.game.roomId),
    // The tree reconstructs positions from the move list client-side (open info,
    // so it matches the server truth); the server per-ply snapshots are unused.
    moves,
    // Server Pikafish whole-game analysis, DB-cached: an already-analysed game
    // loads straight from cache on open (a GET that never computes).
    analysis: {
      requestLabel: 'Request computer analysis',
      fetchCached: () => fetchCachedGameAnalysis(postgame.game.roomId),
      run: () => requestGameAnalysis(postgame.game.roomId),
    },
  });
}

export function postgameViewEntries(
  postgame: XiangqiPostgameResponse,
): Array<{ key: XiangqiPostgameViewKey; label: string; view: StandardXiangqiPlayerView }> {
  const truth = postgame.views?.truth ?? postgame.view;
  return [{ key: 'truth', label: 'Final position', view: truth }];
}

export function postgameReplayMaxPly(postgame: XiangqiPostgameResponse): number {
  const history = Object.values(postgame.history ?? {}).flat();
  return Math.max(postgame.game.plyCount, ...history.map((snapshot) => snapshot.ply), 0);
}

export function postgameViewAtPly(
  postgame: XiangqiPostgameResponse,
  key: XiangqiPostgameViewKey,
  ply: number,
): StandardXiangqiPlayerView | null {
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
  shell.className = 'dxq-postgame__notice';
  const heading = document.createElement('h1');
  heading.textContent = 'Loading game';
  shell.append(heading);
  return shell;
}

function renderError(root: HTMLElement, titleText: string, bodyText: string): void {
  const shell = document.createElement('main');
  shell.className = 'dxq-postgame__error';
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
  if (result.status === 404) return 'This Xiangqi game is not available.';
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

function timeControlLabel(postgame: XiangqiPostgameResponse): string {
  const timeControl = postgameTimeControl(postgame);
  const initialMs = timeControl?.initialMs ?? null;
  const incrementMs = timeControl?.incrementMs ?? null;
  if (initialMs === null && incrementMs === null) return 'Untimed';
  return `${clockLabel(initialMs ?? 0)}+${Math.round((incrementMs ?? 0) / 1000)}`;
}

function postgameTimeControl(
  postgame: XiangqiPostgameResponse,
): { initialMs: number; incrementMs: number } | null {
  const initialMs = postgame.game.initialMs ?? postgame.state.timeControl?.initialMs ?? null;
  const incrementMs = postgame.game.incrementMs ?? postgame.state.timeControl?.incrementMs ?? null;
  if (initialMs === null || incrementMs === null) return null;
  return { initialMs, incrementMs };
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
