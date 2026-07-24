import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import type { WebSocket } from 'ws';
import { createDrainController } from './server-drain.js';
import { clientFixture, gameProjectionFixture, roomFixture } from './test-builders.js';
import { registerVariantTenant } from './variant-tenant/registry.js';

type ResponseCapture = {
  body: string;
  headers: Record<string, string>;
  status: number | null;
};

type RequestOptions = {
  body?: object;
  headers?: IncomingMessage['headers'];
  method?: string;
  remoteAddress?: string;
};

let drainTestTenantActiveGames = 0;

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

function request({
  body = {},
  headers = {},
  method = 'POST',
  remoteAddress = '127.0.0.1',
}: RequestOptions = {}): IncomingMessage {
  const chunks = [Buffer.from(JSON.stringify(body))];
  return {
    headers,
    method,
    socket: { remoteAddress },
    async *[Symbol.asyncIterator]() {
      yield* chunks;
    },
  } as unknown as IncomingMessage;
}

function responseJson(response: ResponseCapture): Record<string, unknown> {
  return JSON.parse(response.body) as Record<string, unknown>;
}

test('drain controller counts only unpaused playing rooms', () => {
  const playing = roomFixture({
    id: 'playing',
    projection: gameProjectionFixture({
      roomId: 'playing',
      state: { status: { type: 'playing', turn: 'white' } },
    }),
  });
  const paused = roomFixture({
    id: 'paused',
    projection: gameProjectionFixture({
      paused: true,
      roomId: 'paused',
      state: { status: { type: 'playing', turn: 'white' } },
    }),
  });
  const pregame = roomFixture({
    id: 'pregame',
    projection: gameProjectionFixture({
      roomId: 'pregame',
      state: { status: { type: 'pregame' } },
    }),
  });
  const rooms = new Map([
    [playing.id, playing],
    [paused.id, paused],
    [pregame.id, pregame],
  ]);

  const drain = createDrainController({
    drainWindowDefaultMs: 1000,
    drainWindowMaxMs: 2000,
    rooms,
  });

  assert.equal(drain.activeGameCount(), 1);
});

test('drain controller counts live variant-tenant games alongside chess rooms', () => {
  drainTestTenantActiveGames = 2;
  registerVariantTenant({
    kind: 'drain-test-tenant',
    gameSpecId: 'drain-test-tenant',
    roomIdPrefix: 'draintest_',
    ownsSpecRouting: true,
    errorPrefix: 'drain_test_tenant',
    enabled: () => true,
    rooms: new Map(),
    activeGameCount: () => drainTestTenantActiveGames,
    getOrLoadRoom: async () => null,
    attachWebSocket: async () => {
      throw new Error('unexpected ws attach in drain test');
    },
    clearRuntimeTimers: () => {},
    clearRooms: () => {},
    http: {
      matchesCreateRequest: () => false,
      handleCreate: async () => {
        throw new Error('unexpected http create in drain test');
      },
    },
    lobby: null,
    sweepDueDeadline: null,
    createCorrespondenceGameForSeek: null,
  });

  const chessRoom = roomFixture({
    id: 'chess-playing',
    projection: gameProjectionFixture({
      roomId: 'chess-playing',
      state: { status: { type: 'playing', turn: 'white' } },
    }),
  });
  const drain = createDrainController({
    drainWindowDefaultMs: 1000,
    drainWindowMaxMs: 2000,
    rooms: new Map([[chessRoom.id, chessRoom]]),
  });

  // 1 chess + 2 playing tenant rooms; the finished tenant room is excluded.
  // Without the tenant sum, a deploy gated on activeGames==0 can land over a
  // live DMX/Crossroads game.
  assert.equal(drain.activeGameCount(), 3);
  drainTestTenantActiveGames = 0;
});

test('drain controller activates idempotently and broadcasts restart schedule', async () => {
  const sent: string[] = [];
  const socket = {
    send(message: string) {
      sent.push(message);
    },
  } as unknown as WebSocket;
  const room = roomFixture({ clients: [clientFixture({ socket })] });
  const rooms = new Map([[room.id, room]]);
  const drain = createDrainController({
    drainWindowDefaultMs: 1000,
    drainWindowMaxMs: 2000,
    rooms,
  });

  const first = captureResponse();
  await drain.handleRequest(request({ body: { windowMs: 1500 } }), first, '/admin/drain');

  assert.equal(first.status, 200);
  const firstBody = responseJson(first);
  assert.equal(firstBody.draining, true);
  assert.equal(firstBody.idempotent, false);
  assert.equal(typeof firstBody.restartAt, 'number');
  assert.equal(drain.isDraining(), true);
  assert.equal(drain.drainDeadlineMs(), firstBody.restartAt);
  assert.equal(drain.restartPhase(), 'pending');
  assert.equal(sent.length, 1);
  assert.deepEqual(JSON.parse(sent[0]!) as Record<string, unknown>, {
    type: 'server_restart_scheduled',
    phase: 'pending',
    restartAt: firstBody.restartAt,
  });

  const second = captureResponse();
  await drain.handleRequest(request({ body: { windowMs: 2000 } }), second, '/admin/drain');

  assert.equal(second.status, 200);
  const secondBody = responseJson(second);
  assert.equal(secondBody.idempotent, true);
  assert.equal(secondBody.restartAt, firstBody.restartAt);
  assert.equal(sent.length, 1, 'idempotent drain activation should not rebroadcast');
});

test('restart commit requires zero active games and broadcasts immediately before deploy', async () => {
  const sent: string[] = [];
  const socket = {
    send(message: string) {
      sent.push(message);
    },
  } as unknown as WebSocket;
  const room = roomFixture({
    clients: [clientFixture({ socket })],
    projection: gameProjectionFixture({
      state: { status: { type: 'playing', turn: 'white' } },
    }),
  });
  const drain = createDrainController({
    drainWindowDefaultMs: 1000,
    drainWindowMaxMs: 2000,
    rooms: new Map([[room.id, room]]),
  });

  await drain.handleRequest(
    request({ body: { windowMs: 1500 } }),
    captureResponse(),
    '/admin/drain',
  );
  const blocked = captureResponse();
  await drain.handleRequest(request({ body: { phase: 'restarting' } }), blocked, '/admin/drain');
  assert.equal(blocked.status, 409);
  assert.deepEqual(responseJson(blocked), { error: 'active_games_remaining', activeGames: 1 });
  assert.equal(drain.restartPhase(), 'pending');

  room.projection.state.status = {
    type: 'finished',
    winner: 'white',
    reason: 'checkmate',
  };
  const committed = captureResponse();
  await drain.handleRequest(request({ body: { phase: 'restarting' } }), committed, '/admin/drain');
  assert.equal(committed.status, 200);
  assert.equal(responseJson(committed).phase, 'restarting');
  assert.equal(drain.restartPhase(), 'restarting');
  assert.deepEqual(JSON.parse(sent[1]!) as Record<string, unknown>, {
    type: 'server_restart_scheduled',
    phase: 'restarting',
  });
});

test('drain controller cancels active drains and broadcasts cancellation', async () => {
  const sent: string[] = [];
  const socket = {
    send(message: string) {
      sent.push(message);
    },
  } as unknown as WebSocket;
  const room = roomFixture({ clients: [clientFixture({ socket })] });
  const rooms = new Map([[room.id, room]]);
  const drain = createDrainController({
    drainWindowDefaultMs: 1000,
    drainWindowMaxMs: 2000,
    rooms,
  });

  await drain.handleRequest(
    request({ body: { windowMs: 1500 } }),
    captureResponse(),
    '/admin/drain',
  );

  const cancel = captureResponse();
  await drain.handleRequest(request(), cancel, '/admin/drain/cancel');

  assert.equal(cancel.status, 200);
  assert.equal(responseJson(cancel).draining, false);
  assert.equal(drain.isDraining(), false);
  assert.equal(drain.drainDeadlineMs(), null);
  assert.equal(drain.restartPhase(), null);
  assert.deepEqual(JSON.parse(sent[1]!) as Record<string, unknown>, {
    type: 'server_restart_cancelled',
  });
});

test('drain controller rejects invalid methods and windows', async () => {
  const drain = createDrainController({
    drainWindowDefaultMs: 1000,
    drainWindowMaxMs: 2000,
    rooms: new Map(),
  });

  const getResponse = captureResponse();
  await drain.handleRequest(request({ method: 'GET' }), getResponse, '/admin/drain');
  assert.equal(getResponse.status, 405);
  assert.equal(responseJson(getResponse).error, 'method_not_allowed');

  const invalidWindow = captureResponse();
  await drain.handleRequest(request({ body: { windowMs: -1 } }), invalidWindow, '/admin/drain');
  assert.equal(invalidWindow.status, 400);
  assert.equal(responseJson(invalidWindow).error, 'invalid_window');
});

// Registers a tenant with a live client, so it stays LAST in this file: any
// drain activated after this registration also reaches that client.
test('drain broadcasts reach variant-tenant room clients', async () => {
  const tenantSent: string[] = [];
  const tenantRoom = {
    id: 'drainbcast_room',
    clients: [
      {
        socket: {
          close: () => {},
          send: (message: string) => tenantSent.push(message),
        },
      },
    ],
    pendingWrites: Promise.resolve(),
  };
  registerVariantTenant({
    kind: 'drain-broadcast-tenant',
    gameSpecId: 'drain-broadcast-tenant',
    roomIdPrefix: 'drainbcast_',
    ownsSpecRouting: true,
    errorPrefix: 'drain_broadcast_tenant',
    enabled: () => true,
    rooms: new Map([[tenantRoom.id, tenantRoom]]),
    activeGameCount: () => 0,
    getOrLoadRoom: async () => null,
    attachWebSocket: async () => {
      throw new Error('unexpected ws attach in drain test');
    },
    clearRuntimeTimers: () => {},
    clearRooms: () => {},
    http: {
      matchesCreateRequest: () => false,
      handleCreate: async () => {
        throw new Error('unexpected http create in drain test');
      },
    },
    lobby: null,
    sweepDueDeadline: null,
    createCorrespondenceGameForSeek: null,
  });

  const drain = createDrainController({
    drainWindowDefaultMs: 1000,
    drainWindowMaxMs: 2000,
    rooms: new Map(),
  });

  await drain.handleRequest(
    request({ body: { windowMs: 1500 } }),
    captureResponse(),
    '/admin/drain',
  );
  assert.equal(tenantSent.length, 1);
  assert.equal((JSON.parse(tenantSent[0]!) as { type: string }).type, 'server_restart_scheduled');

  await drain.handleRequest(request(), captureResponse(), '/admin/drain/cancel');
  assert.equal(tenantSent.length, 2);
  assert.equal((JSON.parse(tenantSent[1]!) as { type: string }).type, 'server_restart_cancelled');
});
