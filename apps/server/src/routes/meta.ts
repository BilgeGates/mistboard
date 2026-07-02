import type { IncomingMessage, ServerResponse } from 'node:http';
import { getBuildInfo } from '../build-info.js';
import { darkXiangqiEnabled, ratedEnabled } from '../feature-flags.js';
import * as persistence from '../persistence.js';
import { onlinePresence, refreshPresence } from '../presence.js';
import { PUBLIC_RATING_TIME_CLASS } from '../rating-buckets.js';
import { readEventLoopLagMs } from '../server-event-loop-lag.js';
import { getProxyTrustWarning } from '../server-policy.js';
import { registeredVariantTenants } from '../variant-tenant/registry.js';
import {
  type HttpApiContext,
  isHttpAdminAuthorized,
  requireMethod,
  requirePersistence,
  writeJson,
} from './lib.js';

export async function tryHandle(
  ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  parsedUrl: URL,
): Promise<boolean> {
  if (pathname === '/api/server-status') {
    if (!requireMethod(request, response, 'GET')) return true;
    writeJson(response, 200, {
      restartAt: ctx.drainDeadlineMs(),
      activeGames: ctx.activeGameCount(),
      build: getBuildInfo(),
      darkXiangqiEnabled: darkXiangqiEnabled(),
      ratedEnabled: ratedEnabled(),
      proxyTrust: getProxyTrustWarning(),
    });
    return true;
  }

  if (pathname === '/api/ping') {
    if (!requireMethod(request, response, 'GET')) return true;
    // Round-trip probe for the account dropdown's connection footer. The client
    // times the request for PING; `lagMs` is the server's event-loop lag for the
    // SERVER readout. Kept trivially cheap (no DB, no allocations) and no-store
    // so it measures live latency rather than a cached response.
    writeJson(
      response,
      200,
      { now: Date.now(), lagMs: readEventLoopLagMs() },
      { 'cache-control': 'no-store' },
    );
    return true;
  }

  if (pathname === '/api/admin/lifecycle') {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!isHttpAdminAuthorized(request)) {
      writeJson(response, 401, { error: 'unauthorized' });
      return true;
    }
    if (!requirePersistence(response)) return true;

    const limit = parseLimit(parsedUrl.searchParams.get('limit'));
    const roomId = parsedUrl.searchParams.get('roomId')?.trim() || null;
    if (roomId) {
      writeJson(response, 200, {
        timeline: await persistence.getRoomLifecycleTimeline(roomId, { auditLimit: limit }),
      });
      return true;
    }

    writeJson(response, 200, {
      audit: await persistence.listRoomLifecycleAudit({ limit }),
    });
    return true;
  }

  if (pathname === '/api/live-stats') {
    if (!requireMethod(request, response, 'GET')) return true;
    const stats = collectLiveRoomStats(ctx);
    writeJson(response, 200, { playing: stats.playing, online: stats.onlineIdentities.size });
    return true;
  }

  if (pathname === '/api/players/online') {
    if (!requireMethod(request, response, 'GET')) return true;
    const now = Date.now();
    const stats = collectLiveRoomStats(ctx);
    // Presence is fed by session resolution (see account-session.ts), which a
    // player deep in a long game may not have hit for longer than the TTL. An
    // open room socket is live presence by definition, so re-touch every
    // connected account across the legacy room map and all tenant room maps.
    for (const identity of stats.onlineIdentities) {
      if (identity.startsWith('u:')) refreshPresence(identity.slice(2), now);
    }
    // Same visibility gate as the leaderboard query: private profiles never
    // appear on public surfaces.
    const visible = onlinePresence(now)
      .filter((entry) => entry.profileVisibility !== 'private')
      .sort((a, b) => a.handle.localeCompare(b.handle));
    const listed = visible.slice(0, ONLINE_PLAYERS_LIMIT);
    // One representative rating per player (their best blitz pool). Ratings
    // are decoration here, so the endpoint stays available without a database.
    const ratings = persistence.isInitialized()
      ? await persistence.getBestRatings(
          listed.map((entry) => entry.userId),
          PUBLIC_RATING_TIME_CLASS,
        )
      : new Map<string, persistence.BestRatingEntry>();
    const players = listed.map((entry) => ({
      handle: entry.handle,
      displayName: entry.displayName,
      rating: ratings.get(entry.userId) ?? null,
      playing: stats.playingUserIds.has(entry.userId),
    }));
    writeJson(
      response,
      200,
      { players, count: visible.length, anonymousOnline: stats.anonymousOnline },
      { 'cache-control': 'no-store' },
    );
    return true;
  }

  if (pathname === '/api/stats/public') {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    writeJson(response, 200, await persistence.getPublicSiteStats());
    return true;
  }

  if (pathname === '/api/stats') {
    if (!requireMethod(request, response, 'GET')) return true;
    // Canonical durable totals (accounts/games), unlike the in-memory
    // /api/live-stats. Admin-gated: in prod requires the admin debug token;
    // open in dev. Keep it unlinked from the UI so it isn't a scrape target.
    if (!isHttpAdminAuthorized(request)) {
      writeJson(response, 401, { error: 'unauthorized' });
      return true;
    }
    if (!requirePersistence(response)) return true;
    writeJson(response, 200, await persistence.getSiteStats());
    return true;
  }

  return false;
}

// Cap on the online-players listing; `count` still reports the full total.
const ONLINE_PLAYERS_LIMIT = 50;

// One pass over every live room (legacy dark-chess map + all variant-tenant
// maps) collecting the connection facts both presence surfaces need.
//
// "online" counts distinct humans connected, not distinct sockets. A signed-in
// user spanning several tabs/rooms/devices shares one userId, so collapse on
// that; anonymous connections fall back to the per-room client id (already
// shared across tabs of the same room via localStorage). The u:/c: prefixes
// keep the two id spaces from colliding. Engines never enter room.clients, so
// they don't inflate this.
function collectLiveRoomStats(ctx: HttpApiContext): {
  playing: number;
  onlineIdentities: Set<string>;
  playingUserIds: Set<string>;
  anonymousOnline: number;
} {
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

function parseLimit(value: string | null): number {
  if (!value) return 100;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return 100;
  return Math.min(Math.max(parsed, 1), 500);
}
