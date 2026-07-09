// DOM coverage for the branching move-tree renderer: mainline cells, an inlined
// variation, current-node highlight, and the jump callback. Uses the real
// xiangqi adapter so the tree is built from a legal game.

import {
  applyStandardXiangqiMove,
  createInitialXiangqiState,
  getStandardXiangqiLegalMoves,
} from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { createGameTree, ROOT_PATH, type TreePath } from './game-tree.js';
import { createMoveTree, pathKey } from './move-tree.js';
import { xiangqiTreeAdapter } from './xiangqi-tree-adapter.js';

function seededTree() {
  const s0 = createInitialXiangqiState('fixture');
  const first = getStandardXiangqiLegalMoves(s0);
  const m1 = first[0]!;
  const altFirst = first[1]!;
  const s1 = applyStandardXiangqiMove(s0, m1);
  const m2 = getStandardXiangqiLegalMoves(s1)[0]!;
  const tree = createGameTree(xiangqiTreeAdapter, [m1, m2]);
  // Add an alternative first move → a variation off the root.
  tree.addMove(ROOT_PATH, altFirst);
  return { tree, m1, m2, altFirst };
}

describe('createMoveTree', () => {
  it('renders mainline cells and an inlined variation', () => {
    const { tree, m1, m2, altFirst } = seededTree();
    const moveTree = createMoveTree(tree, { onJump: () => {} });
    const text = moveTree.el.textContent ?? '';
    expect(text).toContain(`${m1.from}-${m1.to}`);
    expect(text).toContain(`${m2.from}-${m2.to}`);
    // The alternative first move renders as a variation block, in parentheses.
    expect(moveTree.el.querySelector('.move-tree__variation')).not.toBeNull();
    expect(text).toContain(`${altFirst.from}-${altFirst.to}`);
  });

  it('highlights the current node and fires onJump with its path', () => {
    const { tree, m1 } = seededTree();
    let jumped: TreePath | null = null;
    const moveTree = createMoveTree(tree, { onJump: (path) => (jumped = path) });

    const firstMovePath: TreePath = [tree.root.children[0]!.id];
    moveTree.setCurrent(firstMovePath);
    const current = moveTree.el.querySelector('.review-move-list__move--current');
    expect(current?.textContent).toContain(`${m1.from}-${m1.to}`);

    (current as HTMLButtonElement).click();
    expect(jumped).not.toBeNull();
    expect(pathKey(jumped!)).toBe(pathKey(firstMovePath));
  });

  it('offers promote/delete on a right-clicked move', () => {
    const { tree, altFirst } = seededTree();
    let promoted: TreePath | null = null;
    const moveTree = createMoveTree(tree, {
      onJump: () => {},
      onPromote: (path) => (promoted = path),
      onDelete: () => {},
    });
    const label = `${altFirst.from}-${altFirst.to}`;
    const cell = [...moveTree.el.querySelectorAll('.review-move-list__move')].find((c) =>
      c.textContent?.includes(label),
    );
    cell?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    const menu = document.querySelector('.move-tree__menu');
    expect(menu).not.toBeNull();
    const promote = [...menu!.querySelectorAll('button')].find(
      (b) => b.textContent === 'Promote to mainline',
    );
    promote?.click();
    expect(promoted).not.toBeNull();
    expect(pathKey(promoted!)).toBe(pathKey(tree.pathTo(tree.root.children[1]!)));
    document.querySelector('.move-tree__menu')?.remove();
  });

  it('shows an empty state for a bare tree', () => {
    const tree = createGameTree(xiangqiTreeAdapter);
    const moveTree = createMoveTree(tree, { onJump: () => {} });
    expect(moveTree.el.querySelector('.review-move-list__empty')).not.toBeNull();
  });
});
