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

const BASELINE_WATCH_CHANNELS = [
  'dark-chess',
  MINI_XIANGQI_SPEC_ID,
  DROP_MINI_XIANGQI_SPEC_ID,
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
  for (const id of BASELINE_WATCH_CHANNELS.slice(1)) {
    assert.equal(watchChannelForId(id)?.id, id);
  }
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
  assert.deepEqual(watchChannelForId(MINI_XIANGQI_SPEC_ID), {
    default: false,
    family: 'xiangqi',
    gameSpecIds: [MINI_XIANGQI_SPEC_ID],
    id: MINI_XIANGQI_SPEC_ID,
    label: 'Mini Xiangqi',
    legacyVariants: ['mini-xiangqi'],
  });
  assert.deepEqual(watchChannelForId(DROP_MINI_XIANGQI_SPEC_ID), {
    default: false,
    family: 'xiangqi',
    gameSpecIds: [DROP_MINI_XIANGQI_SPEC_ID],
    id: DROP_MINI_XIANGQI_SPEC_ID,
    label: 'Drop Mini Xiangqi',
    legacyVariants: ['drop-mini-xiangqi'],
  });
});
