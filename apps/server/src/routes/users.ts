import type { IncomingMessage, ServerResponse } from 'node:http';
import { currentAccountUser } from './../account-session.js';
import * as persistence from './../persistence.js';
import { requireMethod, requirePersistence, writeJson } from './lib.js';

export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  const profileMatch = pathname.match(/^\/api\/users\/([^/]+)\/profile$/);
  if (!profileMatch) return false;
  if (!requireMethod(request, response, 'GET')) return true;
  if (!requirePersistence(response)) return true;
  const handle = decodeURIComponent(profileMatch[1] ?? '').trim();
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(handle)) {
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
