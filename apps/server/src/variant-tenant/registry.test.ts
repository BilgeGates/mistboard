import assert from 'node:assert/strict';
import test from 'node:test';
// Importing the DMX ws adapter registers the tenant (module-scope side effect,
// the "one registry entry" of the tenant contract).
import '../server-ws-dark-mini-xiangqi.js';
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
