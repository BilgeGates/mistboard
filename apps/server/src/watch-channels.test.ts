import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CROSSROADS_CHESS_SPEC_ID,
  DARK_CHESS_SPEC_ID,
  DARK_DRAFT960_SPEC_ID,
  JIEQI_SPEC_ID,
} from '@mistboard/game';
// Watch channels (other than the hardcoded dark-chess default) derive from the
// variant-tenant registry, so the registrations must be populated for the
// derived channels to appear. This side-effect import registers every tenant.
import './variant-tenant/register-tenants.js';
import { defaultWatchChannel, listWatchChannels, watchChannelForId } from './watch-channels.js';

test('watch channels expose Dark chess as the default channel', () => {
  const channel = defaultWatchChannel();
  assert.equal(channel.id, 'dark-chess');
  assert.equal(channel.label, 'Dark chess');
  assert.deepEqual(channel.gameSpecIds, [DARK_CHESS_SPEC_ID, DARK_DRAFT960_SPEC_ID]);
  assert.deepEqual(channel.legacyVariants, ['dark-chess', 'draft960']);
});

test('watch channel lookup defaults empty input and rejects unknown channels', () => {
  assert.equal(watchChannelForId(null)?.id, 'dark-chess');
  assert.equal(watchChannelForId(undefined)?.id, 'dark-chess');
  assert.equal(watchChannelForId('dark-chess')?.id, 'dark-chess');
  assert.equal(watchChannelForId('crossroads-chess'), null);
  assert.equal(watchChannelForId('dark-xiangqi'), null);
  assert.equal(watchChannelForId('dark-shogi'), null);
});

test('watch channels expose Crossroads Chess behind its live-room flag', () => {
  process.env.MISTBOARD_CROSSROADS_CHESS_ENABLED = 'true';
  try {
    const channel = watchChannelForId('crossroads-chess');
    assert.equal(channel?.id, 'crossroads-chess');
    assert.equal(channel?.label, 'Crossroads Chess');
    assert.deepEqual(channel?.gameSpecIds, [CROSSROADS_CHESS_SPEC_ID]);
    assert.deepEqual(channel?.legacyVariants, ['crossroads-chess', 'dual-chess']);
    assert.deepEqual(
      listWatchChannels().map((entry) => entry.id),
      ['dark-chess', 'crossroads-chess'],
    );
  } finally {
    delete process.env.MISTBOARD_CROSSROADS_CHESS_ENABLED;
  }
});

test('watch channel list is immutable by convention', () => {
  assert.deepEqual(
    listWatchChannels().map((channel) => channel.id),
    ['dark-chess'],
  );
});

test('Jieqi watch channel is absent while the jieqi flag is off', () => {
  assert.equal(watchChannelForId('jieqi'), null);
  assert.equal(
    listWatchChannels().some((channel) => channel.id === 'jieqi'),
    false,
  );
});

test('watch channels expose Jieqi behind its live-room flag', () => {
  process.env.MISTBOARD_JIEQI_ENABLED = 'true';
  try {
    const channel = watchChannelForId('jieqi');
    assert.equal(channel?.id, 'jieqi');
    assert.equal(channel?.label, 'Jieqi');
    assert.equal(channel?.family, 'xiangqi');
    assert.equal(channel?.default, false);
    assert.deepEqual(channel?.gameSpecIds, [JIEQI_SPEC_ID]);
    assert.deepEqual(channel?.legacyVariants, ['jieqi']);
    // Dark chess stays the default and leads the rail; jieqi follows it.
    const channels = listWatchChannels();
    assert.equal(channels[0]?.id, 'dark-chess');
    assert.equal(defaultWatchChannel().id, 'dark-chess');
    assert.deepEqual(
      channels.map((entry) => entry.id),
      ['dark-chess', 'jieqi'],
    );
  } finally {
    delete process.env.MISTBOARD_JIEQI_ENABLED;
  }
});
