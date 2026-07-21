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
  // Room ids of every in-progress live game, so a caller can fold in durable
  // sources (e.g. active correspondence games) without double-counting a game
  // that also happens to have a live socket open.
  playingRoomIds: Set<string>;
  onlineIdentities: Set<string>;
  playingUserIds: Set<string>;
  anonymousOnline: number;
}

// One pass over every live room (legacy dark-chess map + all variant-tenant
// maps) collecting the connection facts the presence surfaces need.
export function collectLiveRoomStats(ctx: HttpApiContext): LiveRoomStats {
  const onlineIdentities = new Set<string>();
  const playingUserIds = new Set<string>();
  const playingRoomIds = new Set<string>();
  for (const [roomId, room] of ctx.rooms.entries()) {
    const roomPlaying = room.projection.state.status.type === 'playing';
    // Every in-progress game is one live game, EvE (engine-vs-engine) included:
    // "games in play" is a raw activity count, not a "humans playing now" count.
    // playingUserIds below still tracks only seated humans, for presence.
    if (roomPlaying) playingRoomIds.add(roomId);
    for (const client of room.clients) {
      onlineIdentities.add(client.userId ? `u:${client.userId}` : `c:${client.id}`);
      if (roomPlaying && client.userId && client.seat !== 'spectator') {
        playingUserIds.add(client.userId);
      }
    }
  }
  for (const tenant of registeredVariantTenants()) {
    for (const [roomId, room] of tenant.rooms.entries()) {
      const roomPlaying = room.projection?.state.status.type === 'playing';
      if (roomPlaying) playingRoomIds.add(roomId);
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
  return {
    playing: playingRoomIds.size,
    playingRoomIds,
    onlineIdentities,
    playingUserIds,
    anonymousOnline,
  };
}
