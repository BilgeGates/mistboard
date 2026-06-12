import assert from 'node:assert/strict';
import type { ServerResponse } from 'node:http';
import test from 'node:test';
import { correspondenceTimeControl, DAY_MS, type RoomTimeControl } from '@mistboard/game';
import {
  createDarkChessCorrespondenceRoom,
  darkChessTenantRooms,
  sweepDarkChessDueDeadline,
} from './dark-chess-registration.js';
import { type DarkChessTenantEvent, darkChessTenant } from './dark-chess-tenant.js';
import type { UserAccount } from './persistence.js';
import {
  type CorrespondenceCreateContext,
  handleCorrespondenceCreate,
  requestsCorrespondence,
} from './routes/correspondence-rooms.js';
import { variantTenantForRoomId } from './variant-tenant/registry.js';
import { createTenantRuntimeRoomFromEvents } from './variant-tenant/runtime.js';

process.env.MISTBOARD_CORRESPONDENCE_ENABLED = 'true';

function fakeResponse() {
  const captured: { status?: number; body?: Record<string, unknown> } = {};
  const response = {
    writeHead(status: number) {
      captured.status = status;
      return response;
    },
    setHeader() {
      return response;
    },
    end(payload?: string) {
      if (payload) captured.body = JSON.parse(payload) as Record<string, unknown>;
    },
  } as unknown as ServerResponse;
  return { response, captured };
}

function createContext(
  overrides: Partial<CorrespondenceCreateContext> = {},
): CorrespondenceCreateContext & {
  created: Array<{ timeControl: RoomTimeControl; creatorPreference?: string }>;
} {
  const created: Array<{ timeControl: RoomTimeControl; creatorPreference?: string }> = [];
  return {
    created,
    databaseRequired: false,
    isDraining: () => false,
    drainDeadlineMs: () => null,
    isPersistenceInitialized: () => true,
    createCorrespondenceRoom: async (timeControl, creatorPreference) => {
      created.push({ timeControl, creatorPreference });
      return { ok: true, room: { id: 'dchx_test-room', gameSpecId: 'dark-chess' } };
    },
    ...overrides,
  };
}

const signedIn = { id: 'user-1', handle: 'tester', displayName: 'Tester' } as UserAccount;

test('correspondence matcher claims only explicit dark-chess correspondence requests', () => {
  assert.equal(requestsCorrespondence({ gameSpecId: 'dark-chess', mode: 'correspondence' }), true);
  // Plain dark-chess creates stay on the chess fallback path.
  assert.equal(requestsCorrespondence({ gameSpecId: 'dark-chess', mode: 'pvp' }), false);
  assert.equal(requestsCorrespondence({ gameSpecId: 'dark-chess' }), false);
  // Other specs answer through their own surfaces.
  assert.equal(
    requestsCorrespondence({ gameSpecId: 'dark-mini-xiangqi', mode: 'correspondence' }),
    false,
  );
});

test('correspondence create is flag-gated', async () => {
  process.env.MISTBOARD_CORRESPONDENCE_ENABLED = 'false';
  try {
    const { response, captured } = fakeResponse();
    await handleCorrespondenceCreate(
      createContext(),
      response,
      { gameSpecId: 'dark-chess', mode: 'correspondence', daysPerMove: 3 },
      signedIn,
    );
    assert.equal(captured.status, 404);
    assert.equal(captured.body?.error, 'correspondence_disabled');
  } finally {
    process.env.MISTBOARD_CORRESPONDENCE_ENABLED = 'true';
  }
});

test('correspondence create requires an account', async () => {
  const { response, captured } = fakeResponse();
  await handleCorrespondenceCreate(
    createContext(),
    response,
    { gameSpecId: 'dark-chess', mode: 'correspondence', daysPerMove: 3 },
    null,
  );
  assert.equal(captured.status, 401);
  assert.equal(captured.body?.error, 'correspondence_requires_account');
});

test('correspondence create rejects off-menu allowances', async () => {
  for (const daysPerMove of [2, 0, -1, 'three', undefined, 0.5]) {
    const { response, captured } = fakeResponse();
    await handleCorrespondenceCreate(
      createContext(),
      response,
      { gameSpecId: 'dark-chess', mode: 'correspondence', daysPerMove },
      signedIn,
    );
    assert.equal(captured.status, 400, `daysPerMove=${String(daysPerMove)}`);
    assert.equal(captured.body?.error, 'invalid_days_per_move');
  }
});

test('correspondence create requires persistence', async () => {
  const { response, captured } = fakeResponse();
  await handleCorrespondenceCreate(
    createContext({ isPersistenceInitialized: () => false }),
    response,
    { gameSpecId: 'dark-chess', mode: 'correspondence', daysPerMove: 3 },
    signedIn,
  );
  assert.equal(captured.status, 503);
  assert.equal(captured.body?.error, 'persistence_disabled');
});

test('correspondence create succeeds for a signed-in user with an official allowance', async () => {
  const ctx = createContext();
  const { response, captured } = fakeResponse();
  await handleCorrespondenceCreate(
    ctx,
    response,
    {
      gameSpecId: 'dark-chess',
      mode: 'correspondence',
      daysPerMove: 3,
      preferredColor: 'white',
    },
    signedIn,
  );
  assert.equal(captured.status, 201);
  assert.equal(captured.body?.roomId, 'dchx_test-room');
  assert.equal(captured.body?.mode, 'correspondence');
  assert.equal(captured.body?.rated, false);
  assert.deepEqual(ctx.created, [
    { timeControl: correspondenceTimeControl(3), creatorPreference: 'white' },
  ]);
});

test('compressed dev allowances are accepted only behind the dev flag', async () => {
  const body = { gameSpecId: 'dark-chess', mode: 'correspondence', daysPerMove: 0.002 };
  {
    const { response, captured } = fakeResponse();
    await handleCorrespondenceCreate(createContext(), response, body, signedIn);
    assert.equal(captured.status, 400);
  }
  process.env.MISTBOARD_DEV_CORRESPONDENCE_TC = 'true';
  try {
    const ctx = createContext();
    const { response, captured } = fakeResponse();
    await handleCorrespondenceCreate(ctx, response, body, signedIn);
    assert.equal(captured.status, 201);
    assert.equal(ctx.created[0]?.timeControl.daysPerMove, 0.002);
    assert.equal(ctx.created[0]?.timeControl.initialMs, Math.round(0.002 * DAY_MS));
  } finally {
    delete process.env.MISTBOARD_DEV_CORRESPONDENCE_TC;
  }
});

test('the dark-chess registration claims the dchx_ prefix with correspondence identity', () => {
  const registration = variantTenantForRoomId('dchx_anything');
  assert.ok(registration);
  assert.equal(registration.kind, 'dark-chess');
  assert.equal(registration.errorPrefix, 'correspondence');
  assert.equal(registration.lobby, null);
  assert.notEqual(registration.sweepDueDeadline, null);
});

test('correspondence rooms never count against the drain gate', async () => {
  const registration = variantTenantForRoomId('dchx_drain');
  assert.ok(registration);
  const created = await createDarkChessCorrespondenceRoom(correspondenceTimeControl(3));
  assert.ok(created.ok);
  try {
    assert.equal(created.room.projection.state.status.type, 'playing');
    assert.equal(registration.activeGameCount(), 0);
  } finally {
    darkChessTenantRooms.clear();
  }
});

test('sweepDarkChessDueDeadline flags a due in-memory room through the ws runtime', async () => {
  const roomId = 'dchx_due_sweep';
  const tc = correspondenceTimeControl(1);
  const events: DarkChessTenantEvent[] = [
    { type: 'room-created', at: 1_000, roomId, gameSpecId: 'dark-chess', timeControl: tc },
    {
      type: 'clock-started',
      at: 1_000,
      roomId,
      clock: {
        activeColor: null,
        incrementMs: 0,
        initialMs: tc.initialMs,
        remainingMs: { black: tc.initialMs, white: tc.initialMs },
        runningSince: null,
      },
    },
    { type: 'seat-assigned', at: 2_000, roomId, clientId: 'w', seat: 'white' },
    { type: 'seat-assigned', at: 3_000, roomId, clientId: 'b', seat: 'black' },
    { type: 'move-played', at: 4_000, roomId, color: 'white', move: { from: 'e2', to: 'e4' } },
    { type: 'move-played', at: 5_000, roomId, color: 'black', move: { from: 'e7', to: 'e5' } },
  ];
  const hydrated = createTenantRuntimeRoomFromEvents(darkChessTenant, events);
  assert.ok(hydrated.ok);
  darkChessTenantRooms.set(roomId, hydrated.room);
  try {
    // The epoch-era timestamps make the one-day allowance long overdue.
    await sweepDarkChessDueDeadline(roomId);
    const status = hydrated.room.projection.state.status;
    assert.equal(status.type, 'finished');
    assert.ok(status.type === 'finished');
    assert.equal(status.winner, 'black');
    assert.equal(status.reason, 'timeout');
  } finally {
    darkChessTenantRooms.clear();
  }
});
