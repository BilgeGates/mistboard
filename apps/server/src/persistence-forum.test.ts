import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  addForumPost,
  countRecentForumPostsByUser,
  countRecentForumTopicsByUser,
  createForumTopic,
  createUser,
  getForumTopic,
  hideForumPost,
  listForumCategories,
  listForumTopics,
  moderateForumTopic,
  searchForumTopics,
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
    assert.equal(topics[0]?.latestPost?.post.id, 'post_strategy_reply');
    assert.equal(topics[0]?.latestPost?.author?.handle, 'bob');

    const categories = await listForumCategories();
    const strategy = categories.find((category) => category.slug === 'strategy');
    assert.equal(strategy?.topicCount, 1);
    assert.equal(strategy?.postCount, 2);
    assert.equal(strategy?.latestPost?.topic.id, 'topic_strategy');
    assert.equal(strategy?.latestPost?.topic.postCount, 2);
    assert.equal(strategy?.latestPost?.post.id, 'post_strategy_reply');
    assert.equal(strategy?.latestPost?.author?.handle, 'bob');

    const detail = await getForumTopic('topic_strategy');
    assert.equal(detail?.posts.length, 2);
    assert.equal(
      detail?.posts[0]?.bodyText,
      'I like opening with central pawns.\nWhat else works?',
    );
    assert.equal(detail?.posts[1]?.author?.handle, 'bob');

    const pagedDetail = await getForumTopic('topic_strategy', { postLimit: 1, postOffset: 1 });
    assert.equal(pagedDetail?.postCount, 2);
    assert.equal(pagedDetail?.posts.length, 1);
    assert.equal(pagedDetail?.posts[0]?.id, 'post_strategy_reply');

    assert.equal(
      await countRecentForumTopicsByUser('forum_user_alice', new Date('2026-05-31T23:59:00Z')),
      1,
    );
    assert.equal(
      await countRecentForumPostsByUser('forum_user_bob', new Date('2026-05-31T23:59:00Z')),
      1,
    );

    const titleMatches = await searchForumTopics({ query: 'scout', limit: 5 });
    assert.equal(titleMatches[0]?.id, 'topic_strategy');
    const bodyMatches = await searchForumTopics({ query: 'knights', limit: 5 });
    assert.equal(bodyMatches[0]?.id, 'topic_strategy');

    const searchResponse = captureResponse();
    const handled = await tryHandleForumRoute(
      {},
      { method: 'GET', headers: {} } as unknown as IncomingMessage,
      searchResponse,
      '/api/forum/search',
      new URL('http://localhost/api/forum/search?q=knights'),
    );
    assert.equal(handled, true);
    assert.equal(searchResponse.status, 200);
    assert.equal(JSON.parse(searchResponse.body).topics[0]?.id, 'topic_strategy');
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

  test('forum moderation can pin, lock, hide posts, and hide topics', async () => {
    const now = new Date('2026-06-01T00:00:00Z');
    await createUser({
      id: 'forum_user_mod_author',
      email: 'mod-author@example.com',
      emailVerifiedAt: now,
      handle: 'modauthor',
      displayName: 'Mod Author',
      now,
    });
    await createUser({
      id: 'forum_user_moderator',
      email: 'moderator@example.com',
      emailVerifiedAt: now,
      handle: 'moderator',
      displayName: 'Moderator',
      accountRole: 'admin',
      now,
    });
    await createForumTopic({
      id: 'topic_moderated',
      postId: 'post_moderated_open',
      categorySlug: 'strategy',
      authorAccountId: 'forum_user_mod_author',
      authorRole: 'player',
      title: 'Moderated topic',
      slug: 'moderated-topic',
      bodyText: 'Opening post.',
      now,
    });
    await addForumPost({
      id: 'post_moderated_reply',
      topicId: 'topic_moderated',
      authorAccountId: 'forum_user_mod_author',
      bodyText: 'Reply to hide.',
      now: new Date('2026-06-01T00:05:00Z'),
    });

    const pinned = await moderateForumTopic({
      topicId: 'topic_moderated',
      moderatorAccountId: 'forum_user_moderator',
      action: 'pin',
      reason: null,
      now: new Date('2026-06-01T00:06:00Z'),
    });
    assert.equal(pinned.ok, true);
    assert.equal(pinned.ok ? pinned.topic?.pinnedAt instanceof Date : false, true);

    const locked = await moderateForumTopic({
      topicId: 'topic_moderated',
      moderatorAccountId: 'forum_user_moderator',
      action: 'lock',
      reason: null,
      now: new Date('2026-06-01T00:07:00Z'),
    });
    assert.equal(locked.ok, true);
    assert.equal(locked.ok ? locked.topic?.lockedAt instanceof Date : false, true);

    const hiddenPost = await hideForumPost({
      postId: 'post_moderated_reply',
      moderatorAccountId: 'forum_user_moderator',
      reason: 'cleanup',
      now: new Date('2026-06-01T00:08:00Z'),
    });
    assert.deepEqual(hiddenPost, { ok: true, topicHidden: false });
    const detailAfterPostHide = await getForumTopic('topic_moderated');
    assert.equal(detailAfterPostHide?.postCount, 1);
    assert.deepEqual(
      detailAfterPostHide?.posts.map((post) => post.id),
      ['post_moderated_open'],
    );

    const hiddenTopic = await moderateForumTopic({
      topicId: 'topic_moderated',
      moderatorAccountId: 'forum_user_moderator',
      action: 'hide',
      reason: 'duplicate',
      now: new Date('2026-06-01T00:09:00Z'),
    });
    assert.deepEqual(hiddenTopic, { ok: true, topic: null });
    assert.equal(await getForumTopic('topic_moderated'), null);
    assert.equal(
      (await listForumTopics({ limit: 10 })).some((topic) => topic.id === 'topic_moderated'),
      false,
    );
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

  test('forum moderation route rejects unknown actions', async () => {
    const response = captureResponse();
    const handled = await tryHandleForumRoute(
      {},
      requestWithJson({ action: 'feature' }),
      response,
      '/api/forum/topics/topic_missing/moderation',
      new URL('http://localhost/api/forum/topics/topic_missing/moderation'),
    );

    assert.equal(handled, true);
    assert.equal(response.status, 400);
    assert.deepEqual(JSON.parse(response.body), { error: 'invalid_action' });
  });
});

function requestWithJson(body: unknown): IncomingMessage {
  const chunks = [Buffer.from(JSON.stringify(body))];
  const request = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() {
      yield* chunks;
    },
  };
  return request as unknown as IncomingMessage;
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
