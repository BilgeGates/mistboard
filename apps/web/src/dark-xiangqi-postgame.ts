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
import { buildReviewMeta, labelize, reviewResultLabel } from './review/game-review-meta.js';
import { createMoveList, type MoveListEntry } from './review/move-list.js';
import { mountReviewLayout } from './review/review-layout.js';
import { buildNav } from './site-shell.js';
import { renderXiangqiPiece } from './xiangqi-pieces.js';

// Captures come from the server-computed ledger on the wire view (per-ply in
// history entries), which is correct on POV boards too — a board diff is NOT:
// on a fog view a hidden survivor and a captured piece are indistinguishable.
// The diff stays only as a fallback for payloads predating the ledger field,
// and only on the fully revealed truth board where it is sound.
const XIANGQI_INITIAL_PIECES = Object.values(createInitialXiangqiBoard()).filter(
  (piece): piece is NonNullable<typeof piece> => Boolean(piece),
);

function darkXiangqiCaptured(view: DarkXiangqiWireView) {
  if (view.captures) {
    return [
      ...view.captures.red.map((role) => ({ owner: 'red' as XiangqiColor, role })),
      ...view.captures.black.map((role) => ({ owner: 'black' as XiangqiColor, role })),
    ];
  }
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
    players?: Array<{
      color: string;
      name: string;
      rating: number | null;
      kind: 'account' | 'guest' | 'engine';
    }>;
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
    renderError(root, 'Fog Xiangqi unavailable', 'This route is not enabled in this build.');
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
    board.setAttribute('aria-label', `${entry.label} final Fog Xiangqi board`);
    // Every board gets flank capture columns (opponent top-left, near
    // bottom-right, level with the board so it keeps its full height), but only
    // the current PRIMARY board's are filled — a promoted POV board shows its
    // seat's captures, the small secondaries stay uncluttered.
    const flank = createFlankCaptures(board);
    el.append(heading, flank.host);
    return { entry, el, board, leftCaptures: flank.leftColumn, rightCaptures: flank.rightColumn };
  });

  // Clickable move list (jump-to-ply + current-ply highlight), matching the
  // other postgame pages. Red moves first, so the default 'a' pairing lands the
  // first ply in the left column. Full truth moves are correct here — /game
  // postgame pages reveal by design.
  const moveList = createMoveList(moveEntries(postgame), { title: 'Moves' });

  const status = `${reviewResultLabel(postgame.game.result)} by ${labelize(postgame.game.termination)}`;
  const { metaCard, details } = buildReviewMeta({
    markerId: 'dark-xiangqi',
    variantName: 'Fog Xiangqi',
    game: postgame.game,
    status,
  });

  root.replaceChildren(buildNav());
  mountReviewLayout(root, {
    pageClassName: 'dark-xiangqi-review',
    ariaLabel: 'Fog Xiangqi postgame',
    title: 'Fog Xiangqi',
    summary: `${status} · ${postgame.game.plyCount} plies`,
    actions: postgameActions(postgame),
    metaCard,
    details,
    moves: moveList.el,
    boards: targets.map((target) => ({
      key: target.entry.key,
      el: target.el,
      tier: target.entry.key === 'truth' ? 'primary' : 'secondary',
    })),
    boardAspect: 552 / 612,
    boardCols: 9,
    maxPly: postgameReplayMaxPly(postgame),
    renderBoards({ ply, flipped, primaryKey }) {
      const orientation: XiangqiColor = flipped ? 'black' : 'red';
      const opponent: XiangqiColor = orientation === 'red' ? 'black' : 'red';
      for (const { entry, board, leftCaptures, rightCaptures } of targets) {
        const view = postgameViewAtPly(postgame, entry.key, ply) ?? entry.view;
        board.innerHTML = renderDarkXiangqiBoardSvg(view, orientation, {
          showFog: entry.key !== 'truth',
        });
        if (leftCaptures && rightCaptures) {
          leftCaptures.replaceChildren();
          rightCaptures.replaceChildren();
          if (entry.key === primaryKey) {
            const captured = darkXiangqiCaptured(view);
            // Render captured glyphs with the SAME renderer the board uses
            // (character pieces). Left column (top) = opponent's captures; right
            // column (bottom) = the near side's captures.
            fillCapturedPoolWith(leftCaptures, captured, orientation, renderCapturedXiangqiGlyph);
            fillCapturedPoolWith(rightCaptures, captured, opponent, renderCapturedXiangqiGlyph);
          }
        }
      }
    },
    // Jump-to-ply routes through the layout's own `go`, the same path the
    // scrubber and keyboard use, so every triptych board stays consistent.
    renderMoves({ ply }, jump) {
      moveList.update(ply, jump);
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

// Flat move entries for the shared clickable list: one per played ply, keeping
// the coordinate `from-to` notation the static timeline showed. `ply` is the
// cursor a click lands on (the scrubber's 1..maxPly), so the pairing/highlight
// track the layout's ply state. Fall back to array index when the wire entry
// omits ply.
function moveEntries(postgame: DarkXiangqiPostgameResponse): MoveListEntry[] {
  const moves = postgame.timeline.filter((entry) => entry.type === 'move-played' && entry.move);
  return moves.map((entry, index) => ({
    ply: entry.ply ?? index + 1,
    label: `${entry.move!.from}-${entry.move!.to}`,
  }));
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
  if (result.status === 404) return 'This Fog Xiangqi game is not available.';
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
  postgame: DarkXiangqiPostgameResponse,
): { initialMs: number; incrementMs: number } | null {
  const initialMs = postgame.game.initialMs ?? postgame.state.timeControl?.initialMs ?? null;
  const incrementMs = postgame.game.incrementMs ?? postgame.state.timeControl?.incrementMs ?? null;
  if (initialMs === null || incrementMs === null) return null;
  return { initialMs, incrementMs };
}
