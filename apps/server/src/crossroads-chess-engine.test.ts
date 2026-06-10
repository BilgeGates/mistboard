import assert from 'node:assert/strict';
import test from 'node:test';
import { crossroadsChessEngineMove, fairyStockfishPath } from './crossroads-chess-engine.js';

const UCI = /^[a-f][1-8][a-f][1-8]q?$/;

const fsfAvailable = (() => {
  try {
    fairyStockfishPath();
    return true;
  } catch {
    return false;
  }
})();

// Integration test: actually drives Fairy-Stockfish. Skipped wherever the binary
// is not installed (e.g. CI) — gated, never failing for a missing dependency.
test('Fairy-Stockfish returns a legal-shaped move from the Crossroads Chess start position', {
  skip: fsfAvailable ? false : 'Fairy-Stockfish binary not installed',
}, async () => {
  const move = await crossroadsChessEngineMove([], { movetimeMs: 200 });
  assert.ok(move, 'expected a move from the start position');
  assert.match(move ?? '', UCI);
});

test('Fairy-Stockfish replies after a move history', {
  skip: fsfAvailable ? false : 'Fairy-Stockfish binary not installed',
}, async () => {
  const move = await crossroadsChessEngineMove(['d2d3'], { movetimeMs: 200, skill: 3 });
  assert.ok(move, 'expected a reply move');
  assert.match(move ?? '', UCI);
});
