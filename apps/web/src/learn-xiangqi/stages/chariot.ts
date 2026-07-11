// Xiangqi Learn — Stage: the chariot (车). Apple levels on general-less
// fragments (relaxed movegen). FEN rows run rank 10 (black side) down to
// rank 1 (red side); uppercase = red. Par counts (nbMoves) are verified
// optimal by the level verifier's BFS, so trim routes with care.

import { arrow, type LearnLevelPartial } from '../learn-types.js';

const levels: LearnLevelPartial[] = [
  {
    goal: 'learn.xiangqi.chariot.goal.1',
    fen: '9/9/9/9/9/9/9/9/4R4/9 w',
    apples: 'e7',
    nbMoves: 1,
    shapes: [arrow('e2', 'e7')],
  },
  {
    goal: 'learn.xiangqi.chariot.goal.2',
    fen: '9/9/2R6/9/9/9/9/9/9/9 w',
    apples: 'c5 g5',
    nbMoves: 2,
    shapes: [arrow('c8', 'c5'), arrow('c5', 'g5')],
  },
  {
    goal: 'learn.xiangqi.chariot.goal.3',
    fen: '9/9/9/9/9/9/9/9/9/2R6 w',
    apples: 'c4 g4 g8',
    nbMoves: 3,
  },
  {
    goal: 'learn.xiangqi.chariot.goal.4',
    fen: '9/9/9/9/9/4R4/9/9/9/9 w',
    apples: 'e2 a2 a8 e8',
    nbMoves: 4,
  },
  {
    goal: 'learn.xiangqi.chariot.goal.5',
    fen: '9/9/9/9/9/9/9/9/9/R8 w',
    apples: 'a5 c5 c9 g9 g2',
    nbMoves: 5,
  },
];

export const chariotStage = {
  key: 'chariot',
  title: 'learn.xiangqi.chariot.title',
  subtitle: 'learn.xiangqi.chariot.subtitle',
  intro: 'learn.xiangqi.chariot.intro',
  complete: 'learn.xiangqi.chariot.complete',
  illustration: { piece: 'chariot' },
  copy: {
    'learn.xiangqi.chariot.title': 'The chariot',
    'learn.xiangqi.chariot.subtitle': 'It moves in straight lines',
    'learn.xiangqi.chariot.intro':
      'The chariot is the strongest piece on the board. It slides any distance along a rank or file. Click or drag to move it.',
    'learn.xiangqi.chariot.complete':
      'Congratulations! You can command a chariot. Chariots win most games, so develop them early.',
    'learn.xiangqi.chariot.goal.1': 'Click on the chariot and grab the star!',
    'learn.xiangqi.chariot.goal.2': 'Grab both stars. Straight lines only!',
    'learn.xiangqi.chariot.goal.3': 'Grab all the stars in three moves.',
    'learn.xiangqi.chariot.goal.4': 'Plan your route before you move.',
    'learn.xiangqi.chariot.goal.5': 'Five stars, five moves. You can do it!',
  },
  levels,
};
