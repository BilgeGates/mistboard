import type { AccountRole } from './persistence-accounts.js';
import { getPool, withTransaction } from './persistence-db.js';

export type ForumTopicWritePolicy = 'account' | 'admin';

export type ForumCategory = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  topicWritePolicy: ForumTopicWritePolicy;
  topicCount: number;
};

export type ForumAuthor = {
  handle: string;
  displayName: string;
} | null;

export type ForumTopicSummary = {
  id: string;
  slug: string;
  title: string;
  category: {
    slug: string;
    name: string;
  };
  author: ForumAuthor;
  postCount: number;
  pinnedAt: Date | null;
  lockedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastPostAt: Date;
};

export type ForumPost = {
  id: string;
  author: ForumAuthor;
  bodyText: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ForumTopicDetail = ForumTopicSummary & {
  posts: ForumPost[];
};

export type CreateForumTopicResult =
  | { ok: true; topic: ForumTopicDetail }
  | { ok: false; error: 'category_not_found' | 'category_admin_only' };

export type AddForumPostResult =
  | { ok: true; post: ForumPost }
  | { ok: false; error: 'topic_not_found' | 'topic_locked' };

export type ForumTopicModerationAction = 'pin' | 'unpin' | 'lock' | 'unlock' | 'hide';

export type ModerateForumTopicResult =
  | { ok: true; topic: ForumTopicDetail | null }
  | { ok: false; error: 'topic_not_found' };

export type HideForumPostResult =
  | { ok: true; topicHidden: boolean }
  | { ok: false; error: 'post_not_found' };

export async function listForumCategories(): Promise<ForumCategory[]> {
  const { rows } = await getPool().query<ForumCategoryRow>(
    `SELECT c.id, c.slug, c.name, c.description, c.sort_order, c.topic_write_policy,
            COUNT(t.id)::int AS topic_count
     FROM forum_categories c
     LEFT JOIN forum_topics t ON t.category_id = c.id AND t.hidden_at IS NULL
     GROUP BY c.id
     ORDER BY c.sort_order ASC, c.name ASC`,
  );
  return rows.map(categoryFromRow);
}

export async function listForumTopics(
  options: { categorySlug?: string | null; limit?: number; offset?: number } = {},
): Promise<ForumTopicSummary[]> {
  const limit = clampInt(options.limit ?? 20, 1, 50);
  const offset = clampInt(options.offset ?? 0, 0, 10_000);
  const categorySlug = options.categorySlug?.trim() || null;
  const { rows } = await getPool().query<ForumTopicRow>(
    `${FORUM_TOPIC_SELECT}
     WHERE t.hidden_at IS NULL
       AND ($1::text IS NULL OR c.slug = $1)
     ORDER BY (t.pinned_at IS NOT NULL) DESC, t.pinned_at DESC NULLS LAST,
              t.last_post_at DESC, t.created_at DESC
     LIMIT $2 OFFSET $3`,
    [categorySlug, limit, offset],
  );
  return rows.map(topicFromRow);
}

export async function getForumTopic(id: string): Promise<ForumTopicDetail | null> {
  const { rows } = await getPool().query<ForumTopicRow>(
    `${FORUM_TOPIC_SELECT}
     WHERE t.id = $1 AND t.hidden_at IS NULL`,
    [id],
  );
  const topic = rows[0] ? topicFromRow(rows[0]) : null;
  if (!topic) return null;
  const posts = await listForumPosts(id);
  return { ...topic, posts };
}

export async function createForumTopic(input: {
  id: string;
  postId: string;
  categorySlug: string;
  authorAccountId: string;
  authorRole: AccountRole;
  title: string;
  slug: string;
  bodyText: string;
  now: Date;
}): Promise<CreateForumTopicResult> {
  const result = await withTransaction<
    { ok: true } | { ok: false; error: 'category_not_found' | 'category_admin_only' }
  >(async (client) => {
    const { rows: categories } = await client.query<{
      id: string;
      topic_write_policy: ForumTopicWritePolicy;
    }>(
      `SELECT id, topic_write_policy
       FROM forum_categories
       WHERE slug = $1`,
      [input.categorySlug],
    );
    const category = categories[0];
    if (!category) return { ok: false, error: 'category_not_found' };
    if (category.topic_write_policy === 'admin' && input.authorRole !== 'admin') {
      return { ok: false, error: 'category_admin_only' };
    }

    await client.query(
      `INSERT INTO forum_topics
         (id, category_id, author_account_id, slug, title, post_count, last_post_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 1, $6, $6, $6)`,
      [input.id, category.id, input.authorAccountId, input.slug, input.title, input.now],
    );
    await client.query(
      `INSERT INTO forum_posts
         (id, topic_id, author_account_id, body_text, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [input.postId, input.id, input.authorAccountId, input.bodyText, input.now],
    );
    return { ok: true };
  });
  if (!result.ok) return result;
  const topic = await getForumTopic(input.id);
  if (!topic) throw new Error(`forum topic ${input.id} missing after insert`);
  return { ok: true, topic };
}

export async function addForumPost(input: {
  id: string;
  topicId: string;
  authorAccountId: string;
  bodyText: string;
  now: Date;
}): Promise<AddForumPostResult> {
  return withTransaction(async (client) => {
    const { rows: topics } = await client.query<{
      id: string;
      locked_at: Date | null;
      hidden_at: Date | null;
    }>(
      `SELECT id, locked_at, hidden_at
       FROM forum_topics
       WHERE id = $1
       FOR UPDATE`,
      [input.topicId],
    );
    const topic = topics[0];
    if (!topic || topic.hidden_at) return { ok: false, error: 'topic_not_found' };
    if (topic.locked_at) return { ok: false, error: 'topic_locked' };

    const { rows } = await client.query<ForumPostRow>(
      `WITH inserted AS (
         INSERT INTO forum_posts
           (id, topic_id, author_account_id, body_text, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5)
         RETURNING id, author_account_id, body_text, created_at, updated_at
       )
       SELECT i.id, i.body_text, i.created_at, i.updated_at,
              u.handle AS author_handle, COALESCE(u.display_name, u.handle) AS author_display_name
       FROM inserted i
       LEFT JOIN users u ON u.id = i.author_account_id`,
      [input.id, input.topicId, input.authorAccountId, input.bodyText, input.now],
    );
    await client.query(
      `UPDATE forum_topics
       SET post_count = post_count + 1,
           last_post_at = $2,
           updated_at = $2
       WHERE id = $1`,
      [input.topicId, input.now],
    );
    const post = postFromRow(rows[0]!);
    return { ok: true, post };
  });
}

export async function moderateForumTopic(input: {
  topicId: string;
  moderatorAccountId: string | null;
  action: ForumTopicModerationAction;
  reason: string | null;
  now: Date;
}): Promise<ModerateForumTopicResult> {
  const result = await withTransaction<{ ok: true } | { ok: false; error: 'topic_not_found' }>(
    async (client) => {
      const patch = topicModerationPatch(input.action);
      const { rowCount } = await client.query(
        `UPDATE forum_topics
         SET ${patch}, updated_at = $2
         WHERE id = $1 AND hidden_at IS NULL`,
        [input.topicId, input.now, input.moderatorAccountId, input.reason],
      );
      if (rowCount === 0) return { ok: false, error: 'topic_not_found' };
      return { ok: true };
    },
  );
  if (!result.ok) return result;
  if (input.action === 'hide') return { ok: true, topic: null };
  const topic = await getForumTopic(input.topicId);
  if (!topic) throw new Error(`forum topic ${input.topicId} missing after moderation`);
  return { ok: true, topic };
}

export async function hideForumPost(input: {
  postId: string;
  moderatorAccountId: string | null;
  reason: string | null;
  now: Date;
}): Promise<HideForumPostResult> {
  return withTransaction(async (client) => {
    const { rows: posts } = await client.query<{ topic_id: string }>(
      `UPDATE forum_posts
       SET hidden_at = $2,
           hidden_by_account_id = $3,
           hidden_reason = $4,
           updated_at = $2
       WHERE id = $1 AND hidden_at IS NULL
       RETURNING topic_id`,
      [input.postId, input.now, input.moderatorAccountId, input.reason],
    );
    const post = posts[0];
    if (!post) return { ok: false, error: 'post_not_found' };

    const { rows: visibleRows } = await client.query<{
      visible_count: number;
      last_visible_post_at: Date | null;
    }>(
      `SELECT COUNT(*)::int AS visible_count, MAX(created_at) AS last_visible_post_at
       FROM forum_posts
       WHERE topic_id = $1 AND hidden_at IS NULL`,
      [post.topic_id],
    );
    const visible = visibleRows[0] ?? { visible_count: 0, last_visible_post_at: null };
    const topicHidden = visible.visible_count === 0;
    await client.query(
      `UPDATE forum_topics
       SET post_count = $2,
           last_post_at = COALESCE($3, last_post_at),
           hidden_at = CASE WHEN $4 THEN $5 ELSE hidden_at END,
           hidden_by_account_id = CASE WHEN $4 THEN $6 ELSE hidden_by_account_id END,
           hidden_reason = CASE WHEN $4 THEN $7 ELSE hidden_reason END,
           updated_at = $5
       WHERE id = $1`,
      [
        post.topic_id,
        visible.visible_count,
        visible.last_visible_post_at,
        topicHidden,
        input.now,
        input.moderatorAccountId,
        input.reason,
      ],
    );
    return { ok: true, topicHidden };
  });
}

export async function countRecentForumTopicsByUser(userId: string, since: Date): Promise<number> {
  const { rows } = await getPool().query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM forum_topics
     WHERE author_account_id = $1 AND created_at >= $2`,
    [userId, since],
  );
  return Number(rows[0]?.count ?? '0');
}

export async function countRecentForumPostsByUser(userId: string, since: Date): Promise<number> {
  const { rows } = await getPool().query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM forum_posts
     WHERE author_account_id = $1 AND created_at >= $2`,
    [userId, since],
  );
  return Number(rows[0]?.count ?? '0');
}

async function listForumPosts(topicId: string): Promise<ForumPost[]> {
  const { rows } = await getPool().query<ForumPostRow>(
    `SELECT p.id, p.body_text, p.created_at, p.updated_at,
            u.handle AS author_handle, COALESCE(u.display_name, u.handle) AS author_display_name
     FROM forum_posts p
     LEFT JOIN users u ON u.id = p.author_account_id
     WHERE p.topic_id = $1 AND p.hidden_at IS NULL
     ORDER BY p.created_at ASC, p.id ASC`,
    [topicId],
  );
  return rows.map(postFromRow);
}

const FORUM_TOPIC_SELECT = `SELECT t.id, t.slug, t.title, t.post_count, t.pinned_at, t.locked_at,
          t.created_at, t.updated_at, t.last_post_at,
          c.slug AS category_slug, c.name AS category_name,
          u.handle AS author_handle, COALESCE(u.display_name, u.handle) AS author_display_name
   FROM forum_topics t
   JOIN forum_categories c ON c.id = t.category_id
   LEFT JOIN users u ON u.id = t.author_account_id`;

function topicModerationPatch(action: ForumTopicModerationAction): string {
  switch (action) {
    case 'pin':
      return 'pinned_at = $2';
    case 'unpin':
      return 'pinned_at = NULL';
    case 'lock':
      return 'locked_at = $2';
    case 'unlock':
      return 'locked_at = NULL';
    case 'hide':
      return 'hidden_at = $2, hidden_by_account_id = $3, hidden_reason = $4';
  }
}

type ForumCategoryRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sort_order: number;
  topic_write_policy: ForumTopicWritePolicy;
  topic_count: number;
};

type ForumTopicRow = {
  id: string;
  slug: string;
  title: string;
  post_count: number;
  pinned_at: Date | null;
  locked_at: Date | null;
  created_at: Date;
  updated_at: Date;
  last_post_at: Date;
  category_slug: string;
  category_name: string;
  author_handle: string | null;
  author_display_name: string | null;
};

type ForumPostRow = {
  id: string;
  body_text: string;
  created_at: Date;
  updated_at: Date;
  author_handle: string | null;
  author_display_name: string | null;
};

function categoryFromRow(row: ForumCategoryRow): ForumCategory {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    sortOrder: row.sort_order,
    topicWritePolicy: row.topic_write_policy,
    topicCount: row.topic_count,
  };
}

function topicFromRow(row: ForumTopicRow): ForumTopicSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: {
      slug: row.category_slug,
      name: row.category_name,
    },
    author: authorFromRow(row.author_handle, row.author_display_name),
    postCount: row.post_count,
    pinnedAt: row.pinned_at,
    lockedAt: row.locked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastPostAt: row.last_post_at,
  };
}

function postFromRow(row: ForumPostRow): ForumPost {
  return {
    id: row.id,
    author: authorFromRow(row.author_handle, row.author_display_name),
    bodyText: row.body_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function authorFromRow(handle: string | null, displayName: string | null): ForumAuthor {
  if (!handle) return null;
  return { handle, displayName: displayName ?? handle };
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(Math.trunc(value), max));
}
