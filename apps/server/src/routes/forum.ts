import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { currentAccountUser } from './../account-session.js';
import * as persistence from './../persistence.js';
import {
  readJsonBody,
  requireAdminSession,
  requireMethod,
  requirePersistence,
  writeJson,
} from './lib.js';

const titleMinLength = 3;
const titleMaxLength = 120;
const bodyMaxLength = 5000;
const moderationReasonMaxLength = 240;
const topicWindowMs = 10 * 60 * 1000;
const topicLimitPerWindow = 3;
const postWindowMs = 10 * 60 * 1000;
const postLimitPerWindow = 12;

type ForumTopicJson = {
  id: string;
  slug: string;
  title: string;
  category: persistence.ForumTopicSummary['category'];
  author: persistence.ForumAuthor;
  latestPost: {
    post: {
      id: string;
    };
    author: persistence.ForumAuthor;
    createdAt: string;
  } | null;
  postCount: number;
  pinned: boolean;
  locked: boolean;
  pinnedAt: string | null;
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastPostAt: string;
};

type ForumCategoryJson = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  topicWritePolicy: persistence.ForumTopicWritePolicy;
  topicCount: number;
  postCount: number;
  latestPost: {
    post: {
      id: string;
    };
    topic: {
      id: string;
      slug: string;
      title: string;
    };
    author: persistence.ForumAuthor;
    createdAt: string;
  } | null;
};

type ForumPostJson = {
  id: string;
  author: persistence.ForumAuthor;
  bodyText: string;
  createdAt: string;
  updatedAt: string;
};

export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  parsedUrl: URL,
): Promise<boolean> {
  if (pathname === '/api/forum/categories') {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    const categories = await persistence.listForumCategories();
    writeJson(response, 200, { categories: categories.map(serializeCategory) });
    return true;
  }

  if (pathname === '/api/forum/topics') {
    if (!requirePersistence(response)) return true;
    const method = request.method ?? 'GET';
    if (method === 'GET') {
      const topics = await persistence.listForumTopics({
        categorySlug: parsedUrl.searchParams.get('category'),
        limit: clampInt(parsedUrl.searchParams.get('limit'), 20, 1, 50),
        offset: clampInt(parsedUrl.searchParams.get('offset'), 0, 0, 10_000),
      });
      writeJson(response, 200, { topics: topics.map(serializeTopicSummary) });
      return true;
    }
    if (method === 'POST') return createTopic(request, response);
    writeJson(response, 405, { error: 'method_not_allowed' });
    return true;
  }

  const postsMatch = pathname.match(/^\/api\/forum\/topics\/([^/]+)\/posts$/);
  if (postsMatch) {
    if (!requireMethod(request, response, 'POST')) return true;
    if (!requirePersistence(response)) return true;
    return createPost(request, response, decodeURIComponent(postsMatch[1]!));
  }

  const topicModerationMatch = pathname.match(/^\/api\/forum\/topics\/([^/]+)\/moderation$/);
  if (topicModerationMatch) {
    if (!requireMethod(request, response, 'POST')) return true;
    if (!requirePersistence(response)) return true;
    return moderateTopic(request, response, decodeURIComponent(topicModerationMatch[1]!));
  }

  const postModerationMatch = pathname.match(/^\/api\/forum\/posts\/([^/]+)\/moderation$/);
  if (postModerationMatch) {
    if (!requireMethod(request, response, 'POST')) return true;
    if (!requirePersistence(response)) return true;
    return moderatePost(request, response, decodeURIComponent(postModerationMatch[1]!));
  }

  const topicMatch = pathname.match(/^\/api\/forum\/topics\/([^/]+)$/);
  if (topicMatch) {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    const topic = await persistence.getForumTopic(decodeURIComponent(topicMatch[1]!));
    if (!topic) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    writeJson(response, 200, { topic: serializeTopicDetail(topic) });
    return true;
  }

  return false;
}

async function createTopic(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
  const user = await currentAccountUser(request);
  if (!user) {
    writeJson(response, 401, { error: 'not_signed_in' });
    return true;
  }
  const since = new Date(Date.now() - topicWindowMs);
  if ((await persistence.countRecentForumTopicsByUser(user.id, since)) >= topicLimitPerWindow) {
    writeJson(response, 429, { error: 'rate_limited' });
    return true;
  }

  const body = await readJsonBody(request);
  const categorySlug = normalizeSlug(
    typeof body.categorySlug === 'string' ? body.categorySlug : '',
  );
  if (!categorySlug) {
    writeJson(response, 400, { error: 'invalid_category' });
    return true;
  }
  const title = normalizeTitle(typeof body.title === 'string' ? body.title : '');
  if (!title) {
    writeJson(response, 400, { error: 'invalid_title' });
    return true;
  }
  const bodyText = normalizeBodyText(typeof body.body === 'string' ? body.body : '');
  if (!bodyText) {
    writeJson(response, 400, { error: 'invalid_body' });
    return true;
  }

  const now = new Date();
  const result = await persistence.createForumTopic({
    id: `topic_${randomUUID()}`,
    postId: `post_${randomUUID()}`,
    categorySlug,
    authorAccountId: user.id,
    authorRole: user.accountRole,
    title,
    slug: slugifyTitle(title),
    bodyText,
    now,
  });
  if (!result.ok) {
    const status = result.error === 'category_not_found' ? 400 : 403;
    writeJson(response, status, { error: result.error });
    return true;
  }
  writeJson(response, 201, { topic: serializeTopicDetail(result.topic) });
  return true;
}

async function createPost(
  request: IncomingMessage,
  response: ServerResponse,
  topicId: string,
): Promise<boolean> {
  const user = await currentAccountUser(request);
  if (!user) {
    writeJson(response, 401, { error: 'not_signed_in' });
    return true;
  }
  const since = new Date(Date.now() - postWindowMs);
  if ((await persistence.countRecentForumPostsByUser(user.id, since)) >= postLimitPerWindow) {
    writeJson(response, 429, { error: 'rate_limited' });
    return true;
  }

  const body = await readJsonBody(request);
  const bodyText = normalizeBodyText(typeof body.body === 'string' ? body.body : '');
  if (!bodyText) {
    writeJson(response, 400, { error: 'invalid_body' });
    return true;
  }
  const result = await persistence.addForumPost({
    id: `post_${randomUUID()}`,
    topicId,
    authorAccountId: user.id,
    bodyText,
    now: new Date(),
  });
  if (!result.ok) {
    writeJson(response, result.error === 'topic_not_found' ? 404 : 423, { error: result.error });
    return true;
  }
  writeJson(response, 201, { post: serializePost(result.post) });
  return true;
}

async function moderateTopic(
  request: IncomingMessage,
  response: ServerResponse,
  topicId: string,
): Promise<boolean> {
  if (!(await requireAdminSession(request, response))) return true;
  const user = await currentAccountUser(request);
  const body = await readJsonBody(request);
  const action = normalizeTopicModerationAction(body.action);
  if (!action) {
    writeJson(response, 400, { error: 'invalid_action' });
    return true;
  }
  const reason = normalizeModerationReason(typeof body.reason === 'string' ? body.reason : null);
  if (reason === false) {
    writeJson(response, 400, { error: 'invalid_reason' });
    return true;
  }
  const result = await persistence.moderateForumTopic({
    topicId,
    moderatorAccountId: user?.id ?? null,
    action,
    reason,
    now: new Date(),
  });
  if (!result.ok) {
    writeJson(response, 404, { error: result.error });
    return true;
  }
  writeJson(response, 200, {
    ok: true,
    ...(result.topic ? { topic: serializeTopicDetail(result.topic) } : {}),
  });
  return true;
}

async function moderatePost(
  request: IncomingMessage,
  response: ServerResponse,
  postId: string,
): Promise<boolean> {
  if (!(await requireAdminSession(request, response))) return true;
  const user = await currentAccountUser(request);
  const body = await readJsonBody(request);
  if (body.action !== 'hide') {
    writeJson(response, 400, { error: 'invalid_action' });
    return true;
  }
  const reason = normalizeModerationReason(typeof body.reason === 'string' ? body.reason : null);
  if (reason === false) {
    writeJson(response, 400, { error: 'invalid_reason' });
    return true;
  }
  const result = await persistence.hideForumPost({
    postId,
    moderatorAccountId: user?.id ?? null,
    reason,
    now: new Date(),
  });
  if (!result.ok) {
    writeJson(response, 404, { error: result.error });
    return true;
  }
  writeJson(response, 200, { ok: true, topicHidden: result.topicHidden });
  return true;
}

function serializeCategory(category: persistence.ForumCategory): ForumCategoryJson {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    description: category.description,
    sortOrder: category.sortOrder,
    topicWritePolicy: category.topicWritePolicy,
    topicCount: category.topicCount,
    postCount: category.postCount,
    latestPost: category.latestPost
      ? {
          post: category.latestPost.post,
          topic: category.latestPost.topic,
          author: category.latestPost.author,
          createdAt: category.latestPost.createdAt.toISOString(),
        }
      : null,
  };
}

function serializeTopicDetail(topic: persistence.ForumTopicDetail): ForumTopicJson & {
  posts: ForumPostJson[];
} {
  return {
    ...serializeTopicSummary(topic),
    posts: topic.posts.map(serializePost),
  };
}

function serializeTopicSummary(topic: persistence.ForumTopicSummary): ForumTopicJson {
  return {
    id: topic.id,
    slug: topic.slug,
    title: topic.title,
    category: topic.category,
    author: topic.author,
    latestPost: topic.latestPost
      ? {
          post: topic.latestPost.post,
          author: topic.latestPost.author,
          createdAt: topic.latestPost.createdAt.toISOString(),
        }
      : null,
    postCount: topic.postCount,
    pinned: topic.pinnedAt !== null,
    locked: topic.lockedAt !== null,
    pinnedAt: topic.pinnedAt?.toISOString() ?? null,
    lockedAt: topic.lockedAt?.toISOString() ?? null,
    createdAt: topic.createdAt.toISOString(),
    updatedAt: topic.updatedAt.toISOString(),
    lastPostAt: topic.lastPostAt.toISOString(),
  };
}

function serializePost(post: persistence.ForumPost): ForumPostJson {
  return {
    id: post.id,
    author: post.author,
    bodyText: post.bodyText,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

function normalizeSlug(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/.test(trimmed) ? trimmed : null;
}

function normalizeTitle(value: string): string | null {
  const title = value.trim().replace(/\s+/g, ' ');
  if (title.length < titleMinLength || title.length > titleMaxLength) return null;
  return title;
}

function normalizeBodyText(value: string): string | null {
  const text = value.replace(/\r\n?/g, '\n').trim();
  if (text.length === 0 || text.length > bodyMaxLength) return null;
  return text;
}

function normalizeModerationReason(value: string | null): string | null | false {
  if (value === null) return null;
  const reason = value.trim();
  if (reason.length === 0) return null;
  return reason.length <= moderationReasonMaxLength ? reason : false;
}

function normalizeTopicModerationAction(
  value: unknown,
): persistence.ForumTopicModerationAction | null {
  if (
    value === 'pin' ||
    value === 'unpin' ||
    value === 'lock' ||
    value === 'unlock' ||
    value === 'hide'
  ) {
    return value;
  }
  return null;
}

function slugifyTitle(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug.length >= 2 ? slug : 'topic';
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}
