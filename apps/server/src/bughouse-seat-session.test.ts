import assert from 'node:assert/strict';
import test from 'node:test';
import type { BughouseSeatId } from '@mistboard/game';
import {
  assignBughouseSeat,
  type BughouseSeatClient,
  type BughouseSeatRoom,
  displaceOlderBughouseSeatClients,
  rollbackBughouseSeatAssignment,
} from './bughouse-seat-session.js';
import type { UserAccount } from './persistence.js';

test('bughouse seat assignment fills board A opponents before partner seats', () => {
  const room = emptySeatRoom();

  assert.equal(claimAndSeat(room, 'c1'), 'A:white');
  assert.equal(claimAndSeat(room, 'c2'), 'A:black');
  assert.equal(claimAndSeat(room, 'c3'), 'B:white');
  assert.equal(claimAndSeat(room, 'c4'), 'B:black');

  assert.deepEqual(assignBughouseSeat(room, 'c5', undefined, null), {
    ok: false,
    reason: 'private room',
  });
});

test('bughouse seat assignment reclaims seats by raw token', () => {
  const room = emptySeatRoom();
  const first = assignBughouseSeat(room, 'c1', undefined, null);
  assert.ok(first.ok);
  assert.ok(first.seatToken);
  room.seats[first.seat] = 'c1';

  const reclaimed = assignBughouseSeat(room, 'c2', first.seatToken, null);

  assert.ok(reclaimed.ok);
  assert.equal(reclaimed.seat, 'A:white');
  assert.equal(reclaimed.seatToken, undefined);
  assert.equal(reclaimed.seatTokenHash, first.seatTokenHash);
  assert.equal(room.seatTokens['A:white']?.clientId, 'c2');
});

test('bughouse seat assignment reclaims account-bound seats by account', () => {
  const room = emptySeatRoom();
  const user = account('u1');
  const first = assignBughouseSeat(room, 'c1', undefined, user);
  assert.ok(first.ok);
  room.seats[first.seat] = 'c1';

  const reclaimed = assignBughouseSeat(room, 'c2', undefined, user);

  assert.ok(reclaimed.ok);
  assert.equal(reclaimed.seat, 'A:white');
  assert.equal(reclaimed.seatTokenHash, first.seatTokenHash);
  assert.equal(room.seatTokens['A:white']?.clientId, 'c2');
});

test('bughouse seat assignment rejects a token for a different account-bound seat', () => {
  const room = emptySeatRoom();
  const first = assignBughouseSeat(room, 'c1', undefined, account('u1'));
  assert.ok(first.ok);
  assert.ok(first.seatToken);
  room.seats[first.seat] = 'c1';

  assert.deepEqual(assignBughouseSeat(room, 'c2', first.seatToken, account('u2')), {
    ok: false,
    reason: 'private room',
  });
});

test('bughouse seat assignment gates rated and correspondence seats to accounts', () => {
  assert.deepEqual(
    assignBughouseSeat({ ...emptySeatRoom(), rated: true }, 'guest', undefined, null),
    {
      ok: false,
      reason: 'rated requires account',
    },
  );

  assert.deepEqual(
    assignBughouseSeat(
      { ...emptySeatRoom(), timeControl: { daysPerMove: 1 } },
      'guest',
      undefined,
      null,
    ),
    {
      ok: false,
      reason: 'correspondence requires account',
    },
  );
});

test('bughouse seat assignment rollback removes new tokens and restores reclaimed tokens', () => {
  const room = emptySeatRoom();
  const first = assignBughouseSeat(room, 'c1', undefined, null);
  assert.ok(first.ok);
  assert.ok(first.seatToken);
  room.seats[first.seat] = 'c1';

  const reclaimed = assignBughouseSeat(room, 'c2', first.seatToken, null);
  assert.ok(reclaimed.ok);
  rollbackBughouseSeatAssignment(room, reclaimed);
  assert.equal(room.seatTokens['A:white']?.clientId, 'c1');

  const fresh = assignBughouseSeat(room, 'c3', undefined, null);
  assert.ok(fresh.ok);
  rollbackBughouseSeatAssignment(room, fresh);
  assert.equal(room.seatTokens[fresh.seat], undefined);
});

test('bughouse seat assignment displaces older clients on the same seat', () => {
  const closed: string[] = [];
  const oldClient = client('A:white', closed);
  const newClient = client('A:white', closed);
  const otherSeat = client('A:black', closed);

  displaceOlderBughouseSeatClients({ clients: [oldClient, newClient, otherSeat] }, newClient);

  assert.equal(oldClient.displaced, true);
  assert.equal(newClient.displaced, false);
  assert.equal(otherSeat.displaced, false);
  assert.deepEqual(closed, ['4000:duplicate session']);
});

function emptySeatRoom(): BughouseSeatRoom {
  return {
    clients: [],
    seats: {},
    seatTokens: {},
  };
}

function claimAndSeat(room: BughouseSeatRoom, clientId: string): BughouseSeatId {
  const assignment = assignBughouseSeat(room, clientId, undefined, null);
  assert.ok(assignment.ok);
  room.seats[assignment.seat] = clientId;
  return assignment.seat;
}

function client(seat: BughouseSeatId, closed: string[]): BughouseSeatClient {
  return {
    displaced: false,
    seat,
    socket: {
      close: (code, reason) => closed.push(`${code}:${reason}`),
    },
  };
}

function account(id: string): UserAccount {
  return {
    id,
    email: `${id}@example.test`,
    emailVerifiedAt: null,
    handle: id,
    handleChangedAt: null,
    displayName: id,
    displayNameChangedAt: null,
    profileVisibility: 'public',
    accountRole: 'player',
    eloRating: 1500,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}
