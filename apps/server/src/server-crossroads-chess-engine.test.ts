import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendCrossroadsChessRuntimeEvent,
  type CrossroadsChessRuntimeRoom,
  createCrossroadsChessRuntimeRoom,
} from './crossroads-chess-runtime.js';
import {
  type CrossroadsChessEngineContext,
  crossroadsChessEngineSeatFor,
  playCrossroadsChessEngineMoveIfReady,
  scheduleCrossroadsChessEngineMove,
} from './server-crossroads-chess-engine.js';
import type { CrossroadsChessLiveRoom } from './server-crossroads-chess-live-room.js';

process.env.MISTBOARD_CROSSROADS_CHESS_ENABLED = 'true';

test('Crossroads engine loop plays a validated FSF move with server-owned tier caps', async () => {
  const room = pveRoom('red');
  appendCrossroadsChessRuntimeEvent(room, {
    type: 'move-played',
    at: 3,
    roomId: room.id,
    color: 'white',
    move: { from: 'd2', to: 'd3' },
  });
  let observedHistory: string[] = [];
  let observedMovetime = 0;
  const ctx = engineCtx(room, async (_engineId, history, opts) => {
    observedHistory = history;
    observedMovetime = opts.movetimeMs;
    return 'd7d6';
  });

  await playCrossroadsChessEngineMoveIfReady(ctx, room);

  assert.deepEqual(observedHistory, ['d2d3']);
  assert.equal(observedMovetime, 300);
  const last = room.events.at(-1);
  assert.equal(last?.type, 'move-played');
  assert.equal(last?.type === 'move-played' && last.color, 'red');
  assert.deepEqual(last?.type === 'move-played' && last.move, { from: 'd7', to: 'd6' });
});

test('Crossroads engine loop falls back to a legal move on illegal output', async () => {
  const room = pveRoom('red');
  appendCrossroadsChessRuntimeEvent(room, {
    type: 'move-played',
    at: 3,
    roomId: room.id,
    color: 'white',
    move: { from: 'd2', to: 'd3' },
  });
  const ctx = engineCtx(room, async () => 'a1a1');

  await playCrossroadsChessEngineMoveIfReady(ctx, room);

  const last = room.events.at(-1);
  assert.equal(last?.type, 'move-played');
  assert.equal(last?.type === 'move-played' && last.color, 'red');
  assert.deepEqual(room.projection.state.status, { type: 'playing', turn: 'white' });
});

test('Crossroads engine loop falls back to a legal move on request failure', async () => {
  const room = pveRoom('red');
  appendCrossroadsChessRuntimeEvent(room, {
    type: 'move-played',
    at: 3,
    roomId: room.id,
    color: 'white',
    move: { from: 'd2', to: 'd3' },
  });
  const ctx = engineCtx(room, async () => {
    throw new Error('engine unavailable');
  });

  await playCrossroadsChessEngineMoveIfReady(ctx, room);

  const last = room.events.at(-1);
  assert.equal(last?.type, 'move-played');
  assert.equal(last?.type === 'move-played' && last.color, 'red');
  assert.deepEqual(room.projection.state.status, { type: 'playing', turn: 'white' });
});

test('Crossroads engine scheduler is a no-op until the engine is on turn', () => {
  const room = pveRoom('red');
  const ctx = engineCtx(room, async () => 'd7d6');

  scheduleCrossroadsChessEngineMove(ctx, room);

  assert.equal(crossroadsChessEngineSeatFor(room), 'red');
  assert.equal(room.engineTimer, null);
});

function pveRoom(engineSeat: 'white' | 'red'): CrossroadsChessLiveRoom {
  const created = createCrossroadsChessRuntimeRoom('dchess_engine_test');
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error('room create failed');
  const room = created.room;
  appendCrossroadsChessRuntimeEvent(room, {
    type: 'seat-assigned',
    at: 1,
    roomId: room.id,
    clientId: 'fairy-stockfish-crossroads-strong',
    seat: engineSeat,
  });
  appendCrossroadsChessRuntimeEvent(room, {
    type: 'seat-assigned',
    at: 2,
    roomId: room.id,
    clientId: 'human',
    seat: engineSeat === 'white' ? 'red' : 'white',
  });
  return room as CrossroadsChessLiveRoom;
}

function engineCtx(
  room: CrossroadsChessRuntimeRoom,
  engineMove: CrossroadsChessEngineContext['engineMove'],
): CrossroadsChessEngineContext {
  return {
    appendEvent: async (_room, event) => appendCrossroadsChessRuntimeEvent(room, event),
    broadcastEventAppended: () => {},
    engineMove,
    now: () => 1_000,
  };
}
