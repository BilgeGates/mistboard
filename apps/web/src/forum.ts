import './forum.css';
import { type AuthUser, buildNav, buildNotice, fetchCurrentUser } from './site-shell.js';

type ForumCategory = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  topicWritePolicy: 'account' | 'admin';
  topicCount: number;
  postCount: number;
  latestPost: {
    topic: {
      id: string;
      slug: string;
      title: string;
    };
    author: ForumAuthor;
    createdAt: string;
  } | null;
};

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
  postCount: number;
  pinned: boolean;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
  lastPostAt: string;
};

type ForumPost = {
  id: string;
  author: ForumAuthor;
  bodyText: string;
  createdAt: string;
  updatedAt: string;
};

type ForumTopicDetail = ForumTopicSummary & {
  posts: ForumPost[];
};

class ForumNotFound extends Error {}

export async function mountForum(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'forum-route');

  const shell = document.createElement('main');
  shell.className = 'site-section forum-shell';
  shell.append(
    pageHeader('Forum', 'Ask questions, share strategy, and follow Mistboard development.'),
  );
  root.append(buildNav(), shell);

  const body = document.createElement('div');
  body.className = 'forum-layout';
  body.append(statusPanel('Loading forum...'));
  shell.append(body);

  const categoryFilter = new URLSearchParams(window.location.search).get('category');
  let categories: ForumCategory[];
  let topics: ForumTopicSummary[];
  let user: AuthUser | null;
  try {
    [categories, topics, user] = await Promise.all([
      fetchForumCategories(),
      fetchForumTopics({ categorySlug: categoryFilter, limit: 25 }),
      fetchCurrentUser().catch(() => null),
    ]);
  } catch {
    body.replaceChildren(buildNotice('Forum unavailable', 'The forum could not load.'));
    return;
  }

  const sidebar = document.createElement('aside');
  sidebar.className = 'forum-sidebar';
  const selectedCategory = categories.find((category) => category.slug === categoryFilter);
  if (selectedCategory) sidebar.append(categoryList(categories, selectedCategory.slug));
  sidebar.append(user ? newTopicForm(categories, user) : signInBox('Sign in to start a topic.'));

  const main = document.createElement('section');
  main.className = 'forum-main';
  if (selectedCategory) {
    main.append(categoryHeaderBox(selectedCategory));
  } else {
    main.append(categoryIndex(categories), sectionTitle('Recent topics'));
  }
  main.append(topicList(topics));

  body.replaceChildren(sidebar, main);
}

export async function mountForumTopic(root: HTMLElement, topicId: string): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'forum-route');

  const shell = document.createElement('main');
  shell.className = 'site-section forum-shell';
  root.append(buildNav(), shell);

  let topic: ForumTopicDetail;
  let user: AuthUser | null;
  try {
    [topic, user] = await Promise.all([
      fetchForumTopic(topicId),
      fetchCurrentUser().catch(() => null),
    ]);
  } catch (err) {
    if (err instanceof ForumNotFound) {
      document.title = 'Topic not found · Mistboard';
      shell.append(buildNotice('Topic not found', 'This forum topic is not available.'));
      return;
    }
    shell.append(buildNotice('Forum unavailable', 'This topic could not load.'));
    return;
  }

  document.title = `${topic.title} · Forum · Mistboard`;
  shell.append(topicHeader(topic));

  const layout = document.createElement('div');
  layout.className = 'forum-layout';

  const sidebar = document.createElement('aside');
  sidebar.className = 'forum-sidebar';
  sidebar.append(topicMetaBox(topic));
  if (user?.accountRole === 'admin') sidebar.append(topicModerationBox(topic));

  const main = document.createElement('section');
  main.className = 'forum-main';
  main.append(postList(topic.posts, user));
  if (topic.locked) main.append(statusPanel('This topic is locked.'));
  else main.append(user ? replyForm(topic.id, user) : signInBox('Sign in to reply.'));

  layout.append(sidebar, main);
  shell.append(layout);
}

function pageHeader(title: string, subtitle: string): HTMLElement {
  const header = document.createElement('header');
  header.className = 'forum-header';
  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = title;
  const sub = document.createElement('p');
  sub.className = 'forum-sub';
  sub.textContent = subtitle;
  header.append(heading, sub);
  return header;
}

function topicHeader(topic: ForumTopicDetail): HTMLElement {
  const header = document.createElement('header');
  header.className = 'forum-header';
  const back = document.createElement('a');
  back.href = '/forum';
  back.className = 'forum-back-link';
  back.textContent = 'Forum';
  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = topic.title;
  const meta = document.createElement('p');
  meta.className = 'forum-sub';
  meta.textContent = `${topic.category.name} · ${topic.postCount} ${topic.postCount === 1 ? 'post' : 'posts'} · last activity ${formatDate(topic.lastPostAt)}`;
  header.append(back, heading, meta);
  return header;
}

function categoryList(
  categories: ForumCategory[],
  selectedSlug: string | null = null,
): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'forum-category-list';
  const all = document.createElement('a');
  all.className = 'forum-category-card';
  all.href = '/forum';
  if (!selectedSlug) all.classList.add('forum-category-card-active');
  const allTitle = document.createElement('strong');
  allTitle.textContent = 'All topics';
  const allCount = document.createElement('p');
  const totalTopics = categories.reduce((sum, category) => sum + category.topicCount, 0);
  allCount.textContent = `${totalTopics} ${totalTopics === 1 ? 'topic' : 'topics'}`;
  all.append(allTitle, allCount);
  wrap.append(all);
  for (const category of categories) {
    const card = document.createElement('a');
    card.className = 'forum-category-card';
    card.href = `/forum?category=${encodeURIComponent(category.slug)}`;
    if (category.slug === selectedSlug) card.classList.add('forum-category-card-active');
    const title = document.createElement('strong');
    title.textContent = category.name;
    const desc = document.createElement('p');
    desc.textContent = category.description;
    const count = document.createElement('p');
    count.textContent = `${category.topicCount} ${category.topicCount === 1 ? 'topic' : 'topics'}`;
    card.append(title, desc, count);
    wrap.append(card);
  }
  return wrap;
}

function categoryIndex(categories: ForumCategory[]): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'forum-category-index';
  const header = document.createElement('div');
  header.className = 'forum-category-index-row forum-category-index-header';
  header.append(
    indexCell('Forum', 'forum-category-index-main'),
    indexCell('Topics', 'forum-category-index-stat'),
    indexCell('Posts', 'forum-category-index-stat'),
    indexCell('Last post', 'forum-category-index-last'),
  );
  wrap.append(header);
  for (const category of categories) wrap.append(categoryIndexRow(category));
  return wrap;
}

function categoryIndexRow(category: ForumCategory): HTMLElement {
  const row = document.createElement('a');
  row.className = 'forum-category-index-row';
  row.href = `/forum?category=${encodeURIComponent(category.slug)}`;

  const main = document.createElement('span');
  main.className = 'forum-category-index-main';
  const title = document.createElement('strong');
  title.textContent = category.name;
  const desc = document.createElement('span');
  desc.textContent = category.description;
  main.append(title, desc);

  row.append(
    main,
    indexCell(formatCount(category.topicCount), 'forum-category-index-stat'),
    indexCell(formatCount(category.postCount), 'forum-category-index-stat'),
    latestPostCell(category),
  );
  return row;
}

function latestPostCell(category: ForumCategory): HTMLElement {
  const cell = document.createElement('span');
  cell.className = 'forum-category-index-last';
  if (!category.latestPost) {
    cell.textContent = 'No posts yet';
    return cell;
  }
  const title = document.createElement('span');
  title.className = 'forum-category-latest-title';
  title.textContent = category.latestPost.topic.title;
  const meta = document.createElement('span');
  meta.textContent = `${authorLabel(category.latestPost.author)} · ${formatDate(category.latestPost.createdAt)}`;
  cell.append(title, meta);
  return cell;
}

function indexCell(text: string, className: string): HTMLElement {
  const cell = document.createElement('span');
  cell.className = className;
  cell.textContent = text;
  return cell;
}

function categoryHeaderBox(category: ForumCategory): HTMLElement {
  const box = document.createElement('section');
  box.className = 'forum-category-header-box';
  const heading = document.createElement('h2');
  heading.textContent = category.name;
  const desc = document.createElement('p');
  desc.textContent = category.description;
  const stats = document.createElement('p');
  stats.textContent = `${category.topicCount} ${category.topicCount === 1 ? 'topic' : 'topics'} · ${category.postCount} ${category.postCount === 1 ? 'post' : 'posts'}`;
  box.append(heading, desc, stats);
  return box;
}

function sectionTitle(text: string): HTMLElement {
  const heading = document.createElement('h2');
  heading.className = 'forum-section-title';
  heading.textContent = text;
  return heading;
}

function topicList(topics: ForumTopicSummary[]): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'forum-topic-list';
  if (topics.length === 0) {
    wrap.append(statusPanel('No forum topics yet.'));
    return wrap;
  }
  for (const topic of topics) wrap.append(topicCard(topic));
  return wrap;
}

function topicCard(topic: ForumTopicSummary): HTMLElement {
  const card = document.createElement('a');
  card.className = 'forum-topic-card';
  card.href = topicHref(topic);
  const flags = document.createElement('div');
  flags.className = 'forum-topic-flags';
  flags.append(pill(topic.category.name));
  if (topic.pinned) flags.append(pill('Pinned'));
  if (topic.locked) flags.append(pill('Locked'));

  const title = document.createElement('strong');
  title.className = 'forum-topic-title';
  title.textContent = topic.title;

  const meta = document.createElement('p');
  meta.className = 'forum-topic-meta';
  meta.textContent = `${authorLabel(topic.author)} · ${topic.postCount} ${topic.postCount === 1 ? 'post' : 'posts'} · ${formatDate(topic.lastPostAt)}`;

  card.append(flags, title, meta);
  return card;
}

function postList(posts: ForumPost[], user: AuthUser | null): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'forum-post-list';
  for (const post of posts) {
    const article = document.createElement('article');
    article.className = 'forum-post';
    const meta = document.createElement('p');
    meta.className = 'forum-post-meta';
    meta.textContent = `${authorLabel(post.author)} · ${formatDate(post.createdAt)}`;
    const body = document.createElement('p');
    body.className = 'forum-post-body';
    body.textContent = post.bodyText;
    article.append(meta, body);
    if (user?.accountRole === 'admin') article.append(postModerationBox(post));
    wrap.append(article);
  }
  return wrap;
}

function newTopicForm(categories: ForumCategory[], user: AuthUser): HTMLElement {
  const form = document.createElement('form');
  form.className = 'forum-form';
  const heading = document.createElement('h2');
  heading.textContent = 'Start a topic';
  const category = document.createElement('select');
  category.name = 'categorySlug';
  let hasSelectedCategory = false;
  for (const optionCategory of categories) {
    const option = document.createElement('option');
    option.value = optionCategory.slug;
    const adminOnly = optionCategory.topicWritePolicy === 'admin';
    const disabled = adminOnly && user.accountRole !== 'admin';
    option.textContent =
      optionCategory.topicWritePolicy === 'admin'
        ? `${optionCategory.name} (admin only)`
        : optionCategory.name;
    option.disabled = disabled;
    if (!disabled && !hasSelectedCategory) {
      option.selected = true;
      hasSelectedCategory = true;
    }
    category.append(option);
  }
  const title = document.createElement('input');
  title.name = 'title';
  title.maxLength = 120;
  title.required = true;
  const body = document.createElement('textarea');
  body.name = 'body';
  body.maxLength = 5000;
  body.required = true;
  const error = errorLine();
  const submit = submitButton('Post topic');
  form.append(
    heading,
    labeled('Category', category),
    labeled('Title', title),
    labeled('Post', body),
    error,
    submit,
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitTopic(form, submit, error);
  });
  return form;
}

function replyForm(topicId: string, _user: AuthUser): HTMLElement {
  const form = document.createElement('form');
  form.className = 'forum-form';
  const heading = document.createElement('h2');
  heading.textContent = 'Reply';
  const body = document.createElement('textarea');
  body.name = 'body';
  body.maxLength = 5000;
  body.required = true;
  const error = errorLine();
  const submit = submitButton('Post reply');
  form.append(heading, labeled('Reply', body), error, submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitReply(topicId, form, submit, error);
  });
  return form;
}

async function submitTopic(
  form: HTMLFormElement,
  submit: HTMLButtonElement,
  error: HTMLElement,
): Promise<void> {
  submit.disabled = true;
  error.textContent = '';
  const data = new FormData(form);
  try {
    const resp = await fetch('/api/forum/topics', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        categorySlug: String(data.get('categorySlug') ?? ''),
        title: String(data.get('title') ?? ''),
        body: String(data.get('body') ?? ''),
      }),
    });
    if (!resp.ok) throw new Error(errorMessageForStatus(resp.status));
    const payload = (await resp.json()) as { topic: ForumTopicDetail };
    window.location.href = topicHref(payload.topic);
  } catch (err) {
    error.textContent = err instanceof Error ? err.message : 'Topic could not be posted.';
  } finally {
    submit.disabled = false;
  }
}

async function submitReply(
  topicId: string,
  form: HTMLFormElement,
  submit: HTMLButtonElement,
  error: HTMLElement,
): Promise<void> {
  submit.disabled = true;
  error.textContent = '';
  const data = new FormData(form);
  try {
    const resp = await fetch(`/api/forum/topics/${encodeURIComponent(topicId)}/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ body: String(data.get('body') ?? '') }),
    });
    if (!resp.ok) throw new Error(errorMessageForStatus(resp.status));
    window.location.reload();
  } catch (err) {
    error.textContent = err instanceof Error ? err.message : 'Reply could not be posted.';
  } finally {
    submit.disabled = false;
  }
}

function labeled(text: string, control: HTMLElement): HTMLElement {
  const label = document.createElement('label');
  const span = document.createElement('span');
  span.textContent = text;
  label.append(span, control);
  return label;
}

function errorLine(): HTMLElement {
  const error = document.createElement('p');
  error.className = 'forum-error';
  return error;
}

function submitButton(text: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'submit';
  button.textContent = text;
  return button;
}

function topicMetaBox(topic: ForumTopicDetail): HTMLElement {
  const box = document.createElement('section');
  box.className = 'forum-auth-box';
  const lines = [
    topic.category.name,
    `${topic.postCount} ${topic.postCount === 1 ? 'post' : 'posts'}`,
    `Started ${formatDate(topic.createdAt)}`,
    `Last activity ${formatDate(topic.lastPostAt)}`,
  ];
  if (topic.locked) lines.push('Locked');
  box.textContent = lines.join(' · ');
  return box;
}

function topicModerationBox(topic: ForumTopicDetail): HTMLElement {
  const box = document.createElement('section');
  box.className = 'forum-auth-box forum-moderation-box';
  const heading = document.createElement('strong');
  heading.textContent = 'Moderation';
  const actions = document.createElement('div');
  actions.className = 'forum-moderation-actions';
  actions.append(
    moderationButton(topic.pinned ? 'Unpin' : 'Pin', () =>
      submitTopicModeration(topic.id, topic.pinned ? 'unpin' : 'pin'),
    ),
    moderationButton(topic.locked ? 'Unlock' : 'Lock', () =>
      submitTopicModeration(topic.id, topic.locked ? 'unlock' : 'lock'),
    ),
    moderationButton('Hide topic', () => submitTopicModeration(topic.id, 'hide'), true),
  );
  box.append(heading, actions);
  return box;
}

function postModerationBox(post: ForumPost): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'forum-moderation-actions forum-post-actions';
  actions.append(moderationButton('Hide post', () => submitPostModeration(post.id), true));
  return actions;
}

function moderationButton(
  text: string,
  submit: () => Promise<void>,
  confirmAction = false,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'forum-moderation-button';
  button.textContent = text;
  button.addEventListener('click', () => {
    if (confirmAction && !window.confirm(`${text}?`)) return;
    button.disabled = true;
    void submit().catch(() => {
      button.disabled = false;
    });
  });
  return button;
}

function signInBox(text: string): HTMLElement {
  const box = document.createElement('section');
  box.className = 'forum-auth-box';
  box.append(document.createTextNode(`${text} `));
  const link = document.createElement('a');
  link.href = '/account?tab=login';
  link.textContent = 'Sign in';
  box.append(link);
  return box;
}

function statusPanel(text: string): HTMLElement {
  const panel = document.createElement('p');
  panel.className = 'forum-auth-box';
  panel.textContent = text;
  return panel;
}

function pill(text: string): HTMLElement {
  const el = document.createElement('span');
  el.className = 'forum-pill';
  el.textContent = text;
  return el;
}

function topicHref(topic: { id: string; slug: string }): string {
  return `/forum/t/${encodeURIComponent(topic.id)}/${encodeURIComponent(topic.slug)}`;
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

function authorLabel(author: ForumAuthor): string {
  return author?.displayName ?? 'Deleted account';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function errorMessageForStatus(status: number): string {
  if (status === 401) return 'Sign in to post.';
  if (status === 403) return 'This category is restricted.';
  if (status === 423) return 'This topic is locked.';
  if (status === 429) return 'You are posting too quickly.';
  if (status >= 500) return 'Forum is unavailable.';
  return 'Check the fields and try again.';
}

async function submitTopicModeration(
  topicId: string,
  action: 'pin' | 'unpin' | 'lock' | 'unlock' | 'hide',
): Promise<void> {
  const resp = await fetch(`/api/forum/topics/${encodeURIComponent(topicId)}/moderation`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!resp.ok) throw new Error(`topic_moderation_failed_${resp.status}`);
  if (action === 'hide') window.location.href = '/forum';
  else window.location.reload();
}

async function submitPostModeration(postId: string): Promise<void> {
  const resp = await fetch(`/api/forum/posts/${encodeURIComponent(postId)}/moderation`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ action: 'hide' }),
  });
  if (!resp.ok) throw new Error(`post_moderation_failed_${resp.status}`);
  const payload = (await resp.json()) as { topicHidden?: boolean };
  if (payload.topicHidden) window.location.href = '/forum';
  else window.location.reload();
}

async function fetchForumCategories(): Promise<ForumCategory[]> {
  const resp = await fetch('/api/forum/categories', { headers: { accept: 'application/json' } });
  if (!resp.ok) throw new Error(`forum_categories_failed_${resp.status}`);
  const data = (await resp.json()) as { categories: ForumCategory[] };
  return data.categories;
}

async function fetchForumTopics(
  options: { categorySlug?: string | null; limit?: number } = {},
): Promise<ForumTopicSummary[]> {
  const params = new URLSearchParams();
  if (options.categorySlug) params.set('category', options.categorySlug);
  if (options.limit) params.set('limit', String(options.limit));
  const resp = await fetch(`/api/forum/topics${params.size ? `?${params}` : ''}`, {
    headers: { accept: 'application/json' },
  });
  if (!resp.ok) throw new Error(`forum_topics_failed_${resp.status}`);
  const data = (await resp.json()) as { topics: ForumTopicSummary[] };
  return data.topics;
}

async function fetchForumTopic(topicId: string): Promise<ForumTopicDetail> {
  const resp = await fetch(`/api/forum/topics/${encodeURIComponent(topicId)}`, {
    headers: { accept: 'application/json' },
  });
  if (resp.status === 404) throw new ForumNotFound();
  if (!resp.ok) throw new Error(`forum_topic_failed_${resp.status}`);
  const data = (await resp.json()) as { topic: ForumTopicDetail };
  return data.topic;
}
