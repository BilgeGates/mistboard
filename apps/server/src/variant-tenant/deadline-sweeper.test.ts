import assert from 'node:assert/strict';
import test from 'node:test';
import { startTenantDeadlineSweeper } from './deadline-sweeper.js';
import type { VariantTenantRegistration } from './registry.js';

// Tick routing only — enforcement semantics are pinned in deadline.test.ts,
// and the registry lookup itself in registry.test.ts. Dependencies are
// injected so no process-global registration leaks into other suites.

function registrationStub(
  swept: string[],
  options: { failFor?: string } = {},
): VariantTenantRegistration {
  return {
    kind: 'sweeper-test-tenant',
    gameSpecId: 'sweeper-test-tenant',
    roomIdPrefix: 'sweeptest_',
    errorPrefix: 'sweeper_test_tenant',
    enabled: () => true,
    rooms: new Map(),
    activeGameCount: () => 0,
    getOrLoadRoom: async () => null,
    attachWebSocket: async () => {
      throw new Error('unexpected ws attach in sweeper test');
    },
    clearRuntimeTimers: () => {},
    clearRooms: () => {},
    http: {
      matchesCreateRequest: () => false,
      handleCreate: async () => {
        throw new Error('unexpected http create in sweeper test');
      },
    },
    lobby: null,
    sweepDueDeadline: async (roomId) => {
      if (roomId === options.failFor) throw new Error(`sweep failed for ${roomId}`);
      swept.push(roomId);
    },
  };
}

test('the sweeper routes due rows to their registration and survives failures', async () => {
  const swept: string[] = [];
  const registration = registrationStub(swept, { failFor: 'sweeptest_boom' });
  const sweeper = startTenantDeadlineSweeper({
    intervalMs: 3_600_000,
    isPersistenceInitialized: () => true,
    listDue: async () => [
      { roomId: 'sweeptest_a', gameSpecId: 'sweeper-test-tenant' },
      { roomId: 'sweeptest_boom', gameSpecId: 'sweeper-test-tenant' },
      { roomId: 'orphan_room', gameSpecId: 'gone-tenant' },
      { roomId: 'sweeptest_b', gameSpecId: 'sweeper-test-tenant' },
    ],
    registrationFor: (roomId) => (roomId.startsWith('sweeptest_') ? registration : null),
  });
  try {
    await sweeper.tick();
  } finally {
    sweeper.stop();
  }

  // The failing room and the orphan row are logged and skipped; every other
  // due row is still swept in order.
  assert.deepEqual(swept, ['sweeptest_a', 'sweeptest_b']);
});

test('the sweeper does nothing while persistence is uninitialized', async () => {
  let listed = 0;
  const sweeper = startTenantDeadlineSweeper({
    intervalMs: 3_600_000,
    isPersistenceInitialized: () => false,
    listDue: async () => {
      listed += 1;
      return [];
    },
    registrationFor: () => null,
  });
  try {
    await sweeper.tick();
  } finally {
    sweeper.stop();
  }

  assert.equal(listed, 0);
});
