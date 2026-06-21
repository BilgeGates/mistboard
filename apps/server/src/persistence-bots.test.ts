import { getPublicBotProfile, listPublicBots, recordGameEnd } from './persistence.js';
import {
  assert,
  definePersistenceTests,
  pg,
  TEST_DATABASE_URL,
  test,
} from './persistence-test-support.js';

definePersistenceTests('bot profiles', () => {
  test('lists public bot profiles with public recent games', async () => {
    await insertBotProfile('test-bot', 'Test Bot', 'public');
    await insertBotProfile('private-bot', 'Private Bot', 'private');

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
    assert.equal(bots[0]?.play.engineId, 'python-v2-v1.4');

    const profile = await getPublicBotProfile('test-bot');
    assert.equal(profile?.gamesTotal, 1);
    assert.equal(profile?.games.length, 1);
    assert.equal(profile?.games[0]?.roomId, 'test-bot-public-game');
    assert.equal(profile?.games[0]?.playerColor, 'black');
    assert.equal(profile?.games[0]?.participants[1]?.subjectType, 'bot');
    assert.equal(profile?.games[0]?.participants[1]?.subjectId, 'test-bot');

    assert.equal(await getPublicBotProfile('private-bot'), null);
  });
});

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
       VALUES ($1, $2, '', 'system', 'python-v2-v1.4', 'dark-chess',
               ARRAY['dark-chess'], 180000, 2000, $3)`,
      [id, displayName, visibility],
    );
  } finally {
    await client.end();
  }
}
