import assert from 'node:assert/strict';
import test from 'node:test';
import type { XiangqiColor } from '@mistboard/game';
import type { DarkXiangqiSeatTokenState } from './dark-xiangqi-runtime.js';
import type { UserAccount } from './persistence.js';
import {
  assignDarkXiangqiSeat,
  type DarkXiangqiSeatClient,
  type DarkXiangqiSeatRoom,
  displaceOlderDarkXiangqiSeatClients,
  rollbackDarkXiangqiSeatAssignment,
} from './server-dark-xiangqi-seat-session.js';
import { hashSeatToken } from './server-seat-session.js';

test('Dark Xiangqi seat session assigns new anonymous seats red then black', () => {
  const room = seatRoom();

  const red = assignDarkXiangqiSeat(room, 'client-red', undefined, null);
  assert.equal(red.ok, true);
  if (!red.ok) return;
  assert.equal(red.seat, 'red');
  assert.equal(typeof red.seatToken, 'string');
  assert.equal(room.seatTokens.red, red.tokenState);

  const black = assignDarkXiangqiSeat(room, 'client-black', undefined, null);
  assert.equal(black.ok, true);
  if (!black.ok) return;
  assert.equal(black.seat, 'black');
  assert.equal(typeof black.seatToken, 'string');
  assert.equal(room.seatTokens.black, black.tokenState);
});

test('Dark Xiangqi seat session reclaims a token-bound seat', () => {
  const rawToken = 'red-token';
  const previous = seatTokenState({
    clientId: 'old-client',
    rawToken,
    seat: 'red',
  });
  const room = seatRoom({ seatTokens: { red: previous } });

  const result = assignDarkXiangqiSeat(room, 'new-client', rawToken, null);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.seat, 'red');
  assert.equal(result.seatToken, undefined);
  assert.equal(result.previousTokenState, previous);
  assert.equal(result.tokenState.clientId, 'new-client');
  assert.equal(room.seatTokens.red, result.tokenState);
});

test('Dark Xiangqi seat session rejects token reuse by the wrong account', () => {
  const rawToken = 'private-red-token';
  const room = seatRoom({
    seatTokens: {
      red: seatTokenState({
        clientId: 'owner-client',
        rawToken,
        seat: 'red',
        userId: 'owner',
      }),
    },
  });

  assert.deepEqual(assignDarkXiangqiSeat(room, 'attacker', rawToken, userAccount('attacker')), {
    ok: false,
    reason: 'private room',
  });
});

test('Dark Xiangqi seat session reclaims an account-bound seat without a raw token', () => {
  const previous = seatTokenState({
    clientId: 'old-client',
    rawToken: 'account-token',
    seat: 'black',
    userId: 'player',
  });
  const room = seatRoom({ seatTokens: { black: previous } });

  const result = assignDarkXiangqiSeat(room, 'new-client', undefined, userAccount('player'));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.seat, 'black');
  assert.equal(result.seatTokenHash, previous.tokenHash);
  assert.equal(result.previousTokenState, previous);
  assert.equal(room.seatTokens.black?.clientId, 'new-client');
});

test('Dark Xiangqi seat session closes the room when both seats are held', () => {
  const room = seatRoom({
    seatTokens: {
      black: seatTokenState({ clientId: 'black-client', rawToken: 'black-token', seat: 'black' }),
      red: seatTokenState({ clientId: 'red-client', rawToken: 'red-token', seat: 'red' }),
    },
  });

  assert.deepEqual(assignDarkXiangqiSeat(room, 'third-client', undefined, null), {
    ok: false,
    reason: 'private room',
  });
});

test('Dark Xiangqi seat session rollback removes newly issued tokens', () => {
  const room = seatRoom();
  const assignment = assignDarkXiangqiSeat(room, 'client-red', undefined, null);
  assert.equal(assignment.ok, true);
  if (!assignment.ok) return;

  rollbackDarkXiangqiSeatAssignment(room, assignment);

  assert.equal(room.seatTokens.red, undefined);
});

test('Dark Xiangqi seat session rollback restores replaced token state', () => {
  const rawToken = 'replace-token';
  const previous = seatTokenState({
    clientId: 'old-client',
    rawToken,
    seat: 'red',
  });
  const room = seatRoom({ seatTokens: { red: previous } });
  const assignment = assignDarkXiangqiSeat(room, 'new-client', rawToken, null);
  assert.equal(assignment.ok, true);
  if (!assignment.ok) return;

  rollbackDarkXiangqiSeatAssignment(room, assignment);

  assert.equal(room.seatTokens.red, previous);
});

test('Dark Xiangqi seat session displaces older clients on the same seat only', () => {
  const olderRed = client('older-red', 'red');
  const newerRed = client('newer-red', 'red');
  const black = client('black', 'black');
  const room = seatRoom({ clients: [olderRed, newerRed, black] });

  displaceOlderDarkXiangqiSeatClients(room, newerRed);

  assert.equal(olderRed.displaced, true);
  assert.deepEqual(olderRed.closeCalls, [{ code: 4000, reason: 'duplicate session' }]);
  assert.equal(newerRed.displaced, false);
  assert.equal(black.displaced, false);
  assert.deepEqual(black.closeCalls, []);
});

type TestClient = DarkXiangqiSeatClient & {
  closeCalls: Array<{ code: number | undefined; reason: string | undefined }>;
  id: string;
};

function seatRoom(
  options: {
    clients?: TestClient[];
    projectionSeats?: Partial<Record<XiangqiColor, string>>;
    seatTokens?: Partial<Record<XiangqiColor, DarkXiangqiSeatTokenState>>;
  } = {},
): DarkXiangqiSeatRoom<TestClient> {
  return {
    clients: new Set(options.clients ?? []),
    projection: { seats: options.projectionSeats ?? {} },
    seatTokens: { ...(options.seatTokens ?? {}) },
  };
}

function client(id: string, seat: XiangqiColor): TestClient {
  const closeCalls: TestClient['closeCalls'] = [];
  return {
    closeCalls,
    displaced: false,
    id,
    seat,
    socket: {
      close: (code?: number, reason?: string) => {
        closeCalls.push({ code, reason });
      },
    },
  };
}

function seatTokenState(options: {
  clientId: string;
  rawToken: string;
  seat: XiangqiColor;
  userId?: string | null;
}): DarkXiangqiSeatTokenState {
  const now = new Date('2026-05-29T00:00:00.000Z');
  return {
    clientId: options.clientId,
    issuedAt: now,
    lastSeenAt: now,
    revokedAt: null,
    seat: options.seat,
    tokenHash: hashSeatToken(options.rawToken),
    userDisplayName: options.userId ? 'Player' : null,
    userHandle: options.userId ? 'player' : null,
    userId: options.userId ?? null,
  };
}

function userAccount(id: string): UserAccount {
  const now = new Date('2026-05-29T00:00:00.000Z');
  return {
    accountRole: 'player',
    createdAt: now,
    displayName: id,
    displayNameChangedAt: null,
    eloRating: 1500,
    email: `${id}@example.test`,
    emailVerifiedAt: now,
    handle: id,
    handleChangedAt: null,
    id,
    profileVisibility: 'private',
    updatedAt: now,
  };
}
