import { buildSiteBox } from './site-box.js';
import './landing-forum-preview.css';

type ForumAuthor = {
  handle: string;
  displayName: string;
} | null;

type ForumCategorySummary = {
  slug: string;
  name: string;
  description: string;
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
      postCount: number;
    };
    author: ForumAuthor;
    createdAt: string;
  } | null;
};

export function buildLandingForumPreview(options: { hydrate?: boolean } = {}): HTMLElement {
  const { box, body } = buildSiteBox({
    title: 'Forum',
    href: '/forum',
    className: 'landing-forum',
  });
  body.append(plainRow('Loading forum.'));
  if (options.hydrate !== false) {
    void hydrateForumPreview(body);
  }
  return box;
}

async function hydrateForumPreview(body: HTMLElement): Promise<void> {
  try {
    const categories = await fetchForumCategories();
    body.replaceChildren();
    if (categories.length === 0) {
      body.append(plainRow('Forum categories are not ready.'));
      return;
    }
    body.append(categoryHeader(), ...categories.slice(0, 5).map(categoryRow));
  } catch {
    body.replaceChildren(plainRow('Forum unavailable.'));
  }
}

function categoryHeader(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'landing-forum-row landing-forum-header';
  row.append(
    headerCell('Forum'),
    headerCell('Topics'),
    headerCell('Posts'),
    headerCell('Last post'),
  );
  return row;
}

function categoryRow(category: ForumCategorySummary): HTMLElement {
  const row = document.createElement('div');
  row.className = 'site-box-row landing-forum-row';

  const main = document.createElement('a');
  main.className = 'landing-forum-row-main';
  main.href = categoryHref(category);
  const title = document.createElement('span');
  title.className = 'landing-forum-row-title';
  title.textContent = category.name;
  const desc = document.createElement('span');
  desc.className = 'landing-forum-row-desc';
  desc.textContent = category.description;
  main.append(title, desc);

  row.append(
    main,
    statCell(category.topicCount),
    statCell(category.postCount),
    latestPostCell(category),
  );
  return row;
}

function headerCell(text: string): HTMLElement {
  const cell = document.createElement('span');
  cell.textContent = text;
  return cell;
}

function statCell(value: number): HTMLElement {
  const cell = document.createElement('span');
  cell.className = 'landing-forum-row-stat';
  cell.textContent = formatCount(value);
  return cell;
}

function latestPostCell(category: ForumCategorySummary): HTMLElement {
  if (!category.latestPost) {
    const cell = document.createElement('span');
    cell.className = 'landing-forum-row-last';
    cell.textContent = 'No posts yet';
    return cell;
  }
  const cell = document.createElement('a');
  cell.className = 'landing-forum-row-last';
  cell.href = postHref(
    category.latestPost.topic,
    category.latestPost.post.id,
    pageForPostCount(category.latestPost.topic.postCount),
  );
  const title = document.createElement('span');
  title.className = 'landing-forum-row-last-title';
  title.textContent = category.latestPost.topic.title;
  const meta = document.createElement('span');
  meta.className = 'landing-forum-row-meta';
  meta.textContent = `${authorLabel(category.latestPost.author)} · ${formatDate(category.latestPost.createdAt)}`;
  cell.append(title, meta);
  return cell;
}

function plainRow(text: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'site-box-row';
  const label = document.createElement('span');
  label.className = 'site-box-row-label';
  label.textContent = text;
  row.append(label);
  return row;
}

function authorLabel(author: ForumAuthor): string {
  return author?.displayName ?? 'Deleted account';
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function categoryHref(category: { slug: string }): string {
  return `/forum/${encodeURIComponent(category.slug)}`;
}

const postPageSize = 25;

function topicHref(topic: { id: string; slug: string }): string {
  return `/forum/t/${encodeURIComponent(topic.id)}/${encodeURIComponent(topic.slug)}`;
}

function topicPageHref(topic: { id: string; slug: string }, page: number): string {
  const href = topicHref(topic);
  return page > 1 ? `${href}?page=${page}` : href;
}

function postHref(topic: { id: string; slug: string }, postId: string, page = 1): string {
  return `${topicPageHref(topic, page)}#${postDomId(postId)}`;
}

function postDomId(postId: string): string {
  return `post_${postId}`;
}

function pageForPostCount(postCount: number): number {
  return Math.max(1, Math.ceil(postCount / postPageSize));
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso));
}

async function fetchForumCategories(): Promise<ForumCategorySummary[]> {
  const resp = await fetch('/api/forum/categories', {
    headers: { accept: 'application/json' },
  });
  if (!resp.ok) throw new Error(`forum_preview_failed_${resp.status}`);
  const data = (await resp.json()) as { categories: ForumCategorySummary[] };
  return data.categories;
}
