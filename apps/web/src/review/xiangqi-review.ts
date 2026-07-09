// Shared standard-xiangqi review surface: ONE tree-based implementation of the
// interactive board + eval gauge + captured material + local engine panel +
// branching move tree + whole-game analysis (advantage chart / accuracy summary /
// move glyphs / move advice), mounted on the shared review scaffold. This is the
// move-tree "P1" the linear DRY-extract left a seam for — both callers ride it:
//   - xiangqi-analysis.ts  — bare move list / empty start position (client views,
//     client ceval sweep). The lichess.org/analysis surface.
//   - xiangqi-postgame.ts  — a specific played/ingested game with a meta card
//     (server views, server Pikafish analysis). The lichess.org/{gameId} surface.
// The two callers differ only in ingress + metadata; the board, tree, engine, and
// analysis machinery is identical. The board is INTERACTIVE (play a move → it
// branches the tree, promote/delete variations).

import {
  createInitialXiangqiBoard,
  fsfUciToXiangqiSquares,
  type StandardXiangqiPlayerView,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiMove,
} from '@mistboard/game';
import { createXiangqiInteractiveBoard } from '../xiangqi-board.js';
import { renderXiangqiPiece } from '../xiangqi-pieces.js';
import { type AdvantageChart, createAdvantageChart } from './advantage-chart.js';
import { createAnalysisSummary } from './analysis-summary.js';
import { capturedByDiff } from './captured-diff.js';
import { fillCapturedPoolWith } from './captured-pool.js';
import { createEnginePanel } from './engine/engine-panel.js';
import { createEvalBar } from './engine/eval-bar.js';
import { formatEval } from './engine/eval-format.js';
import { type GameAnalysis, judgmentGlyph } from './game-analysis.js';
import {
  createGameTree,
  type GameTree,
  type GameTreeNode,
  ROOT_PATH,
  type TreePath,
} from './game-tree.js';
import { createMoveAdvice } from './move-advice.js';
import { createMoveTree, type MoveTree, type MoveTreeAnnotation, pathKey } from './move-tree.js';
import {
  createReviewNavBar,
  createReviewScaffold,
  installReviewKeyboard,
} from './review-layout.js';
import { xiangqiTreeAdapter } from './xiangqi-tree-adapter.js';

type XiangqiNode = GameTreeNode<XiangqiMove, XiangqiGameState>;
type XiangqiTree = GameTree<XiangqiMove, XiangqiGameState, StandardXiangqiPlayerView>;

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
  /** Info-card eyebrow when no meta card ('Analysis' / 'Game review'). */
  eyebrow?: string;
  title: string;
  summary: string;
  boardAriaLabel?: string;
  /** Play again / home / room / import actions row (left rail). */
  actions: HTMLElement;
  /** Left-rail details panel. Optional. */
  details?: HTMLElement;
  /** Lichess-style game meta card; replaces the plain title/summary card. */
  metaCard?: HTMLElement;
  /** Canonical moves in order. Any illegal-from-here move truncates the mainline to
   *  the legal prefix (a notice is surfaced). Empty = a fresh board at the start. */
  moves: XiangqiMove[];
  /** Whole-game analysis source; null disables the analysis affordance. */
  analysis: XiangqiAnalysisSource | null;
};

/** Keyboard listener is document-wide; on re-mount (import re-seeds) abort the
 *  previous one so handlers don't stack. */
let keyboardAbort: AbortController | null = null;

export function mountXiangqiReview(root: HTMLElement, config: XiangqiReviewConfig): void {
  const tree: XiangqiTree = createGameTree(xiangqiTreeAdapter, config.moves);
  const mainlineLen = tree.mainlinePath().length;

  let currentPath: TreePath = tree.last();
  let flipped = false;

  const currentNode = (): XiangqiNode => tree.nodeAt(currentPath) ?? tree.root;
  const currentView = (): StandardXiangqiPlayerView =>
    xiangqiTreeAdapter.project(currentNode().truth)[0]!.view;
  const orientation = (): XiangqiColor => (flipped ? 'black' : 'red');

  const uciTo = (node: XiangqiNode): string[] => {
    const line: string[] = [];
    for (let n: XiangqiNode | null = node; n?.parent; n = n.parent) {
      if (n.move) line.unshift(xiangqiTreeAdapter.toEngineUci(n.move));
    }
    return line;
  };

  // ── Board (interactive), gauge column, rail material rows ──
  const boardWrap = document.createElement('section');
  boardWrap.className = 'dxq-postgame__board-wrap review-board-host';
  const boardEl = document.createElement('div');
  boardEl.className = 'dxq-postgame__board xiangqi-live-board';
  boardEl.setAttribute('aria-label', config.boardAriaLabel ?? 'Elephant Chess board');
  boardWrap.append(boardEl);

  const materialTop = document.createElement('div');
  const materialBottom = document.createElement('div');
  const evalBar = createEvalBar();

  const interactive = createXiangqiInteractiveBoard({
    board: boardEl,
    getInteractionView: () => currentView(),
    getPerspective: orientation,
    // Review plays BOTH sides: the interactive seat is the side to move.
    seatFor: (view) => (view.status.type === 'playing' ? view.status.turn : null),
    enabled: () => true,
    onMove: (move) => {
      const next = tree.addMove(currentPath, move);
      if (!next) return;
      currentPath = next;
      moveTree.rebuild();
      render();
    },
  });

  // ── Engine (live, current node) ──
  const enginePanel = createEnginePanel({
    variant: 'xiangqi',
    formatPvMove: formatXiangqiEngineMove,
    evalBar,
  });

  // ── Move tree (right-click a move to promote/delete its branch) ──
  const isPrefix = (prefix: TreePath, of: TreePath): boolean =>
    of.length >= prefix.length && prefix.every((id, i) => of[i] === id);
  const moveTree: MoveTree = createMoveTree(tree, {
    title: 'Moves',
    onJump: (path) => go(path),
    onPromote: (path) => {
      tree.promoteToMainline(path);
      moveTree.rebuild();
      render();
    },
    onDelete: (path) => {
      if (isPrefix(path, currentPath)) currentPath = path.slice(0, -1);
      tree.deleteAt(path);
      moveTree.rebuild();
      render();
    },
  });

  // ── Navigation bar (tree-driven, scrubber-styled) ──
  const nav = createReviewNavBar({
    first: () => go(ROOT_PATH),
    previous: () => go(tree.stepBack(currentPath)),
    next: () => go(tree.stepForward(currentPath)),
    last: () => go(lineEnd(currentPath)),
    flip: () => flipBoard(),
  });

  // ── Whole-game analysis (mainline) → underboard chart + summary + glyphs ──
  const underboardBody = document.createElement('div');
  underboardBody.className = 'review-underboard-panel__body';
  const underboardEl = underboardPanel(underboardBody);
  const analysisSummaryEl = document.createElement('div');
  const moveAdvice = createMoveAdvice();
  let chart: AdvantageChart | null = null;
  let gameAnalysis: GameAnalysis | null = null;

  // The tree truncates an illegal seed to the legal prefix; surface a notice.
  const truncated = mainlineLen < config.moves.length;
  const details = config.details ?? (truncated ? truncationNotice(mainlineLen) : undefined);

  const scaffold = createReviewScaffold(root, {
    ariaLabel: config.ariaLabel,
    pageClassName: config.pageClassName,
    eyebrow: config.eyebrow ?? 'Analysis',
    title: config.title,
    summary: config.summary,
    actions: config.actions,
    details,
    metaCard: config.metaCard,
    boards: [{ key: 'truth', el: boardWrap, tier: 'primary' }],
    boardAspect: 552 / 612,
    boardCols: 9,
    underboard: config.analysis ? underboardEl : undefined,
    enginePanel: enginePanel.el,
    moves: moveTree.el,
    moveComment: moveAdvice.el,
    navigation: nav.el,
    analysisSummary: analysisSummaryEl,
    gauge: evalBar.el,
    materialTop,
    materialBottom,
    onPromote: () => render(),
  });

  function go(path: TreePath): void {
    currentPath = path;
    render();
  }
  function flipBoard(): void {
    flipped = !flipped;
    render();
  }
  function lineEnd(path: TreePath): TreePath {
    let p = path;
    for (;;) {
      const next = tree.stepForward(p);
      if (pathKey(next) === pathKey(p)) return p;
      p = next;
    }
  }
  function mainlineNodes(): XiangqiNode[] {
    const nodes: XiangqiNode[] = [tree.root];
    let n = tree.root;
    while (n.children[0]) {
      n = n.children[0];
      nodes.push(n);
    }
    return nodes;
  }

  function render(): void {
    const node = currentNode();
    const view = currentView();
    interactive.render(view, orientation());
    evalBar.setFlipped(flipped);

    const own = orientation();
    const opp: XiangqiColor = own === 'red' ? 'black' : 'red';
    const captured = xiangqiCaptured(view);
    materialTop.replaceChildren();
    materialBottom.replaceChildren();
    fillCapturedPoolWith(materialTop, captured, own, renderCapturedXiangqiGlyph);
    fillCapturedPoolWith(materialBottom, captured, opp, renderCapturedXiangqiGlyph);

    enginePanel.setPosition(uciTo(node));
    moveTree.setCurrent(currentPath);
    nav.setBounds({ atStart: currentPath.length === 0, atEnd: node.children.length === 0 });
    nav.status.textContent = `Ply ${node.ply}`;
    chart?.setPly(node.ply);
    moveAdvice.update(node.ply, gameAnalysis);
  }

  function applyAnalysis(analysis: GameAnalysis): void {
    gameAnalysis = analysis;
    const nodes = mainlineNodes();
    chart = createAdvantageChart(analysis.evals, {
      onJump: (ply) => {
        const target = nodes[ply];
        if (target) go(tree.pathTo(target));
      },
    });
    chart.setPly(currentNode().ply);
    underboardBody.replaceChildren(chart.el);
    analysisSummaryEl.replaceChildren(createAnalysisSummary(analysis));

    const evalByPly = new Map(analysis.evals.map((entry) => [entry.ply, entry]));
    const byPathKey = new Map<string, MoveTreeAnnotation>();
    for (const move of analysis.moves) {
      const node = nodes[move.ply];
      if (!node) continue;
      const glyph = judgmentGlyph(move.judgment);
      const entry = evalByPly.get(move.ply);
      byPathKey.set(pathKey(tree.pathTo(node)), {
        suffix: glyph?.suffix,
        suffixClass: glyph?.suffixClass,
        eval: entry ? formatEval(entry.cp, entry.mate) : undefined,
      });
    }
    moveTree.annotate(byPathKey); // rebuilds the tree DOM
    render(); // re-highlight + re-apply move advice
    scaffold.refit(); // the underboard grew; re-fit the board
  }

  function renderAnalysisRequest(source: XiangqiAnalysisSource): void {
    if (mainlineLen < 1) {
      underboardBody.replaceChildren();
      return;
    }
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

  render();
  scaffold.refit();
  keyboardAbort?.abort();
  keyboardAbort = new AbortController();
  installReviewKeyboard(
    {
      stepBack: () => go(tree.stepBack(currentPath)),
      stepForward: () => go(tree.stepForward(currentPath)),
      toStart: () => go(ROOT_PATH),
      toEnd: () => go(tree.mainlinePath()),
      flip: () => flipBoard(),
    },
    keyboardAbort.signal,
  );
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

function truncationNotice(legal: number): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'dxq-postgame__panel';
  const heading = document.createElement('h2');
  heading.textContent = 'Truncated import';
  const body = document.createElement('p');
  body.textContent = `Move ${legal + 1} is illegal from that position; showing the first ${legal} legal ${legal === 1 ? 'move' : 'moves'}.`;
  panel.append(heading, body);
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

// Fairy-Stockfish xiangqi UCI back to our `from-to` notation for readable PV
// lines. FSF is 1-indexed like us, so this is a plain square split.
function formatXiangqiEngineMove(uci: string): string {
  const squares = fsfUciToXiangqiSquares(uci);
  return squares ? `${squares.from}-${squares.to}` : uci;
}
