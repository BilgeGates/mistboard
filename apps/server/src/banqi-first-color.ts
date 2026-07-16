import type { BanqiColor } from '@mistboard/game';
import { BANQI_SPEC_ID } from '@mistboard/game';
import type { BanqiEvent } from './banqi-runtime.js';
import { banqiTenant } from './banqi-tenant.js';
import { FinishedGameCache } from './finished-game-cache.js';
import * as persistence from './persistence.js';
import { isTenantEventLog, replayTenantEvents } from './variant-tenant/runtime.js';

// Banqi records its result by SEAT ('red-wins' = the first-mover seat won), but
// those seats are decoupled from piece ink, which binds on the opening flip and
// is NOT a stored column. List surfaces (the watch queue) need that bound ink to
// label results correctly, so we replay the event log to recover `firstColor`.
//
// firstColor is immutable once a game is finished, so cache it per room: the feed
// is polled, and a full replay on every poll would be wasteful. LRU + TTL
// (the FinishedGameCache pattern) keeps the cache bounded: room ids rotate
// forever, so a plain Map would grow monotonically with every room ever served.
// Correctness never depends on eviction (the value is immutable); an evicted or
// expired room just replays once more. Null (unreplayable log) is a valid cached
// value; the TTL retries it eventually.
const firstColorCache = new FinishedGameCache<BanqiColor | null>(512);

// Injectable so the derivation can be unit-tested without a database, mirroring
// the banqi postgame route.
export type BanqiFirstColorDeps = {
  loadRoomEvents(roomId: string): Promise<BanqiEvent[] | null>;
};

const defaultDeps: BanqiFirstColorDeps = {
  loadRoomEvents: (roomId) => persistence.loadRoomEvents<BanqiEvent>(roomId),
};

async function deriveBanqiFirstColor(
  roomId: string,
  deps: BanqiFirstColorDeps,
): Promise<BanqiColor | null> {
  const events = await deps.loadRoomEvents(roomId);
  if (!events || !isTenantEventLog(banqiTenant, events, roomId)) return null;
  return replayTenantEvents(banqiTenant, events).state.firstColor;
}

export async function banqiFirstColorForRoom(
  roomId: string,
  deps: BanqiFirstColorDeps = defaultDeps,
): Promise<BanqiColor | null> {
  // `undefined` = miss; a cached null (unreplayable log) is a hit and short-circuits.
  const cached = firstColorCache.get(roomId);
  if (cached !== undefined) return cached;
  const firstColor = await deriveBanqiFirstColor(roomId, deps);
  firstColorCache.set(roomId, firstColor);
  return firstColor;
}

// Fill in `firstColor` for the banqi rows of a feed page, in place. Non-banqi
// rows (the common case) are skipped entirely.
export async function attachBanqiFirstColors(
  records: Array<{ roomId: string; variant: string; firstColor?: BanqiColor | null }>,
  deps: BanqiFirstColorDeps = defaultDeps,
): Promise<void> {
  await Promise.all(
    records
      .filter((record) => record.variant === BANQI_SPEC_ID)
      .map(async (record) => {
        record.firstColor = await banqiFirstColorForRoom(record.roomId, deps);
      }),
  );
}
