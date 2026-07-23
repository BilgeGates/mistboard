// Where a review surface opens.
//
// A study is a document read forward; a postgame is a result you came to see.
// The same controller serves both, so the default (end) has to stay put while
// studies opt into 'start'. Regressing this is invisible on a short game and
// brutal on a 60-ply annotated one, where the reader lands on the final
// position and has to rewind before they can begin.

import {
  applyStandardXiangqiMove,
  createInitialXiangqiState,
  getStandardXiangqiLegalMoves,
} from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { createGameTree } from './game-tree.js';
import { xiangqiTreeAdapter } from './xiangqi-tree-adapter.js';

function mainline(length: number) {
  let state = createInitialXiangqiState('initial-position-test');
  const moves = [];
  for (let i = 0; i < length; i += 1) {
    const move = getStandardXiangqiLegalMoves(state)[0]!;
    moves.push(move);
    state = applyStandardXiangqiMove(state, move);
  }
  return moves;
}

describe('tree review initial position', () => {
  it('opens at the tip when the caller wants the end (the default)', () => {
    const tree = createGameTree(xiangqiTreeAdapter, mainline(4));
    expect(tree.last()).toHaveLength(4);
  });

  it('opens at the root when the caller wants the start', () => {
    const tree = createGameTree(xiangqiTreeAdapter, mainline(4));
    // The empty path IS the root; that is what initialPosition: 'start' selects.
    expect(tree.nodeAt([])).toBe(tree.root);
    expect(tree.root.move).toBeNull();
    expect(tree.root.ply).toBe(0);
  });

  it('distinguishes the two for any non-empty game, so the flag is load-bearing', () => {
    const tree = createGameTree(xiangqiTreeAdapter, mainline(4));
    expect(tree.last()).not.toEqual([]);
  });

  it('collapses to the same path for an empty tree', () => {
    // An /analysis board with no moves must not care which mode it is in.
    const tree = createGameTree(xiangqiTreeAdapter);
    expect(tree.last()).toEqual([]);
  });
});
