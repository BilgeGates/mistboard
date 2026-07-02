import assert from 'node:assert/strict';
import type { ServerResponse } from 'node:http';
import test from 'node:test';
import { BANQI_SPEC_ID } from '@mistboard/game';
import {
  createTenantRoomsRoute,
  resolveFirstMoverHumanSeat,
  type TenantRoomCreateBaseContext,
  type TenantRoomCreateParams,
  type TenantRoomCreateResult,
} from '../variant-tenant/rooms-route.js';

// Focused unit test for the generic room-creation route factory. Every case is
// bound to the real (gated) Banqi spec so the fail-closed game-spec gate is
// exercised for real; the tenant policy under test is whatever config we pass.

const BANQI_FLAG = 'MISTBOARD_BANQI_ENABLED';
const RATED_FLAG = 'MISTBOARD_RATED_ENABLED';

type Capture = { body: string; status: number | null };

function captureResponse(): ServerResponse & Capture {
  const capture = {
    body: '',
    status: null as number | null,
    writeHead(status: number) {
      capture.status = status;
      return capture;
    },
    end(chunk?: string) {
      capture.body += chunk ?? '';
      return capture;
    },
  };
  return capture as unknown as ServerResponse & Capture;
}

function json(response: Capture): Record<string, unknown> {
  return JSON.parse(response.body) as Record<string, unknown>;
}

const baseCtx: TenantRoomCreateBaseContext = {
  databaseRequired: false,
  isDraining: () => false,
  drainDeadlineMs: () => null,
};

const GOOD_ENGINE = 'good-engine';
const SEATS = ['red', 'black'] as const;

// A seated + reject-as-surface route (the banqi/jieqi/jungle shape), with a spy
// recording the resolved create params.
function seatedRoute(spy: {
  params?: TenantRoomCreateParams<'red' | 'black' | 'random', 'red' | 'black'>;
}) {
  return createTenantRoomsRoute<
    TenantRoomCreateBaseContext,
    'red' | 'black' | 'random',
    'red' | 'black'
  >({
    gameSpecId: BANQI_SPEC_ID,
    errorPrefix: 'banqi',
    hasDisabledFlag: true,
    preferredColors: ['red', 'black', 'random'],
    engine: {
      kind: 'seated',
      defaultEngineId: GOOD_ENGINE,
      isEngineClientId: (id) => id === GOOD_ENGINE,
      seats: SEATS,
    },
    rated: { kind: 'reject-as-surface' },
    createRoom: (_ctx, params): Promise<TenantRoomCreateResult> => {
      spy.params = params;
      return Promise.resolve({ ok: true, room: { id: 'bq_1', gameSpecId: BANQI_SPEC_ID } });
    },
  });
}

function withFlag(flag: string, value: string | undefined, fn: () => Promise<void>): Promise<void> {
  const before = process.env[flag];
  if (value === undefined) delete process.env[flag];
  else process.env[flag] = value;
  return fn().finally(() => {
    if (before === undefined) delete process.env[flag];
    else process.env[flag] = before;
  });
}

test('factory: returns the disabled error when the launch flag is off', async () => {
  await withFlag(BANQI_FLAG, undefined, async () => {
    const spy: { params?: TenantRoomCreateParams<'red' | 'black' | 'random', 'red' | 'black'> } =
      {};
    const response = captureResponse();
    await seatedRoute(spy).handleCreate(baseCtx, response, {
      gameSpecId: BANQI_SPEC_ID,
      mode: 'pvp',
    });
    assert.equal(response.status, 404);
    assert.deepEqual(json(response), { error: 'banqi_disabled' });
    assert.equal(spy.params, undefined);
  });
});

test('factory: rejects a mismatched spec that the gate passes as not_integrated', async () => {
  await withFlag(BANQI_FLAG, 'true', async () => {
    const spy: { params?: TenantRoomCreateParams<'red' | 'black' | 'random', 'red' | 'black'> } =
      {};
    const response = captureResponse();
    await seatedRoute(spy).handleCreate(baseCtx, response, {
      gameSpecId: 'dark-chess',
      mode: 'pvp',
    });
    assert.equal(response.status, 501);
    assert.deepEqual(json(response), { error: 'banqi_not_integrated' });
    assert.equal(spy.params, undefined);
  });
});

test('factory: matchesCreateRequest claims only the canonical game spec', () => {
  const route = seatedRoute({});
  assert.equal(route.matchesCreateRequest({ gameSpecId: BANQI_SPEC_ID }), true);
  assert.equal(route.matchesCreateRequest({ variant: BANQI_SPEC_ID }), false);
  assert.equal(route.matchesCreateRequest({ gameSpecId: 'dark-chess' }), false);
});

test('factory: reject-as-surface rejects rated before room creation', async () => {
  await withFlag(BANQI_FLAG, 'true', async () => {
    const spy: { params?: TenantRoomCreateParams<'red' | 'black' | 'random', 'red' | 'black'> } =
      {};
    const response = captureResponse();
    await seatedRoute(spy).handleCreate(baseCtx, response, {
      gameSpecId: BANQI_SPEC_ID,
      mode: 'pvp',
      rated: true,
    });
    assert.equal(response.status, 501);
    assert.deepEqual(json(response), { error: 'banqi_unsupported_surface' });
    assert.equal(spy.params, undefined);
  });
});

test('factory: rejects an unknown PvE engine id', async () => {
  await withFlag(BANQI_FLAG, 'true', async () => {
    const spy: { params?: TenantRoomCreateParams<'red' | 'black' | 'random', 'red' | 'black'> } =
      {};
    const response = captureResponse();
    await seatedRoute(spy).handleCreate(baseCtx, response, {
      gameSpecId: BANQI_SPEC_ID,
      mode: 'pve',
      engineId: 'not-an-engine',
    });
    assert.equal(response.status, 400);
    assert.deepEqual(json(response), { error: 'invalid_engine' });
    assert.equal(spy.params, undefined);
  });
});

test('factory: rejects an invalid time control before room creation', async () => {
  await withFlag(BANQI_FLAG, 'true', async () => {
    const spy: { params?: TenantRoomCreateParams<'red' | 'black' | 'random', 'red' | 'black'> } =
      {};
    const response = captureResponse();
    await seatedRoute(spy).handleCreate(baseCtx, response, {
      gameSpecId: BANQI_SPEC_ID,
      mode: 'pvp',
      timeControl: { id: '3m2' },
    });
    assert.equal(response.status, 400);
    assert.deepEqual(json(response), { error: 'invalid_time_control' });
    assert.equal(spy.params, undefined);
  });
});

test('factory: happy path creates a PvP room and echoes the envelope', async () => {
  await withFlag(BANQI_FLAG, 'true', async () => {
    const spy: { params?: TenantRoomCreateParams<'red' | 'black' | 'random', 'red' | 'black'> } =
      {};
    const response = captureResponse();
    await seatedRoute(spy).handleCreate(baseCtx, response, {
      gameSpecId: BANQI_SPEC_ID,
      mode: 'pvp',
      preferredColor: 'black',
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    });
    assert.equal(response.status, 201);
    assert.deepEqual(json(response), {
      roomId: 'bq_1',
      url: '/room/bq_1',
      mode: 'pvp',
      gameSpecId: BANQI_SPEC_ID,
      region: 'global',
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    });
    assert.equal(spy.params?.preferredColor, 'black');
    assert.equal(spy.params?.rated, false);
    assert.equal(spy.params?.engine, undefined);
  });
});

test('factory: PvE seats the engine opposite the human seat', async () => {
  await withFlag(BANQI_FLAG, 'true', async () => {
    const spy: { params?: TenantRoomCreateParams<'red' | 'black' | 'random', 'red' | 'black'> } =
      {};
    const response = captureResponse();
    // Human prefers black → engine takes red (the first mover).
    await seatedRoute(spy).handleCreate(baseCtx, response, {
      gameSpecId: BANQI_SPEC_ID,
      mode: 'pve',
      preferredColor: 'black',
      botId: 'some-bot',
    });
    assert.equal(response.status, 201);
    assert.deepEqual(spy.params?.engine, {
      engineId: GOOD_ENGINE,
      seat: 'red',
      botId: 'some-bot',
    });
  });
});

test('factory: account-gated rated flow gates on the rated flag and mode', async () => {
  const route = createTenantRoomsRoute<
    TenantRoomCreateBaseContext,
    'red' | 'black' | 'random',
    'red' | 'black'
  >({
    gameSpecId: BANQI_SPEC_ID,
    errorPrefix: 'banqi',
    hasDisabledFlag: true,
    preferredColors: ['red', 'black', 'random'],
    engine: {
      kind: 'seated',
      defaultEngineId: GOOD_ENGINE,
      isEngineClientId: (id) => id === GOOD_ENGINE,
      seats: SEATS,
    },
    rated: { kind: 'account-gated' },
    createRoom: (_ctx, params): Promise<TenantRoomCreateResult> =>
      Promise.resolve({
        ok: true,
        room: { id: 'bq_2', gameSpecId: BANQI_SPEC_ID, rated: params.rated },
      }),
  });

  await withFlag(BANQI_FLAG, 'true', () =>
    withFlag(RATED_FLAG, undefined, async () => {
      // PvE + rated → unsupported surface (rejected before the rated flow).
      const pve = captureResponse();
      await route.handleCreate(baseCtx, pve, {
        gameSpecId: BANQI_SPEC_ID,
        mode: 'pve',
        rated: true,
      });
      assert.equal(pve.status, 501);
      assert.deepEqual(json(pve), { error: 'banqi_unsupported_surface' });

      // PvP + rated with the rated flag off → 403 rated_disabled.
      const pvp = captureResponse();
      await route.handleCreate(baseCtx, pvp, {
        gameSpecId: BANQI_SPEC_ID,
        mode: 'pvp',
        rated: true,
      });
      assert.equal(pvp.status, 403);
      assert.deepEqual(json(pvp), { error: 'rated_disabled' });
    }),
  );
});

test('factory: PvP-only route rejects PvE and stray engine ids as unsupported', async () => {
  const route = createTenantRoomsRoute<TenantRoomCreateBaseContext, 'white' | 'black' | 'random'>({
    gameSpecId: BANQI_SPEC_ID,
    errorPrefix: 'banqi',
    hasDisabledFlag: true,
    preferredColors: ['white', 'black', 'random'],
    engine: { kind: 'none', rejectEngineId: true },
    rated: { kind: 'reject-as-surface' },
    createRoom: (_ctx, _params): Promise<TenantRoomCreateResult> =>
      Promise.resolve({ ok: true, room: { id: 'bq_3', gameSpecId: BANQI_SPEC_ID } }),
  });

  await withFlag(BANQI_FLAG, 'true', async () => {
    const pve = captureResponse();
    await route.handleCreate(baseCtx, pve, { gameSpecId: BANQI_SPEC_ID, mode: 'pve' });
    assert.equal(pve.status, 501);
    assert.deepEqual(json(pve), { error: 'banqi_unsupported_surface' });

    const stray = captureResponse();
    await route.handleCreate(baseCtx, stray, {
      gameSpecId: BANQI_SPEC_ID,
      mode: 'pvp',
      engineId: 'x',
    });
    assert.equal(stray.status, 501);
    assert.deepEqual(json(stray), { error: 'banqi_unsupported_surface' });
  });
});

test('resolveFirstMoverHumanSeat: default first mover, explicit second, coin-flip', () => {
  assert.equal(resolveFirstMoverHumanSeat(undefined, SEATS), 'red');
  assert.equal(resolveFirstMoverHumanSeat('red', SEATS), 'red');
  assert.equal(resolveFirstMoverHumanSeat('black', SEATS), 'black');
  assert.equal(resolveFirstMoverHumanSeat('random', SEATS, 0), 'red');
  assert.equal(resolveFirstMoverHumanSeat('random', SEATS, 255), 'black');
});
