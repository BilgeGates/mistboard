import {
  abortRunningGame,
  createUser,
  getGameSummary,
  getLeaderboard,
  getUserGamesPage,
  getUserProfileByHandle,
  recordGameEnd,
  recordGameStart,
} from './persistence.js';
import {
  assert,
  definePersistenceTests,
  pg,
  TEST_DATABASE_URL,
  test,
} from './persistence-test-support.js';

definePersistenceTests('ratings', () => {
  test('rated PvP game updates both players Glicko ratings', async () => {
    const now = new Date();
    await createUser({
      id: 'user_white',
      email: 'w@example.com',
      emailVerifiedAt: now,
      handle: 'whiteplayer',
      displayName: 'White',
      now,
    });
    await createUser({
      id: 'user_black',
      email: 'b@example.com',
      emailVerifiedAt: now,
      handle: 'blackplayer',
      displayName: 'Black',
      now,
    });

    await recordGameEnd('rated-pvp-1', {
      variant: 'dark-chess',
      mode: 'pvp',
      rated: true,
      result: 'white-wins',
      termination: 'king-captured',
      plyCount: 30,
      startedAt: now,
      endedAt: now,
      initialMs: 180000, // 3+2 → blitz bucket
      incrementMs: 2000,
      whiteClient: 'browser',
      blackClient: 'browser',
      whiteName: 'White',
      blackName: 'Black',
      corpusId: null,
      participants: [
        {
          color: 'white',
          displayName: 'White',
          subjectType: 'user',
          subjectId: 'user_white',
          visibility: 'public',
        },
        {
          color: 'black',
          displayName: 'Black',
          subjectType: 'user',
          subjectId: 'user_black',
          visibility: 'public',
        },
      ],
      visibility: 'public',
    });

    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      const { rows } = await client.query<{
        user_id: string;
        elo_rating: number;
        rating_deviation: number;
        volatility: string;
        games_played: number;
      }>(
        `SELECT user_id, elo_rating, rating_deviation, volatility, games_played
         FROM user_ratings WHERE variant = 'fog' AND time_class = 'blitz'`,
      );
      assert.equal(rows.length, 2, 'both players got a rating row');
      const white = rows.find((r) => r.user_id === 'user_white')!;
      const black = rows.find((r) => r.user_id === 'user_black')!;
      // Winner rises above the 1500 base, loser falls below it.
      assert.ok(white.elo_rating > 1500, `white rating ${white.elo_rating}`);
      assert.ok(black.elo_rating < 1500, `black rating ${black.elo_rating}`);
      // RD tightened from the 350 default; volatility persisted.
      assert.ok(white.rating_deviation < 350, `white RD ${white.rating_deviation}`);
      assert.ok(Number(white.volatility) > 0, 'volatility stored');
      assert.equal(white.games_played, 1);

      // The per-game rating-event log (game_participants) recorded before/after.
      const { rows: parts } = await client.query<{
        elo_before: number;
        elo_after: number;
        rd_after: number;
      }>(
        `SELECT elo_before, elo_after, rd_after FROM game_participants
         WHERE game_id = 'rated-pvp-1' AND color = 'white'`,
      );
      assert.equal(parts[0]!.elo_before, 1500);
      assert.ok(parts[0]!.elo_after > 1500);
      assert.ok(parts[0]!.rd_after < 350);
    } finally {
      await client.end();
    }

    // The game summary exposes the rating delta so the game page can show +/-.
    const summary = await getGameSummary('rated-pvp-1');
    const wp = summary?.participants?.find((p) => p.color === 'white');
    assert.equal(wp?.ratingBefore, 1500, 'summary exposes ratingBefore');
    assert.ok((wp?.ratingAfter ?? 0) > 1500, 'summary exposes ratingAfter');
  });

  test('rated game rates on a forfeit (abandonment) termination', async () => {
    // Rating is termination-independent: any completed rated PvP game rates.
    // Forfeit (abandonment) is a real win, so it must move ratings like any other.
    const now = new Date();
    await createUser({
      id: 'ff_w',
      email: 'ffw@e.com',
      emailVerifiedAt: now,
      handle: 'ffwhite',
      displayName: 'FFW',
      now,
    });
    await createUser({
      id: 'ff_b',
      email: 'ffb@e.com',
      emailVerifiedAt: now,
      handle: 'ffblack',
      displayName: 'FFB',
      now,
    });
    await recordGameEnd('rated-forfeit', {
      variant: 'dark-chess',
      mode: 'pvp',
      rated: true,
      result: 'white-wins',
      termination: 'abandonment',
      plyCount: 12,
      startedAt: now,
      endedAt: now,
      initialMs: 180000,
      incrementMs: 2000,
      whiteClient: 'b',
      blackClient: 'b',
      whiteName: 'FFW',
      blackName: 'FFB',
      corpusId: null,
      participants: [
        {
          color: 'white',
          displayName: 'FFW',
          subjectType: 'user',
          subjectId: 'ff_w',
          visibility: 'public',
        },
        {
          color: 'black',
          displayName: 'FFB',
          subjectType: 'user',
          subjectId: 'ff_b',
          visibility: 'public',
        },
      ],
      visibility: 'public',
    });

    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      const { rows } = await client.query<{ user_id: string; elo_rating: number }>(
        `SELECT user_id, elo_rating FROM user_ratings WHERE variant = 'fog' AND time_class = 'blitz'`,
      );
      assert.equal(rows.length, 2, 'forfeit rated both players');
      assert.ok(rows.find((r) => r.user_id === 'ff_w')!.elo_rating > 1500, 'forfeit winner gained');
      assert.ok(rows.find((r) => r.user_id === 'ff_b')!.elo_rating < 1500, 'forfeit loser lost');
    } finally {
      await client.end();
    }
  });

  test('aborted game does not affect ratings', async () => {
    // Aborts go through abortRunningGame (status='aborted'), never recordGameEnd,
    // so they must never touch ratings — even for a rated PvP room of two accounts.
    const now = new Date();
    await createUser({
      id: 'ab_w',
      email: 'abw@e.com',
      emailVerifiedAt: now,
      handle: 'abwhite',
      displayName: 'ABW',
      now,
    });
    await createUser({
      id: 'ab_b',
      email: 'abb@e.com',
      emailVerifiedAt: now,
      handle: 'abblack',
      displayName: 'ABB',
      now,
    });
    await recordGameStart('rated-aborted', {
      variant: 'dark-chess',
      mode: 'pvp',
      startedAt: now,
      whiteClient: 'b',
      blackClient: 'b',
      whiteName: 'ABW',
      blackName: 'ABB',
      corpusId: null,
    });
    const aborted = await abortRunningGame('rated-aborted', {
      abortedReason: 'user-abort',
      termination: 'abandoned',
    });
    assert.equal(aborted, true, 'running game was aborted');

    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      const { rows } = await client.query(`SELECT 1 FROM user_ratings WHERE user_id = ANY($1)`, [
        ['ab_w', 'ab_b'],
      ]);
      assert.equal(rows.length, 0, 'aborted game created no rating rows');
    } finally {
      await client.end();
    }
  });

  test('leaderboard shows provisional players (marked) ranked low by conservative rating', async () => {
    const now = new Date();
    await createUser({
      id: 'u_hi',
      email: 'hi@e.com',
      emailVerifiedAt: now,
      handle: 'settledhi',
      displayName: 'Hi',
      profileVisibility: 'public',
      now,
    });
    await createUser({
      id: 'u_lo',
      email: 'lo@e.com',
      emailVerifiedAt: now,
      handle: 'settledlo',
      displayName: 'Lo',
      profileVisibility: 'public',
      now,
    });
    await createUser({
      id: 'u_pv',
      email: 'pv@e.com',
      emailVerifiedAt: now,
      handle: 'provis',
      displayName: 'Pv',
      profileVisibility: 'public',
      now,
    });

    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      // Conservative (rating - 2*RD): hi=1480, lo=1430, pv=1300.
      // pv has the highest RAW rating (1900) but RD 300 (provisional) → it sorts
      // LAST by conservative rating and is marked provisional, not hidden.
      await client.query(
        `INSERT INTO user_ratings (user_id, variant, time_class, elo_rating, rating_deviation, volatility, games_played)
         VALUES
          ('u_hi','fog','blitz',1600,60,0.06,20),
          ('u_lo','fog','blitz',1550,60,0.06,20),
          ('u_pv','fog','blitz',1900,300,0.06,3)`,
      );
    } finally {
      await client.end();
    }

    const board = await getLeaderboard({ variant: 'fog', timeClass: 'blitz', limit: 100 });
    assert.equal(board.length, 3, 'provisional player is shown, not hidden');
    assert.equal(board[0]!.handle, 'settledhi', 'highest conservative rating ranks first');
    assert.equal(board[0]!.provisional, false);
    assert.equal(board[1]!.handle, 'settledlo');
    assert.equal(board[2]!.handle, 'provis', 'provisional sorts last despite highest raw rating');
    assert.equal(board[2]!.provisional, true);
    assert.equal(
      board[2]!.eloRating,
      1900,
      'displays actual rating (with "?" client-side), not conservative',
    );
    assert.equal(board[0]!.rank, 1);
  });

  test('getUserProfileByHandle lists completed account-attributed games', async () => {
    const now = new Date('2026-05-08T10:00:00.000Z');
    await createUser({
      id: 'user_profile',
      email: 'profile@example.com',
      emailVerifiedAt: now,
      handle: 'profile-player',
      displayName: 'Profile Player',
      profileVisibility: 'public',
      now,
    });
    await recordGameEnd('profile-game', {
      variant: 'dark-chess',
      mode: 'pvp',
      result: 'white-wins',
      termination: 'king-captured',
      plyCount: 9,
      startedAt: now,
      endedAt: new Date(now.getTime() + 60_000),
      whiteClient: 'profile-browser',
      blackClient: 'guest-browser',
      whiteName: null,
      blackName: null,
      corpusId: null,
      participants: [
        {
          color: 'white',
          displayName: 'Profile Player',
          subjectType: 'user',
          subjectId: 'user_profile',
          visibility: 'public',
        },
        {
          color: 'black',
          displayName: 'Guest',
          subjectType: 'guest',
          subjectId: null,
          visibility: 'public',
        },
      ],
    });

    const profile = await getUserProfileByHandle('profile-player', null);
    assert.equal(profile?.user.handle, 'profile-player');
    assert.equal(profile?.games.length, 1);
    assert.equal(profile?.gamesTotal, 1);
    assert.equal(profile?.games[0]?.roomId, 'profile-game');
    assert.equal(profile?.games[0]?.playerColor, 'white');
    assert.equal(profile?.games[0]?.participants[0]?.subjectType, 'user');
  });

  test('getUserGamesPage paginates a user games newest-first with a stable total', async () => {
    const now = new Date('2026-05-09T10:00:00.000Z');
    await createUser({
      id: 'user_pager',
      email: 'pager@example.com',
      emailVerifiedAt: now,
      handle: 'pager-player',
      displayName: 'Pager Player',
      profileVisibility: 'public',
      now,
    });
    for (let i = 0; i < 3; i++) {
      await recordGameEnd(`pager-game-${i}`, {
        variant: 'dark-chess',
        mode: 'pvp',
        result: 'white-wins',
        termination: 'king-captured',
        plyCount: 9,
        startedAt: now,
        endedAt: new Date(now.getTime() + (i + 1) * 60_000),
        whiteClient: 'pager-browser',
        blackClient: 'guest-browser',
        whiteName: null,
        blackName: null,
        corpusId: null,
        participants: [
          {
            color: 'white',
            displayName: 'Pager Player',
            subjectType: 'user',
            subjectId: 'user_pager',
            visibility: 'public',
          },
          {
            color: 'black',
            displayName: 'Guest',
            subjectType: 'guest',
            subjectId: null,
            visibility: 'public',
          },
        ],
      });
    }

    // total reflects all matches regardless of the page window; rows are
    // newest-first (pager-game-2 has the latest endedAt).
    const page1 = await getUserGamesPage('pager-player', null, 0, 2);
    assert.equal(page1?.total, 3);
    assert.equal(page1?.games.length, 2);
    assert.equal(page1?.games[0]?.roomId, 'pager-game-2');
    assert.equal(page1?.games[1]?.roomId, 'pager-game-1');

    const page2 = await getUserGamesPage('pager-player', null, 2, 2);
    assert.equal(page2?.total, 3);
    assert.equal(page2?.games.length, 1);
    assert.equal(page2?.games[0]?.roomId, 'pager-game-0');

    assert.equal(await getUserGamesPage('no-such-handle', null, 0, 2), null);
  });
});
