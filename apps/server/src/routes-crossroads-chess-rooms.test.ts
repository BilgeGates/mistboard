import assert from 'node:assert/strict';
import type { ServerResponse } from 'node:http';
import test from 'node:test';
import { CROSSROADS_CHESS_SPEC_ID } from '@mistboard/game';
import type {
  CrossroadsChessCreatorPreference,
  CrossroadsChessRuntimeRoom,
} from './crossroads-chess-runtime.js';
import {
  type CrossroadsChessCreateContext,
  handleCrossroadsChessCreate,
} from './routes/crossroads-chess-rooms.js';

type ResponseCapture = { body: string; headers: Record<string, string>; status: number | null };

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

test('Crossroads room creation accepts black as the dark-chess picker alias for red', async () => {
  process.env.MISTBOARD_CROSSROADS_CHESS_ENABLED = 'true';
  let creatorPreference: CrossroadsChessCreatorPreference | undefined;
  const ctx = {
    createCrossroadsChessRoom: async (_timeControl, preference) => {
      creatorPreference = preference;
      return {
        ok: true,
        room: {
          id: 'dchess_alias',
          gameSpecId: CROSSROADS_CHESS_SPEC_ID,
        } as CrossroadsChessRuntimeRoom,
      };
    },
    databaseRequired: false,
    drainDeadlineMs: () => null,
    isDraining: () => false,
  } satisfies CrossroadsChessCreateContext;
  const response = captureResponse();

  await handleCrossroadsChessCreate(ctx, response, {
    mode: 'pvp',
    gameSpecId: CROSSROADS_CHESS_SPEC_ID,
    preferredColor: 'black',
  });

  assert.equal(response.status, 201);
  assert.equal(creatorPreference, 'red');
});

test('Crossroads PvE creation seats a known FSF engine opposite the requested side', async () => {
  process.env.MISTBOARD_CROSSROADS_CHESS_ENABLED = 'true';
  let engine: { engineId: string; seat: 'white' | 'red' } | undefined;
  const ctx = {
    createCrossroadsChessRoom: async (_timeControl, _preference, requestedEngine) => {
      engine = requestedEngine;
      return {
        ok: true,
        room: {
          id: 'dchess_engine',
          gameSpecId: CROSSROADS_CHESS_SPEC_ID,
        } as CrossroadsChessRuntimeRoom,
      };
    },
    databaseRequired: false,
    drainDeadlineMs: () => null,
    isDraining: () => false,
  } satisfies CrossroadsChessCreateContext;
  const response = captureResponse();

  await handleCrossroadsChessCreate(ctx, response, {
    mode: 'pve',
    gameSpecId: CROSSROADS_CHESS_SPEC_ID,
    engineId: 'fairy-stockfish-crossroads-very-strong',
    preferredColor: 'black',
  });

  assert.equal(response.status, 201);
  assert.equal(JSON.parse(response.body).mode, 'pve');
  assert.deepEqual(engine, {
    engineId: 'fairy-stockfish-crossroads-very-strong',
    seat: 'white',
  });
});

test('Crossroads PvE creation rejects unknown engine ids', async () => {
  process.env.MISTBOARD_CROSSROADS_CHESS_ENABLED = 'true';
  const response = captureResponse();
  await handleCrossroadsChessCreate(
    {
      createCrossroadsChessRoom: async () => {
        throw new Error('unexpected Crossroads room creation');
      },
      databaseRequired: false,
      drainDeadlineMs: () => null,
      isDraining: () => false,
    } satisfies CrossroadsChessCreateContext,
    response,
    {
      mode: 'pve',
      gameSpecId: CROSSROADS_CHESS_SPEC_ID,
      engineId: 'python-v2-v1.0',
    },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(JSON.parse(response.body), { error: 'invalid_engine' });
});
