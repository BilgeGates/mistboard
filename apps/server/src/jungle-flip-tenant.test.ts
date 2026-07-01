/**
 * Flip Jungle tenant: PvE engine-seat recognition.
 *
 * wire.snapshotExtras is what tells the client a room is PvE and which engine
 * holds a seat — without it the flip room renders as an open PvP invite even
 * though the MistyJungleFlip bot is seated and playing, and "Play again" falls
 * back to a PvP invite instead of re-creating the bot game.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createJungleFlipDeal,
  JUNGLE_FLIP_SPEC_ID,
  type JungleFlipMove,
  type JungleFlipSeat,
} from '@mistboard/game';
import { JUNGLE_FLIP_DEFAULT_ENGINE_ID } from './jungle-flip-engine.js';
import { jungleFlipTenant } from './jungle-flip-tenant.js';
import { replayTenantEvents } from './variant-tenant/runtime.js';
import type { TenantRoomEvent } from './variant-tenant/tenant.js';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// snapshotExtras only reads room.projection.seats (via tenantPveEngineId) and
// ignores the client, so a minimal room wrapping the real projection is faithful.
function flipSnapshotExtrasFor(redClient: string, blackClient: string) {
  const roomId = 'jgf_extras';
  const deal = createJungleFlipDeal(seeded(7));
  const events: TenantRoomEvent<JungleFlipSeat, JungleFlipMove, typeof JUNGLE_FLIP_SPEC_ID>[] = [
    { type: 'room-created', at: 1, roomId, gameSpecId: JUNGLE_FLIP_SPEC_ID, setup: deal },
    { type: 'seat-assigned', at: 2, roomId, clientId: redClient, seat: 'red' },
    { type: 'seat-assigned', at: 3, roomId, clientId: blackClient, seat: 'black' },
  ];
  const projection = replayTenantEvents(jungleFlipTenant, events);
  const snapshotExtras = jungleFlipTenant.wire?.snapshotExtras;
  assert.ok(snapshotExtras, 'flip jungle tenant must define wire.snapshotExtras');
  return snapshotExtras({ projection } as never, { seat: 'black' } as never);
}

test('flip jungle marks the MistyJungleFlip engine seat as an engine client', () => {
  const isEngine = jungleFlipTenant.engine?.isEngineClientId;
  assert.ok(isEngine, 'flip jungle tenant must define engine.isEngineClientId');
  assert.equal(isEngine(JUNGLE_FLIP_DEFAULT_ENGINE_ID), true);
  assert.equal(isEngine('human-1'), false);
});

test('flip jungle snapshot marks a PvE room (engine seat) as roomMode:pve with the engine id', () => {
  assert.deepEqual(flipSnapshotExtrasFor(JUNGLE_FLIP_DEFAULT_ENGINE_ID, 'human-1'), {
    roomMode: 'pve',
    pveEngineId: JUNGLE_FLIP_DEFAULT_ENGINE_ID,
  });
});

test('flip jungle snapshot marks a human-vs-human room as roomMode:pvp (no engine id)', () => {
  assert.deepEqual(flipSnapshotExtrasFor('human-1', 'human-2'), { roomMode: 'pvp' });
});
