import type { IncomingMessage, ServerResponse } from 'node:http';
import type { XiangqiMove } from '@mistboard/game';
import {
  buildHistoricalXiangqiGameQueryWhere,
  getHistoricalXiangqiGame,
  insertHistoricalXiangqiGame,
  normalizeHistoricalXiangqiPlayerName,
  queryHistoricalXiangqiGames,
  upsertHistoricalXiangqiSource,
} from './persistence.js';
import { assert, definePersistenceTests, test } from './persistence-test-support.js';
import { tryHandle as tryHandleHistoricalRoute } from './routes/historical-xiangqi-games.js';

definePersistenceTests('historical xiangqi', () => {
  test('normalizes player names conservatively', () => {
    assert.equal(normalizeHistoricalXiangqiPlayerName('  Hu   Ronghua  '), 'hu ronghua');
    assert.equal(normalizeHistoricalXiangqiPlayerName('Ｈｕ　Ｒｏｎｇｈｕａ'), 'hu ronghua');
  });

  test('historical query where binds every filter value', () => {
    const injection = `x'; DROP TABLE historical_xiangqi_games; --`;
    const { clause, values } = buildHistoricalXiangqiGameQueryWhere({
      sourceSlug: 'fixture',
      player: 'Hu Ronghua',
      event: injection,
      result: '1-0',
      playedFrom: '1982-01-01',
      playedTo: '1983-01-01',
      visibility: 'public',
    });
    assert.ok(!clause.includes(injection), 'event value must not be interpolated');
    assert.match(clause, /sources\.slug = \$1/);
    assert.match(clause, /red_players\.normalized_name LIKE \$2/);
    assert.match(clause, /black_players\.normalized_name LIKE \$3/);
    assert.match(clause, /games\.event_name ILIKE \$4/);
    assert.match(clause, /games\.result = \$5/);
    assert.match(clause, /games\.played_on >= \$6::date/);
    assert.match(clause, /games\.played_on < \$7::date/);
    assert.match(clause, /games\.visibility = \$8/);
    assert.deepEqual(values, [
      'fixture',
      '%hu ronghua%',
      '%hu ronghua%',
      `%${injection}%`,
      '1-0',
      '1982-01-01',
      '1983-01-01',
      'public',
    ]);
  });

  test('inserts an idempotent historical game with source and players', async () => {
    const source = await upsertHistoricalXiangqiSource({
      slug: 'famous-xiangqi-test',
      name: 'Famous Xiangqi Test',
      sourceType: 'fixture',
      license: 'test-only',
      licenseStatus: 'test-only',
    });
    assert.equal(source.licenseStatus, 'test-only');

    const input = {
      sourceId: source.id,
      sourceGameId: 'game-001',
      eventName: 'Test Masters',
      playedOn: '1982-04-03',
      redNameRaw: 'Hu Ronghua',
      blackNameRaw: 'Liu Dahua',
      result: '1-0' as const,
      moveFormat: 'coordinate' as const,
      moves: [
        { from: 'h3', to: 'e3' },
        { from: 'h8', to: 'e8' },
        { from: 'h1', to: 'g3' },
      ] satisfies XiangqiMove[],
      tags: { rawFile: '001.dhtmlxq' },
    };

    const first = await insertHistoricalXiangqiGame(input);
    const second = await insertHistoricalXiangqiGame(input);
    assert.equal(second.id, first.id);
    assert.equal(second.plyCount, 3);
    assert.equal(second.redNameRaw, 'Hu Ronghua');
    assert.equal(second.blackNameRaw, 'Liu Dahua');
    assert.equal(second.tags.rawFile, '001.dhtmlxq');
    assert.ok(second.redPlayerId);
    assert.ok(second.blackPlayerId);

    const loaded = await getHistoricalXiangqiGame(first.id);
    assert.deepEqual(loaded?.moves, input.moves);
    assert.equal(loaded?.eventName, 'Test Masters');
    assert.equal(loaded?.playedOn, '1982-04-03');
  });

  test('queries historical games by source, player, event, result, and date', async () => {
    const source = await upsertHistoricalXiangqiSource({
      slug: 'classic-query-test',
      name: 'Classic Query Test',
      sourceType: 'fixture',
      license: 'test-only',
    });
    await insertHistoricalXiangqiGame({
      sourceId: source.id,
      sourceGameId: 'query-001',
      eventName: 'Silver River Cup',
      playedOn: '1982-04-03',
      redNameRaw: 'Hu Ronghua',
      blackNameRaw: 'Liu Dahua',
      result: '1-0',
      moveFormat: 'coordinate',
      moves: [
        { from: 'h3', to: 'e3' },
        { from: 'h8', to: 'e8' },
      ] satisfies XiangqiMove[],
      visibility: 'public',
    });
    await insertHistoricalXiangqiGame({
      sourceId: source.id,
      sourceGameId: 'query-002',
      eventName: 'Silver River Cup',
      playedOn: '1983-04-03',
      redNameRaw: 'Liu Dahua',
      blackNameRaw: 'Zhao Guorong',
      result: '0-1',
      moveFormat: 'coordinate',
      moves: [
        { from: 'h3', to: 'e3' },
        { from: 'h8', to: 'e8' },
      ] satisfies XiangqiMove[],
      visibility: 'public',
    });

    const page = await queryHistoricalXiangqiGames({
      sourceSlug: 'classic-query-test',
      player: 'Ｈｕ　Ｒｏｎｇｈｕａ',
      event: 'River',
      result: '1-0',
      playedFrom: '1982-01-01',
      playedTo: '1983-01-01',
      visibility: 'public',
    });

    assert.equal(page.total, 1);
    assert.equal(page.games[0]?.sourceSlug, 'classic-query-test');
    assert.equal(page.games[0]?.eventName, 'Silver River Cup');
    assert.equal(page.games[0]?.playedOn, '1982-04-03');
    assert.equal(page.games[0]?.redNameRaw, 'Hu Ronghua');
    assert.equal(page.games[0]?.blackNameRaw, 'Liu Dahua');
  });

  test('detail route serves an unlisted game by id but hides a private one', async () => {
    const source = await upsertHistoricalXiangqiSource({
      slug: 'gate-test',
      name: 'Gate Test',
      sourceType: 'platform-export',
      license: 'GPL-3.0',
      licenseStatus: 'cleared',
    });
    const moves: XiangqiMove[] = [{ from: 'h3', to: 'e3' }];
    const unlisted = await insertHistoricalXiangqiGame({
      sourceId: source.id,
      sourceGameId: 'gate-unlisted',
      result: '1-0',
      moveFormat: 'coordinate',
      moves,
      visibility: 'unlisted',
    });
    const priv = await insertHistoricalXiangqiGame({
      sourceId: source.id,
      sourceGameId: 'gate-private',
      result: '1-0',
      moveFormat: 'coordinate',
      moves,
      visibility: 'private',
    });

    // Unlisted is linked from the opening explorer's "Top games", so a direct id
    // must resolve even though it never appears in the browsable list.
    const okResp = captureResponse();
    await tryHandleHistoricalRoute(
      {} as never,
      { method: 'GET', headers: {} } as unknown as IncomingMessage,
      okResp,
      `/api/historical-xiangqi/games/${unlisted.id}`,
      new URL(`http://test.local/api/historical-xiangqi/games/${unlisted.id}`),
    );
    assert.equal(okResp.status, 200);
    assert.equal(JSON.parse(okResp.body).game.id, unlisted.id);

    // Private stays hidden by id.
    const hiddenResp = captureResponse();
    await tryHandleHistoricalRoute(
      {} as never,
      { method: 'GET', headers: {} } as unknown as IncomingMessage,
      hiddenResp,
      `/api/historical-xiangqi/games/${priv.id}`,
      new URL(`http://test.local/api/historical-xiangqi/games/${priv.id}`),
    );
    assert.equal(hiddenResp.status, 404);
  });
});

type ResponseCapture = { body: string; status: number | null };

function captureResponse(): ServerResponse & ResponseCapture {
  const capture = {
    body: '',
    status: null as number | null,
    writeHead(status: number) {
      capture.status = status;
      return capture;
    },
    setHeader() {
      return capture;
    },
    end(chunk?: string) {
      capture.body += chunk ?? '';
      return capture;
    },
  };
  return capture as unknown as ServerResponse & ResponseCapture;
}
