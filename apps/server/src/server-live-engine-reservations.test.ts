import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalLiveEngineVersionId,
  pveEngineSeatForProjection,
} from './server-live-engine-reservations.js';
import { gameProjectionFixture } from './test-builders.js';

test('canonicalLiveEngineVersionId keeps the legacy random-engine alias stable', () => {
  assert.equal(canonicalLiveEngineVersionId('random-engine'), 'builtin-random-legal');
  assert.equal(canonicalLiveEngineVersionId('python-tier1-v0.9.5'), 'python-tier1-v0.9.5');
});

test('pveEngineSeatForProjection identifies the single live engine seat', () => {
  assert.deepEqual(
    pveEngineSeatForProjection(
      gameProjectionFixture({
        seats: { white: 'human-client', black: 'python-tier1-v0.9.5' },
      }),
    ),
    { clientId: 'python-tier1-v0.9.5', color: 'black' },
  );
  assert.deepEqual(
    pveEngineSeatForProjection(
      gameProjectionFixture({
        seats: { white: 'builtin-random-legal', black: 'human-client' },
      }),
    ),
    { clientId: 'builtin-random-legal', color: 'white' },
  );
});

test('pveEngineSeatForProjection ignores PvP and EvE projections', () => {
  assert.equal(
    pveEngineSeatForProjection(
      gameProjectionFixture({
        seats: { white: 'white-client', black: 'black-client' },
      }),
    ),
    null,
  );
  assert.equal(
    pveEngineSeatForProjection(
      gameProjectionFixture({
        seats: { white: 'builtin-random-legal', black: 'python-tier1-v0.9.5' },
      }),
    ),
    null,
  );
});
