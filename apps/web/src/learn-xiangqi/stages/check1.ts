// Xiangqi Learn — Stage: check in one (将军). Lila check1 arc with lila's
// REAL stakes: detectCapture stays on its 'unprotected' default, so a check
// that hangs the checking piece FAILS with the refutation demonstrated on the
// board. Every level is a find-the-safe-check puzzle: several moves give
// check (the intent contract proves it), exactly one keeps the checker safe.
// All levels run the strict kernel (both generals in their palaces,
// flying-general enforced) and are tuned so the safe check is never
// accidentally checkmate (mate has its own stage).

import { check, not } from '../learn-assert.js';
import { circle, type LearnLevelPartial } from '../learn-types.js';

const levels: LearnLevelPartial[] = [
  {
    // Chariot: the file check (e6) is watched by the horse (leg f7 open); the
    // rank-10 lift (a10) is safe. The circled horse is the level-1 hint.
    goal: 'learn.xiangqi.check1.goal.chariot',
    fen: '4k4/9/9/6n2/R8/9/9/9/9/3K5 w',
    shapes: [circle('g7', 'red')],
    sampleSolution: 'a6a10',
    intent: { solutions: 1, candidates: { assert: check, min: 2 } },
  },
  {
    // Cannon: two screen checks exist. The rank-9 check (h9, screen = the
    // horse) lands next to the enemy chariot; the file check (e6, screen =
    // the elephant) is out of everyone's reach.
    goal: 'learn.xiangqi.check1.goal.cannon',
    fen: '9/4k1n1r/4b4/9/7C1/9/9/9/9/4K4 w',
    sampleSolution: 'h6e6',
    intent: { solutions: 1, candidates: { assert: check, min: 2 } },
  },
  {
    // Horse: both forward jumps give check, but the enemy chariot guards d8
    // straight down its file. f8 is safe: the general blocks the chariot's
    // rank and nothing else reaches it.
    goal: 'learn.xiangqi.check1.goal.horse',
    fen: '3rk4/9/9/9/4N4/9/9/9/9/5K3 w',
    sampleSolution: 'e6f8',
    intent: { solutions: 1, candidates: { assert: check, min: 2 } },
  },
  {
    // Soldier: two pushes check, and both step right next to the general. The
    // sideways step (e8) gets eaten; the forward push (d9) is backed by the
    // chariot on d1, so the general cannot touch it.
    goal: 'learn.xiangqi.check1.goal.soldier',
    fen: '3a5/4k4/3P5/9/9/4p4/9/9/9/3RK4 w',
    sampleSolution: 'd8d9',
    intent: { solutions: 1, candidates: { assert: check, min: 2 } },
  },
  {
    // Discovered check, cannon style: any horse jump clears the e-file and
    // the cannon checks through the enemy soldier screen. But the elephant
    // watches c6 and the horse watches f7 and g6: only d7 is safe. The
    // advisors and soldiers close the horse's own back rank.
    goal: 'learn.xiangqi.check1.goal.discovered',
    fen: '4k4/9/b6n1/4p4/9/4N4/2P3P2/3A1A3/4C4/3K5 w',
    sampleSolution: 'e5d7',
    intent: { solutions: 1, candidates: { assert: check, min: 3 } },
  },
  {
    // Only one check: the cannon has no screen (and may not land on one), the
    // horse can grab the advisor but reaches no checking square, and the horse
    // sits off the d-file so it can never become the cannon's screen. Only the
    // chariot lift to the top rank works.
    goal: 'learn.xiangqi.check1.goal.onlyOne',
    fen: '3k5/2r1a4/6N2/9/9/9/3C5/9/9/R3K4 w',
    sampleSolution: 'a1a10',
    intent: { solutions: 1, candidates: { assert: check, min: 1 } },
  },
  {
    // Capstone: four checks on a full battlefield, and the e8 soldier starts
    // en prise to the enemy chariot. The chariot lift and cannon lift abandon
    // it, the horse jump is met by the other horse. Only the protected
    // soldier push both checks and saves the soldier. The black horse on f9
    // doubles as a leg block so the red horse's g9 jump is never a check, and
    // the red general sits on e1 so Kxd10 stays legal (a red general on the
    // d-file would turn the chariot check into an accidental flying-general
    // mate; the verifier caught both).
    goal: 'learn.xiangqi.check1.goal.capstone',
    fen: '4ka3/5n3/4P2rb/5N3/5n3/9/3R5/4B1C2/9/4K4 w',
    sampleSolution: 'e8e9',
    intent: { solutions: 1, candidates: { assert: check, min: 4 } },
  },
].map((level) => ({
  rules: 'strict',
  nbMoves: 1,
  success: check,
  failure: not(check),
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
    'learn.xiangqi.check1.subtitle': 'Attack the enemy general, safely',
    'learn.xiangqi.check1.intro':
      'You win by trapping the enemy general. Attacking it is called check: the general must deal with the threat at once. But a careless check backfires: if your attacker can be captured for nothing, you gave away a piece, not a check. Find the check that keeps your piece safe!',
    'learn.xiangqi.check1.complete':
      'Well done! Any piece can give check, but only a safe check counts: always ask what the enemy can grab after your move. Next: what to do when YOUR general is the one in check.',
    'learn.xiangqi.check1.goal.chariot':
      'Two chariot moves give check, but the enemy horse watches one of them. Find the safe check!',
    'learn.xiangqi.check1.goal.cannon':
      'Your cannon can check over two different screens. The enemy chariot guards one landing point. Choose wisely!',
    'learn.xiangqi.check1.goal.horse':
      'Both horse jumps give check. The enemy chariot stares straight down at one of them. Pick the safe jump!',
    'learn.xiangqi.check1.goal.soldier':
      'Two soldier checks, and both step right next to the general. He eats the unprotected one. Push the soldier your chariot defends!',
    'learn.xiangqi.check1.goal.discovered':
      'Jump the horse away and your cannon gives a discovered check. But most landing points are watched. Find the safe jump!',
    'learn.xiangqi.check1.goal.onlyOne': 'Only one move gives check here. Find it!',
    'learn.xiangqi.check1.goal.capstone':
      'A real battle. Your soldier is under attack, and four moves give check. Three of them lose material. Find the check that saves the day!',
  },
  levels,
};
