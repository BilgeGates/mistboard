import assert from 'node:assert/strict';
import type { ServerResponse } from 'node:http';
import test from 'node:test';
import { MINI_XIANGQI_SPEC_ID, type RoomTimeControl } from '@mistboard/game';
import {
  handleMiniXiangqiCreate,
  type MiniXiangqiCreateContext,
  requestsMiniXiangqi,
} from './routes/mini-xiangqi-rooms.js';

type ResponseCapture = {
  body: string;
  headers: Record<string, string>;
  status: number | null;
};

test('Mini Xiangqi room route only claims canonical Mini Xiangqi game spec requests', () => {
  assert.equal(requestsMiniXiangqi({ gameSpecId: MINI_XIANGQI_SPEC_ID }), true);
  assert.equal(requestsMiniXiangqi({ variant: MINI_XIANGQI_SPEC_ID }), false);
  assert.equal(requestsMiniXiangqi({ gameSpecId: 'dark-mini-xiangqi' }), false);
  assert.equal(requestsMiniXiangqi({ variant: 'dark-chess' }), false);
});

test('Mini Xiangqi room route rejects legacy variant requests', async () => {
  const response = captureResponse();
  await handleMiniXiangqiCreate(testContext(), response, {
    mode: 'pvp',
    variant: MINI_XIANGQI_SPEC_ID,
  });

  assert.equal(response.status, 501);
  assert.deepEqual(responseJson(response), { error: 'mini_xiangqi_not_integrated' });
});

test('Mini Xiangqi room route stays casual at launch', async () => {
  let createCalls = 0;
  const response = captureResponse();
  await handleMiniXiangqiCreate(
    testContext({
      createMiniXiangqiRoom: async () => {
        createCalls += 1;
        return { ok: true, room: miniXiangqiRoom('mxq_unreachable') };
      },
    }),
    response,
    { gameSpecId: MINI_XIANGQI_SPEC_ID, mode: 'pvp', rated: true },
  );

  assert.equal(response.status, 501);
  assert.deepEqual(responseJson(response), { error: 'rated_unsupported_surface' });
  assert.equal(createCalls, 0);
});

test('Mini Xiangqi room route creates a direct PvP room response', async () => {
  let requestedPreference: unknown;
  const response = captureResponse();
  await handleMiniXiangqiCreate(
    testContext({
      createMiniXiangqiRoom: async (_timeControl, creatorPreference, rated) => {
        requestedPreference = creatorPreference;
        assert.equal(rated, false);
        return { ok: true, room: miniXiangqiRoom('mxq_route') };
      },
    }),
    response,
    {
      gameSpecId: MINI_XIANGQI_SPEC_ID,
      mode: 'pvp',
      preferredColor: 'black',
    },
  );

  assert.equal(requestedPreference, 'black');
  assert.equal(response.status, 201);
  assert.deepEqual(responseJson(response), {
    roomId: 'mxq_route',
    url: '/room/mxq_route',
    mode: 'pvp',
    gameSpecId: MINI_XIANGQI_SPEC_ID,
    rated: false,
    region: 'global',
  });
});

test('Mini Xiangqi room route forwards a valid time control and echoes it', async () => {
  let requestedTimeControl: RoomTimeControl | undefined;
  const timeControl = { initialMs: 180_000, incrementMs: 2_000 };
  const response = captureResponse();
  await handleMiniXiangqiCreate(
    testContext({
      createMiniXiangqiRoom: async (tc) => {
        requestedTimeControl = tc;
        return { ok: true, room: miniXiangqiRoom('mxq_clock') };
      },
    }),
    response,
    {
      gameSpecId: MINI_XIANGQI_SPEC_ID,
      mode: 'pvp',
      timeControl,
    },
  );

  assert.deepEqual(requestedTimeControl, timeControl);
  assert.equal(response.status, 201);
  assert.deepEqual(responseJson(response).timeControl, timeControl);
});

function testContext(overrides: Partial<MiniXiangqiCreateContext> = {}): MiniXiangqiCreateContext {
  return {
    createMiniXiangqiRoom: async () => ({ ok: true, room: miniXiangqiRoom('mxq_test') }),
    databaseRequired: false,
    drainDeadlineMs: () => null,
    isDraining: () => false,
    ...overrides,
  };
}

function miniXiangqiRoom(id: string): { id: string; gameSpecId: string; rated: boolean } {
  return { id, gameSpecId: MINI_XIANGQI_SPEC_ID, rated: false };
}

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
