import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import type { DarkXiangqiRuntimeRoom } from './dark-xiangqi-runtime.js';
import { darkXiangqiTenant } from './dark-xiangqi-tenant.js';
import {
  type DarkXiangqiEngineContext,
  playDarkXiangqiEngineMoveIfReady,
} from './server-dark-xiangqi-engine.js';
import type { DarkXiangqiLiveRoom } from './server-ws-dark-xiangqi.js';
import { appendTenantRuntimeEvent, createTenantRuntimeRoom } from './variant-tenant/runtime.js';

const darkXiangqiFlag = 'MISTBOARD_DARK_XIANGQI_ENABLED';

test('Dark Xiangqi engine loop falls back on fog-pseudo-legal output', async () => {
  await withFlag(async () => {
    const previousUrl = process.env.MISTBOARD_INTERNAL_ENGINE_URL;
    const previousToken = process.env.MISTBOARD_INTERNAL_ENGINE_TOKEN;
    const service = createServer(async (req, res) => {
      assert.equal(req.method, 'POST');
      assert.equal(req.url, '/internal/engine/turn');
      const request = JSON.parse(await readBody(req)) as { gameId: string; sessionId: string };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          protocolVersion: '1',
          gameId: request.gameId,
          sessionId: request.sessionId,
          move: { from: 'i10', to: 'i9' },
        }),
      );
    });
    await listen(service);

    try {
      process.env.MISTBOARD_INTERNAL_ENGINE_URL = `http://127.0.0.1:${serverPort(service)}`;
      process.env.MISTBOARD_INTERNAL_ENGINE_TOKEN = 'test-token';
      const room = pveRoom('red');
      const ctx = engineCtx(room);

      await playDarkXiangqiEngineMoveIfReady(ctx, room);

      const last = room.events.at(-1);
      assert.equal(last?.type, 'move-played');
      assert.equal(last?.type === 'move-played' && last.color, 'red');
      assert.deepEqual(room.projection.state.status, { type: 'playing', turn: 'black' });
    } finally {
      restoreEnv('MISTBOARD_INTERNAL_ENGINE_URL', previousUrl);
      restoreEnv('MISTBOARD_INTERNAL_ENGINE_TOKEN', previousToken);
      await close(service);
    }
  });
});

function pveRoom(engineSeat: 'red' | 'black'): DarkXiangqiLiveRoom {
  const created = createTenantRuntimeRoom(darkXiangqiTenant, 'dxq_engine_test');
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error('room create failed');
  const room = created.room;
  appendTenantRuntimeEvent(darkXiangqiTenant, room, {
    type: 'seat-assigned',
    at: 1,
    roomId: room.id,
    clientId: 'python-fdx-v1.0',
    seat: engineSeat,
  });
  appendTenantRuntimeEvent(darkXiangqiTenant, room, {
    type: 'seat-assigned',
    at: 2,
    roomId: room.id,
    clientId: 'human',
    seat: engineSeat === 'red' ? 'black' : 'red',
  });
  return room as DarkXiangqiLiveRoom;
}

function engineCtx(room: DarkXiangqiRuntimeRoom): DarkXiangqiEngineContext {
  return {
    appendEvent: async (_room, event) => appendTenantRuntimeEvent(darkXiangqiTenant, room, event),
    broadcastEventAppended: () => {},
    now: () => 1_000,
  };
}

async function withFlag(fn: () => Promise<void>): Promise<void> {
  const before = process.env[darkXiangqiFlag];
  process.env[darkXiangqiFlag] = 'true';
  try {
    await fn();
  } finally {
    restoreEnv(darkXiangqiFlag, before);
  }
}

async function readBody(req: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function serverPort(server: Server): number {
  const address = server.address();
  assert.equal(typeof address, 'object');
  assert.notEqual(address, null);
  return (address as AddressInfo).port;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
