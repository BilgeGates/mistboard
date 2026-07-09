// Interactive analysis board for standard Xiangqi — the lichess-shaped analysis
// tool. A move list seeds a GameTree (buildable from an imported game or empty
// for a fresh board); the board is INTERACTIVE (play a move → it branches the
// tree), navigation is path-based over the tree (mainline + variations), and a
// local Fairy-Stockfish ceval evaluates the current node live. No server room.
//
// It rides the SAME review scaffold (createReviewScaffold) the /game postgame
// pages use — identical shell, board-stage, and viewport-fill sizing — but with a
// path-based (tree) controller + nav bar instead of the linear scrubber. So the
// analysis board and the postgame page share one layout and size identically.
//
// An on-demand whole-game sweep evaluates the MAINLINE in the browser (client
// ceval) and feeds the same advantage chart / accuracy summary / move glyphs the
// /game postgame uses.

import {
  createInitialXiangqiBoard,
  fsfUciToXiangqiSquares,
  type StandardXiangqiPlayerView,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiGameStatus,
  type XiangqiMove,
} from '@mistboard/game';
import './game-shell.css';
import './live-xiangqi.css';
import './dark-xiangqi-postgame.css';
import './xiangqi-postgame.css';
import './xiangqi-analysis.css';
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
import {
  createGameTree,
  type GameTree,
  type GameTreeNode,
  ROOT_PATH,
  type TreePath,
} from './review/game-tree.js';
import {
  createMoveTree,
  type MoveTree,
  type MoveTreeAnnotation,
  pathKey,
} from './review/move-tree.js';
import {
  createReviewNavBar,
  createReviewScaffold,
  installReviewKeyboard,
} from './review/review-layout.js';
import { importXiangqiGame } from './review/xiangqi-import.js';
import { xiangqiTreeAdapter } from './review/xiangqi-tree-adapter.js';
import { buildNav } from './site-shell.js';
import { createXiangqiInteractiveBoard } from './xiangqi-board.js';
import { renderXiangqiPiece } from './xiangqi-pieces.js';

// Depth for the whole-game sweep. Shallower than the live panel's interactive
// search so N+1 sequential evaluations stay tolerable on a client.
const ANALYSIS_SWEEP_DEPTH = 12;

// The keyboard nav attaches a document listener; on re-mount (importing a game
// re-seeds the tree) abort the previous one so handlers don't stack.
let keyboardAbort: AbortController | null = null;

type XiangqiNode = GameTreeNode<XiangqiMove, XiangqiGameState>;
type XiangqiTree = GameTree<XiangqiMove, XiangqiGameState, StandardXiangqiPlayerView>;

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

// Size capture tiles to ≈ one board cell and cap the flank row to the board width,
// keyed off the board's measured width (mirrors xiangqi-postgame.ts).
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

/** Mount the interactive analysis board for a standard-xiangqi move list. Illegal
 *  seed moves truncate the mainline to the legal prefix and surface a notice. An
 *  empty move list opens a fresh board from the start position. */
export function mountXiangqiAnalysis(
  root: HTMLElement,
  moves: XiangqiMove[],
  opts: XiangqiAnalysisOptions = {},
): void {
  const tree: XiangqiTree = createGameTree(xiangqiTreeAdapter, moves);
  const seededMainlineLen = tree.mainlinePath().length;
  const truncated = seededMainlineLen < moves.length;

  // Start at the mainline tip (review an imported game) or the root (fresh board).
  let currentPath: TreePath = tree.last();
  let flipped = false;

  const currentNode = (): XiangqiNode => tree.nodeAt(currentPath) ?? tree.root;
  const currentView = (): StandardXiangqiPlayerView =>
    xiangqiTreeAdapter.project(currentNode().truth)[0]!.view;
  const orientation = (): XiangqiColor => (flipped ? 'black' : 'red');

  // Engine UCI move list from the root to a node (its branch line).
  const uciTo = (node: XiangqiNode): string[] => {
    const line: string[] = [];
    for (let n: XiangqiNode | null = node; n?.parent; n = n.parent) {
      if (n.move) line.unshift(xiangqiTreeAdapter.toEngineUci(n.move));
    }
    return line;
  };

  // ── Board + captures + eval bar (mirrors xiangqi-postgame.ts exactly, so the
  //    scaffold sizes it identically to the /game review board). ──
  const boardWrap = document.createElement('section');
  boardWrap.className = 'dxq-postgame__board-wrap review-board-host xqa-board-wrap';
  const boardEl = document.createElement('div');
  boardEl.className = 'dxq-postgame__board xiangqi-live-board';
  boardEl.setAttribute('aria-label', 'Elephant Chess board');
  const flank = createFlankCaptures(boardEl);
  const evalBar = createEvalBar();
  boardWrap.append(flank.host, evalBar.el);
  evalBar.observe(boardEl, flank.host, 'right');
  sizeCapturesToBoard(boardEl, 9, flank);

  const interactive = createXiangqiInteractiveBoard({
    board: boardEl,
    getInteractionView: () => currentView(),
    getPerspective: orientation,
    // Analysis plays BOTH sides: the interactive seat is the side to move.
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
      // If the cursor is inside the branch being removed, retreat to its parent.
      if (isPrefix(path, currentPath)) currentPath = path.slice(0, -1);
      tree.deleteAt(path);
      moveTree.rebuild();
      render();
    },
  });

  // ── Navigation bar (scrubber-styled, tree-driven) ──
  const nav = createReviewNavBar({
    first: () => go(ROOT_PATH),
    previous: () => go(tree.stepBack(currentPath)),
    next: () => go(tree.stepForward(currentPath)),
    last: () => go(lineEnd(currentPath)),
    flip: () => flipBoard(),
  });

  // ── Whole-game sweep (mainline) → underboard chart + summary + glyphs ──
  // Reserve underboard height (like the postgame's advantage chart) so the board
  // fills to a comparable size instead of ballooning to the full viewport height —
  // which would push the on-board eval bar into the right rail.
  const underboardEl = document.createElement('div');
  underboardEl.className = 'xqa-underboard';
  const analysisSummaryEl = document.createElement('div');
  let chart: AdvantageChart | null = null;

  const finalStatus = tree.nodeAt(tree.mainlinePath())?.truth.status ?? tree.root.truth.status;
  const summary =
    seededMainlineLen === 0
      ? 'Play a move, or import a game'
      : statusSummary(finalStatus, seededMainlineLen);
  const scaffold = createReviewScaffold({
    ariaLabel: 'Xiangqi analysis',
    pageClassName: 'xiangqi-review',
    eyebrow: 'Analysis',
    title: opts.title ?? 'Xiangqi analysis',
    summary,
    actions: analysisActions(() =>
      openImportDialog((imported) => {
        const encoded = imported.map((move) => `${move.from}${move.to}`).join(',');
        window.history.pushState({}, '', `${window.location.pathname}?moves=${encoded}`);
        mountXiangqiAnalysis(root, imported, opts);
      }),
    ),
    details: truncated ? truncationNotice(seededMainlineLen, moves.length) : undefined,
    boards: [{ key: 'truth', el: boardWrap, tier: 'primary' }],
    boardAspect: 552 / 612,
    boardCols: 9,
    underboard: underboardEl,
    enginePanel: enginePanel.el,
    moves: moveTree.el,
    navigation: nav.el,
    analysisSummary: analysisSummaryEl,
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

  // Walk to the end of the CURRENT line (follow the mainline child from here).
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

    const captured = xiangqiCaptured(view);
    const own = orientation();
    const opp: XiangqiColor = own === 'red' ? 'black' : 'red';
    flank.leftColumn.replaceChildren();
    flank.rightColumn.replaceChildren();
    fillCapturedPoolWith(flank.leftColumn, captured, own, renderCapturedXiangqiGlyph);
    fillCapturedPoolWith(flank.rightColumn, captured, opp, renderCapturedXiangqiGlyph);

    enginePanel.setPosition(uciTo(node));
    moveTree.setCurrent(currentPath);
    nav.setBounds({ atStart: currentPath.length === 0, atEnd: node.children.length === 0 });
    nav.status.textContent = `Ply ${node.ply}`;
    chart?.setPly(node.ply);
  }

  function applyAnalysis(analysis: GameAnalysis): void {
    const nodes = mainlineNodes();
    chart = createAdvantageChart(analysis.evals, {
      onJump: (ply) => {
        const target = nodes[ply];
        if (target) go(tree.pathTo(target));
      },
    });
    chart.setPly(currentNode().ply);
    underboardEl.replaceChildren(chart.el);
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
    render(); // re-highlight the current cell after the rebuild
    scaffold.refit(); // the underboard grew; re-fit so the board still fits
  }

  // Evaluate every mainline ply cursor (0..N) locally and build the Red-POV eval
  // series computeGameAnalysis expects (ceval scores are side-to-move POV).
  async function runMainlineAnalysis(
    onProgress: (done: number, total: number) => void,
  ): Promise<GameAnalysis> {
    const nodes = mainlineNodes();
    const maxPly = nodes.length - 1;
    const engineMovesUci = nodes.slice(1).map((n) => xiangqiTreeAdapter.toEngineUci(n.move!));
    const handle = createCeval('xiangqi');
    const plies: PlyEval[] = [];
    try {
      for (let ply = 0; ply <= maxPly; ply += 1) {
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
        onProgress(ply, maxPly);
      }
    } finally {
      handle.dispose();
    }
    return computeGameAnalysis({ engineId: 'fairy-stockfish', depth: ANALYSIS_SWEEP_DEPTH, plies });
  }

  function renderSweepButton(): void {
    if (tree.mainlinePath().length < 1) {
      underboardEl.replaceChildren();
      return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'xqa-analyse';
    button.textContent = 'Analyse the whole game';
    button.addEventListener('click', () => {
      const total = tree.mainlinePath().length;
      button.disabled = true;
      button.textContent = `Analysing… 0/${total}`;
      void runMainlineAnalysis((done, t) => {
        button.textContent = `Analysing… ${done}/${t}`;
      })
        .then(applyAnalysis)
        .catch(() => {
          button.disabled = false;
          button.textContent = 'Analysis failed — retry';
        });
    });
    underboardEl.replaceChildren(button);
  }

  root.replaceChildren(buildNav());
  root.append(scaffold.root);
  renderSweepButton();
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

function analysisActions(onImport: () => void): HTMLElement {
  const actions = document.createElement('nav');
  actions.className = 'dxq-postgame__actions';
  actions.setAttribute('aria-label', 'Analysis links');
  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.className = 'dxq-postgame__link';
  importBtn.textContent = 'Import game';
  importBtn.addEventListener('click', onImport);
  const home = document.createElement('a');
  home.className = 'dxq-postgame__link';
  home.href = '/';
  home.textContent = 'Back home';
  actions.append(importBtn, home);
  return actions;
}

// A modal paste box: Chinese / WXF / coordinate notation → a parsed move list.
// Replaces the old standalone paste page; the board now opens by default and this
// is the "load a game" affordance on it (lichess-shaped).
function openImportDialog(onMoves: (moves: XiangqiMove[]) => void): void {
  const dialog = document.createElement('dialog');
  dialog.className = 'xqa-import-dialog';
  const heading = document.createElement('h2');
  heading.textContent = 'Import a game';
  const blurb = document.createElement('p');
  blurb.className = 'xqa-import-dialog__blurb';
  blurb.textContent =
    'Paste a game in Chinese (炮二平五), WXF (C2.5 H2+3), or coordinate/UCI (b3e3) notation.';
  const textarea = document.createElement('textarea');
  textarea.className = 'xqa-import-dialog__input';
  textarea.rows = 6;
  textarea.spellcheck = false;
  textarea.placeholder = '炮二平五 炮8平5 马二进三';
  const error = document.createElement('p');
  error.className = 'xqa-import-dialog__error';
  error.setAttribute('role', 'alert');
  const row = document.createElement('div');
  row.className = 'xqa-import-dialog__actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'dxq-postgame__link';
  cancel.textContent = 'Cancel';
  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'dxq-postgame__link dxq-postgame__link--primary';
  submit.textContent = 'Import';

  const doImport = () => {
    const { moves, error: parseError } = importXiangqiGame(textarea.value);
    if (parseError || moves.length === 0) {
      error.textContent = parseError ?? 'Enter at least one move.';
      return;
    }
    dialog.close();
    onMoves(moves);
  };
  submit.addEventListener('click', doImport);
  cancel.addEventListener('click', () => dialog.close());
  // Cmd/Ctrl+Enter submits (a plain Enter stays a newline).
  textarea.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      doImport();
    }
  });

  row.append(cancel, submit);
  dialog.append(heading, blurb, textarea, error, row);
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  textarea.focus();
}

function truncationNotice(legal: number, attempted: number): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'dxq-postgame__panel';
  const heading = document.createElement('h2');
  heading.textContent = 'Truncated import';
  const body = document.createElement('p');
  body.textContent = `Move ${legal + 1} of ${attempted} is illegal from that position; showing the first ${legal} legal ${legal === 1 ? 'move' : 'moves'}.`;
  panel.append(heading, body);
  return panel;
}
