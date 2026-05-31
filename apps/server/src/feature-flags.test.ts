import assert from 'node:assert/strict';
import test from 'node:test';
import { darkMiniXiangqiEnabled, darkXiangqiEnabled, ratedEnabled } from './feature-flags.js';

const ratedKey = 'MISTBOARD_RATED_ENABLED';
const darkXiangqiKey = 'MISTBOARD_DARK_XIANGQI_ENABLED';
const darkMiniXiangqiKey = 'MISTBOARD_DARK_MINI_XIANGQI_ENABLED';

test('feature flags default off', () => {
  const beforeRated = process.env[ratedKey];
  const beforeDarkXiangqi = process.env[darkXiangqiKey];
  const beforeDarkMiniXiangqi = process.env[darkMiniXiangqiKey];
  delete process.env[ratedKey];
  delete process.env[darkXiangqiKey];
  delete process.env[darkMiniXiangqiKey];
  try {
    assert.equal(ratedEnabled(), false);
    assert.equal(darkXiangqiEnabled(), false);
    assert.equal(darkMiniXiangqiEnabled(), false);
  } finally {
    restoreEnv(ratedKey, beforeRated);
    restoreEnv(darkXiangqiKey, beforeDarkXiangqi);
    restoreEnv(darkMiniXiangqiKey, beforeDarkMiniXiangqi);
  }
});

test('feature flags require the exact true string', () => {
  const beforeRated = process.env[ratedKey];
  const beforeDarkXiangqi = process.env[darkXiangqiKey];
  const beforeDarkMiniXiangqi = process.env[darkMiniXiangqiKey];
  try {
    process.env[ratedKey] = 'true';
    process.env[darkXiangqiKey] = 'true';
    process.env[darkMiniXiangqiKey] = 'true';
    assert.equal(ratedEnabled(), true);
    assert.equal(darkXiangqiEnabled(), true);
    assert.equal(darkMiniXiangqiEnabled(), true);

    process.env[ratedKey] = '1';
    process.env[darkXiangqiKey] = 'yes';
    process.env[darkMiniXiangqiKey] = 'on';
    assert.equal(ratedEnabled(), false);
    assert.equal(darkXiangqiEnabled(), false);
    assert.equal(darkMiniXiangqiEnabled(), false);
  } finally {
    restoreEnv(ratedKey, beforeRated);
    restoreEnv(darkXiangqiKey, beforeDarkXiangqi);
    restoreEnv(darkMiniXiangqiKey, beforeDarkMiniXiangqi);
  }
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
