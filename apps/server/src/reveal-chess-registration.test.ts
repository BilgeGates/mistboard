/**
 * Reveal Chess registration: the tenant is reachable through the shared dispatch
 * layer (registry routing by spec id and room prefix, the POST /api/rooms create
 * flow) and a created room is a real, hydratable live room whose event log
 * carries the server-secret deal.
 */

import assert from 'node:assert/strict';
import type { ServerResponse } from 'node:http';
import test from 'node:test';
import { REVEAL_CHESS_SPEC_ID } from '@mistboard/game';
import {
  createRevealChessRoom,
  getOrLoadRevealChessRoom,
  revealChessRooms,
} from './reveal-chess-registration.js';
import {
  handleRevealChessCreate,
  type RevealChessCreateContext,
  requestsRevealChess,
} from './routes/reveal-chess-rooms.js';
import { variantTenantForRoomId, variantTenantForSpecId } from './variant-tenant/registry.js';

const FLAG = 'MISTBOARD_REVEAL_CHESS_ENABLED';
process.env[FLAG] = 'true';

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

function createContext(): RevealChessCreateContext {
  return {
    databaseRequired: false,
    isDraining: () => false,
    drainDeadlineMs: () => null,
    createRevealChessRoom,
  };
}

test('reveal-chess routes by spec id and room-id prefix through the registry', () => {
  assert.equal(variantTenantForSpecId(REVEAL_CHESS_SPEC_ID)?.kind, 'reveal-chess');
  assert.equal(variantTenantForRoomId('rc_whatever')?.kind, 'reveal-chess');
  assert.equal(variantTenantForRoomId('jq_x')?.kind === 'reveal-chess', false);
});

test('requestsRevealChess claims only canonical reveal-chess spec requests', () => {
  assert.equal(requestsRevealChess({ gameSpecId: REVEAL_CHESS_SPEC_ID }), true);
  assert.equal(requestsRevealChess({ variant: REVEAL_CHESS_SPEC_ID }), false);
  assert.equal(requestsRevealChess({ gameSpecId: 'jieqi' }), false);
});

test('reveal-chess create is hidden when the flag is off', async () => {
  delete process.env[FLAG];
  try {
    const response = captureResponse();
    await handleRevealChessCreate(createContext(), response, {
      gameSpecId: REVEAL_CHESS_SPEC_ID,
      mode: 'pvp',
    });
    assert.equal(response.status, 404);
    assert.deepEqual(responseJson(response), { error: 'reveal_chess_disabled' });
  } finally {
    process.env[FLAG] = 'true';
  }
});

test('reveal-chess create rejects unsupported surfaces before creating a room', async () => {
  const response = captureResponse();
  await handleRevealChessCreate(createContext(), response, {
    gameSpecId: REVEAL_CHESS_SPEC_ID,
    mode: 'pvp',
    rated: true,
  });
  assert.equal(response.status, 501);
  assert.deepEqual(responseJson(response), { error: 'reveal_chess_unsupported_surface' });
});

test('reveal-chess create rejects a PvE request (no engine/bot)', async () => {
  const response = captureResponse();
  await handleRevealChessCreate(createContext(), response, {
    gameSpecId: REVEAL_CHESS_SPEC_ID,
    mode: 'pve',
  });
  assert.equal(response.status, 501);
  assert.deepEqual(responseJson(response), { error: 'reveal_chess_unsupported_surface' });
});

test('reveal-chess create makes a hostable room that hydrates back with its deal', async () => {
  try {
    const response = captureResponse();
    await handleRevealChessCreate(createContext(), response, {
      gameSpecId: REVEAL_CHESS_SPEC_ID,
      mode: 'pvp',
    });
    assert.equal(response.status, 201);
    const body = responseJson(response);
    const roomId = body.roomId as string;
    assert.ok(roomId.startsWith('rc_'));
    assert.equal(body.gameSpecId, REVEAL_CHESS_SPEC_ID);

    const room = await getOrLoadRevealChessRoom(roomId);
    assert.ok(room, 'the created room is live and hydratable');
    const created = room.events[0];
    assert.equal(created.type, 'room-created');
    if (created.type === 'room-created') {
      assert.ok(created.setup, 'the server-secret deal is persisted in the room log');
    }
  } finally {
    revealChessRooms.clear();
  }
});
