/**
 * Banqi firstColor derivation for list surfaces (the watch feed). The result is
 * recorded by SEAT, but seats are decoupled from ink; firstColor (the first-mover
 * seat's bound ink) is NOT a stored column, so it is recovered by replaying the
 * event log. These pins cover the derivation, the variant filter, and the cache.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyBanqiMove,
  BANQI_SPEC_ID,
  type BanqiMove,
  type BanqiSeat,
  createBanqiDeal,
  createInitialBanqiState,
  getBanqiLegalMoves,
} from '@mistboard/game';
import {
  attachBanqiFirstColors,
  type BanqiFirstColorDeps,
  banqiFirstColorForRoom,
} from './banqi-first-color.js';
import type { BanqiEvent } from './banqi-runtime.js';
import type { TenantRoomEvent } from './variant-tenant/tenant.js';

process.env.MISTBOARD_BANQI_ENABLED = 'true';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// A finished banqi event log for `roomId`, plus the firstColor the kernel binds
// on the opening flip (so the test asserts the derivation against ground truth).
function finishedBanqiGame(
  roomId: string,
  seed: number,
): { events: BanqiEvent[]; firstColor: 'red' | 'black' } {
  const deal = createBanqiDeal(seeded(seed));
  const events: TenantRoomEvent<BanqiSeat, BanqiMove, typeof BANQI_SPEC_ID>[] = [
    { type: 'room-created', at: 1, roomId, gameSpecId: BANQI_SPEC_ID, setup: deal },
    { type: 'seat-assigned', at: 2, roomId, clientId: 'a', seat: 'red' },
    { type: 'seat-assigned', at: 3, roomId, clientId: 'b', seat: 'black' },
  ];
  let state = createInitialBanqiState(roomId, deal);
  let at = 4;
  let plies = 0;
  while (state.status.type === 'playing' && plies < 400) {
    const move = getBanqiLegalMoves(state)[0]!;
    events.push({ type: 'move-played', at: at++, roomId, color: state.status.turn, move });
    state = applyBanqiMove(state, move);
    plies += 1;
  }
  assert.equal(state.status.type, 'finished', 'the scripted line finishes');
  assert.ok(state.firstColor, 'a finished game has bound firstColor');
  return { events: events as BanqiEvent[], firstColor: state.firstColor };
}

function depsFor(logs: Record<string, BanqiEvent[]>): {
  deps: BanqiFirstColorDeps;
  calls: () => string[];
} {
  const calls: string[] = [];
  return {
    calls: () => calls,
    deps: {
      loadRoomEvents: async (roomId) => {
        calls.push(roomId);
        return logs[roomId] ?? null;
      },
    },
  };
}

test('derives the ink bound on the opening flip from the event log', async () => {
  const { events, firstColor } = finishedBanqiGame('bq_fc_1', 7);
  const { deps } = depsFor({ bq_fc_1: events });
  assert.equal(await banqiFirstColorForRoom('bq_fc_1', deps), firstColor);
});

test('caches per room so a polled feed replays each game only once', async () => {
  const { events } = finishedBanqiGame('bq_fc_cache', 11);
  const { deps, calls } = depsFor({ bq_fc_cache: events });
  const first = await banqiFirstColorForRoom('bq_fc_cache', deps);
  const second = await banqiFirstColorForRoom('bq_fc_cache', deps);
  assert.equal(first, second);
  assert.deepEqual(calls(), ['bq_fc_cache'], 'the event log is loaded once, not per call');
});

test('attaches firstColor only to banqi rows and leaves others untouched', async () => {
  const { events, firstColor } = finishedBanqiGame('bq_fc_attach', 19);
  const { deps, calls } = depsFor({ bq_fc_attach: events });
  const rows = [
    {
      roomId: 'bq_fc_attach',
      variant: BANQI_SPEC_ID,
      firstColor: undefined as 'red' | 'black' | null | undefined,
    },
    {
      roomId: 'chess_row',
      variant: 'dark-chess',
      firstColor: undefined as 'red' | 'black' | null | undefined,
    },
  ];
  await attachBanqiFirstColors(rows, deps);
  assert.equal(rows[0]!.firstColor, firstColor, 'banqi row gets its bound ink');
  assert.equal(rows[1]!.firstColor, undefined, 'non-banqi row is skipped');
  assert.deepEqual(calls(), ['bq_fc_attach'], 'only the banqi room hits the loader');
});

test('returns null for an unreplayable / missing event log', async () => {
  const { deps } = depsFor({});
  assert.equal(await banqiFirstColorForRoom('bq_fc_missing', deps), null);
});
