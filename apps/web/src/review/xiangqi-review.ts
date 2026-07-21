// Standard-xiangqi review surface: the xiangqi presentation bundle over the
// generic tree-review controller (mountTreeReview, tree-review.ts). All the
// board/engine/tree/analysis machinery lives in the controller; this file only
// supplies the xiangqi-specific presentation seam. Both callers ride it:
//   - xiangqi-analysis.ts  — bare move list / empty start position (client views,
//     client ceval sweep). The lichess.org/analysis surface.
//   - xiangqi-postgame.ts  — a specific played/ingested game with a meta card
//     (server views, server Pikafish analysis). The lichess.org/{gameId} surface.
// The two callers differ only in ingress + metadata. The board is INTERACTIVE
// (play a move → it branches the tree, promote/delete variations).

import {
  fsfUciToXiangqiSquares,
  type StandardXiangqiPlayerView,
  standardXiangqiEngineFen,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiMove,
  type XiangqiPiece,
  type XiangqiPieceRole,
  type XiangqiSquare,
} from '@mistboard/game';
import { readStoredXiangqiBoardLayout, xiangqiAppearanceChangedEvent } from '../theme.js';
import {
  animateXiangqiBoardMove,
  createXiangqiInteractiveBoard,
  type XiangqiBoardArrow,
  type XiangqiBoardMarker,
  xiangqiPieceGhostSvg,
} from '../xiangqi-board.js';
import { xiangqiNotationChangedEvent } from '../xiangqi-notation.js';
import { capturedByDiff } from './captured-diff.js';
// The material rows reuse .review-capture-piece sizing from the captured-pool
// stylesheet, which otherwise only loads with captured-pool.ts.
import './captured-pool.css';
import { bestMoveArrow, engineArrowsFromLines } from './engine/engine-arrows.js';
import type { NodeShape } from './game-tree.js';
import {
  mountTreeReview,
  type TreePresentation,
  type TreeReviewConfig,
  type TreeReviewHandle,
} from './tree-review.js';
import { xiangqiGamePhases } from './xiangqi-phases.js';
import { xiangqiTreeAdapter } from './xiangqi-tree-adapter.js';

/** Whole-game analysis source (variant-neutral; re-exported for the callers). */
export type { AnalysisSource as XiangqiAnalysisSource } from './tree-review.js';

/** Config for a standard-xiangqi review mount. */
export type XiangqiReviewConfig = TreeReviewConfig<XiangqiMove, XiangqiGameState>;

/** Handle returned by mountXiangqiReview: snapshot the current tree to persist it. */
export type XiangqiReviewHandle = TreeReviewHandle;

const xiangqiPresentation: TreePresentation<
  XiangqiMove,
  XiangqiGameState,
  StandardXiangqiPlayerView,
  XiangqiColor,
  XiangqiBoardArrow,
  XiangqiBoardMarker
> = {
  adapter: xiangqiTreeAdapter,
  engine: {
    panelVariant: 'xiangqi',
    fen: standardXiangqiEngineFen,
    formatPvMove: formatXiangqiEngineMove,
    engineArrowsFromLines,
    bestMoveArrow,
  },
  boardHostClassName: 'dxq-postgame__board xiangqi-live-board',
  boardWrapClassName: 'dxq-postgame__board-wrap review-board-host',
  defaultBoardAriaLabel: 'Xiangqi board',
  boardAspect: () => (readStoredXiangqiBoardLayout() === 'cell' ? 540 / 612 : 552 / 612),
  boardCols: 9,
  // The xiangqi board renders pieces as inline SVG, so a piece-set change needs a
  // re-render (the chess board picks up its set via CSS and does not).
  appearanceEvent: xiangqiAppearanceChangedEvent,
  // Notation display-mode changes relabel the whole tree (labels cache at node
  // creation; see xiangqi-tree-adapter.moveLabel).
  labelsEvent: xiangqiNotationChangedEvent,
  perspective: (flipped) => (flipped ? 'black' : 'red'),
  // Review plays BOTH sides: the interactive seat is the side to move.
  seatFor: (view) => (view.status.type === 'playing' ? view.status.turn : null),
  createBoard: (opts) => createXiangqiInteractiveBoard(opts),
  animateMove: animateXiangqiBoardMove,
  shapeToArrow: (s: NodeShape): XiangqiBoardArrow => ({
    from: s.orig as XiangqiSquare,
    to: (s.dest ?? s.orig) as XiangqiSquare,
    className: `xq-arrow--draw xq-shape--${s.brush}`,
  }),
  shapeToMarker: (s: NodeShape): XiangqiBoardMarker => ({
    square: s.orig as XiangqiSquare,
    kind: 'circle',
    className: `xq-shape--${s.brush}`,
  }),
  // Opening/Middlegame/Endgame segmentation for the chart dividers + per-phase
  // accuracy (heuristic; see xiangqi-phases.ts).
  gamePhases: xiangqiGamePhases,
  // Right-rail material rows: lichess-style IMBALANCE (net pieces won + point
  // lead), not a full capture ledger — the common balanced case renders
  // nothing, and the rows reserve their footprint so first blood never
  // reflows the rail (see #166).
  material: ({ top, bottom }) => {
    top.classList.add('review-material-row--reserved');
    bottom.classList.add('review-material-row--reserved');
    return (truth, rootTruth, flipped) => {
      const imbalance = xiangqiMaterialImbalance(rootTruth, truth);
      const bottomSide: XiangqiColor = flipped ? 'black' : 'red';
      const topSide: XiangqiColor = flipped ? 'red' : 'black';
      renderXiangqiMaterialRow(top, imbalance, topSide);
      renderXiangqiMaterialRow(bottom, imbalance, bottomSide);
    };
  },
};

export function mountXiangqiReview(
  root: HTMLElement,
  config: XiangqiReviewConfig,
): XiangqiReviewHandle {
  return mountTreeReview(root, xiangqiPresentation, config);
}

// Fairy-Stockfish xiangqi UCI back to our `from-to` notation for readable PV
// lines. FSF is 1-indexed like us, so this is a plain square split.
function formatXiangqiEngineMove(uci: string): string {
  const squares = fsfUciToXiangqiSquares(uci);
  return squares ? `${squares.from}-${squares.to}` : uci;
}

// ── Material imbalance (right-rail mat rows) ────────────────────────────────

// Conventional display values (chariot 9, cannon 5, horse 4, guards 2, pawn 1).
// Only drives the "+N" lead hint, nothing rules-facing.
const XIANGQI_PIECE_POINTS: Record<XiangqiPieceRole, number> = {
  general: 0,
  chariot: 9,
  cannon: 5,
  horse: 4,
  elephant: 2,
  advisor: 2,
  soldier: 1,
};

const MATERIAL_ROLE_ORDER: XiangqiPieceRole[] = [
  'chariot',
  'cannon',
  'horse',
  'elephant',
  'advisor',
  'soldier',
];

type XiangqiMaterialImbalance = {
  /** Net enemy pieces held per side, heaviest role first. */
  net: Record<XiangqiColor, { role: XiangqiPieceRole; count: number }[]>;
  /** Point lead per side (leader positive, the other side <= 0). */
  points: Record<XiangqiColor, number>;
};

function boardPieces(state: XiangqiGameState): XiangqiPiece[] {
  return Object.values(state.board).filter((piece): piece is XiangqiPiece => Boolean(piece));
}

function xiangqiMaterialImbalance(
  rootTruth: XiangqiGameState,
  truth: XiangqiGameState,
): XiangqiMaterialImbalance {
  const captured = capturedByDiff(boardPieces(rootTruth), boardPieces(truth));
  const lost: Record<XiangqiColor, Map<XiangqiPieceRole, number>> = {
    red: new Map(),
    black: new Map(),
  };
  for (const entry of captured) {
    lost[entry.owner].set(entry.role, (lost[entry.owner].get(entry.role) ?? 0) + 1);
  }
  const netFor = (side: XiangqiColor) => {
    const enemy: XiangqiColor = side === 'red' ? 'black' : 'red';
    const out: { role: XiangqiPieceRole; count: number }[] = [];
    for (const role of MATERIAL_ROLE_ORDER) {
      const count = (lost[enemy].get(role) ?? 0) - (lost[side].get(role) ?? 0);
      if (count > 0) out.push({ role, count });
    }
    return out;
  };
  const redPoints = MATERIAL_ROLE_ORDER.reduce(
    (sum, role) =>
      sum + XIANGQI_PIECE_POINTS[role] * ((lost.black.get(role) ?? 0) - (lost.red.get(role) ?? 0)),
    0,
  );
  return {
    net: { red: netFor('red'), black: netFor('black') },
    points: { red: redPoints, black: -redPoints },
  };
}

function renderXiangqiMaterialRow(
  host: HTMLElement,
  imbalance: XiangqiMaterialImbalance,
  side: XiangqiColor,
): void {
  host.replaceChildren();
  const enemy: XiangqiColor = side === 'red' ? 'black' : 'red';
  for (const { role, count } of imbalance.net[side]) {
    for (let i = 0; i < count; i += 1) {
      const span = document.createElement('span');
      span.className = 'review-capture-piece';
      span.setAttribute('aria-label', `${enemy} ${role} won`);
      span.innerHTML = xiangqiPieceGhostSvg({ color: enemy, role });
      host.append(span);
    }
  }
  if (imbalance.points[side] > 0) {
    const lead = document.createElement('span');
    lead.className = 'review-material-points';
    lead.textContent = `+${imbalance.points[side]}`;
    host.append(lead);
  }
}
