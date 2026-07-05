import assert from 'node:assert/strict';
import type { ServerResponse } from 'node:http';
import test from 'node:test';
import { LUZHANQI_SPEC_ID } from '@mistboard/game';
import {
  createLuzhanqiRoom,
  getOrLoadLuzhanqiRoom,
  luzhanqiRooms,
} from './luzhanqi-registration.js';
import {
  handleLuzhanqiCreate,
  type LuzhanqiCreateContext,
  requestsLuzhanqi,
} from './routes/luzhanqi-rooms.js';
import { variantTenantForRoomId, variantTenantForSpecId } from './variant-tenant/registry.js';

const luzhanqiFlag = 'MISTBOARD_LUZHANQI_ENABLED';

type ResponseCapture = { body: string; status: number | null };

function captureResponse(): ServerResponse & ResponseCapture {
  const capture = {
    body: '',
    status: null as number | null,
    writeHead(status: number) {
      capture.status = status;
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

function createContext(): LuzhanqiCreateContext {
  return {
    databaseRequired: false,
    isDraining: () => false,
    drainDeadlineMs: () => null,
    createLuzhanqiRoom,
  };
}

test('luzhanqi routes by spec id and room-id prefix through the registry', () => {
  assert.equal(variantTenantForSpecId(LUZHANQI_SPEC_ID)?.kind, 'luzhanqi');
  assert.equal(variantTenantForRoomId('lzq_whatever')?.kind, 'luzhanqi');
  assert.equal(variantTenantForRoomId('jgl_x')?.kind === 'luzhanqi', false);
});

test('requestsLuzhanqi claims only canonical luzhanqi spec requests', () => {
  assert.equal(requestsLuzhanqi({ gameSpecId: LUZHANQI_SPEC_ID }), true);
  assert.equal(requestsLuzhanqi({ variant: LUZHANQI_SPEC_ID }), false);
  assert.equal(requestsLuzhanqi({ gameSpecId: 'jungle' }), false);
});

test('luzhanqi create is gated off by default', async () => {
  const previous = process.env[luzhanqiFlag];
  delete process.env[luzhanqiFlag];
  try {
    const response = captureResponse();
    await handleLuzhanqiCreate(createContext(), response, {
      gameSpecId: LUZHANQI_SPEC_ID,
      mode: 'pvp',
    });
    assert.equal(response.status, 404);
    assert.deepEqual(responseJson(response), { error: 'luzhanqi_disabled' });
  } finally {
    if (previous !== undefined) process.env[luzhanqiFlag] = previous;
  }
});

test('luzhanqi create is PvP casual only at this checkpoint', async () => {
  await withLuzhanqiFlag(async () => {
    const rated = captureResponse();
    await handleLuzhanqiCreate(createContext(), rated, {
      gameSpecId: LUZHANQI_SPEC_ID,
      mode: 'pvp',
      rated: true,
    });
    assert.equal(rated.status, 501);
    assert.deepEqual(responseJson(rated), { error: 'luzhanqi_unsupported_surface' });

    const pve = captureResponse();
    await handleLuzhanqiCreate(createContext(), pve, {
      gameSpecId: LUZHANQI_SPEC_ID,
      mode: 'pve',
    });
    assert.equal(pve.status, 501);
    assert.deepEqual(responseJson(pve), { error: 'luzhanqi_unsupported_surface' });
  });
});

test('luzhanqi create makes a hostable setup-phase room', async () => {
  await withLuzhanqiFlag(async () => {
    const response = captureResponse();
    await handleLuzhanqiCreate(createContext(), response, {
      gameSpecId: LUZHANQI_SPEC_ID,
      mode: 'pvp',
    });
    assert.equal(response.status, 201);
    const body = responseJson(response);
    const roomId = body.roomId as string;
    assert.ok(roomId.startsWith('lzq_'));
    assert.equal(body.gameSpecId, LUZHANQI_SPEC_ID);

    const room = await getOrLoadLuzhanqiRoom(roomId);
    assert.ok(room, 'the created room is live and hydratable');
    assert.equal(room.events[0]?.type, 'room-created');
    assert.deepEqual(room.projection.state.status, { type: 'setup' });
    assert.equal(Object.keys(room.projection.state.board).length, 0);
    luzhanqiRooms.clear();
  });
});

async function withLuzhanqiFlag(fn: () => Promise<void>): Promise<void> {
  const previous = process.env[luzhanqiFlag];
  process.env[luzhanqiFlag] = 'true';
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env[luzhanqiFlag];
    else process.env[luzhanqiFlag] = previous;
  }
}
