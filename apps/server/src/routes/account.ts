import type { IncomingMessage, ServerResponse } from 'node:http';
import { normalizeProfileHandle } from './../account-identity.js';
import { currentAccountUser, publicUser } from './../account-session.js';
import * as persistence from './../persistence.js';
import { readJsonBody, requireMethod, requirePersistence, writeJson } from './lib.js';

export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname !== '/api/account/profile') return false;
  if (!requireMethod(request, response, 'PATCH')) return true;
  if (!requirePersistence(response)) return true;
  const user = await currentAccountUser(request);
  if (!user) {
    writeJson(response, 401, { error: 'not_signed_in' });
    return true;
  }
  const body = await readJsonBody(request);
  const handle = normalizeProfileHandle(typeof body.handle === 'string' ? body.handle : null);
  if (!handle) {
    writeJson(response, 400, { error: 'invalid_handle' });
    return true;
  }
  // Single-username model: the public display name always mirrors the handle, so
  // there is no separate display-name input to validate.
  const result = await persistence.updateUserProfile(
    user.id,
    { handle, displayName: handle },
    new Date(),
  );
  if (!result.ok) {
    writeJson(response, result.error === 'handle_taken' ? 409 : 429, {
      error: result.error,
      ...(result.availableAt ? { availableAt: result.availableAt.toISOString() } : {}),
    });
    return true;
  }
  writeJson(response, 200, { user: publicUser(result.user) });
  return true;
}
