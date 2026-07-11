// Xiangqi Learn — Stage: check in two (lila check2.ts arc, xiangqi-ized).
// Relaxed mode with a frozen opponent: keepTurn (the default, no scenario)
// gives the student both moves, and detectCapture is off so the design can be
// pure geometry. Every level is a two-move attacking plan; no level has a
// one-move check, so the first move is always preparation.

import { checkIn, noCheckIn } from '../learn-assert.js';
import { arrow, type LearnLevelPartial } from '../learn-types.js';

const levels: LearnLevelPartial[] = [
  {
    // 1. Chariot: take the open a-file, then swing to the back rank. The
    //    d-file is plugged by the black soldier d4 and rank 10 is shielded by
    //    the g10 elephant, so no single chariot move gives check.
    fen: '3k2b2/9/9/9/9/9/3p5/9/7R1/4K4 w',
    shapes: [arrow('h2', 'a2', 'green'), arrow('a2', 'a10', 'green')],
    sampleSolution: 'h2a2 a2a10',
  },
  {
    // 2. Cannon battery: the soldier e6 is the waiting screen, but the horse
    //    f4 blocks the direct slide to the e-file, so the cannon must reroute
    //    (h4-h2-e2) to hop in behind its screen.
    fen: '4k4/9/9/9/4P4/9/5N1C1/9/9/5K3 w',
    sampleSolution: 'h4h2 h2e2',
  },
  {
    // 3. Horse maneuver: two jumps to the palace corner (g5-f7-g9); from g9
    //    the horse strikes e10 over the empty f9 leg.
    fen: '3aka3/9/9/9/9/6N2/9/9/9/3K5 w',
    sampleSolution: 'g5f7 f7g9',
  },
  {
    // 4. Clear your own blocker: the chariot wants d1 to check down the open
    //    d-file, but your own general sits in the way. Step the general up,
    //    then slide across.
    fen: '3k1a3/9/9/9/9/9/9/9/9/4K1R2 w',
    sampleSolution: 'e1e2 g1d1',
  },
  {
    // 5. Soldier at the palace door: step to d9 (quiet), then sidestep to e9
    //    where the soldier stares the general in the face.
    fen: '4k4/9/3P5/9/9/9/9/9/9/3K5 w',
    sampleSolution: 'd8d9 d9e9',
  },
  {
    // 6. Capstone: only the cannon plan works. The e9 advisor blocks every
    //    chariot idea on the e-file but is the perfect cannon screen; the d9
    //    horse plugs the d-file and rank 9, the c10 elephant shields rank 10,
    //    the i7 soldier and your own f4 soldier force the cannon to reroute
    //    around the bottom (i4-i2-e2).
    fen: '2bak4/3na4/9/8p/9/9/5P2C/6N2/9/R3K4 w',
    sampleSolution: 'i4i2 i2e2',
  },
].map((level) => ({
  goal: 'learn.xiangqi.check2.goal',
  nbMoves: 2,
  rules: 'relaxed' as const,
  detectCapture: false as const,
  success: checkIn(2),
  failure: noCheckIn(2),
  ...level,
}));

export const check2Stage = {
  key: 'check2',
  title: 'learn.xiangqi.check2.title',
  subtitle: 'learn.xiangqi.check2.subtitle',
  intro: 'learn.xiangqi.check2.intro',
  complete: 'learn.xiangqi.check2.complete',
  illustration: { glyph: '双' },
  copy: {
    'learn.xiangqi.check2.title': 'Check in two',
    'learn.xiangqi.check2.subtitle': 'Two moves to attack the general',
    'learn.xiangqi.check2.intro':
      'Some checks need preparation. Find the two-move plan that puts the enemy general in check! The enemy pieces will not move.',
    'learn.xiangqi.check2.complete':
      'Well done! Chariot, cannon, horse, even a humble soldier: every attacker can set up a check one move ahead. Planning two moves ahead is the heart of attack.',
    'learn.xiangqi.check2.goal': 'Check the enemy general in two moves!',
  },
  levels,
};
