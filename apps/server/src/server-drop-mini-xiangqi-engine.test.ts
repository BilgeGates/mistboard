import assert from 'node:assert/strict';
import test from 'node:test';
import type { DropMiniXiangqiMove, MiniXiangqiColor } from '@mistboard/game';
import { getLegalDropMiniXiangqiMoves } from '@mistboard/game';
import { dropMiniXiangqiTenant } from './drop-mini-xiangqi-tenant.js';
import {
  chooseDropMiniXiangqiEngineMove,
  DROP_MINI_XIANGQI_DEFAULT_ENGINE_ID,
  dropMiniXiangqiEngineSeatFor,
  playDropMiniXiangqiEngineMoveIfReady,
  scheduleDropMiniXiangqiEngineMove,
} from './server-drop-mini-xiangqi-engine.js';
import { appendTenantRuntimeEvent, createTenantRuntimeRoom } from './variant-tenant/runtime.js';

type DropMiniEngineRoom = Parameters<typeof playDropMiniXiangqiEngineMoveIfReady>[1];
type DropMiniEngineContext = Parameters<typeof playDropMiniXiangqiEngineMoveIfReady>[0];

test('Drop Mini Xiangqi engine loop plays a legal built-in tier move', async () => {
  const room = pveRoom('black');
  appendHumanMove(room);
  const ctx = engineCtx(room);

  await playDropMiniXiangqiEngineMoveIfReady(ctx, room);

  const last = room.events.at(-1);
  assert.equal(last?.type, 'move-played');
  assert.equal(last?.type === 'move-played' && last.color, 'black');
  assert.equal(room.projection.state.status.type, 'playing');
  assert.equal(
    room.projection.state.status.type === 'playing' && room.projection.state.status.turn,
    'red',
  );
});

test('Drop Mini Xiangqi engine scheduler waits until the engine is on turn', () => {
  const room = pveRoom('black');
  const ctx = engineCtx(room);

  scheduleDropMiniXiangqiEngineMove(ctx, room);

  assert.equal(dropMiniXiangqiEngineSeatFor(room), 'black');
  assert.equal(room.engineTimer, null);
});

test('Drop Mini Xiangqi engine picker returns a deterministic legal move', () => {
  const room = pveRoom('red');
  const move = chooseDropMiniXiangqiEngineMove(room.projection.state, {
    id: 'misty-drop-mini-test',
    name: 'Misty Drop Mini Test',
    version: 'test',
    lookaheadPlies: 0,
    softPickRank: 0,
    softPickWindow: 0,
  });

  assert.ok(move, 'engine should choose a move from the initial position');
  assert.ok(
    getLegalDropMiniXiangqiMoves(room.projection.state).some((candidate) =>
      sameMove(candidate, move),
    ),
    'chosen move must be legal',
  );
});

function pveRoom(engineSeat: MiniXiangqiColor): DropMiniEngineRoom {
  const created = createTenantRuntimeRoom(dropMiniXiangqiTenant, 'dmxqd_engine_test', { now: 1 });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error('room create failed');
  const room = created.room as DropMiniEngineRoom;
  appendTenantRuntimeEvent(dropMiniXiangqiTenant, room, {
    type: 'seat-assigned',
    at: 1,
    roomId: room.id,
    clientId: DROP_MINI_XIANGQI_DEFAULT_ENGINE_ID,
    seat: engineSeat,
  });
  appendTenantRuntimeEvent(dropMiniXiangqiTenant, room, {
    type: 'seat-assigned',
    at: 2,
    roomId: room.id,
    clientId: 'human',
    seat: engineSeat === 'red' ? 'black' : 'red',
  });
  return room;
}

function appendHumanMove(room: DropMiniEngineRoom): void {
  assert.equal(room.projection.state.status.type, 'playing');
  const move = getLegalDropMiniXiangqiMoves(room.projection.state)[0];
  assert.ok(move, 'fixture should have a legal human move');
  appendTenantRuntimeEvent(dropMiniXiangqiTenant, room, {
    type: 'move-played',
    at: 3,
    roomId: room.id,
    color:
      room.projection.state.status.type === 'playing' ? room.projection.state.status.turn : 'red',
    move,
  });
}

function engineCtx(room: DropMiniEngineRoom): DropMiniEngineContext {
  return {
    appendEvent: async (_room, event) =>
      appendTenantRuntimeEvent(dropMiniXiangqiTenant, room, event),
    broadcastEventAppended: () => {},
    now: () => 1_000,
  };
}

function sameMove(a: DropMiniXiangqiMove, b: DropMiniXiangqiMove): boolean {
  if ('drop' in a || 'drop' in b)
    return 'drop' in a && 'drop' in b && a.drop === b.drop && a.to === b.to;
  return a.from === b.from && a.to === b.to;
}
