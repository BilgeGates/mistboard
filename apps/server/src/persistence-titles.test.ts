import type { UserAccount } from './persistence.js';
import { createUser, getUserProfileByHandle } from './persistence.js';
import { assert, definePersistenceTests, test } from './persistence-test-support.js';
import {
  createTitleVerificationRequest,
  decideTitleVerificationRequest,
  latestTitleVerificationRequestForUser,
  listTitleVerificationRequests,
  type PlayerTitle,
} from './persistence-titles.js';

definePersistenceTests('titles', () => {
  const now = new Date('2026-07-10T12:00:00.000Z');

  async function makeUser(suffix: string): Promise<UserAccount> {
    return createUser({
      id: `user_title_${suffix}`,
      email: `title-${suffix}@example.com`,
      emailVerifiedAt: now,
      handle: `titled-${suffix}`,
      displayName: `Titled ${suffix}`,
      now,
    });
  }

  test('the partial unique index allows only one pending request per user', async () => {
    const user = await makeUser('pending');
    const first = await createTitleVerificationRequest({
      id: 'titlereq_p1',
      userId: user.id,
      title: 'xgm',
      evidence: 'WXF profile link',
      now,
    });
    assert.equal(first.ok, true);

    const second = await createTitleVerificationRequest({
      id: 'titlereq_p2',
      userId: user.id,
      title: 'xim',
      evidence: 'another claim',
      now,
    });
    assert.deepEqual(second, { ok: false, error: 'request_pending' });

    // A decided request frees the slot again.
    await decideTitleVerificationRequest({
      id: 'titlereq_p1',
      decision: 'rejected',
      decidedBy: null,
      now,
    });
    const third = await createTitleVerificationRequest({
      id: 'titlereq_p3',
      userId: user.id,
      title: 'xgm',
      evidence: 'stronger evidence',
      now: new Date(now.getTime() + 1_000),
    });
    assert.equal(third.ok, true);
  });

  test('approval stamps users.title and surfaces on the public profile', async () => {
    const user = await makeUser('approve');
    assert.equal(user.title, null);
    await createTitleVerificationRequest({
      id: 'titlereq_a1',
      userId: user.id,
      title: 'xgm',
      evidence: 'WXF profile link, real name',
      now,
    });

    const admin = await makeUser('admin');
    const decided = await decideTitleVerificationRequest({
      id: 'titlereq_a1',
      decision: 'approved',
      decidedBy: admin.id,
      now,
    });
    assert.equal(decided?.status, 'approved');
    assert.equal(decided?.decidedBy, admin.id);

    const profile = await getUserProfileByHandle(user.handle, null);
    assert.equal(profile?.user.title, 'xgm');

    // Approving a later claim overwrites the held title (one title per user).
    await createTitleVerificationRequest({
      id: 'titlereq_a2',
      userId: user.id,
      title: 'gm',
      evidence: 'FIDE profile link',
      now: new Date(now.getTime() + 1_000),
    });
    await decideTitleVerificationRequest({
      id: 'titlereq_a2',
      decision: 'approved',
      decidedBy: admin.id,
      now: new Date(now.getTime() + 2_000),
    });
    const updated = await getUserProfileByHandle(user.handle, null);
    assert.equal(updated?.user.title, 'gm');
  });

  test('rejection leaves the user untitled and deciding twice is a no-op', async () => {
    const user = await makeUser('reject');
    await createTitleVerificationRequest({
      id: 'titlereq_r1',
      userId: user.id,
      title: 'wgm',
      evidence: 'weak evidence',
      now,
    });
    const decided = await decideTitleVerificationRequest({
      id: 'titlereq_r1',
      decision: 'rejected',
      decidedBy: null,
      now,
    });
    assert.equal(decided?.status, 'rejected');

    const profile = await getUserProfileByHandle(user.handle, null);
    assert.equal(profile?.user.title, null);

    const again = await decideTitleVerificationRequest({
      id: 'titlereq_r1',
      decision: 'approved',
      decidedBy: null,
      now,
    });
    assert.equal(again, null);
  });

  test('latest request and admin lists read back what was written', async () => {
    const user = await makeUser('lists');
    await createTitleVerificationRequest({
      id: 'titlereq_l1',
      userId: user.id,
      title: 'xnm',
      evidence: 'CXA membership',
      now,
    });
    await decideTitleVerificationRequest({
      id: 'titlereq_l1',
      decision: 'approved',
      decidedBy: null,
      now: new Date(now.getTime() + 1_000),
    });
    await createTitleVerificationRequest({
      id: 'titlereq_l2',
      userId: user.id,
      title: 'xim',
      evidence: 'promoted',
      now: new Date(now.getTime() + 2_000),
    });

    const latest = await latestTitleVerificationRequestForUser(user.id);
    assert.equal(latest?.id, 'titlereq_l2');
    assert.equal(latest?.status, 'pending');

    const pending = await listTitleVerificationRequests('pending');
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.id, 'titlereq_l2');
    assert.equal(pending[0]?.handle, user.handle);
    // currentTitle reflects the already-approved xnm while xim waits.
    assert.equal(pending[0]?.currentTitle, 'xnm');

    const decided = await listTitleVerificationRequests('decided');
    assert.equal(decided.length, 1);
    assert.equal(decided[0]?.id, 'titlereq_l1');
    assert.equal(decided[0]?.status, 'approved');
  });

  test('the database CHECK refuses titles outside the closed vocabulary', async () => {
    const user = await makeUser('check');
    await assert.rejects(
      createTitleVerificationRequest({
        id: 'titlereq_bad',
        userId: user.id,
        // Cast on purpose: the DB constraint is the last line of defense when
        // a caller bypasses isPlayerTitle.
        title: 'supreme-master' as PlayerTitle,
        evidence: 'nope',
        now,
      }),
      /check/i,
    );
  });
});
