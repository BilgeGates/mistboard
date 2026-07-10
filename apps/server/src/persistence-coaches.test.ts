import type { UserAccount } from './persistence.js';
import { createUser } from './persistence.js';
import {
  getCoachProfileForUser,
  getPublishedCoachByHandle,
  listPublishedCoaches,
  upsertCoachProfile,
} from './persistence-coaches.js';
import { assert, definePersistenceTests, test } from './persistence-test-support.js';
import {
  createTitleVerificationRequest,
  decideTitleVerificationRequest,
} from './persistence-titles.js';

definePersistenceTests('coaches', () => {
  const now = new Date('2026-07-10T12:00:00.000Z');

  async function makeUser(suffix: string): Promise<UserAccount> {
    return createUser({
      id: `user_coach_${suffix}`,
      email: `coach-${suffix}@example.com`,
      emailVerifiedAt: now,
      handle: `coach-${suffix}`,
      displayName: `Coach ${suffix}`,
      now,
    });
  }

  // Titles are only ever written by the verification pipeline; go through it
  // so this test exercises the same path production does.
  async function grantTitle(userId: string, title: 'xim' | 'xgm', at: Date): Promise<void> {
    await createTitleVerificationRequest({
      id: `titlereq_coach_${userId}_${title}`,
      userId,
      title,
      evidence: 'federation profile link',
      now: at,
    });
    await decideTitleVerificationRequest({
      id: `titlereq_coach_${userId}_${title}`,
      decision: 'approved',
      decidedBy: null,
      now: at,
    });
  }

  const baseProfile = {
    headline: 'XIM offering English xiangqi lessons',
    about: 'Ten years of coaching club players.',
    languages: 'English, Mandarin',
    rate: '$25 / hour',
    contact: 'coach@example.com',
    acceptingStudents: true,
    published: true,
    now,
  };

  test('upsert creates then updates in place, preserving created_at', async () => {
    const user = await makeUser('upsert');
    const created = await upsertCoachProfile({ ...baseProfile, userId: user.id });
    assert.equal(created.headline, baseProfile.headline);
    assert.equal(created.published, true);

    const later = new Date(now.getTime() + 60_000);
    const updated = await upsertCoachProfile({
      ...baseProfile,
      userId: user.id,
      headline: 'Updated headline',
      published: false,
      now: later,
    });
    assert.equal(updated.headline, 'Updated headline');
    assert.equal(updated.published, false);
    assert.equal(updated.createdAt.getTime(), created.createdAt.getTime());
    assert.equal(updated.updatedAt.getTime(), later.getTime());

    const readBack = await getCoachProfileForUser(user.id);
    assert.equal(readBack?.headline, 'Updated headline');
  });

  test('the directory join lists only published rows whose user currently holds a title', async () => {
    const titled = await makeUser('titled');
    await grantTitle(titled.id, 'xim', now);
    await upsertCoachProfile({ ...baseProfile, userId: titled.id });

    // Published but the user never earned a title: never listed.
    const untitled = await makeUser('untitled');
    await upsertCoachProfile({ ...baseProfile, userId: untitled.id, headline: 'No title yet' });

    // Titled but the profile is a draft: never listed.
    const draft = await makeUser('draft');
    await grantTitle(draft.id, 'xgm', now);
    await upsertCoachProfile({
      ...baseProfile,
      userId: draft.id,
      headline: 'Draft only',
      published: false,
    });

    const coaches = await listPublishedCoaches();
    assert.deepEqual(
      coaches.map((coach) => coach.handle),
      [titled.handle],
    );
    assert.equal(coaches[0]?.title, 'xim');
    assert.equal(coaches[0]?.displayName, titled.displayName);
  });

  test('directory order: accepting first, then newest, and detail reads case-insensitively', async () => {
    const older = await makeUser('older');
    await grantTitle(older.id, 'xim', now);
    await upsertCoachProfile({ ...baseProfile, userId: older.id, now });

    const newest = await makeUser('newest');
    await grantTitle(newest.id, 'xgm', now);
    await upsertCoachProfile({
      ...baseProfile,
      userId: newest.id,
      now: new Date(now.getTime() + 2_000),
    });

    const paused = await makeUser('paused');
    await grantTitle(paused.id, 'xgm', now);
    await upsertCoachProfile({
      ...baseProfile,
      userId: paused.id,
      acceptingStudents: false,
      now: new Date(now.getTime() + 5_000),
    });

    const coaches = await listPublishedCoaches();
    assert.deepEqual(
      coaches.map((coach) => coach.handle),
      [newest.handle, older.handle, paused.handle],
    );

    const detail = await getPublishedCoachByHandle(older.handle.toUpperCase());
    assert.equal(detail?.handle, older.handle);
    assert.equal(detail?.about, baseProfile.about);
    assert.equal(detail?.contact, baseProfile.contact);

    const missing = await getPublishedCoachByHandle('no-such-coach');
    assert.equal(missing, null);
  });

  test('the database CHECK refuses blank and oversized headlines', async () => {
    const user = await makeUser('check');
    await assert.rejects(
      upsertCoachProfile({ ...baseProfile, userId: user.id, headline: '   ' }),
      /check/i,
    );
    await assert.rejects(
      upsertCoachProfile({ ...baseProfile, userId: user.id, headline: 'x'.repeat(121) }),
      /check/i,
    );
  });

  test('deleting the user cascades to the coach profile', async () => {
    const user = await makeUser('cascade');
    await upsertCoachProfile({ ...baseProfile, userId: user.id });
    assert.ok(await getCoachProfileForUser(user.id));
    const { getPool } = await import('./persistence-db.js');
    await getPool().query('DELETE FROM users WHERE id = $1', [user.id]);
    assert.equal(await getCoachProfileForUser(user.id), null);
  });
});
