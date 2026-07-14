import {
  applyJieqiMove,
  createInitialJieqiState,
  getJieqiLegalMoves,
  type JieqiMove,
  STANDARD_JIEQI_DEAL,
} from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { computeGameAnalysis } from './game-analysis.js';
import { mountJieqiReview } from './jieqi-review.js';
import type { DecisionOverlay } from './tree-review.js';

// End-to-end wiring test (jsdom): mount the jieqi review with a fake analysis + decision overlay
// and assert the three visual outputs the decomposition adds — the reveal glyph on the move list,
// the two-number summary block, and the per-move luck readout in the advice line.

function firstMoves(count: number): JieqiMove[] {
  let state = createInitialJieqiState('t', STANDARD_JIEQI_DEAL);
  const moves: JieqiMove[] = [];
  for (let i = 0; i < count; i += 1) {
    const move = getJieqiLegalMoves(state)[0]!;
    moves.push(move);
    state = applyJieqiMove(state, move);
  }
  return moves;
}

// A basic analysis whose reveal plies carry no eval-swing judgment (they are chance moves).
function fakeAnalysis(plyCount: number) {
  const plies = Array.from({ length: plyCount + 1 }, (_, ply) => ({
    ply,
    cp: 0,
    mate: null,
    best: null,
  }));
  // Mark ply 1 as a chance (reveal) ply so its basic judgment is null — the decision overlay owns it.
  return computeGameAnalysis({ engineId: 'test', depth: 10, plies, chancePlies: [1] });
}

function overlayWithFlaggedReveal(): DecisionOverlay {
  return {
    byPly: new Map([[1, { judgment: 'mistake', luck: -12, playedRank: 5 }]]),
    red: { reveals: 1, decisionAccuracy: 71 },
    black: { reveals: 0, decisionAccuracy: 100 },
  };
}

describe('jieqi decision overlay wiring', () => {
  it('renders the two-number summary, the reveal glyph, and the luck readout', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const moves = firstMoves(3);

    mountJieqiReview(root, 'room-x', STANDARD_JIEQI_DEAL, {
      ariaLabel: 'test',
      title: 'Jieqi',
      summary: 'test',
      moves,
      analysis: {
        requestLabel: 'Analyse',
        fetchCached: async () => fakeAnalysis(moves.length),
        run: async () => fakeAnalysis(moves.length),
      },
      decisions: {
        fetchCached: async () => overlayWithFlaggedReveal(),
        run: async () => overlayWithFlaggedReveal(),
      },
    });

    // Both fetchCached calls resolve on microtasks; let them flush.
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    // 1) The decision-accuracy rollup appears (skill only; luck is NOT summed here anymore).
    const summary = root.querySelector('.review-decision-summary__inner');
    expect(summary).not.toBeNull();
    expect(summary!.textContent).toContain('Reveal decisions');
    expect(summary!.textContent).toContain('71% accuracy'); // red decision accuracy
    expect(summary!.textContent).not.toContain('Luck'); // net-luck row is gone

    // 2) The flagged reveal (ply 1) shows the decision glyph (? mistake) in the move list.
    expect(root.textContent).toContain('?');

    // 3) Luck now shows INLINE on the reveal move: a per-move dice badge, not the advice line.
    const luckBadges = [...root.querySelectorAll('.review-move-list__luck')].filter((el) =>
      el.textContent?.includes('🎲'),
    );
    expect(luckBadges.length).toBeGreaterThan(0);
    expect(luckBadges.some((el) => el.textContent?.includes('-12%'))).toBe(true);
    expect(luckBadges.some((el) => el.classList.contains('review-move-list__luck--unlucky'))).toBe(
      true,
    );

    root.remove();
  });
});
