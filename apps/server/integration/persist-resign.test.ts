import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import pg from 'pg';
import { connectClient, startTestServer, type TestServer, uniqueRoomId } from './harness.js';

// Verifies the Postgres path that the in-memory harness cannot reach:
// when a game ends via resign, recordGameEnd commits a games row (result,
// termination, plyCount, status, mode) and two game_participants rows.
//
// handleResign awaits appendEvent, which awaits recordGameEnd inside the
// pendingWrites chain before broadcastSnapshot fires. By the time both
// clients see status.type === 'finished', the transaction is committed.

const testDbUrl = process.env.TEST_DATABASE_URL;

if (!testDbUrl) {
  test('persist-resign (skipped — set TEST_DATABASE_URL to enable)', { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = testDbUrl;

  let serverInstance: TestServer;
  let db: pg.Client;

  before(async () => {
    serverInstance = await startTestServer();
    db = new pg.Client({ connectionString: testDbUrl });
    await db.connect();
  });

  after(async () => {
    await db.end();
    await serverInstance.close();
    delete process.env.DATABASE_URL;
  });

  test('resign writes games row and game_participants to Postgres', async () => {
    const roomId = uniqueRoomId('persist-resign');

    const a = await connectClient({ url: serverInstance.url, room: roomId });
    const b = await connectClient({ url: serverInstance.url, room: roomId });

    const bothSeated = (m: unknown) => {
      const seats = (m as { seats?: { white?: string; black?: string } }).seats;
      return !!seats?.white && !!seats?.black;
    };
    await Promise.all([a.waitFor(bothSeated), b.waitFor(bothSeated)]);

    const white = a.seat === 'white' ? a : b;
    const black = a.seat === 'black' ? a : b;

    white.send({ type: 'move', from: 'e2', to: 'e4' });
    await black.waitFor((m) => m.type === 'snapshot');

    white.send({ type: 'resign' });
    const finished = (m: unknown) =>
      (m as { state?: { status?: { type: string } } }).state?.status?.type === 'finished';
    await Promise.all([white.waitFor(finished), black.waitFor(finished)]);

    const gameRow = await db.query<{
      result: string;
      termination: string;
      ply_count: number;
      status: string;
      mode: string;
    }>(`SELECT result, termination, ply_count, status, mode FROM games WHERE room_id = $1`, [
      roomId,
    ]);
    assert.equal(gameRow.rowCount, 1, 'expected one games row');
    const g = gameRow.rows[0]!;
    assert.equal(g.result, 'black-wins');
    assert.equal(g.termination, 'resignation');
    assert.equal(g.ply_count, 1);
    assert.equal(g.status, 'completed');
    assert.equal(g.mode, 'pvp');

    const participantRows = await db.query<{ color: string; subject_type: string }>(
      `SELECT color, subject_type FROM game_participants WHERE game_id = $1 ORDER BY color`,
      [roomId],
    );
    assert.equal(participantRows.rowCount, 2, 'expected two game_participants rows');
    const byColor = Object.fromEntries(participantRows.rows.map((r) => [r.color, r]));
    assert.equal(byColor['white']!.subject_type, 'guest');
    assert.equal(byColor['black']!.subject_type, 'guest');

    await white.disconnect();
    await black.disconnect();
  });
}
