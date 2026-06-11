import assert from 'node:assert/strict';
import test from 'node:test';
import type { CrossroadsChessMove } from '@mistboard/game';
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

test('Crossroads engine loop guards avoidable one-ply terminal losses', async () => {
  const room = pveRoom('white');
  appendMoves(room, PRODUCTION_RACE_ENDGAME_HISTORY);
  assert.deepEqual(room.projection.state.status, { type: 'playing', turn: 'white' });
  const ctx = engineCtx(room, async () => 'c1b3');

  await playCrossroadsChessEngineMoveIfReady(ctx, room);

  const last = room.events.at(-1);
  assert.equal(last?.type, 'move-played');
  assert.equal(last?.type === 'move-played' && last.color, 'white');
  assert.deepEqual(last?.type === 'move-played' && last.move, { from: 'd4', to: 'd1' });
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

function appendMoves(room: CrossroadsChessRuntimeRoom, moves: readonly string[]): void {
  moves.forEach((uci, idx) => {
    appendCrossroadsChessRuntimeEvent(room, {
      type: 'move-played',
      at: 3 + idx,
      roomId: room.id,
      color: idx % 2 === 0 ? 'white' : 'red',
      move: moveFromUci(uci),
    });
  });
}

function moveFromUci(uci: string): CrossroadsChessMove {
  const match = uci.match(/^([a-f][1-8])([a-f][1-8])(q)?$/);
  assert.ok(match, `invalid uci move: ${uci}`);
  return {
    from: match[1] as CrossroadsChessMove['from'],
    to: match[2] as CrossroadsChessMove['to'],
    ...(match[3] ? { promotion: 'queen' as const } : {}),
  };
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

const PRODUCTION_RACE_ENDGAME_HISTORY = [
  'e2e3',
  'e7e6',
  'f1c4',
  'b7b6',
  'd2d4',
  'd7d6',
  'd1c3',
  'f7f6',
  'b2b3',
  'f6f5',
  'b3b4',
  'f5f4',
  'c4d3',
  'f4f3',
  'b4b5',
  'a8b7',
  'e1d2',
  'f3f2',
  'b1b3',
  'f8f3',
  'b5b6',
  'c7b6',
  'd3a6',
  'd8c6',
  'a2a3',
  'f3e3',
  'b3e3',
  'e8e3',
  'a6b7',
  'b8b7',
  'd2e3',
  'c8e7',
  'e3e4',
  'b7c7',
  'c3b5',
  'c7d7',
  'b5a7',
  'c6d4',
  'e4d4',
  'd6d5',
  'd4d3',
  'd7d6',
  'a1a2',
  'e6e5',
  'a2b2',
  'e5e4',
  'a7b5',
  'd6e5',
  'b5c3',
  'd5d4',
  'd3d2',
  'd4c4',
  'c3b5',
  'e7d5',
  'a3a4',
  'e4e3',
  'c2c3',
  'c4c3',
  'b5c3',
  'd5c3',
  'd2c3',
  'e5e4',
  'b2f2',
  'e3f3',
  'f2d2',
  'f3e3',
  'c3b4',
  'e4f3',
  'd2d4',
  'f3f2',
] as const;
