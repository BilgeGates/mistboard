// Xiangqi Learn — Stage: board setup (lila setup.ts arc, xiangqi-ized).
// Each level starts with the formation partly assembled and one or two red
// pieces just off their home points; the player walks them home. The boards
// accumulate level over level, so by the capstone the full red starting
// position stands: chariots a1/i1, horses b1/h1, elephants c1/g1, advisors
// d1/f1, general e1, cannons b3/h3, soldiers a4 c4 e4 g4 i4.
// No apples and no scenario: success is a pieceOn() target, proven by
// sampleSolution replay. detectCapture is off (there is nothing to capture;
// this stage is about geography, not safety).

import { and, pieceOn } from '../learn-assert.js';
import { arrow, type LearnLevelPartial } from '../learn-types.js';

const levels: LearnLevelPartial[] = [
  {
    // Chariot home: slide it down the open a-file into the corner.
    goal: 'learn.xiangqi.setup.goal.chariot',
    fen: '9/9/9/9/R8/9/9/9/9/1N5NR w',
    nbMoves: 1,
    shapes: [arrow('a6', 'a1', 'green')],
    success: pieceOn('red', 'chariot', 'a1'),
    sampleSolution: 'a6a1',
  },
  {
    // Cannons home: both drop straight down to b3 and h3, behind the horses.
    goal: 'learn.xiangqi.setup.goal.cannon',
    fen: '9/9/9/9/1C5C1/9/9/9/9/RN5NR w',
    nbMoves: 2,
    success: and(pieceOn('red', 'cannon', 'b3'), pieceOn('red', 'cannon', 'h3')),
    sampleSolution: 'b6b3 h6h3',
  },
  {
    // Elephants home: each is one hop from its corner point (eyes b2/h2 open).
    goal: 'learn.xiangqi.setup.goal.elephant',
    fen: '9/9/9/9/9/9/9/BC5CB/9/RN5NR w',
    nbMoves: 2,
    success: and(pieceOn('red', 'elephant', 'c1'), pieceOn('red', 'elephant', 'g1')),
    sampleSolution: 'a3c1 i3g1',
  },
  {
    // Palace: advisor steps aside to f1, then the general walks down to e1.
    goal: 'learn.xiangqi.setup.goal.palace',
    fen: '9/9/9/9/9/9/9/1C5C1/3KA4/RNBA2BNR w',
    nbMoves: 3,
    success: and(pieceOn('red', 'advisor', 'f1'), pieceOn('red', 'general', 'e1')),
    sampleSolution: 'e2f1 d2e2 e2e1',
  },
  {
    // Capstone: three stragglers (chariot, cannon, elephant) complete the
    // full starting formation, soldiers already on the front line.
    goal: 'learn.xiangqi.setup.goal.formation',
    fen: '9/9/9/9/7C1/9/P1P1P1P1P/1C6B/R8/1NBAKA1NR w',
    nbMoves: 3,
    success: and(
      pieceOn('red', 'chariot', 'a1'),
      pieceOn('red', 'cannon', 'h3'),
      pieceOn('red', 'elephant', 'g1'),
    ),
    sampleSolution: 'a2a1 h6h3 i3g1',
  },
].map((level) => ({ rules: 'relaxed' as const, detectCapture: false, ...level }));

export const setupStage = {
  key: 'setup',
  title: 'learn.xiangqi.setup.title',
  subtitle: 'learn.xiangqi.setup.subtitle',
  intro: 'learn.xiangqi.setup.intro',
  complete: 'learn.xiangqi.setup.complete',
  illustration: { glyph: '布' },
  copy: {
    'learn.xiangqi.setup.title': 'Board setup',
    'learn.xiangqi.setup.subtitle': 'How the game begins',
    'learn.xiangqi.setup.intro':
      'Every xiangqi game starts from the same formation. Walk each piece to its home point and learn the battle line by heart.',
    'learn.xiangqi.setup.complete':
      'Congratulations! You know the starting position: chariots in the corners, cannons behind the horses, and the general safe at the heart of his palace.',
    'learn.xiangqi.setup.goal.chariot':
      'Chariots anchor the corners. Slide your chariot home to a1.',
    'learn.xiangqi.setup.goal.cannon':
      'Cannons sit just behind the horses, pointing at the enemy camp. Bring both cannons home.',
    'learn.xiangqi.setup.goal.elephant':
      'Elephants stand beside the horses and weave the defensive net. Step both onto their home points.',
    'learn.xiangqi.setup.goal.palace':
      'The general lives at the heart of the palace, with advisors at his side. Clear the way, then bring him home.',
    'learn.xiangqi.setup.goal.formation':
      'Three pieces are still out of place. Complete the full formation: chariots, horses, elephants, advisors, general, cannons, and soldiers, all at their posts!',
  },
  levels,
};
