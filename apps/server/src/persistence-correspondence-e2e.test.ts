/**
 * Correspondence end-to-end against real Postgres: the full durable loop from
 * room creation through writer-maintained deadline rows to sweeper
 * enforcement. Time is real, not injected — rooms are created with a
 * sub-second compressed days-per-move allowance (the same lever as
 * MISTBOARD_DEV_CORRESPONDENCE_TC manual testing) and the test waits past the
 * deadline, so the sweeper's own clock comparisons run unmocked. The
 * in-memory room cache is cleared before each sweep, so every enforcement
 * here also proves the server-restart path (hydration from the event log +
 * seat tokens).
 */

import { DAY_MS, type RoomTimeControl, type Square } from '@mistboard/game';
import {
  createDarkChessCorrespondenceRoom,
  darkChessTenantRooms,
  getOrLoadDarkChessTenantRoom,
} from './dark-chess-registration.js';
import { type DarkChessTenantEvent, darkChessTenant } from './dark-chess-tenant.js';
import { createUser, getGameSummary, loadRoom } from './persistence.js';
import {
  assert,
  definePersistenceTests,
  pg,
  TEST_DATABASE_URL,
  test,
} from './persistence-test-support.js';
import { hashSeatToken } from './server-seat-session.js';
import { startTenantDeadlineSweeper } from './variant-tenant/deadline-sweeper.js';
import { appendTenantEvent, appendTenantSeatAssigned } from './variant-tenant/events.js';
import type { TenantSeatTokenState } from './variant-tenant/tenant.js';

// Long enough that room setup (a handful of single-row writes) always fits
// inside the first allowance window; short enough to keep the suite fast.
const ALLOWANCE_MS = 900;
const SETTLE_MS = 1_400;

const COMPRESSED_TC: RoomTimeControl = {
  initialMs: ALLOWANCE_MS,
  incrementMs: 0,
  daysPerMove: ALLOWANCE_MS / DAY_MS,
};

definePersistenceTests('correspondence e2e', () => {
  test('deadline lapse: writer rows, cold-cache sweep, timeout result', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const created = await createDarkChessCorrespondenceRoom(COMPRESSED_TC, 'white');
    assert.ok(created.ok);
    const room = created.room;

    await appendTenantSeatAssigned(
      darkChessTenant,
      room,
      { event: seatAssigned(room.id, 'white', 'w-client'), tokenState: token('white', alice) },
      {},
    );
    await appendTenantSeatAssigned(
      darkChessTenant,
      room,
      { event: seatAssigned(room.id, 'black', 'b-client'), tokenState: token('black', bob) },
      {},
    );
    await appendTenantEvent(darkChessTenant, room, move(room.id, 'white', 'e2', 'e4'));
    await appendTenantEvent(darkChessTenant, room, move(room.id, 'black', 'e7', 'e5'));

    // The writer maintained the durable row: white is on move with the
    // allowance running, and the row carries the seat's account for the C2
    // notification queue.
    const armed = await deadlineRow(room.id);
    assert.ok(armed, 'expected a room_deadlines row after the second move');
    assert.equal(armed.seat, 'white');
    assert.equal(armed.seat_user_id, alice);
    assert.ok(armed.due_at.getTime() > Date.now() - ALLOWANCE_MS);

    // Restart path: nothing in memory when the deadline lapses.
    darkChessTenantRooms.clear();
    await sleep(SETTLE_MS);
    await sweepOnce();

    const hydrated = await getOrLoadDarkChessTenantRoom(room.id);
    assert.ok(hydrated);
    const status = hydrated.projection.state.status;
    assert.equal(status.type, 'finished');
    assert.ok(status.type === 'finished');
    assert.equal(status.winner, 'black');
    assert.equal(status.reason, 'timeout');

    const summary = await getGameSummary(room.id);
    assert.ok(summary, 'expected a completed games row');
    assert.equal(summary.result, 'black-wins');
    assert.equal(summary.termination, 'timeout');

    const events = await loadRoom(room.id);
    assert.ok(events);
    assert.equal(events[events.length - 1]?.type, 'clock-expired');

    assert.equal(await deadlineRow(room.id), null);
    darkChessTenantRooms.clear();
  });

  test('first-move no-show: no row while a seat is open, abort once due', async () => {
    const carol = await makeUser('carol');
    const dan = await makeUser('dan');
    const created = await createDarkChessCorrespondenceRoom(COMPRESSED_TC, 'white');
    assert.ok(created.ok);
    const room = created.room;

    await appendTenantSeatAssigned(
      darkChessTenant,
      room,
      { event: seatAssigned(room.id, 'white', 'w-client'), tokenState: token('white', carol) },
      {},
    );
    // An outstanding invite is not a countdown: with one seat open there is no
    // enforceable deadline and no durable row.
    assert.equal(await deadlineRow(room.id), null);

    await appendTenantSeatAssigned(
      darkChessTenant,
      room,
      { event: seatAssigned(room.id, 'black', 'b-client'), tokenState: token('black', dan) },
      {},
    );
    const armed = await deadlineRow(room.id);
    assert.ok(armed, 'expected a row once both seats are claimed');
    assert.equal(armed.seat, 'white');

    darkChessTenantRooms.clear();
    await sleep(SETTLE_MS);
    await sweepOnce();

    const hydrated = await getOrLoadDarkChessTenantRoom(room.id);
    assert.ok(hydrated);
    assert.equal(hydrated.projection.state.status.type, 'aborted');

    // Aborts flip the running games row instead of recording a result.
    const gamesRow = await queryOne(
      `SELECT status, termination, result FROM games WHERE room_id = $1`,
      [room.id],
    );
    assert.ok(gamesRow);
    assert.equal(gamesRow.status, 'aborted');
    assert.equal(gamesRow.termination, 'abandoned');
    assert.equal(gamesRow.result, null);

    const events = await loadRoom(room.id);
    assert.ok(events);
    assert.equal(events[events.length - 1]?.type, 'game-aborted');

    assert.equal(await deadlineRow(room.id), null);
    darkChessTenantRooms.clear();
  });
});

async function sweepOnce(): Promise<void> {
  // Real listDue + real registry routing; only the interval is parked so the
  // single tick below is the only sweep.
  const sweeper = startTenantDeadlineSweeper({ intervalMs: 3_600_000 });
  try {
    await sweeper.tick();
  } finally {
    sweeper.stop();
  }
}

async function makeUser(handle: string): Promise<string> {
  const id = `user-${handle}`;
  await createUser({
    id,
    email: `${handle}@example.com`,
    emailVerifiedAt: new Date(),
    handle,
    displayName: capitalize(handle),
    now: new Date(),
  });
  return id;
}

function seatAssigned(
  roomId: string,
  seat: 'white' | 'black',
  clientId: string,
): Extract<DarkChessTenantEvent, { type: 'seat-assigned' }> {
  return { type: 'seat-assigned', at: Date.now(), roomId, clientId, seat };
}

function move(
  roomId: string,
  color: 'white' | 'black',
  from: Square,
  to: Square,
): DarkChessTenantEvent {
  return {
    type: 'move-played',
    at: Date.now(),
    roomId,
    color,
    move: { from, to },
  };
}

function token(seat: 'white' | 'black', userId: string): TenantSeatTokenState<'white' | 'black'> {
  const now = new Date();
  return {
    clientId: `${seat}-client`,
    seat,
    tokenHash: hashSeatToken(`${seat}-token-${userId}`),
    userId,
    userHandle: userId.replace(/^user-/, ''),
    userDisplayName: capitalize(userId.replace(/^user-/, '')),
    issuedAt: now,
    lastSeenAt: now,
    revokedAt: null,
  };
}

// Direct row read: listDueRoomDeadlines filters on due_at, but these
// assertions need to see not-yet-due rows (and seat_user_id) too.
async function deadlineRow(
  roomId: string,
): Promise<{ seat: string; seat_user_id: string | null; due_at: Date } | null> {
  return queryOne(`SELECT seat, seat_user_id, due_at FROM room_deadlines WHERE room_id = $1`, [
    roomId,
  ]);
}

async function queryOne<T extends Record<string, unknown>>(
  sql: string,
  values: unknown[],
): Promise<T | null> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(sql, values);
    return (rows[0] as T) ?? null;
  } finally {
    await client.end();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
