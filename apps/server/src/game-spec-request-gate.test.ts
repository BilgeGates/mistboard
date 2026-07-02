import assert from 'node:assert/strict';
import test from 'node:test';
import { GAME_SPECS } from '@mistboard/game';
import { gateGameSpecRequest } from './game-spec-request-gate.js';
// Importing register-tenants registers every tenant (module-scope side effect
// of each *-registration.ts module), so the registry-driven test below sees
// the same tenant set the server boots with.
import './variant-tenant/register-tenants.js';
import { registeredVariantTenants } from './variant-tenant/registry.js';

test('game spec gate passes current chess requests', () => {
  assert.deepEqual(gateGameSpecRequest({ variant: 'dark-chess' }), { type: 'pass' });
  assert.deepEqual(gateGameSpecRequest({ gameSpecId: 'dark-chess' }), { type: 'pass' });
  assert.deepEqual(gateGameSpecRequest({ gameSpecId: 'dark-draft960' }), { type: 'pass' });
  // 'fog-draft960' is a registry alias for dark-draft960 (chess stack).
  assert.deepEqual(gateGameSpecRequest({ gameSpecId: 'fog-draft960' }), { type: 'pass' });
  assert.deepEqual(gateGameSpecRequest({}), { type: 'pass' });
  // The WS dispatch passes url.searchParams.get('gameSpecId'), so an absent
  // query param arrives as null: treat it like undefined.
  assert.deepEqual(gateGameSpecRequest({ gameSpecId: null }), { type: 'pass' });
});

test('game spec gate leaves free-string variants to parseVariantId', () => {
  // parseVariantId (routes/lib.ts) owns the legacy collapse: draft960
  // spellings map to the draft960 setup, everything else to plain dark chess.
  // Legacy clients rely on that, so the gate only rejects a variant string
  // that names a known non-chess spec.
  assert.deepEqual(gateGameSpecRequest({ variant: 'draft960' }), { type: 'pass' });
  assert.deepEqual(gateGameSpecRequest({ variant: 'fog-draft960' }), { type: 'pass' });
  assert.deepEqual(gateGameSpecRequest({ variant: 'fog' }), { type: 'pass' });
});

test('game spec gate rejects unknown game spec ids', () => {
  // Fail closed: an id the registry does not know cannot be served by the
  // chess stack, and passing it would silently create a dark-chess room.
  for (const gameSpecId of ['fog', 'not-a-spec', '', 42]) {
    assert.deepEqual(
      gateGameSpecRequest({ gameSpecId }),
      {
        type: 'reject',
        error: 'unknown_game_spec',
        httpStatus: 404,
        wsCloseReason: 'unknown game spec',
      },
      `gameSpecId ${JSON.stringify(gameSpecId)}`,
    );
  }
});

test('game spec gate treats legacy Dark Xiangqi variant requests as disabled by default', () => {
  withFlag('MISTBOARD_DARK_XIANGQI_ENABLED', false, () => {
    assert.deepEqual(gateGameSpecRequest({ variant: 'dark-xiangqi' }), {
      type: 'reject',
      error: 'dark_xiangqi_disabled',
      httpStatus: 404,
      wsCloseReason: 'game spec disabled',
    });
  });
});

test('game spec gate rejects canonical Mini Xiangqi ids on the chess path', () => {
  // Real routing to the Mini Xiangqi tenant happens before this gate runs;
  // reaching the gate with this id means the tenant registry missed, so a
  // pass would silently create a dark-chess room (the old gate's accidental
  // fail-open).
  assert.deepEqual(gateGameSpecRequest({ gameSpecId: 'mini-xiangqi' }), {
    type: 'reject',
    error: 'mini_xiangqi_not_integrated',
    httpStatus: 501,
    wsCloseReason: 'game spec not integrated',
  });
});

test('game spec gate keeps legacy Mini Xiangqi variant requests out of chess', () => {
  assert.deepEqual(gateGameSpecRequest({ variant: 'mini-xiangqi' }), {
    type: 'reject',
    error: 'mini_xiangqi_not_integrated',
    httpStatus: 501,
    wsCloseReason: 'game spec not integrated',
  });
});

test('game spec gate treats legacy Dark Mini Xiangqi variant requests as disabled by default', () => {
  withFlag('MISTBOARD_DARK_MINI_XIANGQI_ENABLED', false, () => {
    assert.deepEqual(gateGameSpecRequest({ variant: 'dark-mini-xiangqi' }), {
      type: 'reject',
      error: 'dark_mini_xiangqi_disabled',
      httpStatus: 404,
      wsCloseReason: 'game spec disabled',
    });
  });
});

test('game spec gate keeps rejecting legacy variant spellings for tenant specs', () => {
  for (const variant of ['jieqi', 'dark-shogi']) {
    assert.equal(gateGameSpecRequest({ variant }).type, 'reject', `variant ${variant}`);
  }
});

test('game spec gate answers Crossroads Chess with its launch flag', () => {
  // The gate's strings must match routes/crossroads-chess-rooms.ts, which
  // writes 'crossroads_chess_disabled' from the same flag.
  withFlag('MISTBOARD_CROSSROADS_CHESS_ENABLED', false, () => {
    assert.deepEqual(gateGameSpecRequest({ gameSpecId: 'crossroads-chess' }), {
      type: 'reject',
      error: 'crossroads_chess_disabled',
      httpStatus: 404,
      wsCloseReason: 'game spec disabled',
    });
  });
  withFlag('MISTBOARD_CROSSROADS_CHESS_ENABLED', true, () => {
    assert.deepEqual(gateGameSpecRequest({ gameSpecId: 'crossroads-chess' }), {
      type: 'reject',
      error: 'crossroads_chess_not_integrated',
      httpStatus: 501,
      wsCloseReason: 'game spec not integrated',
    });
  });
});

test('game spec gate resolves registry aliases like tenant matching does', () => {
  // 'dual-chess' is the pre-rename alias for crossroads-chess; the crossroads
  // tenant matches it via maybeGameSpecForId, so the gate answers the alias
  // exactly like the canonical id.
  assert.deepEqual(
    gateGameSpecRequest({ gameSpecId: 'dual-chess' }),
    gateGameSpecRequest({ gameSpecId: 'crossroads-chess' }),
  );
  assert.equal(gateGameSpecRequest({ gameSpecId: 'dual-chess' }).type, 'reject');
});

test('game spec gate rejects every runtimeStatus future spec', () => {
  const futureSpecs = GAME_SPECS.filter((spec) => spec.runtimeStatus === 'future');
  assert.ok(futureSpecs.length > 0, 'expected future specs in the registry');
  for (const spec of futureSpecs) {
    assert.deepEqual(
      gateGameSpecRequest({ gameSpecId: spec.id }),
      {
        type: 'reject',
        // Known-but-unrouted stays distinguishable from unknown_game_spec.
        error: `${spec.id.replaceAll('-', '_')}_not_integrated`,
        httpStatus: 501,
        wsCloseReason: 'game spec not integrated',
      },
      spec.id,
    );
  }
});

test('game spec gate fails closed for every registered tenant spec', () => {
  // The gate guards the chess fallback: a tenant spec that passes here would
  // silently create a dark-chess room whenever the tenant registry misses
  // (e.g. a registration import dropped from register-tenants.ts). Tenants
  // with ownsSpecRouting=false (dark-chess correspondence) are skipped: the
  // chess stack IS that spec's primary surface (see variant-tenant/registry.ts).
  //
  // Exhaustiveness is enforced at compile time: GATED_GAME_SPECS in
  // game-spec-request-gate.ts satisfies a Record keyed by every non-chess
  // GameSpecId, so a new union member fails the build until it gets a gate
  // entry. This runtime loop stays as belt-and-braces against a spec landing
  // in CHESS_STACK_SPEC_IDS while a tenant still owns its routing.
  const tenants = registeredVariantTenants().filter((tenant) => tenant.ownsSpecRouting);
  assert.ok(tenants.length > 0, 'expected registered tenants; did register-tenants.ts load?');
  for (const tenant of tenants) {
    for (const input of [{ gameSpecId: tenant.gameSpecId }, { variant: tenant.gameSpecId }]) {
      assert.equal(
        gateGameSpecRequest(input).type,
        'reject',
        `${tenant.gameSpecId}: gate passed ${JSON.stringify(input)}; a registry miss would fall open into the chess stack (check the spec's entry in GATED_GAME_SPECS in game-spec-request-gate.ts)`,
      );
    }
  }
});

function withFlag(name: string, enabled: boolean, fn: () => void): void {
  const before = process.env[name];
  if (enabled) process.env[name] = 'true';
  else delete process.env[name];
  try {
    fn();
  } finally {
    if (before === undefined) delete process.env[name];
    else process.env[name] = before;
  }
}
