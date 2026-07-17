// Tree-aware move list for the analysis board (variations, not just a mainline).
// The MAINLINE renders as the same clean numbered two-column rows as the shared
// createMoveList (number · red · black), so it reads identically to the /game
// review page. VARIATIONS break out as indented, dimmed full-width rows inserted
// right after the move they diverge from (lila tree-view style), with nested
// variations parenthesised inline. Every move is a button that jumps to its
// node's path; the current node is highlighted and scrolled into view.
//
// This is the branching counterpart to the linear createMoveList — the postgame
// pages keep the linear one until the shell spine migrates to paths; the analysis
// board uses this. Both share the review-move-list CSS vocabulary.

import type { GameTree, GameTreeNode, TreePath } from './game-tree.js';
import './move-list.css';
import './move-tree.css';

export interface MoveTreeAnnotation {
  /** Judgment glyph after the move, e.g. '?!', '?', '??'. */
  suffix?: string;
  /** Colour hook, e.g. 'blunder' → .review-move--blunder. */
  suffixClass?: string;
  /** Formatted eval after the move (fixed POV), e.g. '+2.1', '#3'. */
  eval?: string;
  /** Luck readout for a chance (reveal) move, e.g. '🎲 -11%'. Shown inline next to the move. */
  luck?: string;
  /** Tone hook for the luck badge → .review-move-list__luck--<tone>. */
  luckTone?: 'lucky' | 'unlucky' | 'even';
  /** Full-width advice row under the move (lichess "Blunder. h3-e3 was best."),
   *  rendered before the move's variation lines. Mainline only. */
  comment?: string;
  /** Colour hook for the comment row → .move-tree__comment--<class>. */
  commentClass?: string;
}

export interface MoveTree {
  el: HTMLElement;
  /** Rebuild the DOM from the current tree shape (call after a move is added or a
   *  branch is promoted/deleted). */
  rebuild(): void;
  /** Highlight the cell at `path` and scroll it into view. */
  setCurrent(path: TreePath): void;
  /** Apply per-node glyphs/evals, keyed by path string (see pathKey). */
  annotate(byPathKey: Map<string, MoveTreeAnnotation>): void;
}

export interface MoveTreeOptions {
  title?: string;
  onJump(path: TreePath): void;
  /** Right-click "Promote to mainline" on a move. Absent = no promote item. */
  onPromote?(path: TreePath): void;
  /** Right-click "Delete from here" on a move. Absent = no delete item. */
  onDelete?(path: TreePath): void;
  /** Game result block appended after the last move (lichess: a "0-1" score over
   *  the termination line, scrolling with the list). Absent on the analysis board. */
  result?: { score: string; label: string };
}

type MenuItem = { label: string; onClick: () => void };

// A small context menu at the cursor (move right-click → promote/delete). Closes
// on outside-click or Escape.
function openMoveMenu(x: number, y: number, items: MenuItem[]): void {
  document.querySelector('.move-tree__menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'move-tree__menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'move-tree__menu-item';
    button.textContent = item.label;
    button.addEventListener('click', () => {
      item.onClick();
      close();
    });
    menu.append(button);
  }
  const close = (): void => {
    menu.remove();
    document.removeEventListener('mousedown', onOutside);
    document.removeEventListener('keydown', onKey);
  };
  const onOutside = (event: MouseEvent): void => {
    if (!menu.contains(event.target as Node)) close();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') close();
  };
  document.body.append(menu);
  setTimeout(() => {
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
  }, 0);
}

/** Stable string key for a path (for annotation maps + current-cell lookup). */
export function pathKey(path: TreePath): string {
  return path.join('/');
}

export function createMoveTree<M, T, V>(tree: GameTree<M, T, V>, opts: MoveTreeOptions): MoveTree {
  const pathOf = (node: GameTreeNode<M, T>): TreePath => tree.pathTo(node);

  const panel = document.createElement('section');
  panel.className = 'review-move-list move-tree';
  if (opts.title) {
    const heading = document.createElement('h2');
    heading.className = 'review-move-list__title';
    heading.textContent = opts.title;
    panel.append(heading);
  }
  const rows = document.createElement('ol');
  rows.className = 'review-move-list__rows';
  panel.append(rows);

  // path key → its move cell, rebuilt each render.
  let cells = new Map<string, HTMLButtonElement>();
  let annotations = new Map<string, MoveTreeAnnotation>();

  const isRed = (ply: number): boolean => ply % 2 === 1;

  function numberSpan(text: string): HTMLElement {
    const num = document.createElement('span');
    num.className = 'review-move-list__number';
    num.textContent = text;
    return num;
  }

  function emptyCell(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'review-move-list__move review-move-list__move--empty';
    return span;
  }

  function moveCell(node: GameTreeNode<M, T>): HTMLButtonElement {
    const key = pathKey(pathOf(node));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'review-move-list__move move-tree__move';
    const san = document.createElement('span');
    san.className = 'review-move-list__san';
    san.textContent = node.label;
    // The judgment glyph is its OWN slot, NOT appended inside `san`: san truncates with an
    // ellipsis when the row is tight (e.g. a jieqi reveal that also carries a luck badge), and a
    // glyph inside san would be clipped away with the label. A dedicated non-shrinking slot keeps
    // the glyph visible right after the move.
    const suffixEl = document.createElement('span');
    suffixEl.className = 'review-move-list__suffix';
    const luckEl = document.createElement('span');
    luckEl.className = 'review-move-list__luck';
    const evalEl = document.createElement('span');
    evalEl.className = 'review-move-list__eval';
    button.append(san, suffixEl, luckEl, evalEl);
    const ann = annotations.get(key);
    if (ann?.suffix) {
      suffixEl.textContent = ann.suffix;
      if (ann.suffixClass) suffixEl.classList.add(`review-move--${ann.suffixClass}`);
    }
    // Inline luck badge for a reveal (chance) move — the reveal's variance, shown but never graded.
    if (ann?.luck) {
      luckEl.textContent = ann.luck;
      if (ann.luckTone) luckEl.classList.add(`review-move-list__luck--${ann.luckTone}`);
    }
    // Every move carries its eval, reveals included: the three slots read orthogonally — glyph =
    // decision quality, luck badge = the reveal's variance, eval = the objective value of the
    // position that actually resulted. Being luck-mixed is what makes a reveal's eval right; it is
    // the position you got, not a counterfactual. (Keying this off luck-badge presence instead made
    // eval visibility track auth state, since the decomposition only runs for signed-in viewers.)
    if (ann?.eval) evalEl.textContent = ann.eval;
    button.addEventListener('click', () => opts.onJump(pathOf(node)));
    if (opts.onPromote || opts.onDelete) {
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        const path = pathOf(node);
        const items: MenuItem[] = [];
        if (opts.onPromote) {
          items.push({ label: 'Promote to mainline', onClick: () => opts.onPromote?.(path) });
        }
        if (opts.onDelete) {
          items.push({ label: 'Delete from here', onClick: () => opts.onDelete?.(path) });
        }
        openMoveMenu(event.clientX, event.clientY, items);
      });
    }
    cells.set(key, button);
    return button;
  }

  // Render the mainline as number · red · black rows. A ply's VARIATIONS are its
  // siblings (alternatives to that same move): parent.children[1..] are the
  // alternatives to parent.children[0]. They render as indented breakout lines
  // right after the move they replace, and that move CLOSES its row so the reply
  // resumes on a fresh line — so a two-ply row splits whenever a variation attaches
  // to either ply (lila style), keeping it unambiguous which ply a variation is on.
  // Passing the ROOT (not the first move) folds the alternative first moves in at
  // move 1 instead of dumping them after the whole mainline.
  function renderMainline(root: GameTreeNode<M, T>): void {
    let node: GameTreeNode<M, T> | null = root.children[0] ?? null;
    let row: HTMLElement | null = null;
    while (node) {
      const parent = node.parent;
      // Alternatives to `node` itself (its later siblings under the same parent).
      const variations = parent ? parent.children.slice(1) : [];
      if (isRed(node.ply)) {
        row = document.createElement('li');
        row.className = 'review-move-list__row';
        // number · red · (black placeholder, replaced when the reply lands)
        row.append(numberSpan(`${(node.ply + 1) / 2}`), moveCell(node), emptyCell());
        rows.append(row);
      } else if (row) {
        row.replaceChild(moveCell(node), row.lastChild as Node);
      } else {
        // A black move with no open row (its red partner ended a variation-split
        // line): start a row with an empty red column and a "N…" number.
        row = document.createElement('li');
        row.className = 'review-move-list__row';
        row.append(numberSpan(`${node.ply / 2}…`), emptyCell(), moveCell(node));
        rows.append(row);
      }
      const comment = annotations.get(pathKey(pathOf(node)))?.comment;
      if (comment || variations.length > 0) {
        // This ply has an advice comment and/or alternatives: emit them right here
        // (comment first, lichess order), then break the line so the reply starts
        // on a fresh row (and a black move resumes as "N…").
        if (comment) rows.append(commentRow(node));
        for (const variation of variations) rows.append(variationRow(variation));
        row = null;
      } else if (!isRed(node.ply)) {
        // A completed black move with no variation ends the two-ply row.
        row = null;
      }
      node = node.children[0] ?? null;
    }
  }

  // A judged move's advice row ("Blunder. h3-e3 was best."), full-width under the
  // move it grades, ahead of the refutation variation (lichess order).
  function commentRow(node: GameTreeNode<M, T>): HTMLElement {
    const ann = annotations.get(pathKey(pathOf(node)));
    const li = document.createElement('li');
    li.className = `move-tree__comment${ann?.commentClass ? ` move-tree__comment--${ann.commentClass}` : ''}`;
    li.textContent = ann?.comment ?? '';
    return li;
  }

  // A variation: a full-width indented row flowing its moves inline, with any
  // nested variations parenthesised.
  function variationRow(firstNode: GameTreeNode<M, T>): HTMLElement {
    const li = document.createElement('li');
    li.className = 'move-tree__variation';
    renderInline(firstNode, li, true);
    return li;
  }

  function renderInline(
    firstNode: GameTreeNode<M, T>,
    container: HTMLElement,
    lineStart: boolean,
  ): void {
    let node: GameTreeNode<M, T> | null = firstNode;
    let start = lineStart;
    while (node) {
      if (isRed(node.ply)) {
        container.append(inlineNumber(`${(node.ply + 1) / 2}.`));
      } else if (start) {
        container.append(inlineNumber(`${node.ply / 2}…`));
      }
      container.append(moveCell(node));
      start = false;
      for (let i = 1; i < node.children.length; i++) {
        const sub = document.createElement('span');
        sub.className = 'move-tree__subvar';
        sub.append('(');
        renderInline(node.children[i]!, sub, true);
        sub.append(')');
        container.append(sub);
      }
      node = node.children[0] ?? null;
    }
  }

  function inlineNumber(text: string): HTMLElement {
    const span = document.createElement('span');
    span.className = 'move-tree__num';
    span.textContent = text;
    return span;
  }

  function rebuild(): void {
    cells = new Map();
    rows.replaceChildren();
    const main = tree.root.children[0];
    if (!main) {
      const empty = document.createElement('li');
      empty.className = 'review-move-list__empty';
      empty.textContent = 'No moves';
      rows.append(empty);
      return;
    }
    // Pass the root so alternative first moves interleave at move 1 (renderMainline
    // treats them as variations of move 1) rather than dumping at the very bottom.
    renderMainline(tree.root);
    // Terminal result block (lichess): the score over the termination line, part
    // of the scrollable list rather than a separate card.
    if (opts.result) {
      const li = document.createElement('li');
      li.className = 'move-tree__result';
      const score = document.createElement('div');
      score.className = 'move-tree__result-score';
      score.textContent = opts.result.score;
      const label = document.createElement('div');
      label.className = 'move-tree__result-label';
      label.textContent = opts.result.label;
      li.append(score, label);
      rows.append(li);
    }
  }

  function setCurrent(path: TreePath): void {
    const key = pathKey(path);
    let current: HTMLButtonElement | undefined;
    for (const [cellKey, cell] of cells) {
      const isCurrent = cellKey === key;
      cell.classList.toggle('review-move-list__move--current', isCurrent);
      if (isCurrent) current = cell;
    }
    current?.scrollIntoView({ block: 'nearest' });
  }

  function annotate(byPathKey: Map<string, MoveTreeAnnotation>): void {
    annotations = byPathKey;
    rebuild();
  }

  rebuild();
  return { el: panel, rebuild, setCurrent, annotate };
}
