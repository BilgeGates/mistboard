import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clockStartedEvent,
  normalizeEngineTimeControl,
  parseEngineTimeControl,
  roomTimeControlFromEngine,
  timeControlBucket,
  timeoutResult,
} from './engine-time-policy.js';

test('parses engine tournament time controls', () => {
  assert.deepEqual(parseEngineTimeControl('none'), { kind: 'none' });
  assert.deepEqual(parseEngineTimeControl('10+2'), {
    kind: 'standard',
    initial_seconds: 10,
    increment_seconds: 2,
  });
  assert.deepEqual(parseEngineTimeControl('standard'), {
    kind: 'standard',
    initial_seconds: 180,
    increment_seconds: 2,
  });
  assert.deepEqual(parseEngineTimeControl('5'), {
    kind: 'standard',
    initial_seconds: 5,
    increment_seconds: 0,
  });
});

test('normalizes database time control shapes', () => {
  assert.deepEqual(normalizeEngineTimeControl({ kind: 'standard', initialSeconds: '3', incrementSeconds: '0.5' }), {
    kind: 'standard',
    initial_seconds: 3,
    increment_seconds: 0.5,
  });
  assert.deepEqual(normalizeEngineTimeControl({ kind: 'per-move', milliseconds: 100 }), { kind: 'none' });
});

test('converts engine time control into room clock events', () => {
  const tc = parseEngineTimeControl('30+2');
  assert.deepEqual(roomTimeControlFromEngine(tc), { initialMs: 30_000, incrementMs: 2_000 });

  const event = clockStartedEvent('room', 10, tc);
  assert.equal(event?.type, 'clock-started');
  assert.equal(event?.clock.remainingMs.white, 30_000);
  assert.equal(event?.clock.incrementMs, 2_000);
});

test('timeout result awards the opponent', () => {
  assert.equal(timeoutResult('white'), 'black-wins');
  assert.equal(timeoutResult('black'), 'white-wins');
});

test('builds stable time control buckets', () => {
  assert.equal(timeControlBucket(parseEngineTimeControl('standard')), 'tc-180+2');
  assert.equal(timeControlBucket(parseEngineTimeControl('10+0.5')), 'tc-10+0p5');
  assert.equal(timeControlBucket(parseEngineTimeControl('none')), 'untimed');
});
