import type { IncomingMessage, ServerResponse } from 'node:http';
import { listBotRatingSnapshots, promoteBotRatingSnapshots } from './bot-rating-snapshots.js';
import { getPublicBotProfile, listPublicBots, recordGameEnd } from './persistence.js';
import {
  assert,
  definePersistenceTests,
  pg,
  TEST_DATABASE_URL,
  test,
} from './persistence-test-support.js';
import { tryHandle as tryHandleBotsRoute } from './routes/bots.js';

type ResponseCapture = {
  body: string;
  headers: Record<string, string | string[]>;
  status: number | null;
};

definePersistenceTests('bot profiles', () => {
  test('lists public bot profiles with public recent games', async () => {
    await insertBotProfile('test-bot', 'Test Bot', 'public');
    await insertBotProfile('private-bot', 'Private Bot', 'private');
    await insertBotRatingSnapshot('test-bot', {
      rating: 1812,
      ratingDeviation: 92,
      games: 48,
      source: 'eve-anchor',
      sourceRef: 'eve-report-2026-01-01',
      published: true,
      createdAt: new Date('2026-01-01T00:02:00Z'),
    });
    await insertBotRatingSnapshot('test-bot', {
      rating: 2200,
      ratingDeviation: 80,
      games: 64,
      source: 'manual',
      sourceRef: 'draft-calibration',
      published: false,
      createdAt: new Date('2026-01-01T00:03:00Z'),
    });

    const startedAt = new Date('2026-01-01T00:00:00Z');
    const publicEndedAt = new Date('2026-01-01T00:04:00Z');
    const privateEndedAt = new Date('2026-01-01T00:05:00Z');

    await recordGameEnd('test-bot-public-game', {
      variant: 'dark-chess',
      mode: 'pve',
      result: 'black-wins',
      termination: 'king-captured',
      plyCount: 20,
      startedAt,
      endedAt: publicEndedAt,
      whiteClient: 'human-client',
      blackClient: 'python-v2-v1.4',
      whiteName: null,
      blackName: 'Test Bot',
      corpusId: null,
      rated: false,
      visibility: 'public',
      initialMs: 180_000,
      incrementMs: 2_000,
      participants: [
        {
          color: 'white',
          displayName: 'Guest',
          subjectType: 'guest',
          subjectId: null,
          visibility: 'public',
        },
        {
          color: 'black',
          displayName: 'Test Bot',
          subjectType: 'bot',
          subjectId: 'test-bot',
          visibility: 'public',
        },
      ],
    });

    await recordGameEnd('test-bot-private-game', {
      variant: 'dark-chess',
      mode: 'pve',
      result: 'black-wins',
      termination: 'king-captured',
      plyCount: 22,
      startedAt,
      endedAt: privateEndedAt,
      whiteClient: 'human-client-2',
      blackClient: 'python-v2-v1.4',
      whiteName: null,
      blackName: 'Test Bot',
      corpusId: null,
      rated: false,
      visibility: 'private',
      participants: [
        {
          color: 'white',
          displayName: 'Guest',
          subjectType: 'guest',
          subjectId: null,
          visibility: 'private',
        },
        {
          color: 'black',
          displayName: 'Test Bot',
          subjectType: 'bot',
          subjectId: 'test-bot',
          visibility: 'public',
        },
      ],
    });

    const bots = await listPublicBots();
    assert.deepEqual(
      bots.map((bot) => bot.id),
      ['test-bot'],
    );
    assert.equal(bots[0]?.gamesTotal, 1);
    assert.deepEqual(bots[0]?.record, {
      games: 1,
      wins: 1,
      losses: 0,
      draws: 0,
    });
    assert.equal(bots[0]?.rating?.rating, 1812);
    assert.equal(bots[0]?.rating?.ratingDeviation, 92);
    assert.equal(bots[0]?.rating?.games, 48);
    assert.equal(bots[0]?.rating?.source, 'eve-anchor');
    assert.equal(bots[0]?.rating?.sourceRef, 'eve-report-2026-01-01');
    assert.equal(bots[0]?.rating?.provisional, false);
    assert.equal(bots[0]?.play.engineId, 'python-v2-v1.4');

    const profile = await getPublicBotProfile('test-bot');
    assert.equal(profile?.gamesTotal, 1);
    assert.deepEqual(profile?.record, {
      games: 1,
      wins: 1,
      losses: 0,
      draws: 0,
    });
    assert.equal(profile?.rating?.rating, 1812);
    assert.equal(profile?.games.length, 1);
    assert.equal(profile?.games[0]?.roomId, 'test-bot-public-game');
    assert.equal(profile?.games[0]?.playerColor, 'black');
    assert.equal(profile?.games[0]?.participants[1]?.subjectType, 'bot');
    assert.equal(profile?.games[0]?.participants[1]?.subjectId, 'test-bot');

    assert.equal(await getPublicBotProfile('private-bot'), null);
  });

  test('bot API routes expose public directory and profile payloads', async () => {
    await insertBotProfile('route-bot', 'Route Bot', 'public');
    await insertBotProfile('hidden-variant-bot', 'Hidden Variant Bot', 'public', {
      gameSpecId: 'dark-mini-xiangqi',
    });

    const listResponse = await routeGet('/api/bots');
    assert.equal(listResponse.status, 200);
    const listPayload = JSON.parse(listResponse.body) as { bots: Array<{ id: string }> };
    assert.deepEqual(
      listPayload.bots.map((bot) => bot.id),
      ['route-bot'],
    );

    const profileResponse = await routeGet('/api/bots/route-bot');
    assert.equal(profileResponse.status, 200);
    const profilePayload = JSON.parse(profileResponse.body) as { bot: { id: string } };
    assert.equal(profilePayload.bot.id, 'route-bot');

    const invalidResponse = await routeGet('/api/bots/bad%2Fid');
    assert.equal(invalidResponse.status, 400);

    const missingResponse = await routeGet('/api/bots/missing-bot');
    assert.equal(missingResponse.status, 404);

    const hiddenVariantResponse = await routeGet('/api/bots/hidden-variant-bot');
    assert.equal(hiddenVariantResponse.status, 404);
  });

  test('bot rating snapshot audit query separates latest, public, and history views', async () => {
    await insertBotProfile('audit-bot', 'Audit Bot', 'public');
    await insertBotRatingSnapshot('audit-bot', {
      rating: 1800,
      ratingDeviation: 95,
      games: 24,
      source: 'eve-anchor',
      sourceRef: 'published-report',
      published: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    await insertBotRatingSnapshot('audit-bot', {
      rating: 1900,
      ratingDeviation: 88,
      games: 30,
      source: 'manual',
      sourceRef: 'draft-report',
      published: false,
      createdAt: new Date('2026-01-02T00:00:00Z'),
    });

    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      const latest = await listBotRatingSnapshots(client, { botId: 'audit-bot' });
      assert.equal(latest.length, 1);
      assert.equal(latest[0]?.rating, 1900);
      assert.equal(latest[0]?.published, false);
      assert.equal(latest[0]?.publishedAt, null);

      const published = await listBotRatingSnapshots(client, {
        botId: 'audit-bot',
        visibility: 'published',
      });
      assert.equal(published.length, 1);
      assert.equal(published[0]?.rating, 1800);
      assert.equal(published[0]?.published, true);
      assert.equal(published[0]?.publishedAt?.toISOString(), '2026-01-01T00:00:00.000Z');

      const history = await listBotRatingSnapshots(client, {
        botId: 'audit-bot',
        history: true,
      });
      assert.deepEqual(
        history.map((snapshot) => snapshot.rating),
        [1900, 1800],
      );
    } finally {
      await client.end();
    }
  });

  test('bot rating promotion publishes an exact draft snapshot for public bot pages', async () => {
    await insertBotProfile('promote-bot', 'Promote Bot', 'public');
    await insertBotRatingSnapshot('promote-bot', {
      rating: 1700,
      ratingDeviation: 120,
      games: 10,
      source: 'eve-anchor',
      sourceRef: 'old-report',
      published: true,
      createdAt: new Date('2026-01-03T00:00:00Z'),
    });
    const draftId = await insertBotRatingSnapshot('promote-bot', {
      rating: 1850,
      ratingDeviation: 82,
      games: 40,
      source: 'eve-anchor',
      sourceRef: 'reviewed-report',
      published: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
    try {
      const promoted = await promoteBotRatingSnapshots(pool, {
        snapshotId: draftId,
        at: new Date('2026-01-04T00:00:00Z'),
      });
      assert.equal(promoted.length, 1);
      assert.equal(promoted[0]?.snapshotId, draftId);
      assert.equal(promoted[0]?.published, true);
      assert.equal(promoted[0]?.publishedAt?.toISOString(), '2026-01-04T00:00:00.000Z');
    } finally {
      await pool.end();
    }

    const bots = await listPublicBots();
    assert.equal(bots[0]?.id, 'promote-bot');
    assert.equal(bots[0]?.rating?.rating, 1850);
  });
});

async function routeGet(pathname: string): Promise<ResponseCapture> {
  const response = captureResponse();
  const handled = await tryHandleBotsRoute(
    {},
    { method: 'GET', headers: {} } as unknown as IncomingMessage,
    response,
    pathname,
  );
  assert.equal(handled, true);
  return response;
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

async function insertBotProfile(
  id: string,
  displayName: string,
  visibility: 'private' | 'unlisted' | 'public',
  opts: { gameSpecId?: string } = {},
): Promise<void> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO bot_profiles
         (id, display_name, bio, owner_type, active_engine_id, default_game_spec_id,
          supported_game_spec_ids, play_initial_ms, play_increment_ms, visibility)
       VALUES ($1, $2, '', 'system', 'python-v2-v1.4', $3,
               ARRAY[$3], 180000, 2000, $4)`,
      [id, displayName, opts.gameSpecId ?? 'dark-chess', visibility],
    );
  } finally {
    await client.end();
  }
}

async function insertBotRatingSnapshot(
  botId: string,
  opts: {
    rating: number;
    ratingDeviation: number | null;
    games: number;
    source: 'manual' | 'eve-anchor' | 'import';
    sourceRef: string | null;
    published: boolean;
    createdAt: Date;
    gameSpecId?: string;
  },
): Promise<number> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO bot_rating_snapshots
         (bot_id, game_spec_id, time_class, rating, rating_deviation, games,
          source, source_ref, published, published_at, created_at)
       VALUES ($1, $2, 'blitz', $3, $4, $5, $6, $7, $8,
               CASE WHEN $8::boolean THEN $9::timestamptz ELSE NULL::timestamptz END, $9)
       RETURNING id::text`,
      [
        botId,
        opts.gameSpecId ?? 'dark-chess',
        opts.rating,
        opts.ratingDeviation,
        opts.games,
        opts.source,
        opts.sourceRef,
        opts.published,
        opts.createdAt,
      ],
    );
    return Number(rows[0]?.id ?? 0);
  } finally {
    await client.end();
  }
}
