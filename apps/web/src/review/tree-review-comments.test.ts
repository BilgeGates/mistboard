// Authored study comments must be visible to VIEWERS, not just in the owner's
// editor box: they render as inline move-tree comment rows, and the root
// comment renders as the intro row above move 1. (Before this, a public study's
// annotations were invisible to everyone but the owner.)
import { describe, expect, it } from 'vitest';
import type { SerializedTree } from './tree-serialize.js';
import { mountXiangqiReview } from './xiangqi-review.js';

const ANNOTATED_TREE: SerializedTree = {
  version: 1,
  root: {
    annotations: { comments: [{ text: 'The intro: a hand-set composition.' }] },
    children: [
      {
        uci: 'h3e3',
        annotations: { comments: [{ text: 'The cannon centralises.' }] },
        children: [{ uci: 'h8e8', children: [] }],
      },
      {
        uci: 'b3e3',
        annotations: { comments: [{ text: 'The other cannon is passive.' }] },
        children: [],
      },
    ],
  },
};

describe('viewer-visible study comments', () => {
  it('renders root and node comments as inline rows without annotationEditing', () => {
    const root = document.createElement('div');
    document.body.append(root);
    mountXiangqiReview(root, {
      ariaLabel: 'Study',
      title: 'Study',
      summary: '',
      moves: [],
      initialTree: ANNOTATED_TREE,
      analysis: null,
    });
    const rows = [...root.querySelectorAll('.move-tree__comment--user')];
    expect(rows.map((r) => r.textContent)).toEqual([
      'The intro: a hand-set composition.',
      'The cannon centralises.',
    ]);
    // A comment on a VARIATION node flows inline inside its line.
    const inline = root.querySelector('.move-tree__variation .move-tree__inline-comment--user');
    expect(inline?.textContent).toBe('The other cannon is passive.');
    // The intro is the first row in the list, above move 1.
    const first = root.querySelector('.review-move-list__rows')?.children[0];
    expect(first?.textContent).toBe('The intro: a hand-set composition.');
    root.remove();
  });
});
