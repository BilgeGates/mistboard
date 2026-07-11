// Xiangqi Learn — Stage: the general (帅). The piece the whole game is about.
// He moves one orthogonal step and can only stand on the nine palace points
// d1-f3; the geometry itself teaches the confinement (relaxed movegen never
// offers a point outside the palace). All levels use emptyApples: bare star
// markers, no phantom soldiers, because the general's intro stage is about
// walking, not capturing. The black general stays off the board (relaxed
// mode tolerates general-less fragments). Par counts are BFS-verified.

import { arrow, type LearnLevelPartial } from '../learn-types.js';

const levels: LearnLevelPartial[] = [
  {
    // One step. The slowest piece on the board.
    goal: 'learn.xiangqi.general.goal.1',
    fen: '9/9/9/9/9/9/9/9/9/4K4 w',
    apples: 'e2',
    emptyApples: true,
    nbMoves: 1,
    shapes: [arrow('e1', 'e2')],
  },
  {
    // Orthogonal steps only: a short chain around the palace.
    goal: 'learn.xiangqi.general.goal.2',
    fen: '9/9/9/9/9/9/9/9/4K4/9 w',
    apples: 'e3 d3 d2',
    emptyApples: true,
    nbMoves: 3,
  },
  {
    // A longer shuttle: climb to the back of the palace, sweep across,
    // double back. BFS-optimal in 5 (e1-e2-e3, f3, back through e3 to d3).
    goal: 'learn.xiangqi.general.goal.3',
    fen: '9/9/9/9/9/9/9/9/9/4K4 w',
    apples: 'e3 f3 d3',
    emptyApples: true,
    nbMoves: 5,
  },
  {
    // Capstone: tour all four palace corners from the center point.
    goal: 'learn.xiangqi.general.goal.4',
    fen: '9/9/9/9/9/9/9/9/4K4/9 w',
    apples: 'd1 f1 d3 f3',
    emptyApples: true,
    nbMoves: 8,
  },
];

export const generalStage = {
  key: 'general',
  title: 'learn.xiangqi.general.title',
  subtitle: 'learn.xiangqi.general.subtitle',
  intro: 'learn.xiangqi.general.intro',
  complete: 'learn.xiangqi.general.complete',
  illustration: { piece: 'general' },
  copy: {
    'learn.xiangqi.general.title': 'The general',
    'learn.xiangqi.general.subtitle': 'Keep him safe inside the palace',
    'learn.xiangqi.general.intro':
      'The general is the most important piece in xiangqi. He moves one step at a time, up, down, or sideways, and he can never leave the palace: those nine points are his whole world.',
    'learn.xiangqi.general.complete':
      'You can command the general. Remember: the whole game is about this one piece. Lose him and you lose everything.',
    'learn.xiangqi.general.goal.1': 'The general is slow. One step at a time. Grab the star!',
    'learn.xiangqi.general.goal.2':
      'One step along the lines, never diagonally. Collect every star.',
    'learn.xiangqi.general.goal.3':
      'Try stepping outside the palace. You cannot! Shuttle along the back of it instead.',
    'learn.xiangqi.general.goal.4': 'Tour all four corners of the palace. Know his home by heart.',
  },
  levels,
};
