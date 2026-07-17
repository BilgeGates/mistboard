import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveWebSocketLiveRuntime, type WebSocketLiveRuntime } from './server-ws-connection.js';
import type { TenantManagedRoom, VariantTenantRegistration } from './variant-tenant/registry.js';

// The resolver takes the registrations as data (the production caller passes
// registeredVariantTenants()), so the contract is pinned with synthetic
// registrations instead of mutating the global registry.

test('WebSocket runtime resolver routes existing tenant rooms before flag checks', async () => {
  const room = roomFixture('dxq_existing');
  const harness = resolverHarness({ kind: 'dark-xiangqi', prefix: 'dxq_', enabled: false, room });

  const runtime = await resolveWebSocketLiveRuntime([harness.registration], 'dxq_existing');

  assertTenantRuntime(runtime, harness.registration, room);
  assert.equal(harness.loadCalls(), 0);
});

test('WebSocket runtime resolver hydrates enabled tenant rooms by prefix', async () => {
  const room = roomFixture('dmxq_hydrate');
  const harness = resolverHarness({
    kind: 'dark-mini-xiangqi',
    prefix: 'dmxq_',
    enabled: true,
    loadRoom: room,
  });

  const runtime = await resolveWebSocketLiveRuntime([harness.registration], 'dmxq_hydrate');

  assertTenantRuntime(runtime, harness.registration, room);
  assert.equal(harness.loadCalls(), 1);
});

test('WebSocket runtime resolver rejects tenant ids while the tenant is disabled', async () => {
  const harness = resolverHarness({ kind: 'dark-xiangqi', prefix: 'dxq_', enabled: false });

  const runtime = await resolveWebSocketLiveRuntime([harness.registration], 'dxq_disabled');

  assert.deepEqual(runtime, { kind: 'variant-tenant-unavailable', reason: 'game spec disabled' });
  assert.equal(harness.loadCalls(), 0);
});

test('WebSocket runtime resolver rejects missing enabled tenant rooms', async () => {
  const harness = resolverHarness({ kind: 'dark-mini-xiangqi', prefix: 'dmxq_', enabled: true });

  const runtime = await resolveWebSocketLiveRuntime([harness.registration], 'dmxq_missing');

  assert.deepEqual(runtime, { kind: 'variant-tenant-unavailable', reason: 'room unavailable' });
  assert.equal(harness.loadCalls(), 1);
});

test('WebSocket runtime resolver keeps registry misses on the chess runtime', async () => {
  const harness = resolverHarness({ kind: 'dark-xiangqi', prefix: 'dxq_', enabled: true });

  const runtime = await resolveWebSocketLiveRuntime([harness.registration], 'room-chess');

  assert.deepEqual(runtime, { kind: 'chess' });
  assert.equal(harness.loadCalls(), 0);
});

test('WebSocket runtime resolver routes each prefix to its own registration', async () => {
  const dxqRoom = roomFixture('dxq_live');
  const dmxRoom = roomFixture('dmxq_live');
  const dxq = resolverHarness({
    kind: 'dark-xiangqi',
    prefix: 'dxq_',
    enabled: true,
    room: dxqRoom,
  });
  const dmx = resolverHarness({
    kind: 'dark-mini-xiangqi',
    prefix: 'dmxq_',
    enabled: true,
    room: dmxRoom,
  });
  const registrations = [dxq.registration, dmx.registration];

  assertTenantRuntime(
    await resolveWebSocketLiveRuntime(registrations, 'dmxq_live'),
    dmx.registration,
    dmxRoom,
  );
  assertTenantRuntime(
    await resolveWebSocketLiveRuntime(registrations, 'dxq_live'),
    dxq.registration,
    dxqRoom,
  );
});

function assertTenantRuntime(
  runtime: WebSocketLiveRuntime,
  registration: VariantTenantRegistration,
  room: TenantManagedRoom,
): void {
  assert.equal(runtime.kind, 'variant-tenant');
  if (runtime.kind !== 'variant-tenant') return;
  assert.equal(runtime.registration, registration);
  assert.equal(runtime.room, room);
}

function resolverHarness(options: {
  kind: string;
  prefix: string;
  enabled: boolean;
  room?: TenantManagedRoom;
  loadRoom?: TenantManagedRoom;
}): { registration: VariantTenantRegistration; loadCalls: () => number } {
  let loadCalls = 0;
  const rooms = new Map<string, TenantManagedRoom>();
  if (options.room) rooms.set(options.room.id, options.room);
  const registration: VariantTenantRegistration = {
    kind: options.kind,
    gameSpecId: options.kind,
    roomIdPrefix: options.prefix,
    ownsSpecRouting: true,
    errorPrefix: options.kind.replaceAll('-', '_'),
    enabled: () => options.enabled,
    rooms,
    activeGameCount: () => 0,
    getOrLoadRoom: async () => {
      loadCalls += 1;
      return options.loadRoom ?? null;
    },
    attachWebSocket: async () => {
      throw new Error('unexpected ws attach in resolver test');
    },
    clearRuntimeTimers: () => {},
    clearRooms: () => rooms.clear(),
    http: {
      matchesCreateRequest: () => false,
      handleCreate: async () => {
        throw new Error('unexpected http create in resolver test');
      },
    },
    lobby: null,
    sweepDueDeadline: null,
    createCorrespondenceGameForSeek: null,
  };
  return { registration, loadCalls: () => loadCalls };
}

function roomFixture(id: string): TenantManagedRoom {
  return { id, clients: new Set(), pendingWrites: Promise.resolve() };
}
