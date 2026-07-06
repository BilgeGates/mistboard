import {
  createInitialXiangqiBoard,
  type XiangqiColor,
  type XiangqiGameStatus,
  type XiangqiMove,
} from '@mistboard/game';
import './game-shell.css';
import './live-xiangqi.css';
import './dark-xiangqi-postgame.css';
import { createDarkXiangqiPlayAgainRoom } from './dark-xiangqi-room-actions.js';
import { darkXiangqiEnabled } from './feature-flags.js';
import { type DarkXiangqiWireView, renderDarkXiangqiBoardSvg } from './live-dark-xiangqi.js';
import { capturedByDiff } from './review/captured-diff.js';
import { fillCapturedPoolWith } from './review/captured-pool.js';
import { createFlankCaptures } from './review/flank-captures.js';
import { mountReviewLayout } from './review/review-layout.js';
import { buildNav } from './site-shell.js';
import { renderXiangqiPiece } from './xiangqi-pieces.js';

// Dark Xiangqi's wire view carries no captured list, so derive it by diffing the
// standard opening against the (fully revealed) truth board. This is public info —
// the same final position anyone reviewing sees — so it leaks no hidden state.
const XIANGQI_INITIAL_PIECES = Object.values(createInitialXiangqiBoard()).filter(
  (piece): piece is NonNullable<typeof piece> => Boolean(piece),
);

function darkXiangqiCaptured(view: DarkXiangqiWireView) {
  const current = Object.values(view.board)
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .filter((entry) => !entry.shrouded)
    .map((entry) => entry.piece);
  return capturedByDiff(XIANGQI_INITIAL_PIECES, current);
}

function renderCapturedXiangqiGlyph(piece: {
  color: XiangqiColor;
  role: (typeof XIANGQI_INITIAL_PIECES)[number]['role'];
}): string {
  return renderXiangqiPiece(piece, { ariaLabel: `${piece.color} ${piece.role}` });
}

export type DarkXiangqiPostgameViewKey = XiangqiColor | 'truth';

export type DarkXiangqiPostgameResponse = {
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
  views?: Partial<Record<DarkXiangqiPostgameViewKey, DarkXiangqiWireView>>;
  history?: Partial<
    Record<DarkXiangqiPostgameViewKey, Array<{ ply: number; view: DarkXiangqiWireView }>>
  >;
};

type LoadResult =
  | { ok: true; postgame: DarkXiangqiPostgameResponse }
  | { ok: false; status: number; error: string };

export function mountDarkXiangqiPostgame(root: HTMLElement, roomId: string): void {
  root.classList.add('landing-page', 'dark-xiangqi-postgame-route');
  root.replaceChildren(buildNav(), loadingView());
  if (!darkXiangqiEnabled()) {
    renderError(root, 'Dark Xiangqi unavailable', 'This route is not enabled in this build.');
    return;
  }
  void loadDarkXiangqiPostgame(roomId)
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

export async function loadDarkXiangqiPostgame(roomId: string): Promise<LoadResult> {
  const response = await fetch(darkXiangqiPostgameApiUrl(roomId));
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
    postgame: (await response.json()) as DarkXiangqiPostgameResponse,
  };
}

export function darkXiangqiPostgameApiUrl(roomId: string): string {
  const url = new URL(
    `/api/dark-xiangqi/games/${encodeURIComponent(roomId)}`,
    window.location.href,
  );
  return url.pathname;
}

function renderPostgame(root: HTMLElement, postgame: DarkXiangqiPostgameResponse): void {
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
    board.className = 'dxq-postgame__board xiangqi-live-board';
    board.setAttribute('aria-label', `${entry.label} final Dark Chinese Chess board`);
    // Captured material is shown on the dominant truth board only (the small POV
    // secondaries stay uncluttered; the review stage hides their pools anyway).
    // Flank layout: columns beside the board (opponent top-left, near bottom-right)
    // so the board keeps its full height.
    if (entry.key === 'truth') {
      const flank = createFlankCaptures(board);
      el.append(heading, flank.host);
      return { entry, el, board, leftCaptures: flank.leftColumn, rightCaptures: flank.rightColumn };
    }
    el.append(heading, board);
    return { entry, el, board, leftCaptures: null, rightCaptures: null };
  });

  root.replaceChildren(buildNav());
  mountReviewLayout(root, {
    pageClassName: 'dark-xiangqi-review',
    ariaLabel: 'Dark Xiangqi postgame',
    title: 'Dark Chinese Chess',
    summary: `${resultLabel(postgame.game.result)} by ${labelize(postgame.game.termination)} · ${postgame.game.plyCount} plies`,
    actions: postgameActions(postgame),
    details: detailsPanel(postgame),
    moves: timelinePanel(postgame),
    boards: targets.map((target) => ({
      key: target.entry.key,
      el: target.el,
      tier: target.entry.key === 'truth' ? 'primary' : 'secondary',
    })),
    boardAspect: 552 / 612,
    boardCols: 9,
    maxPly: postgameReplayMaxPly(postgame),
    renderBoards({ ply, flipped }) {
      const orientation: XiangqiColor = flipped ? 'black' : 'red';
      const opponent: XiangqiColor = orientation === 'red' ? 'black' : 'red';
      for (const { entry, board, leftCaptures, rightCaptures } of targets) {
        const view = postgameViewAtPly(postgame, entry.key, ply) ?? entry.view;
        board.innerHTML = renderDarkXiangqiBoardSvg(view, orientation, {
          showFog: entry.key !== 'truth',
        });
        if (leftCaptures && rightCaptures) {
          const captured = darkXiangqiCaptured(view);
          leftCaptures.replaceChildren();
          rightCaptures.replaceChildren();
          // Render captured glyphs with the SAME renderer the board uses
          // (character pieces). Left column (top) = opponent's captures; right
          // column (bottom) = the near side's captures.
          fillCapturedPoolWith(leftCaptures, captured, orientation, renderCapturedXiangqiGlyph);
          fillCapturedPoolWith(rightCaptures, captured, opponent, renderCapturedXiangqiGlyph);
        }
      }
    },
  });
}

export function postgameViewEntries(
  postgame: DarkXiangqiPostgameResponse,
): Array<{ key: DarkXiangqiPostgameViewKey; label: string; view: DarkXiangqiWireView }> {
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

export function postgameReplayMaxPly(postgame: DarkXiangqiPostgameResponse): number {
  const history = Object.values(postgame.history ?? {}).flat();
  return Math.max(postgame.game.plyCount, ...history.map((snapshot) => snapshot.ply), 0);
}

export function postgameViewAtPly(
  postgame: DarkXiangqiPostgameResponse,
  key: DarkXiangqiPostgameViewKey,
  ply: number,
): DarkXiangqiWireView | null {
  const history = postgame.history?.[key];
  if (!history || history.length === 0) return null;
  let selected = history[0] ?? null;
  for (const snapshot of history) {
    if (snapshot.ply > ply) break;
    selected = snapshot;
  }
  return selected?.view ?? null;
}

function postgameActions(postgame: DarkXiangqiPostgameResponse): HTMLElement {
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
    void createDarkXiangqiPlayAgainRoom({ timeControl: postgameTimeControl(postgame) })
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

function resultLabel(result: string): string {
  if (result === 'red-wins') return 'Red wins';
  if (result === 'black-wins') return 'Black wins';
  if (result === 'draw') return 'Draw';
  return labelize(result);
}

function timeControlLabel(postgame: DarkXiangqiPostgameResponse): string {
  const timeControl = postgameTimeControl(postgame);
  const initialMs = timeControl?.initialMs ?? null;
  const incrementMs = timeControl?.incrementMs ?? null;
  if (initialMs === null && incrementMs === null) return 'Untimed';
  return `${clockLabel(initialMs ?? 0)}+${Math.round((incrementMs ?? 0) / 1000)}`;
}

function postgameTimeControl(
  postgame: DarkXiangqiPostgameResponse,
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
