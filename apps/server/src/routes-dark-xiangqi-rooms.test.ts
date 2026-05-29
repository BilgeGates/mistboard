import assert from 'node:assert/strict';
import type { ServerResponse } from 'node:http';
import test from 'node:test';
import { DARK_XIANGQI_SPEC_ID } from '@mistboard/game';
import type { DarkXiangqiRuntimeRoom } from './dark-xiangqi-runtime.js';
import { handleDarkXiangqiCreate, requestsDarkXiangqi } from './routes/dark-xiangqi-rooms.js';
import type { HttpApiContext } from './routes/lib.js';

const darkXiangqiFlag = 'MISTBOARD_DARK_XIANGQI_ENABLED';

type ResponseCapture = {
  body: string;
  headers: Record<string, string>;
  status: number | null;
};

test('Dark Xiangqi room route only claims explicit Dark Xiangqi selectors', () => {
  assert.equal(requestsDarkXiangqi({ gameSpecId: DARK_XIANGQI_SPEC_ID }), true);
  assert.equal(requestsDarkXiangqi({ variant: DARK_XIANGQI_SPEC_ID }), true);
  assert.equal(requestsDarkXiangqi({ gameSpecId: 'dark-chess' }), false);
  assert.equal(requestsDarkXiangqi({ variant: 'dark-chess' }), false);
});

test('Dark Xiangqi room route hides flagged-off requests', async () => {
  const before = process.env[darkXiangqiFlag];
  delete process.env[darkXiangqiFlag];
  try {
    const response = captureResponse();
    await handleDarkXiangqiCreate(testContext(), response, {
      gameSpecId: DARK_XIANGQI_SPEC_ID,
      mode: 'pvp',
    });

    assert.equal(response.status, 404);
    assert.deepEqual(responseJson(response), { error: 'dark_xiangqi_disabled' });
  } finally {
    restoreFlag(before);
  }
});

test('Dark Xiangqi room route rejects legacy variant requests when the flag is on', async () => {
  const before = process.env[darkXiangqiFlag];
  process.env[darkXiangqiFlag] = 'true';
  try {
    const response = captureResponse();
    await handleDarkXiangqiCreate(testContext(), response, {
      mode: 'pvp',
      variant: DARK_XIANGQI_SPEC_ID,
    });

    assert.equal(response.status, 501);
    assert.deepEqual(responseJson(response), { error: 'dark_xiangqi_not_integrated' });
  } finally {
    restoreFlag(before);
  }
});

test('Dark Xiangqi room route rejects unsupported create surfaces before room creation', async () => {
  const before = process.env[darkXiangqiFlag];
  process.env[darkXiangqiFlag] = 'true';
  try {
    for (const body of [
      { gameSpecId: DARK_XIANGQI_SPEC_ID, mode: 'pve' },
      { gameSpecId: DARK_XIANGQI_SPEC_ID, mode: 'pvp', rated: true },
      { gameSpecId: DARK_XIANGQI_SPEC_ID, mode: 'pvp', timeControl: { id: '3m2' } },
      { engineId: 'engine', gameSpecId: DARK_XIANGQI_SPEC_ID, mode: 'pvp' },
    ]) {
      let createCalls = 0;
      const response = captureResponse();
      await handleDarkXiangqiCreate(
        testContext({
          createDarkXiangqiRoom: async () => {
            createCalls += 1;
            return { ok: true, room: darkXiangqiRoom('dxq_unreachable') };
          },
        }),
        response,
        body,
      );

      assert.equal(response.status, 501);
      assert.deepEqual(responseJson(response), { error: 'dark_xiangqi_unsupported_surface' });
      assert.equal(createCalls, 0);
    }
  } finally {
    restoreFlag(before);
  }
});

test('Dark Xiangqi room route creates a direct PvP room response', async () => {
  const before = process.env[darkXiangqiFlag];
  process.env[darkXiangqiFlag] = 'true';
  try {
    const response = captureResponse();
    await handleDarkXiangqiCreate(testContext(), response, {
      gameSpecId: DARK_XIANGQI_SPEC_ID,
      mode: 'pvp',
    });

    assert.equal(response.status, 201);
    assert.deepEqual(responseJson(response), {
      roomId: 'dxq_route',
      url: '/room/dxq_route',
      mode: 'pvp',
      gameSpecId: DARK_XIANGQI_SPEC_ID,
      region: 'global',
    });
  } finally {
    restoreFlag(before);
  }
});

test('Dark Xiangqi room route maps room factory failures', async () => {
  const before = process.env[darkXiangqiFlag];
  process.env[darkXiangqiFlag] = 'true';
  try {
    for (const { error, status } of [
      { error: 'dark_xiangqi_disabled' as const, status: 404 },
      { error: 'persistence_failure' as const, status: 503 },
      { error: 'room_id_collision' as const, status: 500 },
    ]) {
      const response = captureResponse();
      await handleDarkXiangqiCreate(
        testContext({
          createDarkXiangqiRoom: async () => ({ ok: false, error }),
        }),
        response,
        { gameSpecId: DARK_XIANGQI_SPEC_ID, mode: 'pvp' },
      );

      assert.equal(response.status, status);
      assert.deepEqual(responseJson(response), { error });
    }
  } finally {
    restoreFlag(before);
  }
});

function captureResponse(): ServerResponse & ResponseCapture {
  const capture = {
    body: '',
    headers: {},
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
  return capture as ServerResponse & ResponseCapture;
}

function responseJson(response: ResponseCapture): Record<string, unknown> {
  return JSON.parse(response.body) as Record<string, unknown>;
}

function testContext(overrides: Partial<HttpApiContext> = {}): HttpApiContext {
  return {
    abandonRoom: async () => ({ ok: false, error: 'not_found' }),
    activeGameCount: () => 0,
    annotationsFile: '',
    createDarkXiangqiRoom: async () => ({ ok: true, room: darkXiangqiRoom('dxq_route') }),
    createRoom: async () => {
      throw new Error('unexpected chess room creation');
    },
    databaseRequired: false,
    drainDeadlineMs: () => null,
    inMemoryGameSummary: () => null,
    isDraining: () => false,
    liveClockIncrementMs: 0,
    liveClockInitialMs: 0,
    lobbyQueue: [],
    lobbyTickets: new Map(),
    pveBuiltinEngineClientId: '',
    releaseLiveEngineReservation: () => {},
    reserveLiveEngineSeat: async () => null,
    rooms: new Map(),
    ...overrides,
  };
}

function darkXiangqiRoom(id: string): DarkXiangqiRuntimeRoom {
  return {
    id,
    gameSpecId: DARK_XIANGQI_SPEC_ID,
  } as DarkXiangqiRuntimeRoom;
}

function restoreFlag(value: string | undefined): void {
  if (value === undefined) {
    delete process.env[darkXiangqiFlag];
    return;
  }
  process.env[darkXiangqiFlag] = value;
}
