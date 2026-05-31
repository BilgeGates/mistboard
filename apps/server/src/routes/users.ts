import type { IncomingMessage, ServerResponse } from 'node:http';
import { currentAccountUser } from './../account-session.js';
import * as persistence from './../persistence.js';
import { requireMethod, requirePersistence, writeJson } from './lib.js';

const HANDLE_PATTERN = /^[a-zA-Z0-9_-]{1,40}$/;
// Upper bound on a single games page; mirrors the server-side clamp in
// getUserGamesPage so a hand-crafted URL can't request an unbounded page.
const GAMES_PAGE_MAX = 50;

export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  parsedUrl: URL,
): Promise<boolean> {
  const profileMatch = pathname.match(/^\/api\/users\/([^/]+)\/profile$/);
  if (profileMatch) {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    const handle = decodeURIComponent(profileMatch[1] ?? '').trim();
    if (!HANDLE_PATTERN.test(handle)) {
      writeJson(response, 400, { error: 'invalid_handle' });
      return true;
    }
    const viewer = await currentAccountUser(request);
    const profile = await persistence.getUserProfileByHandle(handle, viewer?.id ?? null);
    if (!profile) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    writeJson(response, 200, {
      profile: {
        ...profile,
        isViewer: viewer?.handle.toLowerCase() === profile.user.handle.toLowerCase(),
      },
    });
    return true;
  }

  const gamesMatch = pathname.match(/^\/api\/users\/([^/]+)\/games$/);
  if (gamesMatch) {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    const handle = decodeURIComponent(gamesMatch[1] ?? '').trim();
    if (!HANDLE_PATTERN.test(handle)) {
      writeJson(response, 400, { error: 'invalid_handle' });
      return true;
    }
    const offset = clampInt(parsedUrl.searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
    const limit = clampInt(parsedUrl.searchParams.get('limit'), 15, 1, GAMES_PAGE_MAX);
    const viewer = await currentAccountUser(request);
    const page = await persistence.getUserGamesPage(handle, viewer?.id ?? null, offset, limit);
    if (!page) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    writeJson(response, 200, { games: page.games, total: page.total });
    return true;
  }

  return false;
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = parseInt(raw ?? '', 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}
