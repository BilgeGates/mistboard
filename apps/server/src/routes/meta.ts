import type { IncomingMessage, ServerResponse } from 'node:http';
import { getBuildInfo } from '../build-info.js';
import * as persistence from '../persistence.js';
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
): Promise<boolean> {
  if (pathname === '/api/server-status') {
    if (!requireMethod(request, response, 'GET')) return true;
    writeJson(response, 200, {
      restartAt: ctx.drainDeadlineMs(),
      activeGames: ctx.activeGameCount(),
      build: getBuildInfo(),
    });
    return true;
  }

  if (pathname === '/api/live-stats') {
    if (!requireMethod(request, response, 'GET')) return true;
    let playing = 0;
    const uniqueClientIds = new Set<string>();
    for (const room of ctx.rooms.values()) {
      if (room.projection.state.status.type === 'playing') playing += 1;
      for (const client of room.clients) {
        uniqueClientIds.add(client.id);
      }
    }
    writeJson(response, 200, { playing, online: uniqueClientIds.size });
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
