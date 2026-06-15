/**
 * Banqi tenant: deal-randomness primitive + hidden-information contract.
 *
 * The deal is a server secret. These pins prove it is minted at creation,
 * persisted in the room-created event for replay, stripped before any client
 * sees the event, and never leaked through the masked view — and that the
 * generic runtime, driven by the tenant, reaches the same state the kernel does.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyBanqiMove,
  BANQI_SPEC_ID,
  type BanqiDeal,
  type BanqiMove,
  type BanqiSeat,
  createBanqiDeal,
  createInitialBanqiState,
  getBanqiLegalMoves,
} from '@mistboard/game';
import { banqiClientEventFor, banqiTenant, getBanqiClientView } from './banqi-tenant.js';
import { createTenantRuntimeRoom, replayTenantEvents } from './variant-tenant/runtime.js';
import type { TenantRoomEvent } from './variant-tenant/tenant.js';

process.env.MISTBOARD_BANQI_ENABLED = 'true';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

test('banqi room creation mints and persists a server-secret deal', () => {
  const created = createTenantRuntimeRoom(banqiTenant, 'bq_deal', { now: 1 });
  if (!created.ok) throw new Error(created.error);

  const event = created.room.events[0];
  if (event.type !== 'room-created') throw new Error('expected room-created first');
  const setup = event.setup as BanqiDeal | undefined;
  assert.ok(setup, 'room-created carries the deal');
  assert.equal(setup.length, 32);
  assert.equal(setup.filter((p) => p.color === 'red').length, 16);
  assert.equal(setup.filter((p) => p.color === 'black').length, 16);
});

test('the deal is stripped from room-created before any client sees it', () => {
  const created = createTenantRuntimeRoom(banqiTenant, 'bq_redact', { now: 1 });
  if (!created.ok) throw new Error(created.error);
  const event = created.room.events[0];
  if (event.type !== 'room-created') throw new Error('expected room-created first');

  for (const seat of ['red', 'black'] as const) {
    const clientEvent = banqiClientEventFor(event, seat, 0);
    assert.ok(clientEvent, `the seat ${seat} still receives room-created`);
    assert.equal(clientEvent.type, 'room-created');
    assert.ok(!('setup' in clientEvent), `no deal leaks to ${seat}`);
  }
  // /room/ never reveals: spectators receive no events.
  assert.equal(banqiClientEventFor(event, 'spectator', 0), null);
});

test('replay reconstructs the same board from the persisted setup', () => {
  const created = createTenantRuntimeRoom(banqiTenant, 'bq_replay', { now: 1 });
  if (!created.ok) throw new Error(created.error);

  const replayed = replayTenantEvents(banqiTenant, created.room.events);
  assert.deepEqual(replayed.state.board, created.room.projection.state.board);
  assert.equal(Object.keys(replayed.state.board).length, 32);
});

test('the client view masks every face-down identity (all 32 at the start)', () => {
  const created = createTenantRuntimeRoom(banqiTenant, 'bq_view', { now: 1 });
  if (!created.ok) throw new Error(created.error);
  const state = created.room.projection.state;

  const view = getBanqiClientView(state, { id: 'c', seat: 'red', solo: false });
  const revealed = Object.values(view.board).filter((entry) => entry && !entry.faceDown);
  assert.equal(revealed.length, 0); // banqi starts fully face-down
  const a1 = view.board.a1;
  assert.ok(a1 && a1.faceDown === true);
  assert.ok(!('role' in a1), 'a masked entry carries no role');
  assert.ok(!('color' in a1), 'a masked entry carries no ink');

  const spectator = getBanqiClientView(state, { id: 's', seat: 'spectator', solo: false });
  assert.equal(Object.keys(spectator.board).length, 0);
});

test('a full banqi game replays through the runtime identically to the kernel', () => {
  const roomId = 'bq_game';
  const deal = createBanqiDeal(seeded(7)); // a fixed deal makes the line reproducible
  const events: TenantRoomEvent<BanqiSeat, BanqiMove, typeof BANQI_SPEC_ID>[] = [
    { type: 'room-created', at: 1, roomId, gameSpecId: BANQI_SPEC_ID, setup: deal },
    { type: 'seat-assigned', at: 2, roomId, clientId: 'a', seat: 'red' },
    { type: 'seat-assigned', at: 3, roomId, clientId: 'b', seat: 'black' },
  ];

  // Drive a deterministic line with the kernel (first legal move each ply),
  // recording the move-played events keyed by the SEAT to move.
  let kernelState = createInitialBanqiState(roomId, deal);
  let at = 4;
  let plies = 0;
  while (kernelState.status.type === 'playing' && plies < 60) {
    const move = getBanqiLegalMoves(kernelState)[0];
    events.push({ type: 'move-played', at: at++, roomId, color: kernelState.status.turn, move });
    kernelState = applyBanqiMove(kernelState, move);
    plies += 1;
  }
  assert.ok(plies > 0, 'the scripted line made progress');
  // The first action is always a flip (pre-binding, only flips are legal).
  const firstMove = events.find((e) => e.type === 'move-played');
  assert.ok(
    firstMove && firstMove.type === 'move-played' && firstMove.move.from === firstMove.move.to,
  );

  // The generic runtime, driven by the tenant, must reach the same canonical
  // state the kernel did — proving the tenant's move path integrates correctly.
  const projection = replayTenantEvents(banqiTenant, events);
  assert.deepEqual(projection.state, kernelState);
});
