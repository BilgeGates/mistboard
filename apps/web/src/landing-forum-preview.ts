import { buildSiteBox } from './site-box.js';
import './landing-forum-preview.css';

type ForumAuthor = {
  handle: string;
  displayName: string;
} | null;

type ForumTopicSummary = {
  id: string;
  slug: string;
  title: string;
  category: {
    slug: string;
    name: string;
  };
  author: ForumAuthor;
  latestPost: {
    post: {
      id: string;
    };
    author: ForumAuthor;
    createdAt: string;
  } | null;
  postCount: number;
  lastPostAt: string;
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
    const topics = await fetchForumTopics();
    body.replaceChildren();
    if (topics.length === 0) {
      body.append(plainRow('No forum topics yet.'));
      return;
    }
    body.append(topicHeader(), ...topics.map(topicRow));
  } catch {
    body.replaceChildren(plainRow('Forum unavailable.'));
  }
}

function topicHeader(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'landing-forum-row landing-forum-header';
  row.append(headerCell('Topic'), headerCell('Replies'), headerCell('Last post'));
  return row;
}

function topicRow(topic: ForumTopicSummary): HTMLElement {
  const row = document.createElement('div');
  row.className = 'site-box-row landing-forum-row';

  const main = document.createElement('a');
  main.className = 'landing-forum-row-main';
  main.href = topicHref(topic);
  const title = document.createElement('span');
  title.className = 'landing-forum-row-title';
  title.textContent = topic.title;
  const category = document.createElement('span');
  category.className = 'landing-forum-row-category';
  category.textContent = topic.category.name;
  main.append(title, category);

  row.append(main, statCell(replyCount(topic)), latestPostCell(topic));
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

function latestPostCell(topic: ForumTopicSummary): HTMLElement {
  const cell = document.createElement('span');
  cell.className = 'landing-forum-row-last';
  const title = document.createElement('a');
  title.className = 'landing-forum-row-last-title';
  title.href = topic.latestPost
    ? postHref(topic, topic.latestPost.post.id, pageForPostCount(topic.postCount))
    : topicHref(topic);
  title.textContent = topic.latestPost ? 'Latest reply' : 'Opening post';
  const meta = document.createElement('span');
  meta.className = 'landing-forum-row-meta';
  appendLatestPostMeta(
    meta,
    topic.latestPost?.author ?? topic.author,
    topic.latestPost?.createdAt ?? topic.lastPostAt,
  );
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

function appendLatestPostMeta(parent: HTMLElement, author: ForumAuthor, createdAt: string): void {
  parent.append(
    document.createTextNode('by '),
    authorProfileLink(author),
    document.createTextNode(` · ${formatDate(createdAt)}`),
  );
}

function authorProfileLink(author: ForumAuthor): HTMLElement {
  if (!author) {
    const span = document.createElement('span');
    span.textContent = authorLabel(author);
    return span;
  }
  const link = document.createElement('a');
  link.className = 'landing-forum-row-author';
  link.href = `/@/${encodeURIComponent(author.handle)}`;
  link.textContent = author.displayName;
  return link;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
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

function replyCount(topic: ForumTopicSummary): number {
  return Math.max(0, topic.postCount - 1);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso));
}

async function fetchForumTopics(): Promise<ForumTopicSummary[]> {
  const resp = await fetch('/api/forum/topics?limit=5&offset=0', {
    headers: { accept: 'application/json' },
  });
  if (!resp.ok) throw new Error(`forum_preview_failed_${resp.status}`);
  const data = (await resp.json()) as { topics: ForumTopicSummary[] };
  return data.topics;
}
