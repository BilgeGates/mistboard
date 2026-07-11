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
  fsfUciToXiangqiSquares,
  type StandardXiangqiPlayerView,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiMove,
  type XiangqiSquare,
} from '@mistboard/game';
import {
  animateXiangqiBoardMove,
  createXiangqiInteractiveBoard,
  type XiangqiBoardArrow,
  type XiangqiBoardMarker,
} from '../xiangqi-board.js';
import { type AdvantageChart, createAdvantageChart } from './advantage-chart.js';
import { createAnalysisSummary } from './analysis-summary.js';
import { createAnnotationEditor } from './annotations-editor.js';
import type { CevalLine } from './engine/ceval.js';
import { bestMoveArrow, engineArrowsFromLines } from './engine/engine-arrows.js';
import { createEnginePanel } from './engine/engine-panel.js';
import { createEvalBar } from './engine/eval-bar.js';
import { formatEval } from './engine/eval-format.js';
import { type GameAnalysis, judgmentGlyph } from './game-analysis.js';
import {
  createGameTree,
  type GameTree,
  type GameTreeNode,
  type NodeShape,
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
import { deserializeTree, type SerializedTree, serializeTree } from './tree-serialize.js';
import { xiangqiTreeAdapter } from './xiangqi-tree-adapter.js';

type XiangqiNode = GameTreeNode<XiangqiMove, XiangqiGameState>;
type XiangqiTree = GameTree<XiangqiMove, XiangqiGameState, StandardXiangqiPlayerView>;

/** With the live engine off, a completed whole-game analysis still knows the
 *  best move at every mainline ply — draw it as a single arrow. Flip to false
 *  to keep arrows strictly live-engine. */
const SHOW_ANALYSIS_BEST_ARROW = true;

/** NAG code → move-list suffix for user-authored glyphs (annotations-editor set). */
const GLYPH_LABEL: Record<number, string> = { 1: '!', 2: '?', 3: '!!', 4: '??', 5: '!?', 6: '?!' };

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
  /** Optional left-rail actions row (analysis import/home, etc.). */
  actions?: HTMLElement;
  /** Left-rail details panel. Optional. */
  details?: HTMLElement;
  /** Lichess-style game meta card; replaces the plain title/summary card. */
  metaCard?: HTMLElement;
  /** Canonical moves in order. Any illegal-from-here move truncates the mainline to
   *  the legal prefix (a notice is surfaced). Empty = a fresh board at the start.
   *  Ignored when `initialTree` is set. */
  moves: XiangqiMove[];
  /** Load a persisted study tree (with its annotations + variations) instead of
   *  seeding from `moves`. When set, the tree is rebuilt from this blob by replay. */
  initialTree?: SerializedTree;
  /** Fired after any tree mutation (move, annotation, promote, delete). The study
   *  page uses it to autosave; the analysis/postgame pages ignore it. */
  onChange?: () => void;
  /** Whole-game analysis source; null disables the analysis affordance. */
  analysis: XiangqiAnalysisSource | null;
};

/** Handle returned by mountXiangqiReview: lets a caller snapshot the current tree
 *  (to persist it — "save as study", autosave). */
export interface XiangqiReviewHandle {
  serialize(): SerializedTree;
}

/** Keyboard listener is document-wide; on re-mount (import re-seeds) abort the
 *  previous one so handlers don't stack. */
let keyboardAbort: AbortController | null = null;

export function mountXiangqiReview(
  root: HTMLElement,
  config: XiangqiReviewConfig,
): XiangqiReviewHandle {
  const tree: XiangqiTree = config.initialTree
    ? (deserializeTree(xiangqiTreeAdapter, config.initialTree) as XiangqiTree)
    : createGameTree(xiangqiTreeAdapter, config.moves);
  const mainlineLen = tree.mainlinePath().length;
  const notifyChange = (): void => config.onChange?.();

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

  // ── Board (interactive) + gauge column. Captured-material rows are OFF on
  // the review surface for now: empty rows collapse and re-inflate on the first
  // capture, jarring the rail; they return with a lichess-style rework (#166).
  const boardWrap = document.createElement('section');
  boardWrap.className = 'dxq-postgame__board-wrap review-board-host';
  const boardEl = document.createElement('div');
  boardEl.className = 'dxq-postgame__board xiangqi-live-board';
  boardEl.setAttribute('aria-label', config.boardAriaLabel ?? 'Xiangqi board');
  boardWrap.append(boardEl);

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
      notifyChange();
    },
    // Right-drag draws an annotation shape on the CURRENT node (toggle: re-drawing
    // the same shape removes it). Green by default, red with a modifier held.
    onDrawShape: (orig, dest, { alt }) => {
      const brush = alt ? 'red' : 'green';
      const shape: NodeShape =
        !dest || dest === orig
          ? { kind: 'circle', brush, orig }
          : { kind: 'arrow', brush, orig, dest };
      const same = (s: NodeShape): boolean =>
        s.kind === shape.kind &&
        s.orig === shape.orig &&
        s.dest === shape.dest &&
        s.brush === shape.brush;
      const existing = currentNode().annotations?.shapes ?? [];
      const nextShapes = existing.some(same)
        ? existing.filter((s) => !same(s))
        : [...existing, shape];
      tree.annotateAt(currentPath, { shapes: nextShapes });
      paintOverlays();
      annotationEditor.setAnnotations(currentNode().annotations);
      notifyChange();
    },
  });

  // ── Engine (live, current node) ──
  // On-board PV arrows: live MultiPV lines win; with the engine off (or between
  // a ply change and the first fresh update) fall back to the whole-game
  // analysis' best move for the current mainline node; otherwise no arrows.
  // NOTE: declared before createEnginePanel — its constructor clears output,
  // which fires onLines(null) → paintOverlays() synchronously.
  let gameAnalysis: GameAnalysis | null = null;
  let engineLines: CevalLine[] | null = null;
  // Engine PV / analysis-best arrows for the current node (transient, derived).
  function engineArrows(): XiangqiBoardArrow[] {
    if (engineLines?.length) return engineArrowsFromLines(engineLines);
    if (SHOW_ANALYSIS_BEST_ARROW && gameAnalysis) {
      const node = currentNode();
      if (mainlineNodes()[node.ply] === node) {
        const best = gameAnalysis.evals.find((entry) => entry.ply === node.ply)?.best;
        return bestMoveArrow(best);
      }
    }
    return [];
  }
  const shapeToArrow = (s: NodeShape): XiangqiBoardArrow => ({
    from: s.orig as XiangqiSquare,
    to: (s.dest ?? s.orig) as XiangqiSquare,
    className: `xq-arrow--draw xq-shape--${s.brush}`,
  });
  const shapeToMarker = (s: NodeShape): XiangqiBoardMarker => ({
    square: s.orig as XiangqiSquare,
    kind: 'circle',
    className: `xq-shape--${s.brush}`,
  });
  // Paint BOTH the derived engine arrows and the node's user-drawn shapes. User
  // arrows layer over engine arrows; user circles ride the marker overlay.
  function paintOverlays(): void {
    const shapes = currentNode().annotations?.shapes ?? [];
    const userArrows = shapes.filter((s) => s.kind === 'arrow').map(shapeToArrow);
    interactive.setArrows([...engineArrows(), ...userArrows]);
    interactive.setMarkers(shapes.filter((s) => s.kind === 'circle').map(shapeToMarker));
  }

  const enginePanel = createEnginePanel({
    variant: 'xiangqi',
    formatPvMove: formatXiangqiEngineMove,
    evalBar,
    onLines: (lines) => {
      engineLines = lines?.length ? lines : null;
      paintOverlays();
    },
  });

  // ── Move tree (right-click a move to promote/delete its branch) ──
  const isPrefix = (prefix: TreePath, of: TreePath): boolean =>
    of.length >= prefix.length && prefix.every((id, i) => of[i] === id);
  const moveTree: MoveTree = createMoveTree(tree, {
    onJump: (path) => go(path),
    onPromote: (path) => {
      tree.promoteToMainline(path);
      moveTree.rebuild();
      render();
      notifyChange();
    },
    onDelete: (path) => {
      if (isPrefix(path, currentPath)) currentPath = path.slice(0, -1);
      tree.deleteAt(path);
      moveTree.rebuild();
      render();
      notifyChange();
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

  // ── Study annotation controls (glyph picker + comment editor) ──
  const annotationEditor = createAnnotationEditor({
    onGlyph: (code) => {
      tree.annotateAt(currentPath, { glyphs: code === null ? [] : [code] });
      refreshMoveTreeAnnotations();
      render();
      notifyChange();
    },
    onComment: (text) => {
      // Per-keystroke write; deliberately no render() — the move list carries no
      // comment marker in S1 and a re-render would drop the textarea caret.
      tree.annotateAt(currentPath, { comments: text.trim() ? [{ text }] : [] });
      notifyChange();
    },
    onClearShapes: () => {
      tree.annotateAt(currentPath, { shapes: [] });
      paintOverlays();
      annotationEditor.setAnnotations(currentNode().annotations);
      notifyChange();
    },
  });

  // The tree truncates an illegal seed to the legal prefix; surface a notice.
  const truncated = !config.initialTree && mainlineLen < config.moves.length;
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
    underboardOverflows: true,
    enginePanel: enginePanel.el,
    moves: moveTree.el,
    moveComment: moveAdvice.el,
    annotations: annotationEditor.el,
    navigation: nav.el,
    analysisSummary: analysisSummaryEl,
    gauge: evalBar.el,
    onPromote: () => render(),
  });

  function go(path: TreePath): void {
    const fromPath = currentPath;
    currentPath = path;
    render();
    animateStep(fromPath, path);
  }
  // Adjacent tree steps glide (pieceAnimation pref, no-op at duration 0):
  // stepping INTO a child animates that node's move; stepping back to the
  // parent reverse-animates it. Multi-ply jumps (first/last/tree clicks to a
  // distant node) render discretely. Moves the user plays on the board go
  // through onMove, not go(), so own input never double-animates.
  function animateStep(fromPath: TreePath, toPath: TreePath): void {
    if (toPath.length === fromPath.length + 1 && isPrefix(fromPath, toPath)) {
      const move = tree.nodeAt(toPath)?.move;
      if (move) animateXiangqiBoardMove(boardEl, move, orientation());
      return;
    }
    if (fromPath.length === toPath.length + 1 && isPrefix(toPath, fromPath)) {
      const move = tree.nodeAt(fromPath)?.move;
      if (move) animateXiangqiBoardMove(boardEl, move, orientation(), { reverse: true });
    }
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

    // Order matters: setPosition fires onLines(null) synchronously when the
    // engine is on (stale-arrow clear); the explicit paintOverlays below then
    // repaints for the new node (engine/analysis arrows + the node's user shapes),
    // covering the engine-off case where setPosition fires no onLines.
    enginePanel.setPosition(uciTo(node));
    paintOverlays();
    annotationEditor.setAnnotations(node.annotations);
    moveTree.setCurrent(currentPath);
    nav.setBounds({ atStart: currentPath.length === 0, atEnd: node.children.length === 0 });
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
    refreshMoveTreeAnnotations(); // rebuilds the tree DOM (engine glyphs + user glyphs)
    render(); // re-highlight + re-apply move advice
    scaffold.refit(); // the underboard grew; re-fit the board
  }

  // Build the move-list annotation map from BOTH the engine judgment (mainline, if
  // analysed) and the user's authored glyphs (whole tree). User glyphs win on any
  // node where both exist (R6 — the two glyph sources are kept distinct).
  function refreshMoveTreeAnnotations(): void {
    const byPathKey = new Map<string, MoveTreeAnnotation>();
    if (gameAnalysis) {
      const nodes = mainlineNodes();
      const evalByPly = new Map(gameAnalysis.evals.map((entry) => [entry.ply, entry]));
      for (const move of gameAnalysis.moves) {
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
    }
    applyUserGlyphs(tree.root, byPathKey);
    moveTree.annotate(byPathKey);
  }

  function applyUserGlyphs(node: XiangqiNode, map: Map<string, MoveTreeAnnotation>): void {
    const code = node.annotations?.glyphs?.[0];
    if (code !== undefined && node.parent) {
      const key = pathKey(tree.pathTo(node));
      const prev = map.get(key);
      map.set(key, { ...prev, suffix: GLYPH_LABEL[code] ?? prev?.suffix, suffixClass: undefined });
    }
    for (const child of node.children) applyUserGlyphs(child, map);
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

  // Paint any user glyphs carried by a loaded study tree into the move list (the
  // analysis/postgame paths seed no glyphs, so this is a harmless no-op there).
  refreshMoveTreeAnnotations();
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

  return { serialize: () => serializeTree(tree, xiangqiTreeAdapter) };
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

// Fairy-Stockfish xiangqi UCI back to our `from-to` notation for readable PV
// lines. FSF is 1-indexed like us, so this is a plain square split.
function formatXiangqiEngineMove(uci: string): string {
  const squares = fsfUciToXiangqiSquares(uci);
  return squares ? `${squares.from}-${squares.to}` : uci;
}
