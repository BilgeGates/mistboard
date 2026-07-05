import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DARK_CHESS_SPEC_ID,
  DARK_DRAFT960_SPEC_ID,
  DROP_MINI_XIANGQI_SPEC_ID,
  MINI_XIANGQI_SPEC_ID,
} from '@mistboard/game';
// Watch channels (other than the hardcoded dark-chess default) derive from the
// variant-tenant registry, so the registrations must be populated for the
// derived channels to appear. This side-effect import registers every tenant.
import './variant-tenant/register-tenants.js';
import { defaultWatchChannel, listWatchChannels, watchChannelForId } from './watch-channels.js';

// The Mini Xiangqi sub-family (open, dark, drop) was retired from Mistboard TV
// on 2026-07-05 (xiangqi pivot): their registrations carry `watch: null`, so no
// channel derives for them and their `?channel=` ids resolve to null. Dark chess
// is the only baseline channel in a launched-flags-off environment.
const BASELINE_WATCH_CHANNELS = ['dark-chess'] as const;

// Retired sub-family ids that must NOT resolve to a watch channel.
const RETIRED_WATCH_CHANNEL_IDS = [
  MINI_XIANGQI_SPEC_ID,
  DROP_MINI_XIANGQI_SPEC_ID,
  'dark-mini-xiangqi',
] as const;

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
  assert.equal(watchChannelForId('unknown'), null);
});

test('watch channel list is immutable by convention', () => {
  assert.deepEqual(
    listWatchChannels().map((channel) => channel.id),
    BASELINE_WATCH_CHANNELS,
  );
});

test('watch channels expose every launched baseline variant in canonical order', () => {
  const channels = listWatchChannels();
  assert.deepEqual(
    channels.map((entry) => entry.id),
    BASELINE_WATCH_CHANNELS,
  );
  assert.equal(channels[0]?.id, 'dark-chess');
  assert.equal(defaultWatchChannel().id, 'dark-chess');
});

test('retired Mini Xiangqi sub-family has no watch channel', () => {
  const ids = listWatchChannels().map((channel) => channel.id);
  for (const id of RETIRED_WATCH_CHANNEL_IDS) {
    assert.equal(ids.includes(id), false, `${id} must not appear in the watch rail`);
    assert.equal(watchChannelForId(id), null, `${id} must not resolve by deep link`);
  }
});
