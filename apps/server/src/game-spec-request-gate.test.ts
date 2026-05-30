import assert from 'node:assert/strict';
import test from 'node:test';
import { gateGameSpecRequest } from './game-spec-request-gate.js';

const darkXiangqiKey = 'MISTBOARD_DARK_XIANGQI_ENABLED';
const darkMiniXiangqiKey = 'MISTBOARD_DARK_MINI_XIANGQI_ENABLED';

test('game spec gate passes current chess requests', () => {
  assert.deepEqual(gateGameSpecRequest({ variant: 'dark-chess' }), { type: 'pass' });
  assert.deepEqual(gateGameSpecRequest({ gameSpecId: 'dark-draft960' }), { type: 'pass' });
  assert.deepEqual(gateGameSpecRequest({}), { type: 'pass' });
});

test('game spec gate hides Dark Xiangqi while the flag is off', () => {
  const before = process.env[darkXiangqiKey];
  delete process.env[darkXiangqiKey];
  try {
    assert.deepEqual(gateGameSpecRequest({ variant: 'dark-xiangqi' }), {
      type: 'reject',
      error: 'dark_xiangqi_disabled',
      httpStatus: 404,
      wsCloseReason: 'game spec disabled',
    });
    assert.deepEqual(gateGameSpecRequest({ gameSpecId: 'dark-xiangqi' }), {
      type: 'reject',
      error: 'dark_xiangqi_disabled',
      httpStatus: 404,
      wsCloseReason: 'game spec disabled',
    });
  } finally {
    restoreEnv(darkXiangqiKey, before);
  }
});

test('game spec gate hides Dark Mini Xiangqi while the flag is off', () => {
  const before = process.env[darkMiniXiangqiKey];
  delete process.env[darkMiniXiangqiKey];
  try {
    assert.deepEqual(gateGameSpecRequest({ variant: 'dark-mini-xiangqi' }), {
      type: 'reject',
      error: 'dark_mini_xiangqi_disabled',
      httpStatus: 404,
      wsCloseReason: 'game spec disabled',
    });
    assert.deepEqual(gateGameSpecRequest({ gameSpecId: 'dark-mini-xiangqi' }), {
      type: 'reject',
      error: 'dark_mini_xiangqi_disabled',
      httpStatus: 404,
      wsCloseReason: 'game spec disabled',
    });
  } finally {
    restoreEnv(darkMiniXiangqiKey, before);
  }
});

test('game spec gate does not fall through to chess before Dark Xiangqi runtime exists', () => {
  const before = process.env[darkXiangqiKey];
  process.env[darkXiangqiKey] = 'true';
  try {
    assert.deepEqual(gateGameSpecRequest({ variant: 'dark-xiangqi' }), {
      type: 'reject',
      error: 'dark_xiangqi_not_integrated',
      httpStatus: 501,
      wsCloseReason: 'game spec not integrated',
    });
  } finally {
    restoreEnv(darkXiangqiKey, before);
  }
});

test('game spec gate does not fall through to chess before Dark Mini Xiangqi runtime exists', () => {
  const before = process.env[darkMiniXiangqiKey];
  process.env[darkMiniXiangqiKey] = 'true';
  try {
    assert.deepEqual(gateGameSpecRequest({ variant: 'dark-mini-xiangqi' }), {
      type: 'reject',
      error: 'dark_mini_xiangqi_not_integrated',
      httpStatus: 501,
      wsCloseReason: 'game spec not integrated',
    });
  } finally {
    restoreEnv(darkMiniXiangqiKey, before);
  }
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
