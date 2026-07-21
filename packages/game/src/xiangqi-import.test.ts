import assert from 'node:assert/strict';
import test from 'node:test';
import { importXiangqiGame } from './xiangqi-import.js';

test('importXiangqiGame reads native coordinate notation', () => {
  const result = importXiangqiGame('h3e3 h8e8 h1g3');
  assert.equal(result.error, undefined);
  assert.equal(result.format, 'coordinate');
  assert.deepEqual(result.moves, [
    { from: 'h3', to: 'e3' },
    { from: 'h8', to: 'e8' },
    { from: 'h1', to: 'g3' },
  ]);
});

test('importXiangqiGame reads Chinese relative notation', () => {
  const result = importXiangqiGame('炮二平五 炮8平5 马二进三');
  assert.equal(result.error, undefined);
  assert.equal(result.format, 'chinese');
  assert.deepEqual(result.moves, [
    { from: 'h3', to: 'e3' },
    { from: 'h8', to: 'e8' },
    { from: 'h1', to: 'g3' },
  ]);
});

test('importXiangqiGame rejects an illegal game', () => {
  const result = importXiangqiGame('b1b2');
  assert.equal(result.format, null);
  assert.match(result.error ?? '', /not legal/);
});

test('importXiangqiGame resolves red front/rear tandem selectors', () => {
  // 炮八平五 stacks red cannons on the e-file (e7 + e3); 前 picks the one
  // nearest the enemy (e7), 后 the rear (e3).
  const base = '炮二平五 马8进7 炮五进四 马2进3 炮八平五 车9平8';
  const front = importXiangqiGame(`${base} 前炮退一`);
  assert.equal(front.error, undefined);
  assert.deepEqual(front.moves.at(-1), { from: 'e7', to: 'e6' });
  const rear = importXiangqiGame(`${base} 后炮平四`);
  assert.equal(rear.error, undefined);
  assert.deepEqual(rear.moves.at(-1), { from: 'e3', to: 'f3' });
});

test('importXiangqiGame orders black tandem front toward red', () => {
  // Black cannons stacked at e4 + e8: front for black is the LOWER rank (e4),
  // and black's 退 moves toward higher ranks.
  const result = importXiangqiGame(
    '炮二平五 炮8平5 马二进三 炮5进4 仕四进五 炮2平5 马八进七 前炮退二',
  );
  assert.equal(result.error, undefined);
  assert.deepEqual(result.moves.at(-1), { from: 'e4', to: 'e6' });
});

test('importXiangqiGame resolves the WXF tandem token', () => {
  const result = importXiangqiGame('C2.5 H8+7 C5+4 H2+3 C8.5 R9.8 +C-1');
  assert.equal(result.error, undefined);
  assert.equal(result.format, 'wxf');
  assert.deepEqual(result.moves.at(-1), { from: 'e7', to: 'e6' });
});

test('importXiangqiGame reads woodblock-style records (包, 。, capture glosses)', () => {
  // Classical manuals write the black cannon 包, separate moves with 。, and
  // interleave capture glosses (卒去) with the move text.
  const woodblock = importXiangqiGame('炮二平五。包8平5。马二进三。');
  assert.equal(woodblock.error, undefined);
  assert.deepEqual(woodblock.moves, [
    { from: 'h3', to: 'e3' },
    { from: 'h8', to: 'e8' },
    { from: 'h1', to: 'g3' },
  ]);
  const glossed = importXiangqiGame('炮二平五。马8进7。炮五进四卒去。马2进3。');
  assert.equal(glossed.error, undefined);
  assert.equal(glossed.moves.length, 4);
  assert.deepEqual(glossed.moves[2], { from: 'e3', to: 'e7' });
});
