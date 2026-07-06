// Analysis board for standard Xiangqi fed by a bare MOVE LIST rather than a
// persisted room. This is the imported-game / study path: the same shared review
// shell (mountReviewLayout) the /game postgame rides, but the per-ply positions
// are reconstructed on the client from the moves (buildXiangqiReplayFromMoves)
// and the whole-game engine runs locally (ceval) — no server round-trip, so it
// works for a game that was never played on the platform.
//
// Wires the board + captures + on-board eval bar + local engine toggle + move
// list, plus an on-demand whole-game analysis: since there is no server room to
// analyze, a client-side ceval sweep evaluates every ply in the browser and
// feeds the SAME advantage chart / accuracy summary / move glyphs the /game
// postgame uses (computeGameAnalysis). The DRY-extract that unifies the shared
// board glue with xiangqi-postgame.ts is a planned follow-up.

import {
  createInitialXiangqiBoard,
  fsfUciToXiangqiSquares,
  type StandardXiangqiPlayerView,
  type XiangqiColor,
  type XiangqiGameStatus,
  type XiangqiMove,
  xiangqiMoveToFsfUci,
} from '@mistboard/game';
import './game-shell.css';
import './live-xiangqi.css';
import './dark-xiangqi-postgame.css';
import './xiangqi-postgame.css';
import { renderXiangqiBoardSvg } from './live-xiangqi.js';
import { type AdvantageChart, createAdvantageChart } from './review/advantage-chart.js';
import { createAnalysisSummary } from './review/analysis-summary.js';
import { capturedByDiff } from './review/captured-diff.js';
import { fillCapturedPoolWith } from './review/captured-pool.js';
import { createCeval } from './review/engine/ceval.js';
import { createEnginePanel } from './review/engine/engine-panel.js';
import { createEvalBar } from './review/engine/eval-bar.js';
import { formatEval } from './review/engine/eval-format.js';
import { createFlankCaptures } from './review/flank-captures.js';
import {
  computeGameAnalysis,
  type GameAnalysis,
  judgmentGlyph,
  type PlyEval,
} from './review/game-analysis.js';
import { createMoveList, type MoveAnnotation, type MoveListEntry } from './review/move-list.js';
import { mountReviewLayout } from './review/review-layout.js';
import {
  buildXiangqiReplayFromMoves,
  type XiangqiReplay,
  xiangqiReplayViewAtPly,
} from './review/xiangqi-review-model.js';
import { renderXiangqiPiece } from './xiangqi-pieces.js';

// Depth for the whole-game sweep. Shallower than the live panel's interactive
// search so N+1 sequential evaluations stay tolerable on a client (the server
// Pikafish path goes deeper; this is the roomless fallback).
const ANALYSIS_SWEEP_DEPTH = 12;

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

// Size capture tiles to ≈ one board cell and cap the flank row to the board
// width, keyed off the board's measured width (mirrors xiangqi-postgame.ts).
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

// Fairy-Stockfish xiangqi UCI back to our `from-to` notation for readable PV lines.
function formatXiangqiEngineMove(uci: string): string {
  const squares = fsfUciToXiangqiSquares(uci);
  return squares ? `${squares.from}-${squares.to}` : uci;
}

function statusSummary(status: XiangqiGameStatus, plyCount: number): string {
  const plies = `${plyCount} ${plyCount === 1 ? 'ply' : 'plies'}`;
  if (status.type === 'finished') {
    const outcome =
      status.winner === 'red' ? 'Red wins' : status.winner === 'black' ? 'Black wins' : 'Draw';
    return `${outcome} by ${status.reason} · ${plies}`;
  }
  return `Analysis · ${plies}`;
}

export interface XiangqiAnalysisOptions {
  /** Left-rail title (default "Xiangqi analysis"). */
  title?: string;
}

/** Mount the review board for an arbitrary standard-xiangqi move list. Illegal
 *  moves truncate the replay to the legal prefix and surface a notice rather
 *  than throwing. */
export function mountXiangqiAnalysis(
  root: HTMLElement,
  moves: XiangqiMove[],
  opts: XiangqiAnalysisOptions = {},
): void {
  const replay = buildXiangqiReplayFromMoves(moves);
  const boardWrap = document.createElement('section');
  boardWrap.className = 'dxq-postgame__board-wrap review-board-host';
  const board = document.createElement('div');
  board.className = 'dxq-postgame__board xiangqi-live-board';
  board.setAttribute('aria-label', 'Xiangqi board');
  const flank = createFlankCaptures(board);
  const evalBar = createEvalBar();
  boardWrap.append(flank.host, evalBar.el);
  evalBar.observe(board, flank.host, 'right');
  sizeCapturesToBoard(board, 9, flank);

  const moveList = createMoveList(moveEntries(replay), { title: 'Moves' });

  // Local engine: the legal prefix as Fairy-Stockfish xiangqi UCI (1-indexed,
  // = our square notation), sliced to the current ply.
  const engineMovesUci = replay.moves.map((move) => xiangqiMoveToFsfUci(move));
  const enginePanel = createEnginePanel({
    variant: 'xiangqi',
    formatPvMove: formatXiangqiEngineMove,
    evalBar,
  });
  let lastEnginePly = -1;

  // Whole-game analysis (client ceval sweep) → underboard advantage chart +
  // right-rail accuracy summary + move-list glyphs. Runs on demand.
  const underboardEl = document.createElement('div');
  const analysisSummaryEl = document.createElement('div');
  let chart: AdvantageChart | null = null;
  let currentPly = replay.maxPly;
  let jumpTo: ((ply: number) => void) | null = null;

  function applyAnalysis(analysis: GameAnalysis): void {
    chart = createAdvantageChart(analysis.evals, { onJump: (ply) => jumpTo?.(ply) });
    chart.setPly(currentPly);
    underboardEl.replaceChildren(chart.el);
    analysisSummaryEl.replaceChildren(createAnalysisSummary(analysis));
    const evalByPly = new Map(analysis.evals.map((entry) => [entry.ply, entry]));
    const annotations = new Map<number, MoveAnnotation>();
    for (const move of analysis.moves) {
      const glyph = judgmentGlyph(move.judgment);
      const entry = evalByPly.get(move.ply);
      annotations.set(move.ply, {
        suffix: glyph?.suffix,
        suffixClass: glyph?.suffixClass,
        eval: entry ? formatEval(entry.cp, entry.mate) : undefined,
      });
    }
    moveList.annotate(annotations);
    // The underboard grew; re-fit the board so it still fits without a scroll.
    window.dispatchEvent(new Event('resize'));
  }

  // Evaluate every ply cursor (0..N) in the browser and build the Red-POV eval
  // series computeGameAnalysis expects. ceval scores are side-to-move POV, so
  // they flip on black-to-move plies (ply 0 = start = red to move).
  async function runClientAnalysis(
    onProgress: (done: number, total: number) => void,
  ): Promise<GameAnalysis> {
    const handle = createCeval('xiangqi');
    const plies: PlyEval[] = [];
    try {
      for (let ply = 0; ply <= replay.maxPly; ply += 1) {
        const update = await handle.evaluate({
          movesUci: engineMovesUci.slice(0, ply),
          multiPv: 1,
          maxDepth: ANALYSIS_SWEEP_DEPTH,
        });
        const best = update.lines[0];
        const redToMove = ply % 2 === 0;
        const cp = best?.scoreCp ?? null;
        const mate = best?.mate ?? null;
        plies.push({
          ply,
          cp: cp === null ? null : redToMove ? cp : -cp,
          mate: mate === null ? null : redToMove ? mate : -mate,
          best: best?.pvUci[0] ?? null,
        });
        onProgress(ply, replay.maxPly);
      }
    } finally {
      handle.dispose();
    }
    return computeGameAnalysis({
      engineId: 'fairy-stockfish',
      depth: ANALYSIS_SWEEP_DEPTH,
      plies,
    });
  }

  function renderAnalysisRequest(): void {
    if (replay.maxPly < 1) return; // nothing to analyse
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'xiangqi-review__analyse';
    button.textContent = 'Analyse the whole game';
    button.addEventListener('click', () => {
      button.disabled = true;
      button.textContent = `Analysing… 0/${replay.maxPly}`;
      void runClientAnalysis((done, total) => {
        button.textContent = `Analysing… ${done}/${total}`;
      })
        .then(applyAnalysis)
        .catch(() => {
          button.disabled = false;
          button.textContent = 'Analysis failed — retry';
        });
    });
    underboardEl.replaceChildren(button);
  }
  renderAnalysisRequest();

  const finalStatus = xiangqiReplayViewAtPly(replay, replay.maxPly).status;

  root.replaceChildren();
  mountReviewLayout(root, {
    pageClassName: 'xiangqi-review',
    ariaLabel: 'Xiangqi analysis',
    title: opts.title ?? 'Xiangqi analysis',
    summary: statusSummary(finalStatus, replay.maxPly),
    actions: analysisActions(),
    details: replay.illegalAt ? illegalNotice(replay) : undefined,
    moves: moveList.el,
    enginePanel: enginePanel.el,
    underboard: underboardEl,
    analysisSummary: analysisSummaryEl,
    boards: [{ key: 'truth', el: boardWrap, tier: 'primary' }],
    boardAspect: 552 / 612,
    boardCols: 9,
    maxPly: replay.maxPly,
    renderBoards({ ply, flipped }) {
      currentPly = ply;
      const orientation: XiangqiColor = flipped ? 'black' : 'red';
      const opponent: XiangqiColor = orientation === 'red' ? 'black' : 'red';
      const view = xiangqiReplayViewAtPly(replay, ply);
      board.innerHTML = renderXiangqiBoardSvg(view, orientation);
      evalBar.setFlipped(flipped);
      chart?.setPly(ply);
      const captured = xiangqiCaptured(view);
      flank.leftColumn.replaceChildren();
      flank.rightColumn.replaceChildren();
      fillCapturedPoolWith(flank.leftColumn, captured, orientation, renderCapturedXiangqiGlyph);
      fillCapturedPoolWith(flank.rightColumn, captured, opponent, renderCapturedXiangqiGlyph);
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

function moveEntries(replay: XiangqiReplay): MoveListEntry[] {
  return replay.moves.map((move, index) => ({
    ply: index + 1,
    label: `${move.from}-${move.to}`,
  }));
}

function analysisActions(): HTMLElement {
  const actions = document.createElement('nav');
  actions.className = 'dxq-postgame__actions';
  actions.setAttribute('aria-label', 'Analysis links');
  const home = document.createElement('a');
  home.className = 'dxq-postgame__link';
  home.href = '/';
  home.textContent = 'Back home';
  actions.append(home);
  return actions;
}

function illegalNotice(replay: XiangqiReplay): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'dxq-postgame__panel';
  const heading = document.createElement('h2');
  heading.textContent = 'Truncated import';
  const body = document.createElement('p');
  const move = replay.illegalAt;
  body.textContent = move
    ? `Move ${move.ply} (${move.move.from}-${move.move.to}) is illegal from that position; showing the first ${replay.maxPly} legal ${replay.maxPly === 1 ? 'move' : 'moves'}.`
    : '';
  panel.append(heading, body);
  return panel;
}
