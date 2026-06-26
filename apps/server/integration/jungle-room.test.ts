// Jungle (perfect-information 7×9 Dou Shou Qi) live-room integration: the HTTP
// create + WebSocket move loop over a real booted server. The jungle-specific
// property here is PERFECT INFORMATION — unlike the fog tenants (dark-xiangqi),
// the non-moving player's frame is NOT redacted: both seats see every move and
// the shared lastMove.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectClient, startTestServer, type TestServer } from './harness.js';

const jungleKey = 'MISTBOARD_JUNGLE_ENABLED';

test('Jungle direct room creation stays hidden while the flag is off', async () => {
  const before = process.env[jungleKey];
  delete process.env[jungleKey];
  const server = await startTestServer();
  try {
    const response = await createJungleRoom(server);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'jungle_disabled' });
  } finally {
    restoreEnv(jungleKey, before);
    await server.close();
  }
});

test('Jungle create + websocket loop is perfect-information (both seats see every move)', async () => {
  const before = process.env[jungleKey];
  process.env[jungleKey] = 'true';
  const server = await startTestServer();
  try {
    const createdResponse = await createJungleRoom(server);
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()) as {
      roomId: string;
      url: string;
      mode: string;
      gameSpecId: string;
    };
    assert.equal(created.gameSpecId, 'jungle');
    assert.equal(created.mode, 'pvp');
    assert.equal(created.roomId.startsWith('jgl_'), true);

    const red = await connectClient({
      url: server.url,
      room: created.roomId,
      gameSpecId: 'jungle',
    });
    assert.equal(red.seat, 'red');
    // Perfect information: red's opening hello carries the full canonical board.
    const redHello = red.messages.find((m) => (m as { type?: string }).type === 'hello') as {
      state: { board: Record<string, unknown>; visibleSquares: string[] };
    };
    assert.deepEqual(redHello.state.board.a1, { color: 'red', role: 'lion' });
    assert.deepEqual(redHello.state.board.a9, { color: 'black', role: 'tiger' });
    assert.equal(redHello.state.visibleSquares.length, 63);

    const black = await connectClient({
      url: server.url,
      room: created.roomId,
      gameSpecId: 'jungle',
    });
    assert.equal(black.seat, 'black');

    // Red advances the rat a3→a4. The MOVER sees its own move.
    red.send({ type: 'move', from: 'a3', to: 'a4' });
    const redFrame = await red.waitFor<{
      event?: { type: string; color: string; move: { from: string; to: string } };
      state: { board: Record<string, unknown>; lastMove?: { from: string; to: string } };
    }>((msg) => msg.type === 'event-appended' && msg.gameSpecId === 'jungle');
    assert.equal(redFrame.event?.type, 'move-played');
    assert.deepEqual(redFrame.event?.move, { from: 'a3', to: 'a4' });
    assert.deepEqual(redFrame.state.lastMove, { from: 'a3', to: 'a4' });

    // The KEY perfect-info assertion: black ALSO receives the event + lastMove
    // (the dark-xiangqi tenant strips both for the non-moving fog player).
    const blackFrame = await black.waitFor<{
      event?: { type: string; move: { from: string; to: string } };
      state: { board: Record<string, unknown>; lastMove?: { from: string; to: string } };
    }>((msg) => msg.type === 'event-appended' && msg.gameSpecId === 'jungle');
    assert.deepEqual(blackFrame.event?.move, { from: 'a3', to: 'a4' });
    assert.deepEqual(blackFrame.state.lastMove, { from: 'a3', to: 'a4' });
    assert.deepEqual(blackFrame.state.board.a4, { color: 'red', role: 'rat' });
    assert.equal(blackFrame.state.board.a3, undefined);

    // Black replies; red sees it. The live turn alternation works.
    black.send({ type: 'move', from: 'g7', to: 'g6' });
    const redSeesBlack = await red.waitFor<{
      state: { lastMove?: { from: string; to: string } };
    }>(
      (msg) =>
        msg.type === 'event-appended' &&
        msg.gameSpecId === 'jungle' &&
        (msg as { state?: { lastMove?: { from?: string } } }).state?.lastMove?.from === 'g7',
    );
    assert.deepEqual(redSeesBlack.state.lastMove, { from: 'g7', to: 'g6' });
  } finally {
    restoreEnv(jungleKey, before);
    await server.close();
  }
});

test('Jungle rooms accept native resignation after both first moves', async () => {
  const before = process.env[jungleKey];
  process.env[jungleKey] = 'true';
  const server = await startTestServer();
  try {
    const createdResponse = await createJungleRoom(server);
    const created = (await createdResponse.json()) as { roomId: string };

    const red = await connectClient({
      url: server.url,
      room: created.roomId,
      gameSpecId: 'jungle',
    });
    const black = await connectClient({
      url: server.url,
      room: created.roomId,
      gameSpecId: 'jungle',
    });

    red.send({ type: 'move', from: 'a3', to: 'a4' });
    await black.waitFor((msg) => msg.type === 'event-appended' && msg.gameSpecId === 'jungle');
    black.send({ type: 'move', from: 'g7', to: 'g6' });
    await red.waitFor(
      (msg) =>
        msg.type === 'event-appended' &&
        msg.gameSpecId === 'jungle' &&
        (msg as { state?: { lastMove?: { from?: string } } }).state?.lastMove?.from === 'g7',
    );

    red.send({ type: 'resign' });
    const finalFrame = await black.waitFor<{
      state: { status: { type: string; winner: string; reason: string } };
    }>(
      (msg) =>
        msg.type === 'snapshot' &&
        msg.gameSpecId === 'jungle' &&
        (msg.state as { status?: { reason?: string } } | undefined)?.status?.reason ===
          'resignation',
    );
    assert.deepEqual(finalFrame.state.status, {
      type: 'finished',
      winner: 'black',
      reason: 'resignation',
    });
  } finally {
    restoreEnv(jungleKey, before);
    await server.close();
  }
});

async function createJungleRoom(
  server: TestServer,
  body: Record<string, unknown> = {},
): Promise<Response> {
  return fetch(`http://127.0.0.1:${server.port}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'pvp', gameSpecId: 'jungle', ...body }),
  });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
