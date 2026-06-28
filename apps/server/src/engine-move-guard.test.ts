import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEngineDecisionRecord,
  type EngineMoveAttempt,
  resolveValidatedEngineMove,
} from './engine-move-guard.js';

// matchUci treats the legal list as the source of truth (mirrors every engine).
const matchUci = (legal: readonly string[], uci: string): string | null =>
  legal.includes(uci) ? uci : null;

test('resolveValidatedEngineMove returns the move on first-attempt success', async () => {
  const r = await resolveValidatedEngineMove<string>({
    maxAttempts: 2,
    engineId: 'e',
    history: [],
    movetimeMs: 100,
    moveProvider: async () => 'a1a2',
    stillOnTurn: () => true,
    legalMovesNow: () => ['a1a2', 'b1b2'],
    matchUci,
    onReject: () => {},
  });
  assert.equal(r.chosen, 'a1a2');
  assert.equal(r.attempts.length, 1);
  assert.equal(r.aborted, false);
});

test('resolveValidatedEngineMove retries a rejected output then succeeds', async () => {
  let call = 0;
  const rejects: string[] = [];
  const r = await resolveValidatedEngineMove<string>({
    maxAttempts: 2,
    engineId: 'e',
    history: [],
    movetimeMs: 100,
    moveProvider: async () => (call++ === 0 ? 'zz9z' : 'a1a2'), // illegal, then legal
    stillOnTurn: () => true,
    legalMovesNow: () => ['a1a2'],
    matchUci,
    onReject: ({ reason }) => rejects.push(reason),
  });
  assert.equal(r.chosen, 'a1a2');
  assert.equal(r.attempts.length, 2);
  assert.deepEqual(rejects, ['illegal-move']);
});

test('resolveValidatedEngineMove returns null after exhausting retries (fail closed)', async () => {
  const r = await resolveValidatedEngineMove<string>({
    maxAttempts: 2,
    engineId: 'e',
    history: ['a1a2'],
    movetimeMs: 100,
    moveProvider: async () => 'zz9z', // always illegal
    stillOnTurn: () => true,
    legalMovesNow: () => ['a1a2'],
    matchUci,
    onReject: () => {},
  });
  assert.equal(r.chosen, null);
  assert.equal(r.attempts.length, 2);
  assert.equal(
    r.attempts.every((a) => a.reason === 'illegal-move'),
    true,
  );
});

test('resolveValidatedEngineMove classifies a thrown provider as request-failed', async () => {
  const r = await resolveValidatedEngineMove<string>({
    maxAttempts: 1,
    engineId: 'e',
    history: [],
    movetimeMs: 100,
    moveProvider: async () => {
      throw new Error('fsf crashed');
    },
    stillOnTurn: () => true,
    legalMovesNow: () => ['a1a2'],
    matchUci,
    onReject: () => {},
  });
  assert.equal(r.chosen, null);
  assert.equal(r.attempts[0]?.reason, 'request-failed');
  assert.equal(r.attempts[0]?.error, 'fsf crashed');
});

test('resolveValidatedEngineMove aborts without calling the provider when off-turn', async () => {
  let calls = 0;
  const r = await resolveValidatedEngineMove<string>({
    maxAttempts: 2,
    engineId: 'e',
    history: [],
    movetimeMs: 100,
    moveProvider: async () => {
      calls += 1;
      return 'a1a2';
    },
    stillOnTurn: () => false,
    legalMovesNow: () => ['a1a2'],
    matchUci,
    onReject: () => {},
  });
  assert.equal(r.aborted, true);
  assert.equal(r.chosen, null);
  assert.equal(calls, 0);
});

test('buildEngineDecisionRecord captures a complete, replayable record', () => {
  const attempts: EngineMoveAttempt[] = [
    { attempt: 1, uci: 'zz9z', error: null, reason: 'illegal-move' },
    { attempt: 2, uci: null, error: 'timeout', reason: 'request-failed' },
  ];
  const rec = buildEngineDecisionRecord({
    variant: 'mini-xiangqi',
    roomId: 'room1',
    engineId: 'eng1',
    engineVersion: '0.1.0',
    movetimeMs: 800,
    tier: { skill: 8, nodes: 60000, movetimeMs: 800 },
    ply: 1,
    toMove: 'black',
    inCheck: false,
    history: ['a1a2'],
    legalUci: ['b1b2', 'c1c2'],
    attempts,
  });
  assert.equal(rec.variant, 'mini-xiangqi');
  assert.equal(rec.history, 'a1a2');
  assert.equal(rec.legal_moves, 'b1b2 c1c2');
  assert.equal(rec.legal_count, 2);
  assert.equal(rec.attempts, 2);
  assert.equal(rec.reject_reason, 'request-failed');
  assert.equal(rec.last_output, 'timeout');
  assert.equal(rec.tier_skill, 8);
  assert.ok(rec.attempts_detail.includes('1:zz9z:illegal-move'));
});
