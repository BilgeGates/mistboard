import type { XiangqiColor, XiangqiGameStatus, XiangqiMove } from '@mistboard/game';
import './live-xiangqi.css';
import './dark-xiangqi-postgame.css';
import { darkXiangqiEnabled } from './feature-flags.js';
import { readSeatTokenForRoom } from './live-state.js';
import {
  type DarkXiangqiWireView,
  renderDarkXiangqiBoardSvg,
} from './live-xiangqi-render.js';

type DarkXiangqiPostgameResponse = {
  game: {
    roomId: string;
    variant: 'dark-xiangqi';
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
  access: { seat: XiangqiColor | 'spectator' };
  state: {
    status: XiangqiGameStatus;
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
  view: DarkXiangqiWireView;
};

type LoadResult =
  | { ok: true; postgame: DarkXiangqiPostgameResponse; usedSeatToken: boolean }
  | { ok: false; status: number; error: string; usedSeatToken: boolean };

export function mountDarkXiangqiPostgame(root: HTMLElement, roomId: string): void {
  root.classList.add('landing-page', 'dark-xiangqi-postgame-route');
  root.replaceChildren(loadingView());
  if (!darkXiangqiEnabled()) {
    renderError(root, 'Dark Xiangqi unavailable', 'This route is not enabled in this build.');
    return;
  }
  void loadDarkXiangqiPostgame(roomId)
    .then((result) => {
      if (result.ok) {
        renderPostgame(root, result.postgame, result.usedSeatToken);
        return;
      }
      renderError(root, errorTitle(result.status), errorBody(result));
    })
    .catch(() => {
      renderError(root, 'Postgame unavailable', 'The game could not be loaded.');
    });
}

export async function loadDarkXiangqiPostgame(roomId: string): Promise<LoadResult> {
  const seatToken = darkXiangqiPostgameSeatToken(roomId);
  const usedSeatToken = seatToken !== null;
  const response = await fetch(darkXiangqiPostgameApiUrl(roomId, seatToken));
  if (!response.ok) {
    const body = await safeJson(response);
    return {
      ok: false,
      status: response.status,
      error: typeof body?.error === 'string' ? body.error : 'request_failed',
      usedSeatToken,
    };
  }
  return {
    ok: true,
    postgame: (await response.json()) as DarkXiangqiPostgameResponse,
    usedSeatToken,
  };
}

export function darkXiangqiPostgameApiUrl(roomId: string, seatToken: string | null): string {
  const url = new URL(`/api/dark-xiangqi/games/${encodeURIComponent(roomId)}`, window.location.href);
  if (seatToken) url.searchParams.set('seatToken', seatToken);
  return `${url.pathname}${url.search}`;
}

export function darkXiangqiPostgameSeatToken(roomId: string): string | null {
  const stored = readSeatTokenForRoom(roomId);
  if (!stored || !isXiangqiColor(stored.seat)) return null;
  return stored.token;
}

function renderPostgame(
  root: HTMLElement,
  postgame: DarkXiangqiPostgameResponse,
  usedSeatToken: boolean,
): void {
  root.replaceChildren();
  const page = document.createElement('main');
  page.className = 'dxq-postgame';

  const header = document.createElement('header');
  header.className = 'dxq-postgame__header';
  const titleBlock = document.createElement('div');
  const eyebrow = document.createElement('p');
  eyebrow.className = 'dxq-postgame__eyebrow';
  eyebrow.textContent = accessLabel(postgame.access.seat, usedSeatToken);
  const title = document.createElement('h1');
  title.className = 'dxq-postgame__title';
  title.textContent = 'Dark Xiangqi';
  const summary = document.createElement('p');
  summary.className = 'dxq-postgame__summary';
  summary.textContent = `${resultLabel(postgame.game.result)} by ${labelize(postgame.game.termination)} · ${postgame.game.plyCount} plies`;
  titleBlock.append(eyebrow, title, summary);
  header.append(titleBlock, postgameActions(postgame.game.roomId));

  const layout = document.createElement('section');
  layout.className = 'dxq-postgame__layout';
  layout.setAttribute('aria-label', 'Dark Xiangqi postgame');

  const boardWrap = document.createElement('div');
  boardWrap.className = 'dxq-postgame__board-wrap';
  const board = document.createElement('div');
  board.className = 'dxq-postgame__board xiangqi-live-board';
  board.setAttribute('aria-label', 'Final Dark Xiangqi board');
  board.innerHTML = renderDarkXiangqiBoardSvg(postgame.view, postgame.view.perspective);
  boardWrap.append(board);

  const side = document.createElement('aside');
  side.className = 'dxq-postgame__side';
  side.append(detailsPanel(postgame), timelinePanel(postgame));

  layout.append(boardWrap, side);
  page.append(header, layout);
  root.append(page);
}

function postgameActions(roomId: string): HTMLElement {
  const actions = document.createElement('nav');
  actions.className = 'dxq-postgame__actions';
  actions.setAttribute('aria-label', 'Game links');
  const room = document.createElement('a');
  room.className = 'dxq-postgame__link';
  room.href = `/room/${encodeURIComponent(roomId)}`;
  room.textContent = 'Room';
  actions.append(room);
  return actions;
}

function detailsPanel(postgame: DarkXiangqiPostgameResponse): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'dxq-postgame__panel';
  const heading = document.createElement('h2');
  heading.textContent = 'Game';
  const details = document.createElement('dl');
  details.className = 'dxq-postgame__details';
  details.append(
    detailRow('Result', resultLabel(postgame.game.result)),
    detailRow('Ending', labelize(postgame.game.termination)),
    detailRow('Seat', accessLabel(postgame.access.seat, postgame.access.seat !== 'spectator')),
    detailRow('Clock', timeControlLabel(postgame)),
    detailRow('Ended', dateLabel(postgame.game.endedAt)),
  );
  panel.append(heading, details);
  return panel;
}

function timelinePanel(postgame: DarkXiangqiPostgameResponse): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'dxq-postgame__panel';
  const heading = document.createElement('h2');
  heading.textContent = 'Visible Moves';
  const list = document.createElement('ol');
  list.className = 'dxq-postgame__moves';
  const moves = postgame.timeline.filter((entry) => entry.type === 'move-played' && entry.move);
  if (moves.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'dxq-postgame__move';
    empty.textContent = 'No visible moves';
    list.append(empty);
  } else {
    for (const entry of moves) {
      const item = document.createElement('li');
      item.className = 'dxq-postgame__move';
      const number = document.createElement('span');
      number.className = 'dxq-postgame__move-number';
      number.textContent = String(entry.ply ?? '');
      const move = document.createElement('span');
      move.textContent = `${capitalize(entry.color ?? postgame.access.seat)} ${entry.move!.from}-${entry.move!.to}`;
      item.append(number, move);
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
  root.replaceChildren();
  const shell = document.createElement('main');
  shell.className = 'dxq-postgame__error';
  const title = document.createElement('h1');
  title.textContent = titleText;
  const body = document.createElement('p');
  body.textContent = bodyText;
  shell.append(title, body);
  root.append(shell);
}

function errorTitle(status: number): string {
  if (status === 401) return 'Seat unavailable';
  if (status === 404) return 'Game not found';
  if (status === 503) return 'Postgame unavailable';
  return 'Postgame unavailable';
}

function errorBody(result: Extract<LoadResult, { ok: false }>): string {
  if (result.status === 401 && result.usedSeatToken) return 'The stored seat token was rejected.';
  if (result.status === 404) return 'This Dark Xiangqi game is not available.';
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

function accessLabel(seat: XiangqiColor | 'spectator', usedSeatToken: boolean): string {
  if (seat === 'spectator') return 'Spectator';
  return usedSeatToken ? `${capitalize(seat)} view` : capitalize(seat);
}

function resultLabel(result: string): string {
  if (result === 'red-wins') return 'Red wins';
  if (result === 'black-wins') return 'Black wins';
  if (result === 'draw') return 'Draw';
  return labelize(result);
}

function timeControlLabel(postgame: DarkXiangqiPostgameResponse): string {
  const initialMs = postgame.game.initialMs ?? postgame.state.timeControl?.initialMs ?? null;
  const incrementMs = postgame.game.incrementMs ?? postgame.state.timeControl?.incrementMs ?? null;
  if (initialMs === null && incrementMs === null) return 'Untimed';
  return `${clockLabel(initialMs ?? 0)}+${Math.round((incrementMs ?? 0) / 1000)}`;
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
  return value
    .split('-')
    .filter(Boolean)
    .map(capitalize)
    .join(' ');
}

function capitalize(value: string): string {
  if (!value) return value;
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function isXiangqiColor(value: unknown): value is XiangqiColor {
  return value === 'red' || value === 'black';
}
