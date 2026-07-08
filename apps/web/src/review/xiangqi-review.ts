// Shared standard-xiangqi review surface: ONE implementation of the board +
// flank captures + eval gauge + local engine panel + move list + whole-game
// analysis (advantage chart / accuracy summary / move glyphs / move advice),
// mounted on the shared review layout. The two callers differ only in where
// positions and analysis come from:
//   - xiangqi-postgame.ts  — server room response (pre-computed per-ply views,
//     server Pikafish whole-game analysis, DB-cached).
//   - xiangqi-analysis.ts  — bare move list (client-reconstructed views,
//     client ceval sweep).
// This is the DRY-extract both file headers owed; the move tree (P1) builds on
// this seam.

import {
  createInitialXiangqiBoard,
  fsfUciToXiangqiSquares,
  type StandardXiangqiPlayerView,
  type XiangqiColor,
  type XiangqiMove,
  xiangqiMoveToFsfUci,
} from '@mistboard/game';
import { renderXiangqiBoardSvg } from '../live-xiangqi.js';
import { renderXiangqiPiece } from '../xiangqi-pieces.js';
import { type AdvantageChart, createAdvantageChart } from './advantage-chart.js';
import { createAnalysisSummary } from './analysis-summary.js';
import { capturedByDiff } from './captured-diff.js';
import { fillCapturedPoolWith } from './captured-pool.js';
import { createEnginePanel } from './engine/engine-panel.js';
import { createEvalBar } from './engine/eval-bar.js';
import { formatEval } from './engine/eval-format.js';
import { createFlankCaptures } from './flank-captures.js';
import { type GameAnalysis, judgmentGlyph } from './game-analysis.js';
import { createMoveAdvice } from './move-advice.js';
import { createMoveList, type MoveAnnotation, type MoveListEntry } from './move-list.js';
import { mountReviewLayout } from './review-layout.js';

// Standard Xiangqi's view carries no captured list, so derive it by diffing the
// opening against the current (fully open) board — public info, no hidden state.
const XIANGQI_INITIAL_PIECES = Object.values(createInitialXiangqiBoard()).filter(
  (piece): piece is NonNullable<typeof piece> => Boolean(piece),
);

export type XiangqiAnalysisSource = {
  /** Request-button label ('Request computer analysis' / 'Analyse the whole game'). */
  requestLabel: string;
  /** Cached result that never computes (server path). Optional. */
  fetchCached?(): Promise<GameAnalysis | null>;
  /** Compute the whole-game analysis; report progress when known. */
  run(onProgress: (done: number, total: number) => void): Promise<GameAnalysis>;
};

export type XiangqiReviewConfig = {
  pageClassName?: string;
  ariaLabel: string;
  title: string;
  summary: string;
  boardAriaLabel?: string;
  /** Play again / home / room actions row (left rail). */
  actions: HTMLElement;
  /** Left-rail details panel. Optional. */
  details?: HTMLElement;
  /** Canonical moves of the (legal prefix of the) game, in order. */
  moves: XiangqiMove[];
  maxPly: number;
  /** The truth view at a ply cursor (0 = start position). */
  viewAtPly(ply: number): StandardXiangqiPlayerView;
  /** Whole-game analysis source; null disables the analysis affordance. */
  analysis: XiangqiAnalysisSource | null;
};

export function mountXiangqiReview(root: HTMLElement, config: XiangqiReviewConfig): void {
  const boardWrap = document.createElement('section');
  boardWrap.className = 'dxq-postgame__board-wrap review-board-host';
  const board = document.createElement('div');
  board.className = 'dxq-postgame__board xiangqi-live-board';
  board.setAttribute('aria-label', config.boardAriaLabel ?? 'Elephant Chess board');
  // Captured material in columns beside the board (opponent top-left, near side
  // bottom-right) — the flank layout adds no vertical chrome.
  const flank = createFlankCaptures(board);
  boardWrap.append(flank.host);
  sizeCapturesToBoard(board, 9, flank);

  // Eval gauge: a first-class shell column beside the board (lichess's gauge
  // area) rather than an absolutely positioned overlay.
  const evalBar = createEvalBar();

  const moveList = createMoveList(moveEntries(config.moves), { title: 'Moves' });

  // Local engine: the game as Fairy-Stockfish xiangqi UCI (1-indexed, = our
  // square notation), sliced to the current ply. Standard xiangqi is an FSF
  // built-in.
  const engineMovesUci = config.moves.map((move) => xiangqiMoveToFsfUci(move));
  const enginePanel = createEnginePanel({
    variant: 'xiangqi',
    formatPvMove: formatXiangqiEngineMove,
    evalBar,
  });
  let lastEnginePly = -1;

  // Whole-game analysis → underboard advantage chart (in a tabbed panel) +
  // right-rail accuracy summary + move-list glyphs + move advice.
  const underboardBody = document.createElement('div');
  underboardBody.className = 'review-underboard-panel__body';
  const underboardEl = underboardPanel(underboardBody);
  const analysisSummaryEl = document.createElement('div');
  const moveAdvice = createMoveAdvice();
  let chart: AdvantageChart | null = null;
  let currentPly = config.maxPly;
  let jumpTo: ((ply: number) => void) | null = null;
  let gameAnalysis: GameAnalysis | null = null;

  function applyAnalysis(analysis: GameAnalysis): void {
    gameAnalysis = analysis;
    chart = createAdvantageChart(analysis.evals, { onJump: (ply) => jumpTo?.(ply) });
    chart.setPly(currentPly);
    underboardBody.replaceChildren(chart.el);
    analysisSummaryEl.replaceChildren(createAnalysisSummary(analysis));
    // Annotate the move list lichess tree-view style: the position eval after
    // every move (Red POV) + a judgment glyph (?!/?/??) on the mistakes.
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
    moveAdvice.update(currentPly, gameAnalysis);
    // The underboard grew; re-fit the board so it still fits without a scroll.
    window.dispatchEvent(new Event('resize'));
  }

  function renderAnalysisRequest(source: XiangqiAnalysisSource): void {
    if (config.maxPly < 1) return; // nothing to analyse
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'xiangqi-review__analyse';
    button.textContent = source.requestLabel;
    button.addEventListener('click', () => {
      button.disabled = true;
      button.textContent = 'Analysing the whole game…';
      source
        .run((done, total) => {
          button.textContent = `Analysing… ${done}/${total}`;
        })
        .then(applyAnalysis)
        .catch(() => {
          button.disabled = false;
          button.textContent = 'Analysis failed — retry';
        });
    });
    underboardBody.replaceChildren(button);
  }

  const analysisSource = config.analysis;
  if (analysisSource) {
    if (analysisSource.fetchCached) {
      void analysisSource
        .fetchCached()
        .then((cached) => (cached ? applyAnalysis(cached) : renderAnalysisRequest(analysisSource)))
        .catch(() => renderAnalysisRequest(analysisSource));
    } else {
      renderAnalysisRequest(analysisSource);
    }
  }

  mountReviewLayout(root, {
    pageClassName: config.pageClassName,
    ariaLabel: config.ariaLabel,
    title: config.title,
    summary: config.summary,
    actions: config.actions,
    details: config.details,
    moves: moveList.el,
    enginePanel: enginePanel.el,
    moveComment: moveAdvice.el,
    underboard: analysisSource ? underboardEl : undefined,
    analysisSummary: analysisSummaryEl,
    gauge: evalBar.el,
    boards: [{ key: 'truth', el: boardWrap, tier: 'primary' }],
    boardAspect: 552 / 612,
    boardCols: 9,
    maxPly: config.maxPly,
    renderBoards({ ply, flipped }) {
      currentPly = ply;
      const orientation: XiangqiColor = flipped ? 'black' : 'red';
      const opponent: XiangqiColor = orientation === 'red' ? 'black' : 'red';
      const view = config.viewAtPly(ply);
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

function underboardPanel(body: HTMLElement): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'review-underboard-panel';
  const tabs = document.createElement('div');
  tabs.className = 'review-underboard-tabs';
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'review-underboard-tab review-underboard-tab--active';
  tab.textContent = 'Computer analysis';
  tabs.append(tab);
  panel.append(tabs, body);
  return panel;
}

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
// width plus the column budget, keyed off the board's measured width. The cap
// stops the board's flex-grow from leaving slack that would push the capture
// columns away from the board. Re-runs on the layout's fit cadence + resize.
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

function moveEntries(moves: XiangqiMove[]): MoveListEntry[] {
  return moves.map((move, index) => ({
    ply: index + 1,
    label: `${move.from}-${move.to}`,
  }));
}

// Fairy-Stockfish xiangqi UCI back to our `from-to` notation for readable PV
// lines. FSF is 1-indexed like us, so this is a plain square split.
function formatXiangqiEngineMove(uci: string): string {
  const squares = fsfUciToXiangqiSquares(uci);
  return squares ? `${squares.from}-${squares.to}` : uci;
}
