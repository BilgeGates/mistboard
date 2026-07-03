import { buildSiteBox } from './site-box.js';
import './landing-forum-preview.css';

type ForumAuthor = {
  handle: string;
  displayName: string;
} | null;

type ForumLatestPost = {
  post: {
    id: string;
    page: number;
    snippet: string;
  };
  topic: {
    id: string;
    slug: string;
    title: string;
  };
  author: ForumAuthor;
  createdAt: string;
};

export function buildLandingForumPreview(options: { hydrate?: boolean } = {}): HTMLElement {
  const { box, body } = buildSiteBox({
    title: 'Latest forum posts',
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
    const posts = await fetchLatestPosts();
    body.replaceChildren();
    if (posts.length === 0) {
      body.append(plainRow('No forum posts yet.'));
      return;
    }
    body.append(...posts.map(postRow));
  } catch {
    body.replaceChildren(plainRow('Forum unavailable.'));
  }
}

// One line per post (opening posts and replies alike), playstrategy-style: the
// whole row is a single link to the post, showing topic, author, and the first
// words of the text on one ellipsized line.
function postRow(entry: ForumLatestPost): HTMLElement {
  const row = document.createElement('a');
  row.className = 'site-box-row landing-forum-post';
  row.href = postHref(entry);
  row.append(
    span('landing-forum-post-topic', entry.topic.title),
    ' ',
    span('landing-forum-post-author', entry.author?.displayName ?? 'Deleted account'),
    ' ',
    span('landing-forum-post-text', entry.post.snippet),
  );
  return row;
}

function span(className: string, text: string): HTMLElement {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
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

function postHref(entry: ForumLatestPost): string {
  const topicHref = `/forum/t/${encodeURIComponent(entry.topic.id)}/${encodeURIComponent(
    entry.topic.slug,
  )}`;
  const page = entry.post.page > 1 ? `?page=${entry.post.page}` : '';
  return `${topicHref}${page}#post_${entry.post.id}`;
}

async function fetchLatestPosts(): Promise<ForumLatestPost[]> {
  const resp = await fetch('/api/forum/latest-posts?limit=8', {
    headers: { accept: 'application/json' },
  });
  if (!resp.ok) throw new Error(`forum_preview_failed_${resp.status}`);
  const data = (await resp.json()) as { posts: ForumLatestPost[] };
  return data.posts;
}
