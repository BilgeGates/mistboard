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
import { renderXiangqiBoardSvg } from './live-xiangqi.js';
import { mountReviewLayout } from './review/review-layout.js';
import { buildNav } from './site-shell.js';
import { createXiangqiPlayAgainRoom } from './xiangqi-room-actions.js';

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
  const entry = postgameViewEntries(postgame)[0]!;
  const boardWrap = document.createElement('section');
  boardWrap.className = 'dxq-postgame__board-wrap';
  const heading = document.createElement('h2');
  heading.className = 'dxq-postgame__board-title';
  heading.textContent = entry.label;
  const board = document.createElement('div');
  board.className = 'dxq-postgame__board xiangqi-live-board';
  board.setAttribute('aria-label', `${entry.label} final Xiangqi board`);
  boardWrap.append(heading, board);

  root.replaceChildren(buildNav());
  mountReviewLayout(root, {
    pageClassName: 'xiangqi-review',
    ariaLabel: 'Xiangqi postgame',
    title: 'Xiangqi',
    summary: `${resultLabel(postgame.game.result)} by ${labelize(postgame.game.termination)} · ${postgame.game.plyCount} plies`,
    actions: postgameActions(postgame),
    details: detailsPanel(postgame),
    moves: timelinePanel(postgame),
    boards: [{ key: 'truth', el: boardWrap, tier: 'primary' }],
    boardAspect: 552 / 612,
    boardCols: 9,
    maxPly: postgameReplayMaxPly(postgame),
    renderBoards({ ply, flipped }) {
      const orientation: XiangqiColor = flipped ? 'black' : 'red';
      const view = postgameViewAtPly(postgame, 'truth', ply) ?? entry.view;
      board.innerHTML = renderXiangqiBoardSvg(view, orientation);
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

function postgameActions(postgame: XiangqiPostgameResponse): HTMLElement {
  const actions = document.createElement('nav');
  actions.className = 'dxq-postgame__actions';
  actions.setAttribute('aria-label', 'Game links');
  let playAgainStatus: 'creating' | 'failed' | 'idle' = 'idle';
  const playAgain = document.createElement('button');
  playAgain.type = 'button';
  playAgain.className = 'dxq-postgame__link dxq-postgame__link--primary';
  const syncPlayAgain = () => {
    playAgain.disabled = playAgainStatus === 'creating';
    playAgain.textContent =
      playAgainStatus === 'creating'
        ? 'Creating'
        : playAgainStatus === 'failed'
          ? 'Try play again'
          : 'Play again';
  };
  playAgain.addEventListener('click', () => {
    playAgainStatus = 'creating';
    syncPlayAgain();
    void createXiangqiPlayAgainRoom({ timeControl: postgameTimeControl(postgame) })
      .then((url) => {
        window.location.assign(url);
      })
      .catch((err) => {
        console.warn(err);
        playAgainStatus = 'failed';
        syncPlayAgain();
      });
  });
  syncPlayAgain();
  const home = document.createElement('a');
  home.className = 'dxq-postgame__link';
  home.href = '/';
  home.textContent = 'Back home';
  const room = document.createElement('a');
  room.className = 'dxq-postgame__link';
  room.href = `/room/${encodeURIComponent(postgame.game.roomId)}`;
  room.textContent = 'Room';
  actions.append(playAgain, home, room);
  return actions;
}

function detailsPanel(postgame: XiangqiPostgameResponse): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'dxq-postgame__panel';
  const heading = document.createElement('h2');
  heading.textContent = 'Game';
  const details = document.createElement('dl');
  details.className = 'dxq-postgame__details';
  details.append(
    detailRow('Result', resultLabel(postgame.game.result)),
    detailRow('Ending', labelize(postgame.game.termination)),
    detailRow('Clock', timeControlLabel(postgame)),
    detailRow('Ended', dateLabel(postgame.game.endedAt)),
  );
  panel.append(heading, details);
  return panel;
}

function timelinePanel(postgame: XiangqiPostgameResponse): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'dxq-postgame__panel';
  const heading = document.createElement('h2');
  heading.textContent = 'Moves';
  const list = document.createElement('ol');
  list.className = 'dxq-postgame__moves';
  const moves = postgame.timeline.filter((entry) => entry.type === 'move-played' && entry.move);
  if (moves.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'dxq-postgame__move';
    empty.textContent = 'No moves';
    list.append(empty);
  } else {
    // Group plies into move rows: one numbered row per Red+Black pair (Red moves
    // first in xiangqi). Fall back to array index / ply parity when the wire
    // entry omits ply or color, so the pairing stays robust.
    const rows = new Map<number, { red?: string; black?: string }>();
    moves.forEach((entry, index) => {
      const ply = entry.ply ?? index + 1;
      const color = entry.color ?? (ply % 2 === 1 ? 'red' : 'black');
      const moveNumber = Math.max(1, Math.ceil(ply / 2));
      const row = rows.get(moveNumber) ?? {};
      const text = `${entry.move!.from}-${entry.move!.to}`;
      if (color === 'black') row.black = text;
      else row.red = text;
      rows.set(moveNumber, row);
    });
    for (const [moveNumber, row] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
      const item = document.createElement('li');
      item.className = 'dxq-postgame__move';
      const number = document.createElement('span');
      number.className = 'dxq-postgame__move-number';
      number.textContent = String(moveNumber);
      const red = document.createElement('span');
      red.className = 'dxq-postgame__move-ply dxq-postgame__move-ply--red';
      red.textContent = row.red ?? '';
      const black = document.createElement('span');
      black.className = 'dxq-postgame__move-ply dxq-postgame__move-ply--black';
      black.textContent = row.black ?? '';
      item.append(number, red, black);
      list.append(item);
    }
  }
  panel.append(heading, list);
  return panel;
}

function detailRow(label: string, value: string): HTMLElement {
  const row = document.createElement('div');
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  row.append(dt, dd);
  return row;
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

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function labelize(value: string): string {
  return value.split('-').filter(Boolean).map(capitalize).join(' ');
}

function capitalize(value: string): string {
  if (!value) return value;
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
