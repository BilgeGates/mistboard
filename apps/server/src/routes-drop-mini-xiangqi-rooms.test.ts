import assert from 'node:assert/strict';
import type { ServerResponse } from 'node:http';
import test from 'node:test';
import { DROP_MINI_XIANGQI_SPEC_ID } from '@mistboard/game';
import type { DropMiniXiangqiRuntimeRoom } from './drop-mini-xiangqi-registration.js';
import {
  type DropMiniXiangqiCreateContext,
  dropMiniXiangqiPveHumanColor,
  handleDropMiniXiangqiCreate,
  requestsDropMiniXiangqi,
} from './routes/drop-mini-xiangqi-rooms.js';

const dropMiniXiangqiFlag = 'MISTBOARD_DROP_MINI_XIANGQI_ENABLED';

type ResponseCapture = {
  body: string;
  headers: Record<string, string>;
  status: number | null;
};

test('Drop Mini Xiangqi room route only claims canonical game spec requests', () => {
  assert.equal(requestsDropMiniXiangqi({ gameSpecId: DROP_MINI_XIANGQI_SPEC_ID }), true);
  assert.equal(requestsDropMiniXiangqi({ variant: DROP_MINI_XIANGQI_SPEC_ID }), false);
  assert.equal(requestsDropMiniXiangqi({ gameSpecId: 'dark-mini-xiangqi' }), false);
});

test('Drop Mini Xiangqi PvE color selection honors random and explicit black', () => {
  assert.equal(dropMiniXiangqiPveHumanColor(undefined), 'red');
  assert.equal(dropMiniXiangqiPveHumanColor('red'), 'red');
  assert.equal(dropMiniXiangqiPveHumanColor('black'), 'black');
  assert.equal(dropMiniXiangqiPveHumanColor('random', 0), 'red');
  assert.equal(dropMiniXiangqiPveHumanColor('random', 255), 'black');
});

test('Drop Mini Xiangqi PvE route seats the built-in engine opposite the human', async () => {
  const before = process.env[dropMiniXiangqiFlag];
  process.env[dropMiniXiangqiFlag] = 'true';
  try {
    let requestedEngine: unknown;
    const response = captureResponse();
    await handleDropMiniXiangqiCreate(
      testContext({
        createDropMiniXiangqiRoom: async (_timeControl, _creatorPreference, _rated, engine) => {
          requestedEngine = engine;
          return { ok: true, room: dropMiniXiangqiRoom('dmxqd_pve') };
        },
      }),
      response,
      {
        gameSpecId: DROP_MINI_XIANGQI_SPEC_ID,
        mode: 'pve',
        engineId: 'misty-drop-mini-level-3',
        preferredColor: 'black',
      },
    );

    assert.deepEqual(requestedEngine, {
      engineId: 'misty-drop-mini-level-3',
      seat: 'red',
    });
    assert.equal(response.status, 201);
    assert.equal(responseJson(response).mode, 'pve');
    assert.equal(responseJson(response).rated, false);
  } finally {
    restoreFlag(before);
  }
});

test('Drop Mini Xiangqi PvE route carries bot id into engine room creation', async () => {
  const before = process.env[dropMiniXiangqiFlag];
  process.env[dropMiniXiangqiFlag] = 'true';
  try {
    let requestedEngine: unknown;
    const response = captureResponse();
    await handleDropMiniXiangqiCreate(
      testContext({
        createDropMiniXiangqiRoom: async (_timeControl, _creatorPreference, _rated, engine) => {
          requestedEngine = engine;
          return { ok: true, room: dropMiniXiangqiRoom('dmxqd_bot_pve') };
        },
      }),
      response,
      {
        botId: 'misty-drop-mini-level-3',
        engineId: 'misty-drop-mini-level-3',
        gameSpecId: DROP_MINI_XIANGQI_SPEC_ID,
        mode: 'pve',
        preferredColor: 'red',
      },
    );

    assert.deepEqual(requestedEngine, {
      engineId: 'misty-drop-mini-level-3',
      seat: 'black',
      botId: 'misty-drop-mini-level-3',
    });
    assert.equal(response.status, 201);
  } finally {
    restoreFlag(before);
  }
});

test('Drop Mini Xiangqi PvE route rejects rated engine games before room creation', async () => {
  const before = process.env[dropMiniXiangqiFlag];
  process.env[dropMiniXiangqiFlag] = 'true';
  try {
    let createCalls = 0;
    const response = captureResponse();
    await handleDropMiniXiangqiCreate(
      testContext({
        createDropMiniXiangqiRoom: async () => {
          createCalls += 1;
          return { ok: true, room: dropMiniXiangqiRoom('dmxqd_unreachable') };
        },
      }),
      response,
      { gameSpecId: DROP_MINI_XIANGQI_SPEC_ID, mode: 'pve', rated: true },
    );

    assert.equal(response.status, 501);
    assert.deepEqual(responseJson(response), {
      error: 'drop_mini_xiangqi_unsupported_surface',
    });
    assert.equal(createCalls, 0);
  } finally {
    restoreFlag(before);
  }
});

test('Drop Mini Xiangqi PvE route rejects unknown built-in engine ids', async () => {
  const before = process.env[dropMiniXiangqiFlag];
  process.env[dropMiniXiangqiFlag] = 'true';
  try {
    let createCalls = 0;
    const response = captureResponse();
    await handleDropMiniXiangqiCreate(
      testContext({
        createDropMiniXiangqiRoom: async () => {
          createCalls += 1;
          return { ok: true, room: dropMiniXiangqiRoom('dmxqd_unreachable') };
        },
      }),
      response,
      {
        gameSpecId: DROP_MINI_XIANGQI_SPEC_ID,
        mode: 'pve',
        engineId: 'not-a-drop-mini-engine',
      },
    );

    assert.equal(response.status, 400);
    assert.deepEqual(responseJson(response), { error: 'invalid_engine' });
    assert.equal(createCalls, 0);
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

function testContext(
  overrides: Partial<DropMiniXiangqiCreateContext> = {},
): DropMiniXiangqiCreateContext {
  return {
    createDropMiniXiangqiRoom: async () => ({
      ok: true,
      room: dropMiniXiangqiRoom('dmxqd_route'),
    }),
    databaseRequired: false,
    drainDeadlineMs: () => null,
    isDraining: () => false,
    ...overrides,
  };
}

function dropMiniXiangqiRoom(roomId: string): DropMiniXiangqiRuntimeRoom {
  return {
    kind: 'drop-mini-xiangqi',
    id: roomId,
    clients: new Set(),
    events: [
      {
        type: 'room-created',
        at: 1,
        roomId,
        gameSpecId: DROP_MINI_XIANGQI_SPEC_ID,
      },
    ],
    projection: {
      roomId,
      gameSpecId: DROP_MINI_XIANGQI_SPEC_ID,
      rated: false,
      state: {
        id: roomId,
        board: {},
        rules: {
          dropRegion: 'not-enemy-palace',
          dropAttack: 'allow-immediate-general-threat',
          reserve: 'immediate',
        },
        hands: { red: {}, black: {} },
        cooldownHands: { red: {}, black: {} },
        status: { type: 'playing', turn: 'red' },
        moveNumber: 1,
        progressClock: 0,
        positionCounts: {},
      },
      seats: {},
    },
    gameSpecId: DROP_MINI_XIANGQI_SPEC_ID,
    rated: false,
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
    engineTimer: null,
    engineReservationId: null,
    pveBotId: null,
  };
}

function restoreFlag(value: string | undefined): void {
  if (value === undefined) {
    delete process.env[dropMiniXiangqiFlag];
  } else {
    process.env[dropMiniXiangqiFlag] = value;
  }
}
