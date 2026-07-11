// Xiangqi Learn — Stage: piece value (lila value.ts arc, xiangqi-ized).
// Every level offers several captures in one move; only the most valuable
// target satisfies the success assert. detectCapture is off: the lesson is
// pure arithmetic (chariot 90 > cannon 45 > horse 40 > elephant/advisor 20 >
// soldier 10), not safety. The copy carries the scale; the asserts enforce it.

import { pieceNotOn } from '../learn-assert.js';
import { arrow, type LearnLevelPartial } from '../learn-types.js';

const levels: LearnLevelPartial[] = [
  {
    // Chariot (90) vs soldier (10): the easy warm-up.
    goal: 'learn.xiangqi.value.goal.chariotOverSoldier',
    fen: '9/9/4r4/9/9/9/9/9/1p2R4/9 w',
    shapes: [arrow('e2', 'e8', 'green')],
    success: pieceNotOn('black', 'chariot', 'e8'),
    sampleSolution: 'e2e8',
  },
  {
    // Cannon (45) vs horse (40): the close call.
    goal: 'learn.xiangqi.value.goal.cannonOverHorse',
    fen: '9/4c4/9/9/9/1n2R4/9/9/9/9 w',
    success: pieceNotOn('black', 'cannon', 'e9'),
    sampleSolution: 'e5e9',
  },
  {
    // Two red pieces, two targets: the cannon leaps for the chariot (90),
    // the horse could only win the enemy cannon (45).
    goal: 'learn.xiangqi.value.goal.chariotOverCannon',
    fen: '9/4r4/5c3/9/6N2/4P4/9/9/4C4/9 w',
    success: pieceNotOn('black', 'chariot', 'e9'),
    sampleSolution: 'e2e9',
  },
  {
    // The trap: the cannon's board-length leap only wins a soldier (10);
    // the quiet chariot slide wins the horse (40).
    goal: 'learn.xiangqi.value.goal.flashyTrap',
    fen: '9/1p7/7n1/9/1p7/9/7R1/9/1C7/9 w',
    success: pieceNotOn('black', 'horse', 'h8'),
    sampleSolution: 'h4h8',
  },
  {
    // Capstone: one chariot, four captures on the compass points.
    // Chariot 90 beats cannon 45, horse 40, soldier 10.
    goal: 'learn.xiangqi.value.goal.capstone',
    fen: '9/9/4c4/9/9/n3R3r/9/9/4p4/9 w',
    success: pieceNotOn('black', 'chariot', 'i5'),
    sampleSolution: 'e5i5',
  },
].map((level) => ({
  nbMoves: 1,
  captures: 1,
  pointsForCapture: true,
  showPieceValues: true,
  detectCapture: false as const,
  rules: 'relaxed' as const,
  ...level,
}));

export const valueStage = {
  key: 'value',
  title: 'learn.xiangqi.value.title',
  subtitle: 'learn.xiangqi.value.subtitle',
  intro: 'learn.xiangqi.value.intro',
  complete: 'learn.xiangqi.value.complete',
  illustration: { glyph: '值' },
  copy: {
    'learn.xiangqi.value.title': 'Piece value',
    'learn.xiangqi.value.subtitle': 'Know what your pieces are worth',
    'learn.xiangqi.value.intro':
      'Pieces are not equal. The chariot is worth 90 points, the cannon 45, the horse 40, the elephant and advisor 20 each, and the soldier 10. Yes, one chariot is worth two cannons! When you have a choice of captures, take the most valuable piece.',
    'learn.xiangqi.value.complete':
      'Well done! You know the scale: chariot 90, cannon 45, horse 40, elephant and advisor 20, soldier 10. In every exchange, trade up, never down.',
    'learn.xiangqi.value.goal.chariotOverSoldier':
      'Your chariot can take the soldier (10) or the chariot (90). Take the chariot!',
    'learn.xiangqi.value.goal.cannonOverHorse':
      'A close call: the cannon (45) is worth a little more than the horse (40). Take the cannon!',
    'learn.xiangqi.value.goal.chariotOverCannon':
      'Two of your pieces can capture. Remember: one chariot (90) is worth two cannons (45). Take the chariot!',
    'learn.xiangqi.value.goal.flashyTrap':
      'The big leap looks tempting, but that soldier is only worth 10. The quiet move wins a horse (40). Take the most valuable piece!',
    'learn.xiangqi.value.goal.capstone':
      'Four captures, one right answer. Chariot 90, cannon 45, horse 40, soldier 10. Take the most valuable piece!',
  },
  levels,
};
