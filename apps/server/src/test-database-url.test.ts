import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertSafePersistentTestDatabaseUrl,
  testDatabaseUrlFromEnv,
} from './test-database-url.js';

test('testDatabaseUrlFromEnv defaults to TEST_DATABASE_URL over DATABASE_URL', () => {
  assert.equal(
    testDatabaseUrlFromEnv({
      TEST_DATABASE_URL: 'postgres://mistboard:mistboard@localhost:5435/mistboard_test',
      DATABASE_URL: 'postgres://mistboard:mistboard@localhost:5435/mistboard',
    }),
    'postgres://mistboard:mistboard@localhost:5435/mistboard_test',
  );
});

test('persistent tests refuse the default local dev database', () => {
  assert.throws(
    () =>
      assertSafePersistentTestDatabaseUrl(
        'postgres://mistboard:mistboard@localhost:5435/mistboard',
      ),
    /Refusing to run persistent tests/,
  );
});

test('persistent tests can explicitly override the local dev database guard', () => {
  assert.doesNotThrow(() =>
    assertSafePersistentTestDatabaseUrl('postgres://mistboard:mistboard@localhost:5435/mistboard', {
      MISTBOARD_ALLOW_DEV_DB_TESTS: '1',
    }),
  );
});

test('persistent tests allow CI and local test databases', () => {
  assert.doesNotThrow(() =>
    assertSafePersistentTestDatabaseUrl('postgres://bichess:bichess@localhost:5432/bichess'),
  );
  assert.doesNotThrow(() =>
    assertSafePersistentTestDatabaseUrl(
      'postgres://mistboard:mistboard@localhost:5435/mistboard_test',
    ),
  );
});
