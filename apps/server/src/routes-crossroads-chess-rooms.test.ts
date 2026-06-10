import assert from 'node:assert/strict';
import type { ServerResponse } from 'node:http';
import test from 'node:test';
import { CROSSROADS_CHESS_SPEC_ID } from '@mistboard/game';
import type {
  CrossroadsChessCreatorPreference,
  CrossroadsChessRuntimeRoom,
} from './crossroads-chess-runtime.js';
import { handleCrossroadsChessCreate } from './routes/crossroads-chess-rooms.js';
import type { HttpApiContext } from './routes/lib.js';

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
  } satisfies Partial<HttpApiContext>;
  const response = captureResponse();

  await handleCrossroadsChessCreate(ctx as HttpApiContext, response, {
    mode: 'pvp',
    gameSpecId: CROSSROADS_CHESS_SPEC_ID,
    preferredColor: 'black',
  });

  assert.equal(response.status, 201);
  assert.equal(creatorPreference, 'red');
});
