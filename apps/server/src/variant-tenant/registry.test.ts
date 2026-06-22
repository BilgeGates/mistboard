import assert from 'node:assert/strict';
import test from 'node:test';
// Importing register-tenants registers every tenant (module-scope side effect
// of each *-registration.ts module — the "one registry entry" of the tenant
// contract).
import './register-tenants.js';
import {
  registeredVariantTenants,
  registerVariantTenant,
  variantTenantForRoomId,
  variantTenantForSpecId,
} from './registry.js';

test('registry: DMX registration resolves by room id prefix and spec id', () => {
  const byRoom = variantTenantForRoomId('dmxq_some-room');
  assert.equal(byRoom?.kind, 'dark-mini-xiangqi');
  const bySpec = variantTenantForSpecId('dark-mini-xiangqi');
  assert.equal(bySpec?.roomIdPrefix, 'dmxq_');
});

test('registry: Drop Mini Xiangqi registration resolves by room id prefix and spec id', () => {
  assert.equal(variantTenantForRoomId('dmxqd_some-room')?.kind, 'drop-mini-xiangqi');
  assert.equal(variantTenantForSpecId('drop-mini-xiangqi')?.roomIdPrefix, 'dmxqd_');
});

test('registry: Mini Xiangqi registration resolves by room id prefix and spec id', () => {
  assert.equal(variantTenantForRoomId('mxq_some-room')?.kind, 'mini-xiangqi');
  assert.equal(variantTenantForSpecId('mini-xiangqi')?.roomIdPrefix, 'mxq_');
});

test('registry: Dark Xiangqi registration resolves by room id prefix and spec id', () => {
  assert.equal(variantTenantForRoomId('dxq_some-room')?.kind, 'dark-xiangqi');
  assert.equal(variantTenantForSpecId('dark-xiangqi')?.roomIdPrefix, 'dxq_');
});

test('registry: Crossroads registration resolves by room id prefix and spec id', () => {
  assert.equal(variantTenantForRoomId('dchess_some-room')?.kind, 'crossroads-chess');
  assert.equal(variantTenantForSpecId('crossroads-chess')?.roomIdPrefix, 'dchess_');
});

test('registry: misses fall through to null (chess fallback stays untouched)', () => {
  assert.equal(variantTenantForRoomId('room_chess-id'), null);
  assert.equal(variantTenantForSpecId('dark-chess'), null);
});

test('registry: re-registration is idempotent for the same kind, throws across kinds', () => {
  const dmx = registeredVariantTenants().find((entry) => entry.kind === 'dark-mini-xiangqi');
  assert.ok(dmx);
  const before = registeredVariantTenants().length;
  registerVariantTenant(dmx);
  assert.equal(registeredVariantTenants().length, before);
  assert.throws(() => registerVariantTenant({ ...dmx, kind: 'other-variant' }), /prefix collision/);
});
