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
  if (pathname === '/api/account/display-preferences') {
    if (!requireMethod(request, response, 'PATCH')) return true;
    if (!requirePersistence(response)) return true;
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    const body = await readJsonBody(request);
    const keys = Object.keys(body);
    if (
      keys.length !== 1 ||
      keys[0] !== 'pieceAnimation' ||
      !persistence.isPieceAnimationPreference(body.pieceAnimation)
    ) {
      writeJson(response, 400, { error: 'invalid_display_preferences' });
      return true;
    }
    const updated = await persistence.updateUserPieceAnimationPreference(
      user.id,
      body.pieceAnimation,
      new Date(),
    );
    if (!updated) {
      writeJson(response, 404, { error: 'user_not_found' });
      return true;
    }
    writeJson(response, 200, { user: publicUser(updated) });
    return true;
  }

  if (pathname === '/api/account/preferences') {
    if (!requireMethod(request, response, 'PATCH')) return true;
    if (!requirePersistence(response)) return true;
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    const body = await readJsonBody(request);

    // Profiles are public identities on Mistboard. Preserve historical values
    // in storage, but do not let the general account-preferences endpoint hide
    // or unlist a profile.
    if ('profileVisibility' in body) {
      writeJson(response, 400, { error: 'profile_visibility_not_configurable' });
      return true;
    }

    // DM policy rides the same preferences PATCH as locale; branch on which
    // key the client sent so the two settings stay independently updatable.
    if ('dmPolicy' in body) {
      if (!persistence.isDmPolicy(body.dmPolicy)) {
        writeJson(response, 400, { error: 'invalid_dm_policy' });
        return true;
      }
      const updated = await persistence.updateUserDmPolicy(user.id, body.dmPolicy, new Date());
      if (!updated) {
        writeJson(response, 404, { error: 'user_not_found' });
        return true;
      }
      writeJson(response, 200, { user: publicUser(updated) });
      return true;
    }

    const locale = body.locale;
    if (locale !== null && !persistence.isAccountLocale(locale)) {
      writeJson(response, 400, { error: 'invalid_locale' });
      return true;
    }
    const updated = await persistence.updateUserLocale(user.id, locale, new Date());
    if (!updated) {
      writeJson(response, 404, { error: 'user_not_found' });
      return true;
    }
    writeJson(response, 200, { user: publicUser(updated) });
    return true;
  }

  if (pathname === '/api/account/public-profile') {
    if (!requireMethod(request, response, 'PATCH')) return true;
    if (!requirePersistence(response)) return true;
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    const details = parsePublicProfileDetails(await readJsonBody(request));
    if (!details) {
      writeJson(response, 400, { error: 'invalid_public_profile' });
      return true;
    }
    const updated = await persistence.updateUserPublicProfileDetails(user.id, details, new Date());
    if (!updated) {
      writeJson(response, 404, { error: 'user_not_found' });
      return true;
    }
    writeJson(response, 200, { user: publicUser(updated) });
    return true;
  }

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

function parsePublicProfileDetails(
  body: Record<string, unknown>,
): { bio: string; location: string; profileLinks: string[] } | null {
  if (typeof body.bio !== 'string' || typeof body.location !== 'string') return null;
  if (!Array.isArray(body.profileLinks) || body.profileLinks.length > 5) return null;

  const bio = body.bio.trim();
  const location = body.location.trim();
  if (bio.length > 500 || location.length > 80) return null;

  const profileLinks: string[] = [];
  for (const candidate of body.profileLinks) {
    if (typeof candidate !== 'string') return null;
    const raw = candidate.trim();
    if (!raw || raw.length > 300) return null;
    try {
      const url = new URL(raw);
      if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
        return null;
      }
      const normalized = url.toString();
      if (!profileLinks.includes(normalized)) profileLinks.push(normalized);
    } catch {
      return null;
    }
  }
  return { bio, location, profileLinks };
}
