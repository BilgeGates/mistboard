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
import { resolveBotRoomRequest, tryHandle } from './routes/rooms.js';
// The multi-variant resolve tests exercise Misty's banqi entry, which needs
// the banqi tenant registered (isBotSpecPlayable reads the launch flag through
// the tenant registry; the flag itself is read lazily per request).
import './variant-tenant/register-tenants.js';

process.env.MISTBOARD_BANQI_ENABLED = 'true';

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
    botId?: string;
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
          pveBotId: options?.botId ?? null,
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
      options: { engineColor: 'black', engineReservationId: 'reservation-1', botId: 'play-bot' },
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

  test('a legacy bot id canonicalizes to the merged identity before the lookup', async () => {
    await insertMistyProfile();
    const response = captureResponse();

    const resolved = await resolveBotRoomRequest(response, {
      botId: 'misty-dark-chess',
      mode: 'pve',
    });

    assert.ok(resolved);
    assert.equal(resolved.botId, 'misty');
    assert.equal(resolved.gameSpecId, 'dark-chess');
    assert.equal(resolved.engineId, 'python-v2-v1.5');
  });

  test('a multi-variant bot resolves the per-spec engine for a supported spec', async () => {
    await insertMistyProfile();
    const response = captureResponse();

    const resolved = await resolveBotRoomRequest(response, {
      botId: 'misty',
      gameSpecId: 'banqi',
      mode: 'pve',
      timeControl: { initialMs: 60_000, incrementMs: 1_000 },
    });

    assert.ok(resolved);
    assert.equal(resolved.botId, 'misty');
    assert.equal(resolved.gameSpecId, 'banqi');
    assert.equal(resolved.engineId, 'misty-banqi');
    // Caller-chosen pace passes through; the tenant gate downstream validates it.
    assert.deepEqual(resolved.timeControl, { initialMs: 60_000, incrementMs: 1_000 });
  });

  test('a spec outside the bot roster rejects with bot_game_spec_conflict', async () => {
    await insertMistyProfile();
    const response = captureResponse();

    const resolved = await resolveBotRoomRequest(response, {
      botId: 'misty',
      gameSpecId: 'xiangqi',
      mode: 'pve',
    });

    assert.equal(resolved, null);
    assert.equal(response.status, 400);
    assert.deepEqual(JSON.parse(response.body), { error: 'bot_game_spec_conflict' });
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

// The merged Misty row as migration 111 writes it (the harness truncates
// bot_profiles between tests, so each test re-inserts what it needs).
async function insertMistyProfile(): Promise<void> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO bot_profiles
         (id, display_name, bio, owner_type, active_engine_id, default_game_spec_id,
          supported_game_spec_ids, play_initial_ms, play_increment_ms, visibility)
       VALUES ('misty', 'Misty', '', 'system', 'python-v2-v1.5', 'dark-chess',
               ARRAY['dark-chess', 'dark-draft960', 'dark-xiangqi', 'banqi', 'jungle', 'jungle-flip'],
               180000, 2000, 'public')`,
    );
  } finally {
    await client.end();
  }
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
