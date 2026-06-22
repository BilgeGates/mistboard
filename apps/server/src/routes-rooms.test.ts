import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { RoomTimeControl, VariantId } from '@mistboard/game';
import {
  assert,
  definePersistenceTests,
  pg,
  TEST_DATABASE_URL,
  test,
} from './persistence-test-support.js';
import type { HttpApiContext } from './routes/lib.js';
import { tryHandle } from './routes/rooms.js';
import type { Room } from './server-types.js';
import { roomFixture } from './test-builders.js';

type ResponseCapture = {
  body: string;
  headers: Record<string, string | string[]>;
  status: number | null;
};

type RoomCreateArgs = {
  engineId: string;
  hiddenDraft960?: boolean;
  mode: 'pvp' | 'pve';
  options?: {
    creatorPreference?: 'white' | 'black';
    engineColor?: 'white' | 'black';
    engineReservationId?: string;
    randomSeating?: boolean;
    region?: string;
  };
  rated?: boolean;
  timeControl?: RoomTimeControl;
  variant: VariantId;
};

definePersistenceTests('room bot play requests', () => {
  test('room creation resolves a bot id to its active engine and play settings', async () => {
    await insertBotProfile('play-bot', 'Play Bot', 'public');
    let reserved: { color: 'white' | 'black'; engineId: string } | null = null;
    let created: RoomCreateArgs | null = null;
    const ctx = createContext({
      createRoom: async (mode, variant, engineId, hiddenDraft960, timeControl, rated, options) => {
        created = { engineId, hiddenDraft960, mode, options, rated, timeControl, variant };
        return roomFixture({
          id: 'bot-room',
          mode,
          pveEngineId: engineId,
          randomEngine: mode === 'pve',
          timeControl,
          variant,
        });
      },
      reserveLiveEngineSeat: async (engineId, color) => {
        reserved = { color, engineId };
        return 'reservation-1';
      },
    });
    const response = captureResponse();

    const handled = await tryHandle(
      ctx,
      jsonPost({ botId: 'play-bot', mode: 'pve', preferredColor: 'white' }),
      response,
      '/api/rooms',
    );

    assert.equal(handled, true);
    assert.equal(response.status, 201);
    assert.deepEqual(reserved, { color: 'black', engineId: 'python-v2-v1.5' });
    assert.deepEqual(created, {
      engineId: 'python-v2-v1.5',
      hiddenDraft960: false,
      mode: 'pve',
      options: { engineColor: 'black', engineReservationId: 'reservation-1' },
      rated: false,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      variant: 'dark-chess',
    });
    assert.equal((JSON.parse(response.body) as { url?: string }).url, '/room/bot-room');
  });

  test('room creation rejects a bot id combined with a client-selected engine', async () => {
    await insertBotProfile('play-bot', 'Play Bot', 'public');
    const response = captureResponse();

    const handled = await tryHandle(
      createContext(),
      jsonPost({ botId: 'play-bot', engineId: 'python-v2-v1.5', mode: 'pve' }),
      response,
      '/api/rooms',
    );

    assert.equal(handled, true);
    assert.equal(response.status, 400);
    assert.deepEqual(JSON.parse(response.body), { error: 'bot_engine_conflict' });
  });
});

function createContext(
  overrides: Partial<Pick<HttpApiContext, 'createRoom' | 'reserveLiveEngineSeat'>> = {},
): HttpApiContext {
  return {
    abandonRoom: async () => ({ ok: false, error: 'not_found' }),
    activeGameCount: () => 0,
    annotationsFile: '',
    createRoom: async () => roomFixture({ id: 'room' }),
    databaseRequired: true,
    drainDeadlineMs: () => null,
    inMemoryGameSummary: () => null,
    isDraining: () => false,
    liveClockIncrementMs: 2_000,
    liveClockInitialMs: 180_000,
    lobbyQueue: [],
    lobbyTickets: new Map(),
    pveBuiltinEngineClientId: 'python-v2-v1.5',
    releaseLiveEngineReservation: () => {},
    reserveLiveEngineSeat: async () => 'reservation',
    rooms: new Map<string, Room>(),
    ...overrides,
  };
}

function captureResponse(): ServerResponse & ResponseCapture {
  const capture = {
    body: '',
    headers: {} as Record<string, string | string[]>,
    status: null as number | null,
    writeHead(status: number, headers?: Record<string, string | string[]>) {
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

function jsonPost(body: Record<string, unknown>): IncomingMessage {
  const request = Readable.from([JSON.stringify(body)]) as unknown as IncomingMessage;
  request.method = 'POST';
  request.headers = { accept: 'application/json', 'content-type': 'application/json' };
  return request;
}

async function insertBotProfile(
  id: string,
  displayName: string,
  visibility: 'private' | 'unlisted' | 'public',
): Promise<void> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO bot_profiles
         (id, display_name, bio, owner_type, active_engine_id, default_game_spec_id,
          supported_game_spec_ids, play_initial_ms, play_increment_ms, visibility)
       VALUES ($1, $2, '', 'system', 'python-v2-v1.5', 'dark-chess',
               ARRAY['dark-chess'], 180000, 2000, $3)`,
      [id, displayName, visibility],
    );
  } finally {
    await client.end();
  }
}
