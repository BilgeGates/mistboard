import assert from 'node:assert/strict';
import test from 'node:test';
import { gateGameSpecRequest } from './game-spec-request-gate.js';

test('game spec gate passes current chess requests', () => {
  assert.deepEqual(gateGameSpecRequest({ variant: 'dark-chess' }), { type: 'pass' });
  assert.deepEqual(gateGameSpecRequest({ gameSpecId: 'dark-draft960' }), { type: 'pass' });
  assert.deepEqual(gateGameSpecRequest({}), { type: 'pass' });
});

test('game spec gate treats legacy Dark Xiangqi variant requests as disabled by default', () => {
  withFlag('MISTBOARD_DARK_XIANGQI_ENABLED', false, () => {
    assert.deepEqual(gateGameSpecRequest({ variant: 'dark-xiangqi' }), {
      type: 'reject',
      error: 'dark_xiangqi_disabled',
      httpStatus: 404,
      wsCloseReason: 'game spec disabled',
    });
  });
});

test('game spec gate lets canonical Mini Xiangqi route to its tenant', () => {
  assert.deepEqual(gateGameSpecRequest({ gameSpecId: 'mini-xiangqi' }), { type: 'pass' });
});

test('game spec gate keeps legacy Mini Xiangqi variant requests out of chess', () => {
  assert.deepEqual(gateGameSpecRequest({ variant: 'mini-xiangqi' }), {
    type: 'reject',
    error: 'mini_xiangqi_not_integrated',
    httpStatus: 501,
    wsCloseReason: 'game spec not integrated',
  });
});

test('game spec gate treats legacy Dark Mini Xiangqi variant requests as disabled by default', () => {
  withFlag('MISTBOARD_DARK_MINI_XIANGQI_ENABLED', false, () => {
    assert.deepEqual(gateGameSpecRequest({ variant: 'dark-mini-xiangqi' }), {
      type: 'reject',
      error: 'dark_mini_xiangqi_disabled',
      httpStatus: 404,
      wsCloseReason: 'game spec disabled',
    });
  });
});

function withFlag(name: string, enabled: boolean, fn: () => void): void {
  const before = process.env[name];
  if (enabled) process.env[name] = 'true';
  else delete process.env[name];
  try {
    fn();
  } finally {
    if (before === undefined) delete process.env[name];
    else process.env[name] = before;
  }
}
