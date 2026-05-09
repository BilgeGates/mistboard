import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameState } from '@bichess/game';
import { engineThinkTimeMs } from './engines/think-time.js';
import type { EngineMoveContext } from './engines/types.js';

const baseContext: EngineMoveContext = {
  baseThinkTimeMs: 650,
  clockRemainingMs: undefined,
  color: 'black',
  incrementMs: 2_000,
  legalMoves: [
    { from: 'e7', to: 'e5' },
    { from: 'd7', to: 'd5' },
  ],
  ply: 12,
  seed: 1n,
  state: { board: {}, status: { type: 'playing', turn: 'black' } } as GameState,
};

test('engine think time varies by seeded move context', () => {
  const first = engineThinkTimeMs({ context: baseContext, runtime: 'in-process' });
  const second = engineThinkTimeMs({ context: { ...baseContext, seed: 2n }, runtime: 'in-process' });

  assert.notEqual(first, second);
});

test('engine think time spends longer on more complex tactical positions', () => {
  const quiet = engineThinkTimeMs({
    context: {
      ...baseContext,
      legalMoves: baseContext.legalMoves.slice(0, 1),
      seed: 293n,
    },
    runtime: 'in-process',
  });
  const tactical = engineThinkTimeMs({
    captureMoveCount: 6,
    context: {
      ...baseContext,
      legalMoves: Array.from({ length: 32 }, (_, index) => ({
        from: 'e7',
        to: index % 2 === 0 ? 'e5' : 'd5',
      })),
      seed: 293n,
    },
    runtime: 'in-process',
  });

  assert.ok(tactical > quiet);
});

test('engine think time shrinks under time pressure', () => {
  const comfortable = engineThinkTimeMs({
    context: { ...baseContext, clockRemainingMs: 30_000 },
    runtime: 'in-process',
  });
  const pressured = engineThinkTimeMs({
    context: { ...baseContext, clockRemainingMs: 900 },
    runtime: 'in-process',
  });

  assert.ok(pressured < comfortable);
  assert.ok(pressured <= 650);
});

test('engine think time leaves room for subprocess engines to spend compute time', () => {
  const inProcess = engineThinkTimeMs({ context: baseContext, runtime: 'in-process' });
  const subprocess = engineThinkTimeMs({ context: baseContext, runtime: 'subprocess' });

  assert.ok(subprocess < inProcess);
});
