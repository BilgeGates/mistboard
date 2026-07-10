import assert from 'node:assert/strict';
import test from 'node:test';
import type { CoachListing, CoachProfile } from '../persistence-coaches.js';
import type { PlayerTitle } from '../persistence-titles.js';
import {
  COACH_ABOUT_MAX,
  COACH_CONTACT_MAX,
  COACH_HEADLINE_MAX,
  COACH_LANGUAGES_MAX,
  COACH_RATE_MAX,
  type CoachesApiPersistence,
  coachDetailForApi,
  listCoachesForApi,
  myCoachProfileForApi,
  upsertMyCoachProfileForApi,
} from './coaches.js';

// In-memory stand-in for persistence-coaches.ts with the same contract,
// including the fail-closed directory rule: a listing/detail row only exists
// while its user is published AND currently holds a title. Lets the whole
// request lifecycle run without Postgres (same pattern as routes/titles.ts).
type FakeUser = { id: string; handle: string; displayName: string; title: PlayerTitle | null };

function makeFake(users: FakeUser[]): {
  deps: CoachesApiPersistence;
  profiles: Map<string, CoachProfile>;
  users: Map<string, FakeUser>;
} {
  const profiles = new Map<string, CoachProfile>();
  const usersById = new Map(users.map((user) => [user.id, user]));
  const publicRows = (): Array<{ user: FakeUser; profile: CoachProfile }> =>
    [...profiles.values()]
      .map((profile) => ({ user: usersById.get(profile.userId), profile }))
      .filter(
        (row): row is { user: FakeUser; profile: CoachProfile } =>
          row.user !== undefined && row.profile.published && row.user.title !== null,
      );
  const listing = (user: FakeUser, profile: CoachProfile): CoachListing => ({
    handle: user.handle,
    displayName: user.displayName,
    title: user.title!,
    headline: profile.headline,
    languages: profile.languages,
    rate: profile.rate,
    acceptingStudents: profile.acceptingStudents,
  });
  const deps: CoachesApiPersistence = {
    getCoachProfileForUser: async (userId) => profiles.get(userId) ?? null,
    upsertCoachProfile: async (input) => {
      const existing = profiles.get(input.userId);
      const profile: CoachProfile = {
        userId: input.userId,
        headline: input.headline,
        about: input.about,
        languages: input.languages,
        rate: input.rate,
        contact: input.contact,
        acceptingStudents: input.acceptingStudents,
        published: input.published,
        createdAt: existing?.createdAt ?? input.now,
        updatedAt: input.now,
      };
      profiles.set(input.userId, profile);
      return profile;
    },
    listPublishedCoaches: async () =>
      publicRows()
        .sort((a, b) => {
          if (a.profile.acceptingStudents !== b.profile.acceptingStudents) {
            return a.profile.acceptingStudents ? -1 : 1;
          }
          return b.profile.createdAt.getTime() - a.profile.createdAt.getTime();
        })
        .map((row) => listing(row.user, row.profile)),
    getPublishedCoachByHandle: async (handle) => {
      const row = publicRows().find(
        (candidate) => candidate.user.handle.toLowerCase() === handle.toLowerCase(),
      );
      if (!row) return null;
      return {
        ...listing(row.user, row.profile),
        about: row.profile.about,
        contact: row.profile.contact,
      };
    },
  };
  return { deps, profiles, users: usersById };
}

const titledUser: FakeUser = {
  id: 'user-1',
  handle: 'xim-coach',
  displayName: 'XIM Coach',
  title: 'xim',
};
const untitledUser: FakeUser = {
  id: 'user-2',
  handle: 'student',
  displayName: 'Student',
  title: null,
};

const validBody = {
  headline: 'XIM offering English xiangqi lessons',
  about: 'Ten years of coaching club players.',
  languages: 'English, Mandarin',
  rate: '$25 / hour',
  contact: 'coach@example.com',
  acceptingStudents: true,
  published: true,
};

test('a titled user can publish and shows up in the directory', async () => {
  const { deps } = makeFake([titledUser]);
  const saved = await upsertMyCoachProfileForApi(titledUser, validBody, deps);
  assert.equal(saved.status, 200);
  const profile = saved.payload.profile as Record<string, unknown>;
  assert.equal(profile.published, true);
  assert.equal(profile.acceptingStudents, true);

  const list = await listCoachesForApi(deps);
  assert.equal(list.status, 200);
  const coaches = list.payload.coaches as Array<Record<string, unknown>>;
  assert.equal(coaches.length, 1);
  assert.equal(coaches[0]?.handle, 'xim-coach');
  assert.equal(coaches[0]?.title, 'xim');
  assert.equal(coaches[0]?.headline, validBody.headline);
  // The list never carries the long-form/contact fields.
  assert.equal('about' in coaches[0]!, false);
  assert.equal('contact' in coaches[0]!, false);
});

test('publishing without a held title is a 403 and writes nothing', async () => {
  const { deps, profiles } = makeFake([untitledUser]);
  const result = await upsertMyCoachProfileForApi(untitledUser, validBody, deps);
  assert.deepEqual([result.status, result.payload.error], [403, 'title_required']);
  assert.equal(profiles.size, 0);
});

test('an untitled user can still save an unpublished draft', async () => {
  const { deps } = makeFake([untitledUser]);
  const result = await upsertMyCoachProfileForApi(
    untitledUser,
    { ...validBody, published: false },
    deps,
  );
  assert.equal(result.status, 200);
  assert.equal((result.payload.profile as { published: boolean }).published, false);

  const list = await listCoachesForApi(deps);
  assert.equal((list.payload.coaches as unknown[]).length, 0);
});

test('unpublishing is always allowed, even after a title is revoked', async () => {
  const { deps, users } = makeFake([titledUser]);
  await upsertMyCoachProfileForApi(titledUser, validBody, deps);
  // Simulate a later revocation: the user no longer holds a title.
  users.set(titledUser.id, { ...titledUser, title: null });
  const revoked = { ...titledUser, title: null };
  const result = await upsertMyCoachProfileForApi(
    revoked,
    { ...validBody, published: false },
    deps,
  );
  assert.equal(result.status, 200);
  assert.equal((result.payload.profile as { published: boolean }).published, false);
});

test('the directory filters unpublished rows AND rows whose user lost the title', async () => {
  const secondTitled: FakeUser = {
    id: 'user-3',
    handle: 'xgm-coach',
    displayName: 'XGM Coach',
    title: 'xgm',
  };
  const { deps, users } = makeFake([titledUser, secondTitled, untitledUser]);
  await upsertMyCoachProfileForApi(titledUser, validBody, deps, new Date('2026-07-01T00:00:00Z'));
  await upsertMyCoachProfileForApi(
    secondTitled,
    { ...validBody, headline: 'XGM lessons' },
    deps,
    new Date('2026-07-02T00:00:00Z'),
  );
  // A draft never lists.
  await upsertMyCoachProfileForApi(
    untitledUser,
    { ...validBody, published: false },
    deps,
    new Date('2026-07-03T00:00:00Z'),
  );

  const before = await listCoachesForApi(deps);
  assert.deepEqual(
    (before.payload.coaches as Array<{ handle: string }>).map((coach) => coach.handle),
    ['xgm-coach', 'xim-coach'],
  );

  // Revoking a title silently delists without touching coach_profiles.
  users.set(secondTitled.id, { ...secondTitled, title: null });
  const after = await listCoachesForApi(deps);
  assert.deepEqual(
    (after.payload.coaches as Array<{ handle: string }>).map((coach) => coach.handle),
    ['xim-coach'],
  );
});

test('directory order is accepting-first, then newest', async () => {
  const older: FakeUser = { id: 'user-4', handle: 'older', displayName: 'Older', title: 'gm' };
  const newest: FakeUser = { id: 'user-5', handle: 'newest', displayName: 'Newest', title: 'im' };
  const paused: FakeUser = { id: 'user-6', handle: 'paused', displayName: 'Paused', title: 'xgm' };
  const { deps } = makeFake([older, newest, paused]);
  await upsertMyCoachProfileForApi(older, validBody, deps, new Date('2026-07-01T00:00:00Z'));
  // Newest but not accepting: sorts after every accepting coach.
  await upsertMyCoachProfileForApi(
    paused,
    { ...validBody, acceptingStudents: false },
    deps,
    new Date('2026-07-05T00:00:00Z'),
  );
  await upsertMyCoachProfileForApi(newest, validBody, deps, new Date('2026-07-03T00:00:00Z'));

  const list = await listCoachesForApi(deps);
  assert.deepEqual(
    (list.payload.coaches as Array<{ handle: string }>).map((coach) => coach.handle),
    ['newest', 'older', 'paused'],
  );
});

test('field validation: headline required, every cap enforced', async () => {
  const { deps, profiles } = makeFake([titledUser]);
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ ...validBody, headline: '' }, 'headline_required'],
    [{ ...validBody, headline: '   ' }, 'headline_required'],
    [{ ...validBody, headline: 42 }, 'headline_required'],
    [{ ...validBody, headline: 'x'.repeat(COACH_HEADLINE_MAX + 1) }, 'headline_too_long'],
    [{ ...validBody, about: 'x'.repeat(COACH_ABOUT_MAX + 1) }, 'about_too_long'],
    [{ ...validBody, languages: 'x'.repeat(COACH_LANGUAGES_MAX + 1) }, 'languages_too_long'],
    [{ ...validBody, rate: 'x'.repeat(COACH_RATE_MAX + 1) }, 'rate_too_long'],
    [{ ...validBody, contact: 'x'.repeat(COACH_CONTACT_MAX + 1) }, 'contact_too_long'],
  ];
  for (const [body, error] of cases) {
    const result = await upsertMyCoachProfileForApi(titledUser, body, deps);
    assert.deepEqual([result.status, result.payload.error], [400, error]);
  }
  assert.equal(profiles.size, 0);
});

test('non-boolean flags read as false: a malformed publish flag never publishes', async () => {
  const { deps } = makeFake([titledUser]);
  const result = await upsertMyCoachProfileForApi(
    titledUser,
    { ...validBody, acceptingStudents: 'yes', published: 'true' },
    deps,
  );
  assert.equal(result.status, 200);
  const profile = result.payload.profile as Record<string, unknown>;
  assert.equal(profile.published, false);
  assert.equal(profile.acceptingStudents, false);
});

test('me reports eligibility, the own handle, and the own row, including drafts', async () => {
  const { deps } = makeFake([titledUser, untitledUser]);
  const empty = await myCoachProfileForApi(titledUser, deps);
  assert.deepEqual(empty.payload, { titled: true, handle: 'xim-coach', profile: null });

  await upsertMyCoachProfileForApi(titledUser, { ...validBody, published: false }, deps);
  const mine = await myCoachProfileForApi(titledUser, deps);
  assert.equal(mine.payload.titled, true);
  assert.equal((mine.payload.profile as { published: boolean }).published, false);

  const student = await myCoachProfileForApi(untitledUser, deps);
  assert.deepEqual(student.payload, { titled: false, handle: 'student', profile: null });
});

test('detail returns the full public page and 404s fail-closed', async () => {
  const { deps, users } = makeFake([titledUser]);
  await upsertMyCoachProfileForApi(titledUser, validBody, deps);

  const found = await coachDetailForApi('XIM-Coach', deps);
  assert.equal(found.status, 200);
  const coach = found.payload.coach as Record<string, unknown>;
  assert.equal(coach.handle, 'xim-coach');
  assert.equal(coach.about, validBody.about);
  assert.equal(coach.contact, validBody.contact);

  const missing = await coachDetailForApi('nobody', deps);
  assert.deepEqual([missing.status, missing.payload.error], [404, 'coach_not_found']);

  // Unpublished profile 404s.
  await upsertMyCoachProfileForApi(titledUser, { ...validBody, published: false }, deps);
  const unpublished = await coachDetailForApi('xim-coach', deps);
  assert.equal(unpublished.status, 404);

  // Republished but title revoked: also a 404.
  await upsertMyCoachProfileForApi(titledUser, validBody, deps);
  users.set(titledUser.id, { ...titledUser, title: null });
  const revoked = await coachDetailForApi('xim-coach', deps);
  assert.equal(revoked.status, 404);
});
