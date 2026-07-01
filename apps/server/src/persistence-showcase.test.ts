import { gameAggregates, listShowcaseGames, queryGames } from './persistence.js';
import {
  assert,
  definePersistenceTests,
  pg,
  TEST_DATABASE_URL,
  test,
} from './persistence-test-support.js';

type SeedGame = {
  roomId: string;
  mode: 'pvp' | 'pve' | 'eve';
  result: string;
  termination: string;
  plyCount: number;
  endedAt: Date;
  visibility?: string;
  variant?: string;
  corpusId?: string | null;
  withEvent?: boolean;
};

async function seed(games: SeedGame[]): Promise<void> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    for (const g of games) {
      const variant = g.variant ?? 'dark-chess';
      await client.query(
        `INSERT INTO games
           (room_id, variant, result, termination, ply_count, started_at, ended_at,
            white_name, black_name, corpus_id, mode, status, visibility)
         VALUES ($1, $2, $3, $4, $5, $6, $6, 'White', 'Black', $7, $8, 'completed', $9)`,
        [
          g.roomId,
          variant,
          g.result,
          g.termination,
          g.plyCount,
          g.endedAt,
          g.corpusId ?? null,
          g.mode,
          g.visibility ?? 'public',
        ],
      );
      if (g.withEvent !== false) {
        await client.query(
          `INSERT INTO events (room_id, seq, type, payload) VALUES ($1, 0, 'room-created', $2)`,
          [
            g.roomId,
            { type: 'room-created', at: g.endedAt.getTime(), roomId: g.roomId, variant, offer: [] },
          ],
        );
      }
    }
  } finally {
    await client.end();
  }
}

definePersistenceTests('showcase + browse queries', () => {
  test('listShowcaseGames recency-leads, includes substantial PvP, excludes short/abandoned', async () => {
    const t = (min: number) => new Date(Date.UTC(2026, 5, 1, 12, min, 0));
    await seed([
      {
        roomId: 'sc-pvp-kc',
        mode: 'pvp',
        result: 'white-wins',
        termination: 'king-captured',
        plyCount: 40,
        endedAt: t(10),
      },
      {
        roomId: 'sc-pvp-timeout',
        mode: 'pvp',
        result: 'black-wins',
        termination: 'timeout',
        plyCount: 35,
        endedAt: t(8),
      },
      {
        roomId: 'sc-pvp-short',
        mode: 'pvp',
        result: 'white-wins',
        termination: 'king-captured',
        plyCount: 12,
        endedAt: t(9),
      },
      {
        roomId: 'sc-pvp-abandon',
        mode: 'pvp',
        result: 'white-wins',
        termination: 'abandonment',
        plyCount: 50,
        endedAt: t(11),
      },
      {
        roomId: 'sc-eve-x',
        mode: 'eve',
        result: 'white-wins',
        termination: 'king-captured',
        plyCount: 60,
        endedAt: t(20),
        corpusId: 'run-x',
      },
    ]);

    const ids = (await listShowcaseGames({ limit: 8 })).map((g) => g.roomId);
    // Recency-lead: the single most-recent finished game leads regardless of tier
    // (the EvE game at t20 here) so the showcase reflects the site's latest
    // activity; the tiered interleave then fills, substantial PvP ahead of the rest.
    assert.equal(ids[0], 'sc-eve-x');
    assert.deepEqual(ids.slice(1, 3), ['sc-pvp-kc', 'sc-pvp-timeout']);
    // <30 plies and abandonments are not demo-worthy.
    assert.ok(!ids.includes('sc-pvp-short'));
    assert.ok(!ids.includes('sc-pvp-abandon'));
  });

  test('listShowcaseGames falls back to EvE, one game per run, decisive only', async () => {
    const t = (min: number) => new Date(Date.UTC(2026, 5, 1, 13, min, 0));
    await seed([
      {
        roomId: 'sc-a-old',
        mode: 'eve',
        result: 'white-wins',
        termination: 'king-captured',
        plyCount: 40,
        endedAt: t(1),
        corpusId: 'run-a',
      },
      {
        roomId: 'sc-a-new',
        mode: 'eve',
        result: 'black-wins',
        termination: 'king-captured',
        plyCount: 50,
        endedAt: t(5),
        corpusId: 'run-a',
      },
      {
        roomId: 'sc-b',
        mode: 'eve',
        result: 'white-wins',
        termination: 'checkmate',
        plyCount: 45,
        endedAt: t(3),
        corpusId: 'run-b',
      },
      {
        roomId: 'sc-draw',
        mode: 'eve',
        result: 'draw',
        termination: 'draw',
        plyCount: 60,
        endedAt: t(4),
        corpusId: 'run-c',
      },
      {
        roomId: 'sc-eve-short',
        mode: 'eve',
        result: 'white-wins',
        termination: 'king-captured',
        plyCount: 20,
        endedAt: t(6),
        corpusId: 'run-d',
      },
    ]);

    const games = await listShowcaseGames({ limit: 8 });
    const ids = games.map((g) => g.roomId);
    assert.equal(games.length, 2, 'one game per qualifying run');
    assert.ok(ids.includes('sc-a-new'));
    assert.ok(!ids.includes('sc-a-old'), 'deduped: only the newest of run-a');
    assert.ok(ids.includes('sc-b'));
    assert.ok(!ids.includes('sc-draw'), 'non-decisive excluded');
    assert.ok(!ids.includes('sc-eve-short'), 'short excluded');
  });

  test('queryGames filters + paginates; gameAggregates computes the win split', async () => {
    const t = (min: number) => new Date(Date.UTC(2026, 5, 1, 14, min, 0));
    await seed([
      {
        roomId: 'q-w1',
        mode: 'eve',
        result: 'white-wins',
        termination: 'king-captured',
        plyCount: 40,
        endedAt: t(1),
        withEvent: false,
      },
      {
        roomId: 'q-w2',
        mode: 'eve',
        result: 'white-wins',
        termination: 'king-captured',
        plyCount: 41,
        endedAt: t(2),
        withEvent: false,
      },
      {
        roomId: 'q-b1',
        mode: 'eve',
        result: 'black-wins',
        termination: 'king-captured',
        plyCount: 42,
        endedAt: t(3),
        withEvent: false,
      },
      {
        roomId: 'q-draw',
        mode: 'eve',
        result: 'draw',
        termination: 'draw',
        plyCount: 43,
        endedAt: t(4),
        withEvent: false,
      },
      {
        roomId: 'q-960',
        mode: 'eve',
        result: 'white-wins',
        termination: 'king-captured',
        plyCount: 44,
        endedAt: t(5),
        variant: 'draft960',
        withEvent: false,
      },
    ]);

    const whiteWins = await queryGames({ result: 'white-wins', variant: 'dark-chess' });
    assert.deepEqual(new Set(whiteWins.games.map((g) => g.roomId)), new Set(['q-w1', 'q-w2']));
    assert.equal(whiteWins.total, 2);

    const page = await queryGames({ variant: 'dark-chess', limit: 2, offset: 0 });
    assert.equal(page.games.length, 2);
    assert.equal(
      page.total,
      4,
      '4 dark-chess; the draft960 game is excluded by the variant filter',
    );

    const agg = await gameAggregates({ variant: 'dark-chess' });
    assert.equal(agg.total, 4);
    assert.equal(agg.results.whiteWins, 2);
    assert.equal(agg.results.blackWins, 1);
    assert.equal(agg.results.draws, 1);
  });
});
