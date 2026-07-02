// Follow/block routes (the social kernel, #87).
//   POST/DELETE /api/users/:handle/follow
//   POST/DELETE /api/users/:handle/block
//   GET /api/relations/following
//   GET /api/relations/blocks
// All signed-in-only. Lists are self-only: there is no public followers or
// following surface, matching the lichess privacy posture. Mutations return
// the viewer's fresh relation to the target so the client can render state
// without a profile refetch.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { currentAccountUser } from './../account-session.js';
import { createAuthRateLimiter } from './../auth-rate-limit.js';
import * as persistence from './../persistence.js';
import { onlinePresence } from './../presence.js';
import { requireMethod, requirePersistence, writeJson } from './lib.js';

const HANDLE_PATTERN = /^[a-zA-Z0-9_-]{1,40}$/;
const LIST_PAGE_MAX = 50;

// Defense-in-depth on relation writes: enough for any human clicking buttons,
// low enough to stop scripted follow-spam. Per account id, in-memory.
const relationWriteLimiter = createAuthRateLimiter(30, 60 * 60 * 1000);

export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  parsedUrl: URL,
): Promise<boolean> {
  const relationMatch = pathname.match(/^\/api\/users\/([^/]+)\/(follow|block)$/);
  if (relationMatch) {
    if (!requirePersistence(response)) return true;
    const method = request.method ?? 'GET';
    if (method !== 'POST' && method !== 'DELETE') {
      writeJson(response, 405, { error: 'method_not_allowed' });
      return true;
    }
    const handle = decodeURIComponent(relationMatch[1] ?? '').trim();
    if (!HANDLE_PATTERN.test(handle)) {
      writeJson(response, 400, { error: 'invalid_handle' });
      return true;
    }
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    if (!relationWriteLimiter.check(user.id)) {
      writeJson(response, 429, { error: 'rate_limited' });
      return true;
    }

    const kind = relationMatch[2] as 'follow' | 'block';
    const input = { actorId: user.id, targetHandle: handle };
    const result =
      method === 'POST'
        ? kind === 'follow'
          ? await persistence.followUser(input)
          : await persistence.blockUser(input)
        : kind === 'follow'
          ? await persistence.unfollowUser(input)
          : await persistence.unblockUser(input);

    if (!result.ok) {
      if (result.error === 'unknown_user') {
        writeJson(response, 404, { error: 'not_found' });
      } else if (result.error === 'self_relation') {
        writeJson(response, 400, { error: 'self_relation' });
      } else {
        writeJson(response, 400, { error: result.error });
      }
      return true;
    }

    const relation = await persistence.viewerRelationForHandle(user.id, handle);
    writeJson(response, 200, {
      relation: relation
        ? { following: relation.following, blocked: relation.blocked }
        : { following: false, blocked: false },
    });
    return true;
  }

  // Online-friends (#94): the viewer's follow set intersected with the
  // in-memory presence map. Same visibility gate as /api/players/online:
  // private profiles never appear, even to their followers.
  if (pathname === '/api/relations/online-following') {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    const following = new Set(await persistence.listFollowingIds(user.id));
    const players = onlinePresence()
      .filter((entry) => following.has(entry.userId) && entry.profileVisibility !== 'private')
      .sort((a, b) => a.handle.localeCompare(b.handle))
      .map((entry) => ({ handle: entry.handle, displayName: entry.displayName }));
    writeJson(response, 200, { players, count: players.length });
    return true;
  }

  const listMatch = pathname.match(/^\/api\/relations\/(following|blocks)$/);
  if (listMatch) {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    const offset = clampInt(parsedUrl.searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
    const limit = clampInt(parsedUrl.searchParams.get('limit'), 30, 1, LIST_PAGE_MAX);
    const relation = listMatch[1] === 'following' ? 'follow' : 'block';
    const page = await persistence.listRelations(user.id, relation, offset, limit);
    writeJson(response, 200, {
      entries: page.entries.map((entry) => ({
        handle: entry.handle,
        displayName: entry.displayName,
        createdAt: entry.createdAt.toISOString(),
      })),
      total: page.total,
    });
    return true;
  }

  return false;
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = parseInt(raw ?? '', 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}
