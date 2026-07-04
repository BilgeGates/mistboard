// Shared one-pass scan over every live room, feeding the presence surfaces
// (/api/players/online, /api/live-stats, /api/relations/online-following).
//
// "online" counts distinct humans connected, not distinct sockets. A signed-in
// user spanning several tabs/rooms/devices shares one userId, so collapse on
// that; anonymous connections fall back to the per-room client id (already
// shared across tabs of the same room via localStorage). The u:/c: prefixes
// keep the two id spaces from colliding. Engines never enter room.clients, so
// they don't inflate this.

import type { HttpApiContext } from './routes/lib.js';
import { registeredVariantTenants } from './variant-tenant/registry.js';

export interface LiveRoomStats {
  playing: number;
  onlineIdentities: Set<string>;
  playingUserIds: Set<string>;
  anonymousOnline: number;
}

// One pass over every live room (legacy dark-chess map + all variant-tenant
// maps) collecting the connection facts the presence surfaces need.
export function collectLiveRoomStats(ctx: HttpApiContext): LiveRoomStats {
  const onlineIdentities = new Set<string>();
  const playingUserIds = new Set<string>();
  let playing = 0;
  for (const room of ctx.rooms.values()) {
    const roomPlaying = room.projection.state.status.type === 'playing';
    // EvE (engine-vs-engine) games have no human player, so they don't count as
    // "people playing now". PvP and PvE both involve a human, so they do count.
    if (roomPlaying && room.mode !== 'eve') playing += 1;
    for (const client of room.clients) {
      onlineIdentities.add(client.userId ? `u:${client.userId}` : `c:${client.id}`);
      if (roomPlaying && client.userId && client.seat !== 'spectator') {
        playingUserIds.add(client.userId);
      }
    }
  }
  for (const tenant of registeredVariantTenants()) {
    // Tenants have no EvE mode, so every playing tenant game involves a human
    // and activeGameCount (playing-status rooms) matches the legacy semantics.
    playing += tenant.activeGameCount();
    for (const room of tenant.rooms.values()) {
      const roomPlaying = room.projection?.state.status.type === 'playing';
      for (const client of room.clients) {
        if (client.userId) {
          onlineIdentities.add(`u:${client.userId}`);
          if (roomPlaying && client.seat && client.seat !== 'spectator') {
            playingUserIds.add(client.userId);
          }
        } else if (client.id) {
          onlineIdentities.add(`c:${client.id}`);
        }
      }
    }
  }
  let anonymousOnline = 0;
  for (const identity of onlineIdentities) {
    if (identity.startsWith('c:')) anonymousOnline += 1;
  }
  return { playing, onlineIdentities, playingUserIds, anonymousOnline };
}
