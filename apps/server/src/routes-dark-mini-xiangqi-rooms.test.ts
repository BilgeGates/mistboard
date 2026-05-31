import assert from 'node:assert/strict';
import type { ServerResponse } from 'node:http';
import test from 'node:test';
import { DARK_MINI_XIANGQI_SPEC_ID } from '@mistboard/game';
import type { DarkMiniXiangqiRuntimeRoom } from './dark-mini-xiangqi-runtime.js';
import {
  handleDarkMiniXiangqiCreate,
  requestsDarkMiniXiangqi,
} from './routes/dark-mini-xiangqi-rooms.js';
import type { HttpApiContext } from './routes/lib.js';

const darkMiniXiangqiFlag = 'MISTBOARD_DARK_MINI_XIANGQI_ENABLED';

type ResponseCapture = {
  body: string;
  headers: Record<string, string>;
  status: number | null;
};

test('Dark Mini Xiangqi room route only claims canonical Dark Mini Xiangqi game spec requests', () => {
  assert.equal(requestsDarkMiniXiangqi({ gameSpecId: DARK_MINI_XIANGQI_SPEC_ID }), true);
  assert.equal(requestsDarkMiniXiangqi({ variant: DARK_MINI_XIANGQI_SPEC_ID }), false);
  assert.equal(requestsDarkMiniXiangqi({ gameSpecId: 'dark-xiangqi' }), false);
  assert.equal(requestsDarkMiniXiangqi({ variant: 'dark-chess' }), false);
});

test('Dark Mini Xiangqi room route hides flagged-off requests', async () => {
  const before = process.env[darkMiniXiangqiFlag];
  delete process.env[darkMiniXiangqiFlag];
  try {
    const response = captureResponse();
    await handleDarkMiniXiangqiCreate(testContext(), response, {
      gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
      mode: 'pvp',
    });

    assert.equal(response.status, 404);
    assert.deepEqual(responseJson(response), { error: 'dark_mini_xiangqi_disabled' });
  } finally {
    restoreFlag(before);
  }
});

test('Dark Mini Xiangqi room route rejects legacy variant requests when the flag is on', async () => {
  const before = process.env[darkMiniXiangqiFlag];
  process.env[darkMiniXiangqiFlag] = 'true';
  try {
    const response = captureResponse();
    await handleDarkMiniXiangqiCreate(testContext(), response, {
      mode: 'pvp',
      variant: DARK_MINI_XIANGQI_SPEC_ID,
    });

    assert.equal(response.status, 501);
    assert.deepEqual(responseJson(response), { error: 'dark_mini_xiangqi_not_integrated' });
  } finally {
    restoreFlag(before);
  }
});

test('Dark Mini Xiangqi room route rejects unsupported create surfaces before room creation', async () => {
  const before = process.env[darkMiniXiangqiFlag];
  process.env[darkMiniXiangqiFlag] = 'true';
  try {
    for (const body of [
      { gameSpecId: DARK_MINI_XIANGQI_SPEC_ID, mode: 'pve' },
      { gameSpecId: DARK_MINI_XIANGQI_SPEC_ID, mode: 'pvp', rated: true },
      { engineId: 'engine', gameSpecId: DARK_MINI_XIANGQI_SPEC_ID, mode: 'pvp' },
      {
        gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
        mode: 'pvp',
        timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      },
    ]) {
      let createCalls = 0;
      const response = captureResponse();
      await handleDarkMiniXiangqiCreate(
        testContext({
          createDarkMiniXiangqiRoom: async () => {
            createCalls += 1;
            return { ok: true, room: darkMiniXiangqiRoom('dmxq_unreachable') };
          },
        }),
        response,
        body,
      );

      assert.equal(response.status, 501);
      assert.deepEqual(responseJson(response), {
        error: 'dark_mini_xiangqi_unsupported_surface',
      });
      assert.equal(createCalls, 0);
    }
  } finally {
    restoreFlag(before);
  }
});

test('Dark Mini Xiangqi room route creates a direct PvP room response', async () => {
  const before = process.env[darkMiniXiangqiFlag];
  process.env[darkMiniXiangqiFlag] = 'true';
  try {
    let requestedPreference: unknown;
    const response = captureResponse();
    await handleDarkMiniXiangqiCreate(
      testContext({
        createDarkMiniXiangqiRoom: async (creatorPreference) => {
          requestedPreference = creatorPreference;
          return { ok: true, room: darkMiniXiangqiRoom('dmxq_route') };
        },
      }),
      response,
      {
        gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
        mode: 'pvp',
        preferredColor: 'black',
      },
    );

    assert.equal(requestedPreference, 'black');
    assert.equal(response.status, 201);
    assert.deepEqual(responseJson(response), {
      roomId: 'dmxq_route',
      url: '/room/dmxq_route',
      mode: 'pvp',
      gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
      region: 'global',
    });
  } finally {
    restoreFlag(before);
  }
});

test('Dark Mini Xiangqi room route maps room factory failures', async () => {
  const before = process.env[darkMiniXiangqiFlag];
  process.env[darkMiniXiangqiFlag] = 'true';
  try {
    for (const { error, status } of [
      { error: 'dark_mini_xiangqi_disabled' as const, status: 404 },
      { error: 'persistence_failure' as const, status: 503 },
      { error: 'room_id_collision' as const, status: 500 },
    ]) {
      const response = captureResponse();
      await handleDarkMiniXiangqiCreate(
        testContext({
          createDarkMiniXiangqiRoom: async () => ({ ok: false, error }),
        }),
        response,
        { gameSpecId: DARK_MINI_XIANGQI_SPEC_ID, mode: 'pvp' },
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
    createDarkMiniXiangqiRoom: async () => ({
      ok: true,
      room: darkMiniXiangqiRoom('dmxq_route'),
    }),
    createDarkXiangqiRoom: async () => {
      throw new Error('unexpected Dark Xiangqi room creation');
    },
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

function darkMiniXiangqiRoom(roomId: string): DarkMiniXiangqiRuntimeRoom {
  return {
    kind: 'dark-mini-xiangqi',
    id: roomId,
    clients: new Set(),
    events: [
      {
        type: 'room-created',
        at: 1,
        roomId,
        gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
      },
    ],
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
    gameEndRecorded: false,
    pendingWrites: Promise.resolve(),
    seatTokens: {},
  };
}

function restoreFlag(value: string | undefined): void {
  if (value === undefined) {
    delete process.env[darkMiniXiangqiFlag];
  } else {
    process.env[darkMiniXiangqiFlag] = value;
  }
}
