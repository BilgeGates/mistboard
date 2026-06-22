import './landing-forum-preview.css';
import { buildSiteBox } from './site-box.js';

type ForumTopicSummary = {
  id: string;
  slug: string;
  title: string;
  category: {
    name: string;
  };
  postCount: number;
};

export function buildLandingForumPreview(options: { hydrate?: boolean } = {}): HTMLElement {
  const { box, body } = buildSiteBox({
    title: 'Forum',
    href: '/forum',
    className: 'landing-forum',
  });
  body.append(plainRow('Loading forum topics.'));
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
    body.append(...topics.map(topicRow));
  } catch {
    body.replaceChildren(plainRow('Forum unavailable.'));
  }
}

function topicRow(topic: ForumTopicSummary): HTMLElement {
  const row = document.createElement('a');
  row.className = 'site-box-row landing-forum-row';
  row.href = `/forum/t/${encodeURIComponent(topic.id)}/${encodeURIComponent(topic.slug)}`;
  const title = document.createElement('span');
  title.className = 'landing-forum-row-title';
  title.textContent = topic.title;
  const meta = document.createElement('span');
  meta.className = 'landing-forum-row-meta';
  meta.textContent = `${topic.category.name} · ${topic.postCount}`;
  row.append(title, meta);
  return row;
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

async function fetchForumTopics(): Promise<ForumTopicSummary[]> {
  const resp = await fetch('/api/forum/topics?limit=5', {
    headers: { accept: 'application/json' },
  });
  if (!resp.ok) throw new Error(`forum_preview_failed_${resp.status}`);
  const data = (await resp.json()) as { topics: ForumTopicSummary[] };
  return data.topics;
}
