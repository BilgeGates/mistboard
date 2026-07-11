// Xiangqi Learn — Stage: check in one (将军). Lila check1 arc, xiangqi-ized:
// common fields (strict rules, one move, success = check) spread across every
// level; the checking piece escalates through the xiangqi arsenal. All levels
// run the strict kernel, so both generals sit in their palaces, flying-general
// is enforced, and movegen never offers a self-exposing move. Positions are
// tuned so the check-in-one is never accidentally checkmate (mate has its own
// stage).

import { check, not } from '../learn-assert.js';
import { arrow, type LearnLevelPartial } from '../learn-types.js';

const levels: LearnLevelPartial[] = [
  {
    // Chariot check straight down the open file.
    goal: 'learn.xiangqi.check1.goal.chariot',
    fen: '4k4/9/9/9/9/R8/9/9/9/3K5 w',
    shapes: [arrow('a5', 'e5')],
    sampleSolution: 'a5e5',
  },
  {
    // Cannon check: the advisor on e9 is the screen.
    goal: 'learn.xiangqi.check1.goal.cannon',
    fen: '4k4/4a4/9/9/9/7C1/9/9/9/3K5 w',
    sampleSolution: 'h5e5',
  },
  {
    // Horse check: the black horse on d9 blocks the d8 route's leg, so only
    // the f8 jump delivers check.
    goal: 'learn.xiangqi.check1.goal.horse',
    fen: '4k4/3n5/9/9/4N4/9/9/9/9/3K5 w',
    sampleSolution: 'e6f8',
  },
  {
    // Soldier check: one push to the palace edge. Kept minimal: any friendly
    // piece behind the soldier adds discovered checks that muddy the lesson.
    goal: 'learn.xiangqi.check1.goal.soldier',
    fen: '4k4/9/4P4/9/9/9/9/9/9/3K5 w',
    sampleSolution: 'e8e9',
  },
  {
    // Discovered check, cannon style: two pieces sit between cannon and
    // general. Jump the horse away and exactly one screen (the enemy
    // soldier!) remains.
    goal: 'learn.xiangqi.check1.goal.discovered',
    fen: '4k4/9/9/4p4/9/4N4/9/9/4C4/3K5 w',
    sampleSolution: 'e5d7',
  },
  {
    // Only one check: the cannon has no screen (and may not land on one), the
    // horse can grab the advisor but reaches no checking square, and the horse
    // sits off the d-file so it can never become the cannon's screen. Only the
    // chariot lift to the top rank works.
    goal: 'learn.xiangqi.check1.goal.onlyOne',
    fen: '3k5/2r1a4/6N2/9/9/9/3C5/9/9/R3K4 w',
    sampleSolution: 'a1a10',
  },
  {
    // Capstone on a fuller board: lift the cannon to the back rank and check
    // through the enemy's own elephant.
    goal: 'learn.xiangqi.check1.goal.capstone',
    fen: '2b1ka3/8r/4b2n1/9/9/2p3p2/2N1P4/1C7/4K2R1/3A2B2 w',
    sampleSolution: 'b3b10',
  },
].map((level) => ({
  rules: 'strict',
  nbMoves: 1,
  success: check,
  failure: not(check),
  detectCapture: false,
  ...level,
}));

export const check1Stage = {
  key: 'check1',
  title: 'learn.xiangqi.check1.title',
  subtitle: 'learn.xiangqi.check1.subtitle',
  intro: 'learn.xiangqi.check1.intro',
  complete: 'learn.xiangqi.check1.complete',
  illustration: { glyph: '将' },
  copy: {
    'learn.xiangqi.check1.title': 'Check in one',
    'learn.xiangqi.check1.subtitle': 'Attack the enemy general',
    'learn.xiangqi.check1.intro':
      'You win by trapping the enemy general. Attacking it is called check: the general must deal with the threat at once. Find the move that gives check!',
    'learn.xiangqi.check1.complete':
      'Well done! Any piece can give check, and the cannon can even do it from behind a screen. Next: what to do when YOUR general is the one in check.',
    'learn.xiangqi.check1.goal.chariot':
      'The file is wide open. Check the enemy general with your chariot!',
    'learn.xiangqi.check1.goal.cannon':
      'Check with your cannon. Remember: it needs exactly one screen between itself and the general.',
    'learn.xiangqi.check1.goal.horse':
      'Check with your horse. Mind the legs: a blocked horse cannot attack.',
    'learn.xiangqi.check1.goal.soldier':
      'Even the humble soldier can give check. March it into the palace!',
    'learn.xiangqi.check1.goal.discovered':
      'Two pieces block your cannon. Jump the horse away and the cannon behind it gives check: a discovered check!',
    'learn.xiangqi.check1.goal.onlyOne': 'Only one move gives check here. Find it!',
    'learn.xiangqi.check1.goal.capstone': 'A real battle. Find the check in one move!',
  },
  levels,
};
