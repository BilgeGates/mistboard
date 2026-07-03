import type {
  Color,
  CrazyhouseDropRole,
  CrazyhouseHand,
  CrazyhouseMove,
  CrazyhousePlayerView,
} from '@mistboard/game';
import { isCrazyhouseDrop } from '@mistboard/game';
import './game-shell.css';
import './live-dark-crazyhouse.css';
// Reuse the shared dxq-postgame scaffold (.dxq-postgame__*); the route-scoped
// theme + board/reserve overrides live in our own file.
import './dark-xiangqi-postgame.css';
import './dark-crazyhouse-postgame.css';
import {
  CRAZYHOUSE_HAND_ORDER,
  crazyhouseHandPieceSvg,
  renderCrazyhouseBoardSvg,
} from './crazyhouse-render.js';
import { createDarkCrazyhousePlayAgainRoom } from './dark-crazyhouse-room-actions.js';
import { darkCrazyhouseEnabled } from './feature-flags.js';
import { mountReviewLayout } from './review/review-layout.js';
import { buildNav } from './site-shell.js';
import { setBoardFamily } from './theme.js';

export type DarkCrazyhousePostgameViewKey = Color | 'truth';

const DROP_LETTER: Record<CrazyhouseDropRole, string> = {
  queen: 'Q',
  rook: 'R',
  bishop: 'B',
  knight: 'N',
  pawn: 'P',
};

export type DarkCrazyhousePostgameResponse = {
  game: {
    roomId: string;
    variant: 'dark-crazyhouse';
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
    status: CrazyhousePlayerView['status'];
    moveNumber: number;
    clock?: unknown;
    timeControl?: { initialMs: number; incrementMs: number };
  };
  timeline: Array<{
    type: string;
    at: number;
    color?: Color;
    move?: CrazyhouseMove;
    ply?: number;
    winner?: Color;
    reason?: string;
  }>;
  view: CrazyhousePlayerView;
  views?: Partial<Record<DarkCrazyhousePostgameViewKey, CrazyhousePlayerView>>;
  history?: Partial<
    Record<DarkCrazyhousePostgameViewKey, Array<{ ply: number; view: CrazyhousePlayerView }>>
  >;
};

type LoadResult =
  | { ok: true; postgame: DarkCrazyhousePostgameResponse }
  | { ok: false; status: number; error: string };

type PostgameEntry = {
  key: DarkCrazyhousePostgameViewKey;
  label: string;
  view: CrazyhousePlayerView;
};

export function mountDarkCrazyhousePostgame(root: HTMLElement, roomId: string): void {
  root.classList.add('landing-page', 'dark-crazyhouse-postgame-route');
  setBoardFamily('chess');
  root.replaceChildren(buildNav(), loadingView());
  if (!darkCrazyhouseEnabled()) {
    renderError(root, 'Dark Crazyhouse unavailable', 'This route is not enabled in this build.');
    return;
  }
  void loadDarkCrazyhousePostgame(roomId)
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

export async function loadDarkCrazyhousePostgame(roomId: string): Promise<LoadResult> {
  const response = await fetch(darkCrazyhousePostgameApiUrl(roomId));
  if (!response.ok) {
    const body = await safeJson(response);
    return {
      ok: false,
      status: response.status,
      error: typeof body?.error === 'string' ? body.error : 'request_failed',
    };
  }
  return { ok: true, postgame: (await response.json()) as DarkCrazyhousePostgameResponse };
}

export function darkCrazyhousePostgameApiUrl(roomId: string): string {
  const url = new URL(
    `/api/dark-crazyhouse/games/${encodeURIComponent(roomId)}`,
    window.location.href,
  );
  return url.pathname;
}

function renderPostgame(root: HTMLElement, postgame: DarkCrazyhousePostgameResponse): void {
  const views = postgameViewEntries(postgame);
  // Each board host carries its own label + reserve strips; the review layout
  // arranges them (truth dominant, per-seat views as click-to-promote
  // secondaries) and owns the scrubber, keyboard, flip, and viewport-fill sizing.
  const targets = views.map((entry) => {
    const el = document.createElement('section');
    el.className = 'dxq-postgame__board-wrap';
    const heading = document.createElement('h2');
    heading.className = 'dxq-postgame__board-title';
    heading.textContent = entry.label;
    const topReserve = document.createElement('div');
    topReserve.className = 'dczh-postgame__reserve dczh-postgame__reserve--top';
    const board = document.createElement('div');
    board.className = 'dxq-postgame__board crazyhouse-live-board';
    board.setAttribute('aria-label', `${entry.label} final Dark Crazyhouse board`);
    const bottomReserve = document.createElement('div');
    bottomReserve.className = 'dczh-postgame__reserve dczh-postgame__reserve--bottom';
    el.append(heading, topReserve, board, bottomReserve);
    return { entry, el, board, topReserve, bottomReserve };
  });

  root.replaceChildren(buildNav());
  mountReviewLayout(root, {
    pageClassName: 'dark-crazyhouse-review',
    ariaLabel: 'Dark Crazyhouse postgame',
    title: 'Dark Crazyhouse',
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
    boardChromePx: 68,
    maxPly: postgameReplayMaxPly(postgame),
    renderBoards({ ply, flipped }) {
      const orientation: Color = flipped ? 'black' : 'white';
      const topColor: Color = orientation === 'white' ? 'black' : 'white';
      for (const { entry, board, topReserve, bottomReserve } of targets) {
        const view = postgameViewAtPly(postgame, entry.key, ply) ?? entry.view;
        board.innerHTML = renderCrazyhouseBoardSvg(view, {
          perspective: orientation,
          showFog: entry.key !== 'truth',
        });
        const revealed: readonly Color[] = entry.key === 'truth' ? ['white', 'black'] : [entry.key];
        renderReserve(topReserve, topColor, ply, postgame, revealed);
        renderReserve(bottomReserve, orientation, ply, postgame, revealed);
      }
    },
  });
}

function renderReserve(
  host: HTMLElement,
  color: Color,
  ply: number,
  postgame: DarkCrazyhousePostgameResponse,
  revealed: readonly Color[],
): void {
  host.replaceChildren();
  if (!revealed.includes(color)) {
    const note = document.createElement('span');
    note.className = 'dczh-postgame__reserve-empty';
    note.textContent = 'hidden';
    host.append(note);
    return;
  }
  const hand = handForColorAtPly(postgame, color, ply);
  const entries = CRAZYHOUSE_HAND_ORDER.filter((role) => (hand[role] ?? 0) > 0);
  if (entries.length === 0) {
    const note = document.createElement('span');
    note.className = 'dczh-postgame__reserve-empty';
    note.textContent = '(no pieces in hand)';
    host.append(note);
    return;
  }
  for (const role of entries) {
    host.append(reservePiece(role, color, hand[role] ?? 0));
  }
}

function reservePiece(role: CrazyhouseDropRole, color: Color, count: number): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'dczh-postgame__reserve-piece';
  wrap.innerHTML = crazyhouseHandPieceSvg(role, color);
  const badge = document.createElement('span');
  badge.className = 'dczh-postgame__reserve-count';
  badge.textContent = String(count);
  wrap.append(badge);
  return wrap;
}

// The reserve carried by a side at a given ply. The per-color fog views carry
// that side's own hand; the truth view carries no hand, so hands come from the
// color histories / final color views.
function handForColorAtPly(
  postgame: DarkCrazyhousePostgameResponse,
  color: Color,
  ply: number,
): CrazyhouseHand {
  const history = postgame.history?.[color];
  if (history && history.length > 0) {
    let selected = history[0] ?? null;
    for (const snapshot of history) {
      if (snapshot.ply > ply) break;
      selected = snapshot;
    }
    if (selected) return selected.view.hand;
  }
  return postgame.views?.[color]?.hand ?? {};
}

export function postgameViewEntries(postgame: DarkCrazyhousePostgameResponse): PostgameEntry[] {
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

export function postgameReplayMaxPly(postgame: DarkCrazyhousePostgameResponse): number {
  const history = Object.values(postgame.history ?? {}).flat();
  return Math.max(postgame.game.plyCount, ...history.map((snapshot) => snapshot.ply), 0);
}

export function postgameViewAtPly(
  postgame: DarkCrazyhousePostgameResponse,
  key: DarkCrazyhousePostgameViewKey,
  ply: number,
): CrazyhousePlayerView | null {
  const history = postgame.history?.[key];
  if (!history || history.length === 0) return null;
  let selected = history[0] ?? null;
  for (const snapshot of history) {
    if (snapshot.ply > ply) break;
    selected = snapshot;
  }
  return selected?.view ?? null;
}

function postgameActions(postgame: DarkCrazyhousePostgameResponse): HTMLElement {
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
    void createDarkCrazyhousePlayAgainRoom({ timeControl: postgameTimeControl(postgame) })
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

function detailsPanel(postgame: DarkCrazyhousePostgameResponse): HTMLElement {
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

function timelinePanel(postgame: DarkCrazyhousePostgameResponse): HTMLElement {
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
      const text = notateCrazyhouseMove(entry.move!);
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

function notateCrazyhouseMove(move: CrazyhouseMove): string {
  if (isCrazyhouseDrop(move)) return `${DROP_LETTER[move.drop]}@${move.to}`;
  return `${move.from}${move.to}${move.promotion ? `=${DROP_LETTER[move.promotion]}` : ''}`;
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
  if (result.status === 404) return 'This Dark Crazyhouse game is not available.';
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

function timeControlLabel(postgame: DarkCrazyhousePostgameResponse): string {
  const timeControl = postgameTimeControl(postgame);
  const initialMs = timeControl?.initialMs ?? null;
  const incrementMs = timeControl?.incrementMs ?? null;
  if (initialMs === null && incrementMs === null) return 'Untimed';
  return `${clockLabel(initialMs ?? 0)}+${Math.round((incrementMs ?? 0) / 1000)}`;
}

function postgameTimeControl(
  postgame: DarkCrazyhousePostgameResponse,
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
