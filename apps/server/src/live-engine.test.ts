import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameState, Move } from '@bichess/game';
import { chooseLiveEngineMove, type LiveEngineFallbackEvent } from './live-engine.js';
import type { EngineDefinition, EngineMoveContext } from './engine-registry.js';

const legalMove: Move = { from: 'e2', to: 'e4' };
const alternateLegalMove: Move = { from: 'd2', to: 'd4' };
const illegalMove: Move = { from: 'e2', to: 'e5' };

test('live engine move uses selected engine decision when legal', async () => {
  const engine = testEngine('selected', legalMove);
  const result = await chooseLiveEngineMove({
    context: context([legalMove]),
    engine,
  });

  assert.equal(result.engineId, 'selected');
  assert.equal(result.fallback, false);
  assert.deepEqual(result.decision.move, legalMove);
});

test('live engine move falls back when selected engine throws', async () => {
  const events: LiveEngineFallbackEvent[] = [];
  const result = await chooseLiveEngineMove({
    context: context([legalMove, alternateLegalMove]),
    engine: {
      ...testEngine('selected', legalMove),
      chooseMove() {
        throw new Error('engine crashed');
      },
    },
    onFallback: (event) => events.push(event),
  });

  assert.equal(result.engineId, 'builtin-random-legal');
  assert.equal(result.fallback, true);
  assert.ok([legalMove, alternateLegalMove].some((move) => sameMove(move, result.decision.move)));
  assert.equal(events.length, 1);
  assert.equal(events[0]?.engineId, 'selected');
  assert.equal(events[0]?.fallbackEngineId, 'builtin-random-legal');
  assert.equal(events[0]?.reason, 'internal_error');
  assert.equal(events[0]?.ply, 4);
});

test('live engine move falls back when selected engine returns illegal move', async () => {
  const events: LiveEngineFallbackEvent[] = [];
  const result = await chooseLiveEngineMove({
    context: context([legalMove]),
    engine: testEngine('selected', illegalMove),
    onFallback: (event) => events.push(event),
  });

  assert.equal(result.engineId, 'builtin-random-legal');
  assert.deepEqual(result.decision.move, legalMove);
  assert.equal(events[0]?.reason, 'illegal_move');
});

test('live engine fallback reports timeout budget', async () => {
  const events: LiveEngineFallbackEvent[] = [];
  const result = await chooseLiveEngineMove({
    context: context([legalMove]),
    engine: {
      ...testEngine('slow-selected', legalMove),
      livePolicy: { timeoutMs: 1 },
      chooseMove: (() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve({
            move: legalMove,
            scores: [{ move: legalMove, score: 1, reason: 'slow-test' }],
          }), 20);
        });
      }) as unknown as EngineDefinition['chooseMove'],
    },
    onFallback: (event) => events.push(event),
  });

  assert.equal(result.engineId, 'builtin-random-legal');
  assert.equal(result.fallback, true);
  assert.equal(events[0]?.reason, 'timeout');
  assert.equal(events[0]?.timeoutMs, 1);
});

test('live engine move respects disabled fallback policy', async () => {
  await assert.rejects(
    chooseLiveEngineMove({
      context: context([legalMove]),
      engine: {
        ...testEngine('selected', illegalMove),
        livePolicy: { fallbackEngineId: null },
      },
    }),
    /illegal move/,
  );
});

test('python live engine falls back when room event context is missing', async () => {
  const events: LiveEngineFallbackEvent[] = [];
  const result = await chooseLiveEngineMove({
    context: context([legalMove]),
    engine: {
      ...testEngine('python-selected', illegalMove),
      kind: 'container',
      config: { kind: 'python-subprocess' },
      chooseMove: undefined,
    },
    onFallback: (event) => events.push(event),
  });

  assert.equal(result.engineId, 'builtin-random-legal');
  assert.equal(result.fallback, true);
  assert.deepEqual(result.decision.move, legalMove);
  assert.equal(events[0]?.engineId, 'python-selected');
  assert.equal(events[0]?.reason, 'unsupported_engine');
});

function testEngine(id: string, move: Move): EngineDefinition {
  return {
    id,
    engineId: id,
    engineName: id,
    name: id,
    kind: 'builtin',
    configHash: id,
    playSignature: id,
    config: { kind: 'builtin' },
    chooseMove() {
      return {
        move,
        scores: [{ move, score: 1, reason: 'test' }],
      };
    },
  };
}

function context(legalMoves: Move[]): EngineMoveContext {
  return {
    color: 'black',
    legalMoves,
    ply: 4,
    seed: 1n,
    state: {} as GameState,
  };
}

function sameMove(left: Move, right: Move): boolean {
  return left.from === right.from && left.to === right.to && (left.promotion ?? null) === (right.promotion ?? null);
}
