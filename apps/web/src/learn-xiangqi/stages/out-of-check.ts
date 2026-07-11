// Xiangqi Learn — Stage: out of check (应将). Port of lila outOfCheck.ts,
// xiangqi-ized. Every level starts with RED IN CHECK under strict rules, so
// the movegen itself forces an escape: any offered move answers the check and
// the level completes on it. Each position is shaped so one escape family is
// the natural (often only) answer: run, capture, block, and the two cannon
// twists chess does not have (add a second screen; walk the screen away).

import { arrow, type LearnLevelPartial } from '../learn-types.js';

const levels: LearnLevelPartial[] = [
  {
    // Run: the chariot owns the file; Kf1 is the single legal move (d1 is
    // flying-general illegal against the black general on d10).
    goal: 'learn.xiangqi.outOfCheck.goal.escape',
    fen: '3k5/9/9/9/4r4/9/9/9/9/4K4 w',
    shapes: [arrow('e6', 'e1', 'red'), arrow('e1', 'f1', 'green')],
    sampleSolution: 'e1f1',
  },
  {
    // Capture: the checking horse is on your chariot's rank. Take it.
    goal: 'learn.xiangqi.outOfCheck.goal.capture',
    fen: '5k3/9/9/9/9/9/9/R2n5/9/4K4 w',
    sampleSolution: 'a3d3',
  },
  {
    // Block: the general cannot step anywhere; interpose on the e-file
    // (chariot to e2, or either advisor to e2 — every legal move is a block).
    goal: 'learn.xiangqi.outOfCheck.goal.block',
    fen: '4k4/9/4r4/9/9/9/9/9/1R7/3AKA3 w',
    sampleSolution: 'b2e2',
  },
  {
    // Xiangqi twist: the cannon fires over ONE screen (the black soldier on
    // e4). Add a second piece to the line and the capture is impossible.
    goal: 'learn.xiangqi.outOfCheck.goal.secondScreen',
    fen: '4k4/9/4c4/9/9/6R2/4p4/9/9/3AKA3 w',
    sampleSolution: 'g5e5',
  },
  {
    // Xiangqi twist: your own horse is the cannon's screen. Walk it off the
    // line and the cannon has nothing to jump (every horse move escapes).
    goal: 'learn.xiangqi.outOfCheck.goal.removeScreen',
    fen: '5k3/4c4/9/9/9/4N4/9/2n3n2/9/4K4 w',
    sampleSolution: 'e5d7',
  },
  {
    // Capstone: run (Kd1/Kf1), block (Ng3-e2), or capture (Ra7xe7) all work.
    // The copy asks for the best answer; any legal escape is accepted.
    goal: 'learn.xiangqi.outOfCheck.goal.best',
    fen: '4k4/9/9/R3r4/9/9/9/6N2/9/4K4 w',
    sampleSolution: 'a7e7',
  },
].map((level) => ({ rules: 'strict', nbMoves: 1, detectCapture: false, ...level }));

export const outOfCheckStage = {
  key: 'out-of-check',
  title: 'learn.xiangqi.outOfCheck.title',
  subtitle: 'learn.xiangqi.outOfCheck.subtitle',
  intro: 'learn.xiangqi.outOfCheck.intro',
  complete: 'learn.xiangqi.outOfCheck.complete',
  illustration: { glyph: '应' },
  copy: {
    'learn.xiangqi.outOfCheck.title': 'Out of check',
    'learn.xiangqi.outOfCheck.subtitle': 'Defend your general',
    'learn.xiangqi.outOfCheck.intro':
      'Check! Your general is attacked and you must answer right away. Run, capture the attacker, or break the attack. Against a cannon you have a special trick: play with its screen.',
    'learn.xiangqi.outOfCheck.complete':
      'Congratulations! Your general always has a plan: run, capture, or block. And when a cannon checks, remember the screen: add a second one, or take yours away.',
    'learn.xiangqi.outOfCheck.goal.escape':
      'Check! The chariot attacks your general. Step to a safe point in the palace.',
    'learn.xiangqi.outOfCheck.goal.capture':
      'The horse gives check. Get out of check by capturing it!',
    'learn.xiangqi.outOfCheck.goal.block':
      'Your general cannot run. Block the chariot by putting a piece in its path.',
    'learn.xiangqi.outOfCheck.goal.secondScreen':
      'A cannon captures over exactly one screen. Slide a second piece onto the line: with two screens, it cannot take your general!',
    'learn.xiangqi.outOfCheck.goal.removeScreen':
      'Your own horse is the screen this cannon fires over! Move it off the line and the cannon cannot jump.',
    'learn.xiangqi.outOfCheck.goal.best':
      'Check! You can run, block, or capture. Find the best way out of this one.',
  },
  levels,
};
