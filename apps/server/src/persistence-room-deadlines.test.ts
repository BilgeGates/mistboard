import { deleteRoomDeadline, listDueRoomDeadlines, upsertRoomDeadline } from './persistence.js';
import {
  assert,
  definePersistenceTests,
  pg,
  TEST_DATABASE_URL,
  test,
} from './persistence-test-support.js';

definePersistenceTests('room deadlines', () => {
  test('upsert + listDue roundtrip with due filtering, ordering, and limit', async () => {
    const now = new Date('2026-06-11T12:00:00Z');
    await upsertRoomDeadline({
      roomId: 'dchx_due_late',
      gameSpecId: 'dark-chess',
      seat: 'white',
      seatUserId: null,
      dueAt: new Date(now.getTime() - 1_000),
    });
    await upsertRoomDeadline({
      roomId: 'dchx_due_early',
      gameSpecId: 'dark-chess',
      seat: 'black',
      seatUserId: 'user-1',
      dueAt: new Date(now.getTime() - 60_000),
    });
    await upsertRoomDeadline({
      roomId: 'dchx_not_due',
      gameSpecId: 'dark-chess',
      seat: 'white',
      seatUserId: null,
      dueAt: new Date(now.getTime() + 60_000),
    });

    const due = await listDueRoomDeadlines(now);
    assert.deepEqual(
      due.map((row) => row.roomId),
      ['dchx_due_early', 'dchx_due_late'],
    );
    assert.equal(due[0]?.seat, 'black');
    assert.equal(due[0]?.gameSpecId, 'dark-chess');

    const limited = await listDueRoomDeadlines(now, 1);
    assert.deepEqual(
      limited.map((row) => row.roomId),
      ['dchx_due_early'],
    );
  });

  test('a changed due_at re-arms the warning; an unchanged one keeps it', async () => {
    const dueAt = new Date('2026-06-15T12:00:00Z');
    await upsertRoomDeadline({
      roomId: 'dchx_warned',
      gameSpecId: 'dark-chess',
      seat: 'white',
      seatUserId: null,
      dueAt,
    });

    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `UPDATE room_deadlines SET warned_at = now() WHERE room_id = 'dchx_warned'`,
      );

      // Same due_at: the warning state survives the idempotent re-upsert.
      await upsertRoomDeadline({
        roomId: 'dchx_warned',
        gameSpecId: 'dark-chess',
        seat: 'white',
        seatUserId: null,
        dueAt,
      });
      const kept = await client.query(
        `SELECT warned_at FROM room_deadlines WHERE room_id = 'dchx_warned'`,
      );
      assert.notEqual(kept.rows[0]?.warned_at, null);

      // New due_at (the player moved): the next warning re-arms.
      await upsertRoomDeadline({
        roomId: 'dchx_warned',
        gameSpecId: 'dark-chess',
        seat: 'black',
        seatUserId: null,
        dueAt: new Date(dueAt.getTime() + 60_000),
      });
      const rearmed = await client.query(
        `SELECT warned_at, seat FROM room_deadlines WHERE room_id = 'dchx_warned'`,
      );
      assert.equal(rearmed.rows[0]?.warned_at, null);
      assert.equal(rearmed.rows[0]?.seat, 'black');
    } finally {
      await client.end();
    }
  });

  test('delete removes the row', async () => {
    const now = new Date();
    await upsertRoomDeadline({
      roomId: 'dchx_deleted',
      gameSpecId: 'dark-chess',
      seat: 'white',
      seatUserId: null,
      dueAt: new Date(now.getTime() - 1_000),
    });
    await deleteRoomDeadline('dchx_deleted');
    const due = await listDueRoomDeadlines(now);
    assert.deepEqual(
      due.filter((row) => row.roomId === 'dchx_deleted'),
      [],
    );
  });
});
