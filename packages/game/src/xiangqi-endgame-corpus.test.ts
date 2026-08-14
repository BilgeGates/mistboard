import assert from 'node:assert/strict';
import test from 'node:test';
import {
  endgameEntryEngineFen,
  endgameEntryFen,
  endgameEntryState,
  parseStandardXiangqiFen,
  XIANGQI_ENDGAME_CORPUS,
} from './index.js';

test('every endgame entry compiles to a legal position', () => {
  for (const entry of XIANGQI_ENDGAME_CORPUS) {
    const parsed = parseStandardXiangqiFen(endgameEntryFen(entry), entry.id);
    assert.ok(parsed.ok, `${entry.id}: ${parsed.ok ? '' : parsed.error}`);
  }
});

test('entry ids are unique', () => {
  const ids = XIANGQI_ENDGAME_CORPUS.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every entry has both generals and the side to move it declares', () => {
  for (const entry of XIANGQI_ENDGAME_CORPUS) {
    const state = endgameEntryState(entry);
    const generals = Object.values(state.board).filter((piece) => piece?.role === 'general');
    assert.equal(generals.length, 2, `${entry.id} should have exactly two generals`);
    assert.equal(state.status.type === 'playing' && state.status.turn, entry.turn);
  }
});

test('the engine FEN writes the side to move in the engine dialect', () => {
  const red = XIANGQI_ENDGAME_CORPUS.find((entry) => entry.turn === 'red');
  const black = XIANGQI_ENDGAME_CORPUS.find((entry) => entry.turn === 'black');
  assert.ok(red && black, 'corpus should cover both sides to move');
  assert.match(endgameEntryEngineFen(red), / w /);
  assert.match(endgameEntryEngineFen(black), / b /);
});
