import assert from 'node:assert/strict';
import test from 'node:test';
import type { MiniXiangqiColor } from '@mistboard/game';
import type { DarkMiniXiangqiSeatTokenState } from './dark-mini-xiangqi-runtime.js';
import type { UserAccount } from './persistence.js';
import {
  assignDarkMiniXiangqiSeat,
  type DarkMiniXiangqiSeatClient,
  type DarkMiniXiangqiSeatRoom,
  displaceOlderDarkMiniXiangqiSeatClients,
  rollbackDarkMiniXiangqiSeatAssignment,
} from './server-dark-mini-xiangqi-seat-session.js';
import { hashSeatToken } from './server-seat-session.js';

test('Dark Mini Xiangqi seat session assigns new anonymous seats red then black', () => {
  const room = seatRoom();

  const red = assignDarkMiniXiangqiSeat(room, 'c-red', undefined, null);
  const black = assignDarkMiniXiangqiSeat(room, 'c-black', undefined, null);

  assert.equal(red.ok && red.seat, 'red');
  assert.equal(black.ok && black.seat, 'black');
  assert.equal(red.ok && typeof red.seatToken, 'string');
  assert.equal(black.ok && typeof black.seatToken, 'string');
});

test('Dark Mini Xiangqi seat session honors creator color preference for first join', () => {
  const room = seatRoom({ creatorPreference: 'black' });

  const first = assignDarkMiniXiangqiSeat(room, 'c-black', undefined, null);
  const second = assignDarkMiniXiangqiSeat(room, 'c-red', undefined, null);

  assert.equal(first.ok && first.seat, 'black');
  assert.equal(second.ok && second.seat, 'red');
});

test('Dark Mini Xiangqi seat session reclaims a token-bound seat', () => {
  const room = seatRoom({
    seatTokens: { red: tokenState('red', 'old-client', hashSeatToken('seat-token')) },
  });

  const assignment = assignDarkMiniXiangqiSeat(room, 'new-client', 'seat-token', null);

  assert.equal(assignment.ok && assignment.seat, 'red');
  assert.equal(assignment.ok && assignment.seatToken, undefined);
  assert.equal(room.seatTokens.red?.clientId, 'new-client');
});

test('Dark Mini Xiangqi seat session rejects token reuse by the wrong account', () => {
  const room = seatRoom({
    seatTokens: {
      red: tokenState('red', 'old-client', hashSeatToken('seat-token'), account('u1')),
    },
  });

  const assignment = assignDarkMiniXiangqiSeat(room, 'attacker', 'seat-token', account('u2'));

  assert.deepEqual(assignment, { ok: false, reason: 'private room' });
});

test('Dark Mini Xiangqi seat session reclaims an account-bound seat without a raw token', () => {
  const room = seatRoom({
    seatTokens: {
      black: tokenState('black', 'old-client', hashSeatToken('seat-token'), account('u1')),
    },
  });

  const assignment = assignDarkMiniXiangqiSeat(room, 'new-client', undefined, account('u1'));

  assert.equal(assignment.ok && assignment.seat, 'black');
  assert.equal(room.seatTokens.black?.clientId, 'new-client');
});

test('Dark Mini Xiangqi seat session closes the room when both seats are held', () => {
  const room = seatRoom({
    seatTokens: {
      red: tokenState('red', 'red-client', hashSeatToken('red-token')),
      black: tokenState('black', 'black-client', hashSeatToken('black-token')),
    },
  });

  const assignment = assignDarkMiniXiangqiSeat(room, 'third-client', undefined, null);

  assert.deepEqual(assignment, { ok: false, reason: 'private room' });
});

test('Dark Mini Xiangqi seat session rollback removes newly issued tokens', () => {
  const room = seatRoom();
  const assignment = assignDarkMiniXiangqiSeat(room, 'client', undefined, null);

  assert.equal(assignment.ok, true);
  if (!assignment.ok) return;
  rollbackDarkMiniXiangqiSeatAssignment(room, assignment);

  assert.deepEqual(room.seatTokens, {});
});

test('Dark Mini Xiangqi seat session rollback restores replaced token state', () => {
  const previous = tokenState('red', 'old-client', hashSeatToken('seat-token'));
  const room = seatRoom({ seatTokens: { red: previous } });
  const assignment = assignDarkMiniXiangqiSeat(room, 'new-client', 'seat-token', null);

  assert.equal(assignment.ok, true);
  if (!assignment.ok) return;
  rollbackDarkMiniXiangqiSeatAssignment(room, assignment);

  assert.equal(room.seatTokens.red, previous);
});

test('Dark Mini Xiangqi seat session displaces older clients on the same seat only', () => {
  const redOld = client('red');
  const redNew = client('red');
  const black = client('black');
  const room = seatRoom({ clients: [redOld, black, redNew] });

  displaceOlderDarkMiniXiangqiSeatClients(room, redNew);

  assert.equal(redOld.displaced, true);
  assert.equal(redOld.closed, true);
  assert.equal(redNew.displaced, false);
  assert.equal(black.displaced, false);
});

function seatRoom(
  opts: {
    clients?: TestSeatClient[];
    creatorPreference?: MiniXiangqiColor | 'random';
    seatTokens?: Partial<Record<MiniXiangqiColor, DarkMiniXiangqiSeatTokenState>>;
  } = {},
): DarkMiniXiangqiSeatRoom<TestSeatClient> {
  return {
    clients: new Set(opts.clients ?? []),
    projection: {
      ...(opts.creatorPreference ? { creatorPreference: opts.creatorPreference } : {}),
      seats: {},
    },
    seatTokens: opts.seatTokens ?? {},
  };
}

type TestSeatClient = DarkMiniXiangqiSeatClient & { closed: boolean };

function client(seat: MiniXiangqiColor): TestSeatClient {
  const out: TestSeatClient = {
    closed: false,
    displaced: false,
    seat,
    socket: {
      close() {
        out.closed = true;
      },
    },
  };
  return out;
}

function tokenState(
  seat: MiniXiangqiColor,
  clientId: string,
  tokenHash: string,
  user?: UserAccount,
): DarkMiniXiangqiSeatTokenState {
  return {
    clientId,
    seat,
    tokenHash,
    userId: user?.id ?? null,
    userHandle: user?.handle ?? null,
    userDisplayName: user?.displayName ?? null,
    issuedAt: new Date(0),
    lastSeenAt: new Date(0),
    revokedAt: null,
  };
}

function account(id: string): UserAccount {
  return {
    id,
    email: `${id}@example.com`,
    emailVerifiedAt: new Date(0),
    handle: `${id}-handle`,
    handleChangedAt: null,
    displayName: `${id} player`,
    displayNameChangedAt: null,
    profileVisibility: 'public',
    accountRole: 'player',
    eloRating: 1500,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}
