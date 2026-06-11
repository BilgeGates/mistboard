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

test('Fairy-Stockfish full strength sees the one-ply race defense', {
  skip: fsfAvailable ? false : 'Fairy-Stockfish binary not installed',
}, async () => {
  const history = [
    'e2e3',
    'e7e6',
    'f1c4',
    'b7b6',
    'd2d4',
    'd7d6',
    'd1c3',
    'f7f6',
    'b2b3',
    'f6f5',
    'b3b4',
    'f5f4',
    'c4d3',
    'f4f3',
    'b4b5',
    'a8b7',
    'e1d2',
    'f3f2',
    'b1b3',
    'f8f3',
    'b5b6',
    'c7b6',
    'd3a6',
    'd8c6',
    'a2a3',
    'f3e3',
    'b3e3',
    'e8e3',
    'a6b7',
    'b8b7',
    'd2e3',
    'c8e7',
    'e3e4',
    'b7c7',
    'c3b5',
    'c7d7',
    'b5a7',
    'c6d4',
    'e4d4',
    'd6d5',
    'd4d3',
    'd7d6',
    'a1a2',
    'e6e5',
    'a2b2',
    'e5e4',
    'a7b5',
    'd6e5',
    'b5c3',
    'd5d4',
    'd3d2',
    'd4c4',
    'c3b5',
    'e7d5',
    'a3a4',
    'e4e3',
    'c2c3',
    'c4c3',
    'b5c3',
    'd5c3',
    'd2c3',
    'e5e4',
    'b2f2',
    'e3f3',
    'f2d2',
    'f3e3',
    'c3b4',
    'e4f3',
    'd2d4',
    'f3f2',
  ];
  const move = await crossroadsChessEngineMove(history, {
    movetimeMs: 100,
    skill: 20,
  });
  assert.equal(move, 'd4d1');
});
