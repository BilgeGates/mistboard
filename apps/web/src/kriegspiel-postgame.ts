import type { Color, KriegspielPlayerView, Move, Square } from '@mistboard/game';
import './game-shell.css';
import './live-kriegspiel.css';
// Reuse the shared dxq-postgame scaffold (.dxq-postgame__*); the route-scoped
// theme + board overrides live in our own file.
import './dark-xiangqi-postgame.css';
import './kriegspiel-postgame.css';
import { kriegspielEnabled } from './feature-flags.js';
import { renderKriegspielBoardSvg } from './kriegspiel-render.js';
import { createKriegspielPlayAgainRoom } from './kriegspiel-room-actions.js';
import { mountReviewLayout } from './review/review-layout.js';
import { buildNav } from './site-shell.js';
import { setBoardFamily } from './theme.js';

export type KriegspielPostgameViewKey = Color | 'truth';

// The umpire's announcement rides each move-played event; Kriegspiel moves are
// plain chess moves (from/to/promotion), never drops.
type KriegspielPostgameMove = {
  from?: Square;
  to?: Square;
  promotion?: Move['promotion'];
  announcement?: unknown;
};

export type KriegspielPostgameResponse = {
  game: {
    roomId: string;
    variant: 'kriegspiel';
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
    status: KriegspielPlayerView['status'];
    moveNumber: number;
    clock?: unknown;
    timeControl?: { initialMs: number; incrementMs: number };
  };
  timeline: Array<{
    type: string;
    at: number;
    color?: Color;
    move?: KriegspielPostgameMove;
    ply?: number;
    winner?: Color;
    reason?: string;
  }>;
  view: KriegspielPlayerView;
  views?: Partial<Record<KriegspielPostgameViewKey, KriegspielPlayerView>>;
  history?: Partial<
    Record<KriegspielPostgameViewKey, Array<{ ply: number; view: KriegspielPlayerView }>>
  >;
};

type LoadResult =
  | { ok: true; postgame: KriegspielPostgameResponse }
  | { ok: false; status: number; error: string };

type PostgameEntry = {
  key: KriegspielPostgameViewKey;
  label: string;
  view: KriegspielPlayerView;
};

export function mountKriegspielPostgame(root: HTMLElement, roomId: string): Promise<unknown> {
  root.classList.add('landing-page', 'kriegspiel-postgame-route');
  setBoardFamily('chess');
  root.replaceChildren(buildNav(), loadingView());
  if (!kriegspielEnabled()) {
    renderError(root, 'Kriegspiel unavailable', 'This route is not enabled in this build.');
    return Promise.resolve();
  }
  return loadKriegspielPostgame(roomId)
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

export async function loadKriegspielPostgame(roomId: string): Promise<LoadResult> {
  const response = await fetch(kriegspielPostgameApiUrl(roomId));
  if (!response.ok) {
    const body = await safeJson(response);
    return {
      ok: false,
      status: response.status,
      error: typeof body?.error === 'string' ? body.error : 'request_failed',
    };
  }
  return { ok: true, postgame: (await response.json()) as KriegspielPostgameResponse };
}

export function kriegspielPostgameApiUrl(roomId: string): string {
  const url = new URL(`/api/kriegspiel/games/${encodeURIComponent(roomId)}`, window.location.href);
  return url.pathname;
}

function renderPostgame(root: HTMLElement, postgame: KriegspielPostgameResponse): void {
  const views = postgameViewEntries(postgame);
  // Each board host carries its own label; the review layout arranges them
  // (truth dominant, per-seat views as click-to-promote secondaries) and owns
  // the scrubber, keyboard, flip, and viewport-fill sizing.
  const targets = views.map((entry) => {
    const el = document.createElement('section');
    el.className = 'dxq-postgame__board-wrap';
    const heading = document.createElement('h2');
    heading.className = 'dxq-postgame__board-title';
    heading.textContent = entry.label;
    const board = document.createElement('div');
    board.className = 'dxq-postgame__board kriegspiel-live-board';
    board.setAttribute('aria-label', `${entry.label} final Kriegspiel board`);
    el.append(heading, board);
    return { entry, el, board };
  });

  root.replaceChildren(buildNav());
  mountReviewLayout(root, {
    pageClassName: 'kriegspiel-review',
    ariaLabel: 'Kriegspiel postgame',
    title: 'Kriegspiel',
    summary: `${resultLabel(postgame.game.result)} by ${labelize(postgame.game.termination)} · ${postgame.game.plyCount} plies`,
    actions: postgameActions(postgame),
    details: detailsPanel(postgame),
    moves: timelinePanel(postgame),
    boards: targets.map((target) => ({
      key: target.entry.key,
      el: target.el,
      tier: target.entry.key === 'truth' ? 'primary' : 'secondary',
    })),
    boardAspect: 1,
    maxPly: postgameReplayMaxPly(postgame),
    renderBoards({ ply, flipped }) {
      const orientation: Color = flipped ? 'black' : 'white';
      for (const { entry, board } of targets) {
        const view = postgameViewAtPly(postgame, entry.key, ply) ?? entry.view;
        board.innerHTML = renderKriegspielBoardSvg(view, {
          perspective: orientation,
          showFog: entry.key !== 'truth',
        });
      }
    },
  });
}

export function postgameViewEntries(postgame: KriegspielPostgameResponse): PostgameEntry[] {
  const views = postgame.views;
  if (views?.white && views.truth && views.black) {
    return [
      { key: 'white', label: 'White view', view: views.white },
      { key: 'truth', label: 'Server truth', view: views.truth },
      { key: 'black', label: 'Black view', view: views.black },
    ];
  }
  return [{ key: 'truth', label: 'Server truth', view: postgame.view }];
}

export function postgameReplayMaxPly(postgame: KriegspielPostgameResponse): number {
  const history = Object.values(postgame.history ?? {}).flat();
  return Math.max(postgame.game.plyCount, ...history.map((snapshot) => snapshot.ply), 0);
}

export function postgameViewAtPly(
  postgame: KriegspielPostgameResponse,
  key: KriegspielPostgameViewKey,
  ply: number,
): KriegspielPlayerView | null {
  const history = postgame.history?.[key];
  if (!history || history.length === 0) return null;
  let selected = history[0] ?? null;
  for (const snapshot of history) {
    if (snapshot.ply > ply) break;
    selected = snapshot;
  }
  return selected?.view ?? null;
}

function postgameActions(postgame: KriegspielPostgameResponse): HTMLElement {
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
    void createKriegspielPlayAgainRoom({ timeControl: postgameTimeControl(postgame) })
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

function detailsPanel(postgame: KriegspielPostgameResponse): HTMLElement {
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

function timelinePanel(postgame: KriegspielPostgameResponse): HTMLElement {
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
    const rows = new Map<number, { white?: string; black?: string }>();
    moves.forEach((entry, index) => {
      const ply = entry.ply ?? index + 1;
      const color = entry.color ?? (ply % 2 === 1 ? 'white' : 'black');
      const moveNumber = Math.max(1, Math.ceil(ply / 2));
      const row = rows.get(moveNumber) ?? {};
      const text = notateKriegspielMove(entry.move!);
      if (color === 'black') row.black = text;
      else row.white = text;
      rows.set(moveNumber, row);
    });
    for (const [moveNumber, row] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
      const item = document.createElement('li');
      item.className = 'dxq-postgame__move';
      const number = document.createElement('span');
      number.className = 'dxq-postgame__move-number';
      number.textContent = String(moveNumber);
      const white = document.createElement('span');
      white.className = 'dxq-postgame__move-ply dxq-postgame__move-ply--white';
      white.textContent = row.white ?? '';
      const black = document.createElement('span');
      black.className = 'dxq-postgame__move-ply dxq-postgame__move-ply--red';
      black.textContent = row.black ?? '';
      item.append(number, white, black);
      list.append(item);
    }
  }
  panel.append(heading, list);
  return panel;
}

// Kriegspiel moves are plain chess moves — from/to with an optional promotion.
// There are no drops, so no '@' notation. The redacted opponent move-played can
// arrive without from/to (only the umpire announcement survives); fall back to a
// dot so the row still renders.
function notateKriegspielMove(move: KriegspielPostgameMove): string {
  if (!move.from || !move.to) return '·';
  const promotion = move.promotion ? `=${move.promotion[0]?.toUpperCase() ?? ''}` : '';
  return `${move.from}${move.to}${promotion}`;
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
  return 'Postgame unavailable';
}

function errorBody(result: Extract<LoadResult, { ok: false }>): string {
  if (result.status === 404) return 'This Kriegspiel game is not available.';
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
  if (result === 'white-wins') return 'White wins';
  if (result === 'black-wins') return 'Black wins';
  if (result === 'draw') return 'Draw';
  return labelize(result);
}

function timeControlLabel(postgame: KriegspielPostgameResponse): string {
  const timeControl = postgameTimeControl(postgame);
  const initialMs = timeControl?.initialMs ?? null;
  const incrementMs = timeControl?.incrementMs ?? null;
  if (initialMs === null && incrementMs === null) return 'Untimed';
  return `${clockLabel(initialMs ?? 0)}+${Math.round((incrementMs ?? 0) / 1000)}`;
}

function postgameTimeControl(
  postgame: KriegspielPostgameResponse,
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
