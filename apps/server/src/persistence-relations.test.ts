import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  blockUser,
  countFollowing,
  createUser,
  followUser,
  hasBlock,
  listRelations,
  unblockUser,
  unfollowUser,
  viewerRelationForHandle,
} from './persistence.js';
import { assert, definePersistenceTests, test } from './persistence-test-support.js';
import { tryHandle as tryHandleRelationsRoute } from './routes/relations.js';

type ResponseCapture = {
  body: string;
  headers: Record<string, string | string[]>;
  status: number | null;
};

definePersistenceTests('relations', () => {
  test('follow creates a directed edge with self-only lists and counts', async () => {
    const now = new Date('2026-07-01T00:00:00Z');
    await makeUser('rel_user_ana', 'ana', now);
    await makeUser('rel_user_bo', 'bo', now);

    const followed = await followUser({ actorId: 'rel_user_ana', targetHandle: 'bo', now });
    assert.equal(followed.ok, true);
    // Idempotent: a second follow neither errors nor duplicates.
    const again = await followUser({ actorId: 'rel_user_ana', targetHandle: 'BO', now });
    assert.equal(again.ok, true);

    assert.equal(await countFollowing('rel_user_ana'), 1);
    assert.equal(await countFollowing('rel_user_bo'), 0);

    const following = await listRelations('rel_user_ana', 'follow', 0, 30);
    assert.equal(following.total, 1);
    assert.equal(following.entries[0]?.handle, 'bo');

    const anaView = await viewerRelationForHandle('rel_user_ana', 'bo');
    assert.deepEqual(anaView, { following: true, blocked: false, blockedBy: false });
    // Follow is one-directional and invisible to the target: bo sees no edge.
    const boView = await viewerRelationForHandle('rel_user_bo', 'ana');
    assert.deepEqual(boView, { following: false, blocked: false, blockedBy: false });
  });

  test('unknown handles and self-relations are rejected', async () => {
    const now = new Date('2026-07-01T00:00:00Z');
    await makeUser('rel_user_solo', 'solo', now);

    const unknown = await followUser({ actorId: 'rel_user_solo', targetHandle: 'ghost', now });
    assert.deepEqual(unknown, { ok: false, error: 'unknown_user' });
    const self = await followUser({ actorId: 'rel_user_solo', targetHandle: 'solo', now });
    assert.deepEqual(self, { ok: false, error: 'self_relation' });
  });

  test('block overwrites follow and severs the reverse follow', async () => {
    const now = new Date('2026-07-01T00:00:00Z');
    await makeUser('rel_user_cara', 'cara', now);
    await makeUser('rel_user_dan', 'dan', now);

    // Mutual follows first.
    assert.equal(
      (await followUser({ actorId: 'rel_user_cara', targetHandle: 'dan', now })).ok,
      true,
    );
    assert.equal(
      (await followUser({ actorId: 'rel_user_dan', targetHandle: 'cara', now })).ok,
      true,
    );

    // Cara blocks Dan: her follow flips to block, his follow of her is deleted.
    assert.equal(
      (await blockUser({ actorId: 'rel_user_cara', targetHandle: 'dan', now })).ok,
      true,
    );
    assert.equal(await countFollowing('rel_user_cara'), 0);
    assert.equal(await countFollowing('rel_user_dan'), 0);
    assert.equal(await hasBlock('rel_user_cara', 'rel_user_dan'), true);
    assert.equal(await hasBlock('rel_user_dan', 'rel_user_cara'), false);

    const caraView = await viewerRelationForHandle('rel_user_cara', 'dan');
    assert.deepEqual(caraView, { following: false, blocked: true, blockedBy: false });
    const danView = await viewerRelationForHandle('rel_user_dan', 'cara');
    assert.deepEqual(danView, { following: false, blocked: false, blockedBy: true });
  });

  test('following someone who blocked you silently no-ops', async () => {
    const now = new Date('2026-07-01T00:00:00Z');
    await makeUser('rel_user_eve', 'eve', now);
    await makeUser('rel_user_finn', 'finn', now);

    assert.equal(
      (await blockUser({ actorId: 'rel_user_finn', targetHandle: 'eve', now })).ok,
      true,
    );

    // Eve's follow reports ok (so she can't probe who blocked her) but writes
    // no edge.
    const result = await followUser({ actorId: 'rel_user_eve', targetHandle: 'finn', now });
    assert.equal(result.ok, true);
    assert.equal(await countFollowing('rel_user_eve'), 0);

    // After Finn unblocks, the same follow lands.
    assert.equal((await unblockUser({ actorId: 'rel_user_finn', targetHandle: 'eve' })).ok, true);
    assert.equal(
      (await followUser({ actorId: 'rel_user_eve', targetHandle: 'finn', now })).ok,
      true,
    );
    assert.equal(await countFollowing('rel_user_eve'), 1);
  });

  test('unfollow and unblock delete only the matching relation', async () => {
    const now = new Date('2026-07-01T00:00:00Z');
    await makeUser('rel_user_gil', 'gil', now);
    await makeUser('rel_user_hana', 'hana', now);

    assert.equal(
      (await followUser({ actorId: 'rel_user_gil', targetHandle: 'hana', now })).ok,
      true,
    );
    // Unblock is a no-op against a follow edge.
    assert.equal((await unblockUser({ actorId: 'rel_user_gil', targetHandle: 'hana' })).ok, true);
    assert.equal(await countFollowing('rel_user_gil'), 1);

    assert.equal((await unfollowUser({ actorId: 'rel_user_gil', targetHandle: 'hana' })).ok, true);
    assert.equal(await countFollowing('rel_user_gil'), 0);
  });

  test('the follow cap refuses new follows', async () => {
    const now = new Date('2026-07-01T00:00:00Z');
    await makeUser('rel_user_ida', 'ida', now);
    await makeUser('rel_user_jo', 'jo', now);
    await makeUser('rel_user_kim', 'kim', now);

    assert.equal(
      (await followUser({ actorId: 'rel_user_ida', targetHandle: 'jo', now, followCap: 1 })).ok,
      true,
    );
    const capped = await followUser({
      actorId: 'rel_user_ida',
      targetHandle: 'kim',
      now,
      followCap: 1,
    });
    assert.deepEqual(capped, { ok: false, error: 'follow_limit_reached' });
  });

  test('relation routes require an account session', async () => {
    const followResponse = captureResponse();
    const handled = await tryHandleRelationsRoute(
      {},
      { method: 'POST', headers: {} } as unknown as IncomingMessage,
      followResponse,
      '/api/users/somebody/follow',
      new URL('http://localhost/api/users/somebody/follow'),
    );
    assert.equal(handled, true);
    assert.equal(followResponse.status, 401);
    assert.equal(JSON.parse(followResponse.body).error, 'not_signed_in');

    const listResponse = captureResponse();
    const listHandled = await tryHandleRelationsRoute(
      {},
      { method: 'GET', headers: {} } as unknown as IncomingMessage,
      listResponse,
      '/api/relations/following',
      new URL('http://localhost/api/relations/following'),
    );
    assert.equal(listHandled, true);
    assert.equal(listResponse.status, 401);

    const badMethod = captureResponse();
    const badMethodHandled = await tryHandleRelationsRoute(
      {},
      { method: 'PUT', headers: {} } as unknown as IncomingMessage,
      badMethod,
      '/api/users/somebody/follow',
      new URL('http://localhost/api/users/somebody/follow'),
    );
    assert.equal(badMethodHandled, true);
    assert.equal(badMethod.status, 405);
  });
});

async function makeUser(id: string, handle: string, now: Date): Promise<void> {
  await createUser({
    id,
    email: `${handle}@example.com`,
    emailVerifiedAt: now,
    handle,
    displayName: handle,
    now,
  });
}

function captureResponse(): ServerResponse & ResponseCapture {
  const capture = {
    body: '',
    headers: {} as Record<string, string | string[]>,
    status: null as number | null,
    writeHead(status: number, headers?: Record<string, string | string[]>) {
      capture.status = status;
      capture.headers = headers ?? {};
      return capture;
    },
    end(chunk?: string) {
      capture.body += chunk ?? '';
      return capture;
    },
  };
  return capture as unknown as ServerResponse & ResponseCapture;
}
