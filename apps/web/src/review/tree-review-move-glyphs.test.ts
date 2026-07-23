// The move-annotation glyph the move list shows after a move ('??', '?', '?!',
// and the user-authored NAGs) is also pinned to that move's DESTINATION point on
// the board, the way lila badges the destination square. These drive the whole
// path: serialized tree -> annotation map -> tone -> presentation marker -> SVG.
//
// User NAGs are the fixture here because they need no engine: the engine
// judgment path feeds the SAME map through the same tone function, so the wiring
// under test is identical (move-glyph.test.ts pins the tone mapping itself).
import { describe, expect, it } from 'vitest';
import type { SerializedTree } from './tree-serialize.js';
import { mountXiangqiReview } from './xiangqi-review.js';

// NAG codes (tree-review GLYPH_LABEL): 4 = '??', 1 = '!'.
const GLYPHED_TREE: SerializedTree = {
  version: 1,
  root: {
    children: [
      {
        uci: 'h3e3',
        annotations: { glyphs: [4] },
        children: [{ uci: 'h8e8', annotations: { glyphs: [1] }, children: [] }],
      },
    ],
  },
};

function mount(tree: SerializedTree): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  mountXiangqiReview(root, {
    ariaLabel: 'Study',
    title: 'Study',
    summary: '',
    moves: [],
    initialTree: tree,
    analysis: null,
  });
  return root;
}

function key(name: string): void {
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }),
  );
}

// Badges ride their own layer ABOVE the arrows, so an engine arrow landing on the
// annotated point cannot cover the verdict.
function markers(root: HTMLElement): string {
  return root.querySelector('.xq-live-glyphs')?.innerHTML ?? '';
}

describe('move-annotation glyphs on the review board', () => {
  it('badges the destination of the move that led to the current node', () => {
    const root = mount(GLYPHED_TREE);
    try {
      // Mount lands on the tip (h8e8, glyph '!'): the badge sits on e8, not h8.
      // Red perspective e8 -> (276, 156), badge offset +21 / -21.
      expect(markers(root)).toContain('cx="297" cy="135"');
      expect(markers(root)).toContain('>!</text>');
      expect(markers(root)).toContain('xq-marker--good');
      root.remove();
    } finally {
      root.remove();
    }
  });

  it('follows the cursor, showing exactly one badge at a time', () => {
    const root = mount(GLYPHED_TREE);
    try {
      key('ArrowLeft'); // back to h3e3 ('??')
      const html = markers(root);
      expect(html).toContain('>??</text>');
      expect(html).toContain('xq-marker--blunder');
      expect(html).not.toContain('>!</text>');
      expect(html.match(/xq-marker--glyph/g)).toHaveLength(1);
    } finally {
      root.remove();
    }
  });

  it('shows no badge at the root, which has no move to judge', () => {
    const root = mount(GLYPHED_TREE);
    try {
      key('Home');
      expect(markers(root)).not.toContain('xq-marker--glyph');
    } finally {
      root.remove();
    }
  });

  it('leaves unannotated moves unbadged', () => {
    const root = mount({
      version: 1,
      root: { children: [{ uci: 'h3e3', children: [] }] },
    });
    try {
      expect(markers(root)).not.toContain('xq-marker--glyph');
    } finally {
      root.remove();
    }
  });
});
