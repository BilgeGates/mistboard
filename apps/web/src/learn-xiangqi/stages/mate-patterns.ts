// Xiangqi Learn — Stage: classic mate patterns (基本杀法). Six scripted
// strict-mode scenarios, one canonical pattern each: 双车错 (alternating
// chariots), 马后炮 (cannon behind the horse), 卧槽马 (stable horse), 重炮
// (doubled cannons), 铁门栓 (iron bolt), and a 小刀剜心 chariot+soldier
// capstone. Every level scripts black's most natural defense between the
// player's moves and ends in a kernel-verified checkmate (success:
// mate('red')). Shapes on black's reply steps hint the player's next move.

import { mate } from '../learn-assert.js';
import { arrow, circle, type LearnLevelPartial } from '../learn-types.js';

const levels: LearnLevelPartial[] = [
  {
    // 双车错: check on the top rank forces the general down; the second
    // chariot cuts the next rank. Black's lone general is forced throughout.
    goal: 'learn.xiangqi.matePatterns.goal.1',
    fen: '4k4/R8/1R1P5/9/9/9/9/9/9/3K5 w',
    nbMoves: 2,
    rules: 'strict',
    detectCapture: false,
    success: mate('red'),
    shapes: [arrow('a9', 'a10')],
    scenario: [
      { from: 'a9', to: 'a10' },
      { move: { from: 'e10', to: 'e9' }, shapes: [arrow('b8', 'b9', 'green')] },
      { from: 'b8', to: 'b9' },
    ],
  },
  {
    // 马后炮: the horse posts at e8 (guarding d10/f10), then the cannon lines
    // up behind it on the middle file; the horse is the screen.
    goal: 'learn.xiangqi.matePatterns.goal.2',
    fen: '4k4/9/9/6N2/9/9/p8/7C1/9/3K5 w',
    nbMoves: 2,
    rules: 'strict',
    detectCapture: false,
    success: mate('red'),
    shapes: [arrow('g7', 'e8'), circle('e8', 'blue')],
    scenario: [
      { from: 'g7', to: 'e8' },
      { move: { from: 'a4', to: 'a3' }, shapes: [arrow('h3', 'e3', 'green')] },
      { from: 'h3', to: 'e3' },
    ],
  },
  {
    // 卧槽马: the horse leaps to the stable point c8, checking d10 and
    // guarding e9; the chariot delivers the back-rank mate.
    goal: 'learn.xiangqi.matePatterns.goal.3',
    fen: '3k5/R8/9/9/3N5/9/9/9/4A4/4K4 w',
    nbMoves: 2,
    rules: 'strict',
    detectCapture: false,
    success: mate('red'),
    shapes: [arrow('d6', 'c8'), circle('c8', 'blue')],
    scenario: [
      { from: 'd6', to: 'c8' },
      { move: { from: 'd10', to: 'e10' }, shapes: [arrow('a9', 'a10', 'green')] },
      { from: 'a9', to: 'a10' },
    ],
  },
  {
    // 重炮: both cannons stack on the middle file. The front cannon is the
    // screen; any block between front cannon and general feeds the front
    // cannon instead, so the advisors cannot interpose.
    goal: 'learn.xiangqi.matePatterns.goal.4',
    fen: '3ak4/4a4/9/9/9/7C1/9/7C1/9/4K4 w',
    nbMoves: 2,
    rules: 'strict',
    detectCapture: false,
    success: mate('red'),
    shapes: [arrow('h3', 'e3')],
    scenario: [
      { from: 'h3', to: 'e3' },
      { move: { from: 'e9', to: 'f10' }, shapes: [arrow('h5', 'e5', 'green')] },
      { from: 'h5', to: 'e5' },
    ],
  },
  {
    // 铁门栓: the cannon on the middle file pins the center advisor and
    // elephant shut (either moving, or blocking on the tenth rank, exposes the
    // cannon check), then the chariot slams the back rank.
    goal: 'learn.xiangqi.matePatterns.goal.5',
    fen: '4k4/4a4/R3b4/9/9/6p2/7C1/9/9/4K4 w',
    nbMoves: 2,
    rules: 'strict',
    detectCapture: false,
    success: mate('red'),
    shapes: [arrow('h4', 'e4'), circle('e9', 'red'), circle('e8', 'red')],
    scenario: [
      { from: 'h4', to: 'e4' },
      { move: { from: 'g5', to: 'g4' }, shapes: [arrow('a8', 'a10', 'green')] },
      { from: 'a8', to: 'a10' },
    ],
  },
  {
    // 小刀剜心 capstone: the soldier sacrifices itself on the palace heart e9,
    // the cannon pins the middle file (recaptures on e9 would expose the
    // general), and the chariot pierces the heart for mate.
    goal: 'learn.xiangqi.matePatterns.goal.6',
    fen: '3aka3/R8/4P1N2/9/9/9/7C1/9/9/4K4 w',
    nbMoves: 3,
    rules: 'strict',
    detectCapture: false,
    success: mate('red'),
    shapes: [arrow('e8', 'e9'), circle('e9', 'blue')],
    scenario: [
      { from: 'e8', to: 'e9' },
      { move: { from: 'f10', to: 'e9' }, shapes: [arrow('h4', 'e4', 'green')] },
      { from: 'h4', to: 'e4' },
      { move: { from: 'e9', to: 'f10' }, shapes: [arrow('a9', 'e9', 'green')] },
      { from: 'a9', to: 'e9' },
    ],
  },
];

export const matePatternsStage = {
  key: 'mate-patterns',
  title: 'learn.xiangqi.matePatterns.title',
  subtitle: 'learn.xiangqi.matePatterns.subtitle',
  intro: 'learn.xiangqi.matePatterns.intro',
  complete: 'learn.xiangqi.matePatterns.complete',
  illustration: { glyph: '绝' },
  copy: {
    'learn.xiangqi.matePatterns.title': 'Mate patterns',
    'learn.xiangqi.matePatterns.subtitle': 'Six classic winning shapes',
    'learn.xiangqi.matePatterns.intro':
      'Every winning attack ends in a known shape. These are six classic mate patterns (基本杀法) that xiangqi players learn by name. Play each one out and remember the picture.',
    'learn.xiangqi.matePatterns.complete':
      'Well done! You can name six classic mates. Strong players spot these shapes several moves ahead. When you attack, aim for a picture you already know.',
    'learn.xiangqi.matePatterns.goal.1':
      '双车错, the alternating chariots: check with one chariot to drive the general down, then mate with the other on the next line.',
    'learn.xiangqi.matePatterns.goal.2':
      '马后炮, cannon behind the horse: the horse guards the corner points and becomes the screen. Jump in, then line the cannon up behind it.',
    'learn.xiangqi.matePatterns.goal.3':
      '卧槽马, the stable horse: from the point beside the palace the horse checks and guards the escape. Leap in, then finish with the chariot.',
    'learn.xiangqi.matePatterns.goal.4':
      '重炮, the doubled cannons: stack both cannons on the middle file. The front one is the screen, the rear one mates. Any block only feeds the front cannon.',
    'learn.xiangqi.matePatterns.goal.5':
      '铁门栓, the iron bolt: your center cannon pins the defenders shut, they cannot move or block. Slam the chariot onto the back rank.',
    'learn.xiangqi.matePatterns.goal.6':
      '小刀剜心, carve out the heart: give up the soldier on the center point, pin the middle file with your cannon, then drive the chariot in.',
  },
  levels,
};
