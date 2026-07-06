// Postgame review for standard Xiangqi — OPEN INFORMATION, so there is a single
// truth board (no red/truth/black fog triptych). Rides the shared review layout
// (mountReviewLayout) like every other variant; the board comes from
// renderXiangqiBoardSvg with no fog mask.

import {
  createInitialXiangqiBoard,
  fsfUciToXiangqiSquares,
  type StandardXiangqiPlayerView,
  type XiangqiColor,
  type XiangqiMove,
  xiangqiMoveToFsfUci,
} from '@mistboard/game';
import './game-shell.css';
import './live-xiangqi.css';
// Reuse the shared dxq-postgame scaffold (.dxq-postgame__*) the other variants ride.
import './dark-xiangqi-postgame.css';
import './xiangqi-postgame.css';
import { xiangqiEnabled } from './feature-flags.js';
import { renderXiangqiBoardSvg } from './live-xiangqi.js';
import { type AdvantageChart, createAdvantageChart } from './review/advantage-chart.js';
import { createAnalysisSummary } from './review/analysis-summary.js';
import { capturedByDiff } from './review/captured-diff.js';
import { fillCapturedPoolWith } from './review/captured-pool.js';
import { createEnginePanel } from './review/engine/engine-panel.js';
import { createEvalBar } from './review/engine/eval-bar.js';
import { formatEval } from './review/engine/eval-format.js';
import { createFlankCaptures } from './review/flank-captures.js';
import {
  fetchCachedGameAnalysis,
  type GameAnalysis,
  judgmentGlyph,
  requestGameAnalysis,
} from './review/game-analysis.js';
import { createMoveAdvice } from './review/move-advice.js';
import { createMoveList, type MoveAnnotation, type MoveListEntry } from './review/move-list.js';
import { mountReviewLayout } from './review/review-layout.js';
import { buildNav } from './site-shell.js';
import { renderXiangqiPiece } from './xiangqi-pieces.js';
import { createXiangqiPlayAgainRoom } from './xiangqi-room-actions.js';

// Standard Xiangqi's view carries no captured list, so derive it by diffing the
// opening against the current (fully open) board — public info, no hidden state.
const XIANGQI_INITIAL_PIECES = Object.values(createInitialXiangqiBoard()).filter(
  (piece): piece is NonNullable<typeof piece> => Boolean(piece),
);

function xiangqiCaptured(view: StandardXiangqiPlayerView) {
  const current = Object.values(view.board).filter((piece): piece is NonNullable<typeof piece> =>
    Boolean(piece),
  );
  return capturedByDiff(XIANGQI_INITIAL_PIECES, current);
}

function renderCapturedXiangqiGlyph(piece: {
  color: XiangqiColor;
  role: (typeof XIANGQI_INITIAL_PIECES)[number]['role'];
}): string {
  return renderXiangqiPiece(piece, { ariaLabel: `${piece.color} ${piece.role}` });
}

// Size capture tiles to the board (≈ one board cell) AND cap the flank row to
// board + a fixed column budget, both keyed off the board's measured width. The
// cap stops the board's flex-grow from leaving slack that would push the capture
// columns away from the board. Re-run on the layout's fit cadence + a ResizeObserver.
function sizeCapturesToBoard(
  boardEl: HTMLElement,
  cols: number,
  flank: { host: HTMLElement; leftColumn: HTMLElement; rightColumn: HTMLElement },
): void {
  const apply = () => {
    const width = boardEl.getBoundingClientRect().width;
    if (width <= 0) return;
    const tile = Math.round(width / cols);
    const size = `${tile}px`;
    flank.leftColumn.style.setProperty('--capture-piece-size', size);
    flank.rightColumn.style.setProperty('--capture-piece-size', size);
    // Two columns (tile + horizontal padding) + the two flank gaps.
    const columnBudget = 2 * (tile + 16) + 2 * 8;
    flank.host.style.maxWidth = `${Math.round(width) + columnBudget}px`;
    flank.host.style.marginInline = 'auto';
  };
  apply();
  requestAnimationFrame(apply);
  setTimeout(apply, 80);
  setTimeout(apply, 300);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(apply).observe(boardEl);
  window.addEventListener('resize', apply);
}

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
  // review-board-host makes the wrap the positioning context for the on-board eval
  // bar (aligned to the board's rect via observe()). No board title (lichess has
  // none); the board carries its own aria-label.
  boardWrap.className = 'dxq-postgame__board-wrap review-board-host';
  const board = document.createElement('div');
  board.className = 'dxq-postgame__board xiangqi-live-board';
  board.setAttribute('aria-label', 'Xiangqi board');
  // Captured material in columns beside the board (opponent top-left, near side
  // bottom-right) — same flank layout as Dark Xiangqi, no vertical chrome added.
  const flank = createFlankCaptures(board);
  const evalBar = createEvalBar();
  boardWrap.append(flank.host, evalBar.el);
  // The eval bar sits on the RIGHT of the board area, past the capture columns
  // (captures · board · captures · bar), so it reads toward the move list rather
  // than floating off the far-left edge.
  evalBar.observe(board, flank.host, 'right');
  // The stage's container-query capture sizing assumes slot width ≈ board width,
  // but a single portrait board leaves the slot much wider, so size the tiles off
  // the board's measured width (≈ one board cell) to match the on-board pieces.
  sizeCapturesToBoard(board, 9, flank);

  const moveList = createMoveList(xiangqiMoveEntries(postgame), { title: 'Moves' });

  // Local engine: the full game as Fairy-Stockfish xiangqi UCI (1-indexed, = our
  // square notation), sliced to the current ply. Standard xiangqi is an FSF built-in.
  const engineMovesUci = postgame.timeline
    .filter((entry) => entry.type === 'move-played' && entry.move)
    .map((entry) => xiangqiMoveToFsfUci(entry.move as XiangqiMove));
  const enginePanel = createEnginePanel({
    variant: 'xiangqi',
    formatPvMove: formatXiangqiEngineMove,
    evalBar,
  });
  let lastEnginePly = -1;

  // Computer analysis (P3): whole-game eval → advantage chart (underboard) +
  // accuracy summary (right rail) + move-list glyphs. If the game was already
  // analysed it loads straight from cache on open (a GET that never computes);
  // otherwise a request button triggers the engine pass.
  const underboardEl = document.createElement('div');
  const analysisSummaryEl = document.createElement('div');
  let chart: AdvantageChart | null = null;
  let currentPly = 0;
  let jumpTo: ((ply: number) => void) | null = null;
  let gameAnalysis: GameAnalysis | null = null;
  const moveAdvice = createMoveAdvice();
  void fetchCachedGameAnalysis(postgame.game.roomId)
    .then((cached) => (cached ? applyAnalysis(cached) : renderAnalysisRequest()))
    .catch(() => renderAnalysisRequest());

  function applyAnalysis(analysis: GameAnalysis): void {
    gameAnalysis = analysis;
    chart = createAdvantageChart(analysis.evals, { onJump: (ply) => jumpTo?.(ply) });
    chart.setPly(currentPly);
    underboardEl.replaceChildren(chart.el);
    analysisSummaryEl.replaceChildren(createAnalysisSummary(analysis));
    // Annotate the move list lichess tree-view style: the position eval after every
    // move (Red POV) + a judgment glyph (?!/?/??) on the mistakes.
    const evalByPly = new Map(analysis.evals.map((e) => [e.ply, e]));
    const annotations = new Map<number, MoveAnnotation>();
    for (const move of analysis.moves) {
      const glyph = judgmentGlyph(move.judgment);
      const e = evalByPly.get(move.ply);
      annotations.set(move.ply, {
        suffix: glyph?.suffix,
        suffixClass: glyph?.suffixClass,
        eval: e ? formatEval(e.cp, e.mate) : undefined,
      });
    }
    moveList.annotate(annotations);
    moveAdvice.update(currentPly, gameAnalysis);
    // The underboard grew; re-fit the board so it still fills without scroll.
    window.dispatchEvent(new Event('resize'));
  }

  function renderAnalysisRequest(): void {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'xiangqi-review__analyse';
    button.textContent = 'Request computer analysis';
    button.addEventListener('click', () => {
      button.disabled = true;
      button.textContent = 'Analysing the whole game…';
      requestGameAnalysis(postgame.game.roomId)
        .then(applyAnalysis)
        .catch(() => {
          button.disabled = false;
          button.textContent = 'Analysis failed — retry';
        });
    });
    underboardEl.replaceChildren(button);
  }

  root.replaceChildren(buildNav());
  mountReviewLayout(root, {
    pageClassName: 'xiangqi-review',
    ariaLabel: 'Xiangqi postgame',
    title: 'Xiangqi',
    summary: `${resultLabel(postgame.game.result)} by ${labelize(postgame.game.termination)} · ${postgame.game.plyCount} plies`,
    actions: postgameActions(postgame),
    details: detailsPanel(postgame),
    moves: moveList.el,
    enginePanel: enginePanel.el,
    moveComment: moveAdvice.el,
    underboard: underboardEl,
    analysisSummary: analysisSummaryEl,
    boards: [{ key: 'truth', el: boardWrap, tier: 'primary' }],
    boardAspect: 552 / 612,
    boardCols: 9,
    maxPly: postgameReplayMaxPly(postgame),
    renderBoards({ ply, flipped }) {
      currentPly = ply;
      const orientation: XiangqiColor = flipped ? 'black' : 'red';
      const opponent: XiangqiColor = orientation === 'red' ? 'black' : 'red';
      const view = postgameViewAtPly(postgame, 'truth', ply) ?? entry.view;
      board.innerHTML = renderXiangqiBoardSvg(view, orientation);
      evalBar.setFlipped(flipped);
      chart?.setPly(ply);
      moveAdvice.update(ply, gameAnalysis);
      // Captured pools: left (top) = near side's losses, right (bottom) = opponent's.
      const captured = xiangqiCaptured(view);
      flank.leftColumn.replaceChildren();
      flank.rightColumn.replaceChildren();
      fillCapturedPoolWith(flank.leftColumn, captured, orientation, renderCapturedXiangqiGlyph);
      fillCapturedPoolWith(flank.rightColumn, captured, opponent, renderCapturedXiangqiGlyph);
      // Re-evaluate on ply change only (not on flip, which keeps the position).
      if (ply !== lastEnginePly) {
        lastEnginePly = ply;
        enginePanel.setPosition(engineMovesUci.slice(0, ply));
      }
    },
    renderMoves({ ply }, jump) {
      jumpTo = jump;
      moveList.update(ply, jump);
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

// Flatten the timeline into the shared move-list entries (Red moves first in
// xiangqi; the ply is the position you land on by clicking the move). Falls back
// to array index when the wire entry omits ply, so the numbering stays robust.
function xiangqiMoveEntries(postgame: XiangqiPostgameResponse): MoveListEntry[] {
  return postgame.timeline
    .filter((entry) => entry.type === 'move-played' && entry.move)
    .map((entry, index) => ({
      ply: entry.ply ?? index + 1,
      label: `${entry.move!.from}-${entry.move!.to}`,
    }));
}

// Fairy-Stockfish xiangqi UCI back to our `from-to` notation for readable PV lines.
// FSF is 1-indexed like us, so this is a plain square split with a dash inserted.
function formatXiangqiEngineMove(uci: string): string {
  const squares = fsfUciToXiangqiSquares(uci);
  return squares ? `${squares.from}-${squares.to}` : uci;
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
