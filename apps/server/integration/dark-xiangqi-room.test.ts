import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectClient, startTestServer, type TestServer } from './harness.js';

const darkXiangqiKey = 'MISTBOARD_DARK_XIANGQI_ENABLED';

test('Dark Xiangqi direct room creation stays hidden while the flag is off', async () => {
  const before = process.env[darkXiangqiKey];
  delete process.env[darkXiangqiKey];
  const server = await startTestServer();
  try {
    const response = await createDarkXiangqiRoom(server);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'dark_xiangqi_disabled' });
  } finally {
    restoreEnv(darkXiangqiKey, before);
    await server.close();
  }
});

test('Dark Xiangqi room create + websocket loop is flag-gated and redacted', async () => {
  const before = process.env[darkXiangqiKey];
  process.env[darkXiangqiKey] = 'true';
  const server = await startTestServer();
  try {
    const unsupported = await createDarkXiangqiRoom(server, { mode: 'pve', engineId: 'random' });
    assert.equal(unsupported.status, 501);
    assert.deepEqual(await unsupported.json(), { error: 'dark_xiangqi_unsupported_surface' });

    const createdResponse = await createDarkXiangqiRoom(server);
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()) as {
      roomId: string;
      url: string;
      mode: string;
      gameSpecId: string;
    };
    assert.equal(created.gameSpecId, 'dark-xiangqi');
    assert.equal(created.mode, 'pvp');
    assert.equal(created.roomId.startsWith('dxq_'), true);
    assert.equal(created.url, `/room/${encodeURIComponent(created.roomId)}`);

    const red = await connectClient({
      url: server.url,
      room: created.roomId,
      gameSpecId: 'dark-xiangqi',
    });
    assert.equal(red.seat, 'red');
    assert.ok(red.seatToken);
    const redHello = red.messages.find((msg) => (msg as { type?: string }).type === 'hello') as {
      state: { board: Record<string, unknown>; visibleSquares: string[] };
    };
    assert.deepEqual(redHello.state.board.b8, { color: 'black', shrouded: true });
    assert.equal(redHello.state.visibleSquares.includes('b9'), false);

    const redReclaim = await connectClient({
      url: server.url,
      room: created.roomId,
      gameSpecId: 'dark-xiangqi',
      seatToken: red.seatToken,
    });
    assert.equal(redReclaim.seat, 'red');
    await red.closed;
    assert.equal(red.isClosed(), true);

    const black = await connectClient({
      url: server.url,
      room: created.roomId,
      gameSpecId: 'dark-xiangqi',
    });
    assert.equal(black.seat, 'black');

    const third = await connectClient({
      url: server.url,
      room: created.roomId,
      gameSpecId: 'dark-xiangqi',
      awaitHello: false,
    });
    await third.closed;
    assert.equal(third.isClosed(), true);

    redReclaim.send({ type: 'move', from: 'b3', to: 'b4' });
    const redMoveFrame = await redReclaim.waitFor<{
      type: string;
      event?: {
        type: string;
        at: number;
        roomId: string;
        color: string;
        move: { from: string; to: string };
      };
      state: { board: Record<string, unknown> };
    }>((msg) => msg.type === 'event-appended' && msg.gameSpecId === 'dark-xiangqi');
    assert.equal(redMoveFrame.event?.type, 'move-played');
    assert.equal(redMoveFrame.event.roomId, created.roomId);
    assert.equal(redMoveFrame.event.color, 'red');
    assert.deepEqual(redMoveFrame.event.move, { from: 'b3', to: 'b4' });

    const blackMoveFrame = await black.waitFor<{
      type: string;
      event?: unknown;
      state: { board: Record<string, unknown>; visibleSquares: string[] };
    }>((msg) => msg.type === 'event-appended' && msg.gameSpecId === 'dark-xiangqi');
    assert.equal('event' in blackMoveFrame, false);
  } finally {
    restoreEnv(darkXiangqiKey, before);
    await server.close();
  }
});

test('Dark Xiangqi room ids fail closed instead of falling through to chess', async () => {
  const before = process.env[darkXiangqiKey];
  process.env[darkXiangqiKey] = 'true';
  const server = await startTestServer();
  try {
    const missingRoomId = `dxq_missing_${Date.now()}`;
    const client = await connectClient({
      url: server.url,
      room: missingRoomId,
      awaitHello: false,
    });

    await client.closed;
    assert.equal(client.isClosed(), true);
    assert.equal(client.closeCode(), 1008);
    assert.equal(client.closeReason(), 'room unavailable');
    assert.equal(server.rooms.has(missingRoomId), false);
  } finally {
    restoreEnv(darkXiangqiKey, before);
    await server.close();
  }
});

async function createDarkXiangqiRoom(
  server: TestServer,
  body: Record<string, unknown> = {},
): Promise<Response> {
  return fetch(`http://127.0.0.1:${server.port}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'pvp', gameSpecId: 'dark-xiangqi', ...body }),
  });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
