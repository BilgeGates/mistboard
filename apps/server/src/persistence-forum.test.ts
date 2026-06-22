import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  addForumPost,
  countRecentForumPostsByUser,
  countRecentForumTopicsByUser,
  createForumTopic,
  createUser,
  getForumTopic,
  listForumCategories,
  listForumTopics,
} from './persistence.js';
import { getPool } from './persistence-db.js';
import { assert, definePersistenceTests, test } from './persistence-test-support.js';
import { tryHandle as tryHandleForumRoute } from './routes/forum.js';

type ResponseCapture = {
  body: string;
  headers: Record<string, string | string[]>;
  status: number | null;
};

definePersistenceTests('forum', () => {
  test('forum categories are seeded and non-admins cannot start announcement topics', async () => {
    const categories = await listForumCategories();
    assert.deepEqual(
      categories.map((category) => category.slug),
      ['announcements', 'rules', 'strategy', 'engines', 'support'],
    );
    assert.equal(categories[0]?.topicWritePolicy, 'admin');

    await createUser({
      id: 'forum_user_regular',
      email: 'regular@example.com',
      emailVerifiedAt: new Date('2026-06-01T00:00:00Z'),
      handle: 'regular',
      displayName: 'Regular',
      now: new Date('2026-06-01T00:00:00Z'),
    });

    const result = await createForumTopic({
      id: 'topic_announcement_blocked',
      postId: 'post_announcement_blocked',
      categorySlug: 'announcements',
      authorAccountId: 'forum_user_regular',
      authorRole: 'player',
      title: 'Regular announcement attempt',
      slug: 'regular-announcement-attempt',
      bodyText: 'This should not publish.',
      now: new Date('2026-06-01T00:01:00Z'),
    });

    assert.deepEqual(result, { ok: false, error: 'category_admin_only' });
  });

  test('forum topics list newest activity and expose plaintext posts', async () => {
    const now = new Date('2026-06-01T00:00:00Z');
    await createUser({
      id: 'forum_user_alice',
      email: 'alice@example.com',
      emailVerifiedAt: now,
      handle: 'alice',
      displayName: 'Alice',
      now,
    });
    await createUser({
      id: 'forum_user_bob',
      email: 'bob@example.com',
      emailVerifiedAt: now,
      handle: 'bob',
      displayName: 'Bob',
      now,
    });

    const created = await createForumTopic({
      id: 'topic_strategy',
      postId: 'post_strategy_open',
      categorySlug: 'strategy',
      authorAccountId: 'forum_user_alice',
      authorRole: 'player',
      title: 'How do you scout the center?',
      slug: 'how-do-you-scout-the-center',
      bodyText: 'I like opening with central pawns.\nWhat else works?',
      now,
    });
    assert.equal(created.ok, true);

    const reply = await addForumPost({
      id: 'post_strategy_reply',
      topicId: 'topic_strategy',
      authorAccountId: 'forum_user_bob',
      bodyText: 'Developing knights first keeps more fog pressure.',
      now: new Date('2026-06-01T00:05:00Z'),
    });
    assert.equal(reply.ok, true);

    const topics = await listForumTopics({ limit: 5 });
    assert.equal(topics[0]?.id, 'topic_strategy');
    assert.equal(topics[0]?.postCount, 2);
    assert.equal(topics[0]?.category.slug, 'strategy');
    assert.equal(topics[0]?.author?.handle, 'alice');

    const detail = await getForumTopic('topic_strategy');
    assert.equal(detail?.posts.length, 2);
    assert.equal(
      detail?.posts[0]?.bodyText,
      'I like opening with central pawns.\nWhat else works?',
    );
    assert.equal(detail?.posts[1]?.author?.handle, 'bob');

    assert.equal(
      await countRecentForumTopicsByUser('forum_user_alice', new Date('2026-05-31T23:59:00Z')),
      1,
    );
    assert.equal(
      await countRecentForumPostsByUser('forum_user_bob', new Date('2026-05-31T23:59:00Z')),
      1,
    );
  });

  test('locked forum topics reject replies', async () => {
    const now = new Date('2026-06-01T00:00:00Z');
    await createUser({
      id: 'forum_user_lock',
      email: 'lock@example.com',
      emailVerifiedAt: now,
      handle: 'lock',
      displayName: 'Lock',
      now,
    });
    await createForumTopic({
      id: 'topic_locked',
      postId: 'post_locked_open',
      categorySlug: 'support',
      authorAccountId: 'forum_user_lock',
      authorRole: 'player',
      title: 'This support topic is locked',
      slug: 'this-support-topic-is-locked',
      bodyText: 'Initial report.',
      now,
    });
    await getPool().query('UPDATE forum_topics SET locked_at = $2 WHERE id = $1', [
      'topic_locked',
      new Date('2026-06-01T00:01:00Z'),
    ]);

    const reply = await addForumPost({
      id: 'post_locked_reply',
      topicId: 'topic_locked',
      authorAccountId: 'forum_user_lock',
      bodyText: 'Follow-up.',
      now: new Date('2026-06-01T00:02:00Z'),
    });

    assert.deepEqual(reply, { ok: false, error: 'topic_locked' });
  });

  test('forum write routes require an account session', async () => {
    const response = captureResponse();
    const handled = await tryHandleForumRoute(
      {},
      { method: 'POST', headers: {} } as unknown as IncomingMessage,
      response,
      '/api/forum/topics',
      new URL('http://localhost/api/forum/topics'),
    );

    assert.equal(handled, true);
    assert.equal(response.status, 401);
    assert.deepEqual(JSON.parse(response.body), { error: 'not_signed_in' });
  });
});

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
