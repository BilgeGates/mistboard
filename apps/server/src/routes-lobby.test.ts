import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import { DARK_MINI_XIANGQI_SPEC_ID } from '@mistboard/game';
import type { DarkMiniXiangqiRuntimeRoom } from './dark-mini-xiangqi-runtime.js';
import type { Room } from './server-types.js';
import type { HttpApiContext } from './routes/lib.js';
import { tryHandle } from './routes/lobby.js';

const darkMiniXiangqiFlag = 'MISTBOARD_DARK_MINI_XIANGQI_ENABLED';

type ResponseCapture = { body: string; headers: Record<string, string>; status: number | null };

function captureResponse(): ServerResponse & ResponseCapture {
  const capture = {
    body: '',
    headers: {} as Record<string, string>,
    status: null as number | null,
    writeHead(status: number, headers?: Record<string, string>) {
      capture.status = status;
      capture.headers = headers ?? {};
      return capture;
    },
    end(chunk?: string) {
      capture.body += chunk ?? '';
      return capture;
    },
  };
  return capture as unknown as ServerResponse & ResponseCapture;
}

function responseJson(response: ResponseCapture): Record<string, unknown> {
  return JSON.parse(response.body) as Record<string, unknown>;
}

function lobbyPost(body: Record<string, unknown>): IncomingMessage {
  const json = JSON.stringify(body);
  async function* chunks() {
    yield Buffer.from(json);
  }
  const req = chunks() as unknown as IncomingMessage & Record<string, unknown>;
  req.method = 'POST';
  req.headers = {};
  return req;
}

type CreateRoomCall = unknown[];

function testContext(
  overrides: Partial<HttpApiContext> = {},
): { ctx: HttpApiContext; chessCalls: CreateRoomCall[]; dmxCalls: unknown[] } {
  const chessCalls: CreateRoomCall[] = [];
  const dmxCalls: unknown[] = [];
  let chessRoomSeq = 0;
  let dmxRoomSeq = 0;
  const ctx: HttpApiContext = {
    abandonRoom: async () => ({ ok: false, error: 'not_found' }),
    activeGameCount: () => 0,
    annotationsFile: '',
    createDarkMiniXiangqiRoom: async (...args) => {
      dmxCalls.push(args);
      dmxRoomSeq += 1;
      return { ok: true, room: darkMiniXiangqiRoom(`dmxq_lobby_${dmxRoomSeq}`) };
    },
    createDarkXiangqiRoom: async () => {
      throw new Error('unexpected Dark Xiangqi room creation');
    },
    createRoom: async (...args) => {
      chessCalls.push(args);
      chessRoomSeq += 1;
      return { id: `room_chess_${chessRoomSeq}`, region: 'global' } as unknown as Room;
    },
    databaseRequired: false,
    drainDeadlineMs: () => null,
    inMemoryGameSummary: () => null,
    isDraining: () => false,
    liveClockIncrementMs: 2000,
    liveClockInitialMs: 180000,
    lobbyQueue: [],
    lobbyTickets: new Map(),
    pveBuiltinEngineClientId: 'engine',
    releaseLiveEngineReservation: () => {},
    reserveLiveEngineSeat: async () => null,
    rooms: new Map(),
    ...overrides,
  };
  return { ctx, chessCalls, dmxCalls };
}

const tc = { initialMs: 180000, incrementMs: 2000 };

async function post(ctx: HttpApiContext, body: Record<string, unknown>): Promise<ResponseCapture> {
  const response = captureResponse();
  const handled = await tryHandle(ctx, lobbyPost(body), response, '/api/lobby');
  assert.equal(handled, true);
  return response;
}

// ── Chess baseline (must stay identical across the variant-aware refactor) ──

test('lobby: a single chess request waits (202)', async () => {
  const { ctx, chessCalls } = testContext();
  const res = await post(ctx, { timeControl: tc });
  assert.equal(res.status, 202);
  const json = responseJson(res);
  assert.equal(json.status, 'waiting');
  assert.equal(json.gameSpecId, 'dark-chess');
  assert.equal(chessCalls.length, 0);
});

test('lobby: two matching chess requests create one dark-chess room with the exact args', async () => {
  const { ctx, chessCalls } = testContext();
  const first = await post(ctx, { timeControl: tc });
  assert.equal(first.status, 202);
  const second = await post(ctx, { timeControl: tc });
  assert.equal(second.status, 201);
  assert.equal(responseJson(second).status, 'matched');
  assert.equal(responseJson(second).roomId, 'room_chess_1');

  assert.equal(chessCalls.length, 1);
  assert.deepEqual(chessCalls[0], [
    'pvp',
    'dark-chess',
    'engine',
    false,
    tc,
    false,
    { randomSeating: true },
  ]);
});

test('lobby: chess requests with different time controls do not match', async () => {
  const { ctx, chessCalls } = testContext();
  await post(ctx, { timeControl: tc }); // 3+2
  // 1+1 is a different allowed bucket (the allowlist now scopes chess matchmaking
  // to 1+1 / 3+2; an off-menu TC like 1+0 is rejected — see the allowlist test).
  const other = await post(ctx, { timeControl: { initialMs: 60000, incrementMs: 1000 } });
  assert.equal(other.status, 202);
  assert.equal(chessCalls.length, 0);
  assert.equal(ctx.lobbyQueue.length, 2);
});

test('lobby: chess request with an off-menu time control is rejected', async () => {
  const { ctx } = testContext();
  // 1+0 is not an official playable TC — matchmaking must reject it so the queue
  // can't fragment into off-menu buckets.
  const res = await post(ctx, { timeControl: { initialMs: 60000, incrementMs: 0 } });
  assert.equal(res.status, 400);
  assert.equal(ctx.lobbyQueue.length, 0);
});

// ── Dark Mini Xiangqi ──────────────────────────────────────────────────────

test('lobby: a single Dark Mini Xiangqi request waits (202)', async () => {
  await withFlag(true, async () => {
    const { ctx, dmxCalls } = testContext();
    const res = await post(ctx, { gameSpecId: DARK_MINI_XIANGQI_SPEC_ID, timeControl: tc });
    assert.equal(res.status, 202);
    assert.equal(responseJson(res).gameSpecId, DARK_MINI_XIANGQI_SPEC_ID);
    assert.equal(dmxCalls.length, 0);
  });
});

test('lobby: two Dark Mini Xiangqi requests match into a DMX room', async () => {
  await withFlag(true, async () => {
    const { ctx, dmxCalls, chessCalls } = testContext();
    const first = await post(ctx, { gameSpecId: DARK_MINI_XIANGQI_SPEC_ID, timeControl: tc });
    assert.equal(first.status, 202);
    const second = await post(ctx, { gameSpecId: DARK_MINI_XIANGQI_SPEC_ID, timeControl: tc });
    assert.equal(second.status, 201);
    assert.equal(responseJson(second).status, 'matched');
    assert.equal(responseJson(second).roomId, 'dmxq_lobby_1');
    assert.equal(dmxCalls.length, 1);
    assert.deepEqual(dmxCalls[0], [tc, 'random']);
    assert.equal(chessCalls.length, 0, 'chess factory must not be touched');
  });
});

test('lobby: Dark Mini Xiangqi requests are rejected when the flag is off', async () => {
  await withFlag(false, async () => {
    const { ctx } = testContext();
    const res = await post(ctx, { gameSpecId: DARK_MINI_XIANGQI_SPEC_ID, timeControl: tc });
    assert.equal(res.status, 404);
    assert.deepEqual(responseJson(res), { error: 'dark_mini_xiangqi_disabled' });
  });
});

test('lobby: chess and Dark Mini Xiangqi seekers never match each other', async () => {
  await withFlag(true, async () => {
    const { ctx, chessCalls, dmxCalls } = testContext();
    const chess = await post(ctx, { timeControl: tc });
    const dmx = await post(ctx, { gameSpecId: DARK_MINI_XIANGQI_SPEC_ID, timeControl: tc });
    assert.equal(chess.status, 202);
    assert.equal(dmx.status, 202);
    assert.equal(chessCalls.length, 0);
    assert.equal(dmxCalls.length, 0);
    assert.equal(ctx.lobbyQueue.length, 2);
  });
});

function darkMiniXiangqiRoom(roomId: string): DarkMiniXiangqiRuntimeRoom {
  return {
    kind: 'dark-mini-xiangqi',
    id: roomId,
    clients: new Set(),
    events: [{ type: 'room-created', at: 1, roomId, gameSpecId: DARK_MINI_XIANGQI_SPEC_ID }],
    projection: {
      roomId,
      gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
      state: {
        id: roomId,
        board: {},
        status: { type: 'playing', turn: 'red' },
        moveNumber: 1,
        progressClock: 0,
        positionCounts: {},
      },
      seats: {},
    },
    gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
    abortTimer: null,
    abortDeadline: null,
    abortPhase: null,
    clockTimer: null,
    forfeitTimer: null,
    forfeitDeadline: null,
    forfeitSeat: null,
    gameEndRecorded: false,
    pendingWrites: Promise.resolve(),
    seatTokens: {},
    rematch: { offers: {} },
  };
}

function withFlag(value: boolean, fn: () => Promise<void>): Promise<void> {
  const before = process.env[darkMiniXiangqiFlag];
  if (value) process.env[darkMiniXiangqiFlag] = 'true';
  else delete process.env[darkMiniXiangqiFlag];
  return fn().finally(() => {
    if (before === undefined) delete process.env[darkMiniXiangqiFlag];
    else process.env[darkMiniXiangqiFlag] = before;
  });
}

export { testContext, post, responseJson, tc, withFlag, darkMiniXiangqiRoom };
