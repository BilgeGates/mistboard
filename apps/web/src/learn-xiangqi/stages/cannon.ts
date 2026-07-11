// Xiangqi Learn — Stage: the cannon (炮). The signature xiangqi piece: it
// MOVES like a chariot but CAPTURES by jumping exactly one piece (the screen).
// Movement levels use emptyApples (bare markers, no capture needed); capture
// levels materialize apples as enemy soldiers so the screen requirement does
// the teaching. Level 6 is a scripted scenario: the opponent walks into the
// cannon's fire.

import { scenarioComplete } from '../learn-assert.js';
import { arrow, circle, type LearnLevelPartial } from '../learn-types.js';

const levels: LearnLevelPartial[] = [
  {
    // Pure movement: slides like a chariot.
    goal: 'learn.xiangqi.cannon.goal.1',
    fen: '9/9/9/9/9/9/9/9/4C4/9 w',
    apples: 'e6',
    emptyApples: true,
    nbMoves: 1,
    shapes: [arrow('e2', 'e6')],
  },
  {
    // Movement route planning.
    goal: 'learn.xiangqi.cannon.goal.2',
    fen: '9/9/2C6/9/9/9/9/9/9/9 w',
    apples: 'c3 h3',
    emptyApples: true,
    nbMoves: 2,
  },
  {
    // First screen capture: jump the friendly soldier.
    goal: 'learn.xiangqi.cannon.goal.3',
    fen: '9/9/9/9/9/4P4/9/9/4C4/9 w',
    apples: 'e8',
    nbMoves: 1,
    shapes: [circle('e5', 'blue'), arrow('e2', 'e8')],
  },
  {
    // Reposition first, then use the screen.
    goal: 'learn.xiangqi.cannon.goal.4',
    fen: '9/9/9/9/9/5P3/9/9/2C6/9 w',
    apples: 'f9',
    nbMoves: 2,
  },
  {
    // The enemy's own soldier works as your screen.
    goal: 'learn.xiangqi.cannon.goal.5',
    fen: '9/9/5p3/9/9/4P4/9/9/C1P6/9 w',
    apples: 'e2 e8 g8',
    nbMoves: 3,
  },
  {
    // Scenario: the enemy chariot stops behind your horse. Blast it.
    goal: 'learn.xiangqi.cannon.goal.6',
    fen: '7r1/9/9/9/9/7N1/9/7C1/9/9 b',
    color: 'red',
    nbMoves: 1,
    scenario: [
      { move: { from: 'h10', to: 'h6' }, shapes: [arrow('h3', 'h6', 'green')] },
      { from: 'h3', to: 'h6' },
    ],
    success: scenarioComplete,
    detectCapture: false,
  },
  {
    // Capstone: a four-capture tour on changing screens.
    goal: 'learn.xiangqi.cannon.goal.7',
    fen: '9/3p5/9/9/2P1P4/9/5p3/4C4/9/9 w',
    apples: 'e9 c9 c4 h4',
    nbMoves: 4,
  },
];

export const cannonStage = {
  key: 'cannon',
  title: 'learn.xiangqi.cannon.title',
  subtitle: 'learn.xiangqi.cannon.subtitle',
  intro: 'learn.xiangqi.cannon.intro',
  complete: 'learn.xiangqi.cannon.complete',
  illustration: { piece: 'cannon' },
  copy: {
    'learn.xiangqi.cannon.title': 'The cannon',
    'learn.xiangqi.cannon.subtitle': 'It jumps over a screen to capture',
    'learn.xiangqi.cannon.intro':
      'The cannon moves like the chariot, but it captures differently: it must jump over exactly one piece, called the screen. Any piece can be the screen, yours or theirs.',
    'learn.xiangqi.cannon.complete':
      'Well done! The cannon is the trickiest piece in xiangqi. Remember: it needs a screen to capture, and no screen to move.',
    'learn.xiangqi.cannon.goal.1': 'The cannon slides like the chariot. Grab the star!',
    'learn.xiangqi.cannon.goal.2': 'Two stars, two moves. No jumping needed to move.',
    'learn.xiangqi.cannon.goal.3':
      'To capture, the cannon jumps over one screen. Jump your soldier and grab the star!',
    'learn.xiangqi.cannon.goal.4': 'No screen, no capture. Line up behind your soldier first.',
    'learn.xiangqi.cannon.goal.5': 'Enemy pieces make fine screens too. Use them!',
    'learn.xiangqi.cannon.goal.6': 'The enemy chariot stopped behind your horse. Blast it!',
    'learn.xiangqi.cannon.goal.7': 'Four stars. Every capture needs its own screen.',
  },
  levels,
};
