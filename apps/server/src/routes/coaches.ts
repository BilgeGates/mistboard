// Coach directory (lichess.org/coach equivalent).
//
//   GET /api/coaches           (public)  published coaches whose user holds a title
//   GET /api/coaches/me        (auth)    own profile row + eligibility {titled}
//   PUT /api/coaches/me        (auth)    upsert own profile; publish needs a held title
//   GET /api/coaches/:handle   (public)  full detail; 404 if unpublished/untitled/missing
//
// Publish eligibility is enforced HERE (isPlayerTitle(user.title)), not in the
// DB: titles can later be revoked, and the directory queries join users and
// require a currently-held title, so a revoked title silently delists the
// coach fail-closed (persistence-coaches.ts). Unpublishing is always allowed.
// The web surfaces live at /coach (directory + /coach/:handle detail) and
// /coach/edit (the editor).

import type { IncomingMessage, ServerResponse } from 'node:http';
import { currentAccountUser } from './../account-session.js';
import {
  type CoachProfile,
  getCoachProfileForUser,
  getPublishedCoachByHandle,
  listPublishedCoaches,
  upsertCoachProfile,
} from './../persistence-coaches.js';
import { isPlayerTitle, type PlayerTitle } from './../persistence-titles.js';
import { readJsonBody, requireMethod, requirePersistence, writeJson } from './lib.js';

// Field caps, mirrored by the /coach/edit form (apps/web/src/coach-edit.ts).
// Bounded well under readJsonBody's 16 KiB body cap so the limit error is
// ours, not a generic body-too-large throw.
export const COACH_HEADLINE_MAX = 120;
export const COACH_ABOUT_MAX = 4000;
export const COACH_LANGUAGES_MAX = 200;
export const COACH_RATE_MAX = 120;
export const COACH_CONTACT_MAX = 400;

// Persistence surface the handlers use, injectable so the request lifecycle is
// unit-testable without Postgres (same pattern as routes/titles.ts).
export type CoachesApiPersistence = {
  getCoachProfileForUser: typeof getCoachProfileForUser;
  upsertCoachProfile: typeof upsertCoachProfile;
  listPublishedCoaches: typeof listPublishedCoaches;
  getPublishedCoachByHandle: typeof getPublishedCoachByHandle;
};

const defaultPersistence: CoachesApiPersistence = {
  getCoachProfileForUser,
  upsertCoachProfile,
  listPublishedCoaches,
  getPublishedCoachByHandle,
};

type ApiResult = { status: number; payload: Record<string, unknown> };

// ── public: directory list ──────────────────────────────────────────────────
export async function listCoachesForApi(
  deps: CoachesApiPersistence = defaultPersistence,
): Promise<ApiResult> {
  const coaches = await deps.listPublishedCoaches();
  return { status: 200, payload: { coaches } };
}

// ── player: own profile + eligibility ───────────────────────────────────────
export async function myCoachProfileForApi(
  user: { id: string; handle: string; title: PlayerTitle | null },
  deps: CoachesApiPersistence = defaultPersistence,
): Promise<ApiResult> {
  const profile = await deps.getCoachProfileForUser(user.id);
  return {
    status: 200,
    payload: {
      titled: isPlayerTitle(user.title),
      // The caller's own handle, so the editor can link to /coach/:handle
      // once the profile is published.
      handle: user.handle,
      profile: profile ? serializeProfile(profile) : null,
    },
  };
}

// ── player: upsert own profile ──────────────────────────────────────────────
export async function upsertMyCoachProfileForApi(
  user: { id: string; title: PlayerTitle | null },
  body: Record<string, unknown>,
  deps: CoachesApiPersistence = defaultPersistence,
  now: Date = new Date(),
): Promise<ApiResult> {
  const headline = typeof body.headline === 'string' ? body.headline.trim() : '';
  if (headline.length === 0) return { status: 400, payload: { error: 'headline_required' } };
  if (headline.length > COACH_HEADLINE_MAX) {
    return { status: 400, payload: { error: 'headline_too_long' } };
  }
  const about = typeof body.about === 'string' ? body.about.trim() : '';
  if (about.length > COACH_ABOUT_MAX) return { status: 400, payload: { error: 'about_too_long' } };
  const languages = typeof body.languages === 'string' ? body.languages.trim() : '';
  if (languages.length > COACH_LANGUAGES_MAX) {
    return { status: 400, payload: { error: 'languages_too_long' } };
  }
  const rate = typeof body.rate === 'string' ? body.rate.trim() : '';
  if (rate.length > COACH_RATE_MAX) return { status: 400, payload: { error: 'rate_too_long' } };
  const contact = typeof body.contact === 'string' ? body.contact.trim() : '';
  if (contact.length > COACH_CONTACT_MAX) {
    return { status: 400, payload: { error: 'contact_too_long' } };
  }
  // Strict-boolean coercion: anything but `true` reads as false, so a
  // malformed publish flag can never publish by accident (fail-closed).
  const acceptingStudents = body.acceptingStudents === true;
  const published = body.published === true;

  // Publishing requires a currently-held title. Unpublishing (or saving a
  // draft) is always allowed so a revoked-title coach can still edit or
  // withdraw their page.
  if (published && !isPlayerTitle(user.title)) {
    return { status: 403, payload: { error: 'title_required' } };
  }

  const profile = await deps.upsertCoachProfile({
    userId: user.id,
    headline,
    about,
    languages,
    rate,
    contact,
    acceptingStudents,
    published,
    now,
  });
  return { status: 200, payload: { profile: serializeProfile(profile) } };
}

// ── public: detail ──────────────────────────────────────────────────────────
export async function coachDetailForApi(
  handle: string,
  deps: CoachesApiPersistence = defaultPersistence,
): Promise<ApiResult> {
  const coach = await deps.getPublishedCoachByHandle(handle);
  // Missing, unpublished, and revoked-title all collapse to one 404 on
  // purpose: none of them is a public coach page.
  if (!coach) return { status: 404, payload: { error: 'coach_not_found' } };
  return { status: 200, payload: { coach } };
}

// ── dispatch ────────────────────────────────────────────────────────────────
export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname === '/api/coaches') {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    const result = await listCoachesForApi();
    writeJson(response, result.status, result.payload);
    return true;
  }

  // Reserved literal below the /api/coaches/:handle pattern: it must win over
  // the handle dispatch (same tradeoff as /api/inbox/reports).
  if (pathname === '/api/coaches/me') {
    if (!requireMethod(request, response, 'GET', 'PUT')) return true;
    if (!requirePersistence(response)) return true;
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    if (request.method === 'GET') {
      const result = await myCoachProfileForApi({
        id: user.id,
        handle: user.handle,
        title: user.title,
      });
      writeJson(response, result.status, result.payload);
      return true;
    }
    const body = await readJsonBody(request);
    const result = await upsertMyCoachProfileForApi({ id: user.id, title: user.title }, body);
    writeJson(response, result.status, result.payload);
    return true;
  }

  const detailMatch = pathname.match(/^\/api\/coaches\/([^/]+)$/);
  if (detailMatch) {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    const result = await coachDetailForApi(decodeURIComponent(detailMatch[1]!));
    writeJson(response, result.status, result.payload);
    return true;
  }

  return false;
}

// ── serialization ───────────────────────────────────────────────────────────
function serializeProfile(profile: CoachProfile): Record<string, unknown> {
  return {
    headline: profile.headline,
    about: profile.about,
    languages: profile.languages,
    rate: profile.rate,
    contact: profile.contact,
    acceptingStudents: profile.acceptingStudents,
    published: profile.published,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}
