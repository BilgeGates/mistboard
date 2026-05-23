import type { IncomingMessage, ServerResponse } from 'node:http';
import { type HttpApiContext, requireMethod, writeJson } from './lib.js';

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

  return false;
}
