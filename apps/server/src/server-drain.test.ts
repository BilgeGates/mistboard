import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import type { WebSocket } from 'ws';
import { createDrainController } from './server-drain.js';
import { clientFixture, gameProjectionFixture, roomFixture } from './test-builders.js';

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
  assert.equal(sent.length, 1);
  assert.deepEqual(JSON.parse(sent[0]!) as Record<string, unknown>, {
    type: 'server_restart_scheduled',
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
