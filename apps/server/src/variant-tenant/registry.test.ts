import assert from 'node:assert/strict';
import test from 'node:test';
// Importing a tenant's module registers it (module-scope side effect, the
// "one registry entry" of the tenant contract). DMX registers from its ws
// adapter; Dark Xiangqi and Crossroads from their tenant modules.
import '../crossroads-chess-tenant.js';
import '../dark-xiangqi-tenant.js';
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
