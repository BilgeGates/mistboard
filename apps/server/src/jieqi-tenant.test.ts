/**
 * Jieqi tenant: deal-randomness primitive + hidden-information contract.
 *
 * The deal is a server secret. These pins prove it is minted at creation,
 * persisted in the room-created event for replay, stripped before any client
 * sees the event, and never leaked through the masked view — and that the
 * additive `setup` field leaves setup-free tenants byte-identical.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { darkMiniXiangqiTenant } from './dark-mini-xiangqi-tenant.js';
import { getJieqiClientView, jieqiClientEventFor, jieqiTenant } from './jieqi-tenant.js';
import { createTenantRuntimeRoom, replayTenantEvents } from './variant-tenant/runtime.js';

process.env.MISTBOARD_JIEQI_ENABLED = 'true';
process.env.MISTBOARD_DARK_MINI_XIANGQI_ENABLED = 'true';

test('jieqi room creation mints and persists a server-secret deal', () => {
  const created = createTenantRuntimeRoom(jieqiTenant, 'jq_deal', { now: 1 });
  if (!created.ok) throw new Error(created.error);

  const event = created.room.events[0];
  if (event.type !== 'room-created') throw new Error('expected room-created first');
  const setup = event.setup as { red: string[]; black: string[] } | undefined;
  assert.ok(setup, 'room-created carries the deal');
  assert.equal(setup.red.length, 15);
  assert.equal(setup.black.length, 15);
});

test('the deal is stripped from room-created before any client sees it', () => {
  const created = createTenantRuntimeRoom(jieqiTenant, 'jq_redact', { now: 1 });
  if (!created.ok) throw new Error(created.error);
  const event = created.room.events[0];
  if (event.type !== 'room-created') throw new Error('expected room-created first');

  for (const seat of ['red', 'black'] as const) {
    const clientEvent = jieqiClientEventFor(event, seat, 0);
    assert.ok(clientEvent, `the seat ${seat} still receives room-created`);
    assert.equal(clientEvent.type, 'room-created');
    assert.ok(!('setup' in clientEvent), `no deal leaks to ${seat}`);
  }
  // /room/ never reveals: spectators receive no events.
  assert.equal(jieqiClientEventFor(event, 'spectator', 0), null);
});

test('replay reconstructs the same deal from the persisted setup', () => {
  const created = createTenantRuntimeRoom(jieqiTenant, 'jq_replay', { now: 1 });
  if (!created.ok) throw new Error(created.error);

  const replayed = replayTenantEvents(jieqiTenant, created.room.events);
  assert.deepEqual(replayed.state.board, created.room.projection.state.board);
  assert.equal(Object.keys(replayed.state.board).length, 32);
});

test('the client view masks every face-down identity', () => {
  const created = createTenantRuntimeRoom(jieqiTenant, 'jq_view', { now: 1 });
  if (!created.ok) throw new Error(created.error);
  const state = created.room.projection.state;

  const view = getJieqiClientView(state, { id: 'c', seat: 'red', solo: false });
  // Only the two generals are face-up at the start; everything else is masked.
  const revealed = Object.values(view.board).filter((entry) => entry && !entry.faceDown);
  assert.equal(revealed.length, 2);
  const a1 = view.board.a1;
  assert.ok(a1 && a1.faceDown === true);
  assert.ok(!('role' in a1), 'a masked entry carries no role');

  const spectator = getJieqiClientView(state, { id: 's', seat: 'spectator', solo: false });
  assert.equal(Object.keys(spectator.board).length, 0);
});

test('tenants without createSetup still emit a setup-free room-created', () => {
  const created = createTenantRuntimeRoom(darkMiniXiangqiTenant, 'dmxq_x', { now: 1 });
  if (!created.ok) throw new Error(created.error);
  const event = created.room.events[0];
  if (event.type !== 'room-created') throw new Error('expected room-created first');
  assert.ok(!('setup' in event), 'additive setup field does not touch other tenants');
});
