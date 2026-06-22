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

const topicListPageSize = 25;
const postPageSize = 25;
const forumTopicTitleMaxLength = 120;
const forumPostBodyMaxLength = 5000;
const forumModerationReasonMaxLength = 240;

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

  const query = new URLSearchParams(window.location.search);
  const categoryFilter = categorySlugFromPath(window.location.pathname) ?? query.get('category');
  const searchQuery = searchQueryFromParam(query.get('q'));
  const topicPage = pageFromParam(query.get('page'));
  const topicOffset = (topicPage - 1) * topicListPageSize;
  let categories: ForumCategory[];
  let topics: ForumTopicSummary[];
  let user: AuthUser | null;
  try {
    [categories, topics, user] = await Promise.all([
      fetchForumCategories(),
      searchQuery
        ? searchForumTopics({
            query: searchQuery,
            limit: topicListPageSize + 1,
            offset: topicOffset,
          })
        : fetchForumTopics({
            categorySlug: categoryFilter,
            limit: topicListPageSize + 1,
            offset: topicOffset,
          }),
      fetchCurrentUser().catch(() => null),
    ]);
  } catch {
    body.replaceChildren(buildNotice('Forum unavailable', 'The forum could not load.'));
    return;
  }
  const hasNextPage = topics.length > topicListPageSize;
  const visibleTopics = topics.slice(0, topicListPageSize);

  const sidebar = document.createElement('aside');
  sidebar.className = 'forum-sidebar';
  sidebar.append(forumSearchForm(searchQuery));
  const selectedCategory = searchQuery
    ? undefined
    : categories.find((category) => category.slug === categoryFilter);
  if (selectedCategory) sidebar.append(categoryList(categories, selectedCategory.slug));
  sidebar.append(
    user
      ? newTopicForm(categories, user, selectedCategory?.slug ?? null)
      : signInBox('Sign in to start a topic.'),
  );

  const main = document.createElement('section');
  main.className = 'forum-main';
  if (searchQuery) {
    main.append(searchHeaderBox(searchQuery));
  } else if (selectedCategory) {
    main.append(categoryHeaderBox(selectedCategory));
  } else {
    main.append(categoryIndex(categories), sectionTitle('Recent topics'));
  }
  const needsTopicPager = topicPage > 1 || hasNextPage;
  const topicPageOptions = {
    categorySlug: searchQuery ? null : categoryFilter,
    searchQuery,
    page: topicPage,
    hasNext: hasNextPage,
    hasPrevious: topicPage > 1,
  };
  if (needsTopicPager) main.append(topicPager(topicPageOptions));
  main.append(
    topicList(
      visibleTopics,
      topicPage > 1
        ? 'No forum topics on this page.'
        : searchQuery
          ? 'No forum topics matched.'
          : undefined,
      { showCategory: !selectedCategory },
    ),
  );
  if (needsTopicPager) main.append(topicPager(topicPageOptions));

  body.replaceChildren(sidebar, main);
}

export async function mountForumTopic(root: HTMLElement, topicId: string): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'forum-route');

  const shell = document.createElement('main');
  shell.className = 'site-section forum-shell';
  root.append(buildNav(), shell);

  const query = new URLSearchParams(window.location.search);
  const postPage = pageFromParam(query.get('page'));
  const postOffset = (postPage - 1) * postPageSize;
  let topic: ForumTopicDetail;
  let categories: ForumCategory[];
  let user: AuthUser | null;
  try {
    [topic, categories, user] = await Promise.all([
      fetchForumTopic(topicId, { limit: postPageSize + 1, offset: postOffset }),
      fetchForumCategories().catch(() => []),
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
  shell.append(topicHeader(topic, user));
  const hasNextPostPage = topic.posts.length > postPageSize;
  const visiblePosts = topic.posts.slice(0, postPageSize);

  const layout = document.createElement('div');
  layout.className = 'forum-layout';

  const sidebar = document.createElement('aside');
  sidebar.className = 'forum-sidebar';
  sidebar.append(forumSearchForm(null));
  if (categories.length > 0) sidebar.append(categoryList(categories, topic.category.slug));
  sidebar.append(topicMetaBox(topic));
  if (user?.accountRole === 'admin') sidebar.append(topicModerationBox(topic, categories));

  const main = document.createElement('section');
  main.className = 'forum-main';
  const needsPostPager = postPage > 1 || hasNextPostPage;
  const postPageOptions = {
    topic,
    page: postPage,
    hasNext: hasNextPostPage,
    hasPrevious: postPage > 1,
  };
  if (needsPostPager) main.append(postPager(postPageOptions));
  main.append(
    postList(
      topic,
      visiblePosts,
      user,
      postPage > 1 ? 'No forum posts on this page.' : undefined,
      postPage,
    ),
  );
  if (needsPostPager) main.append(postPager(postPageOptions));
  if (topic.locked) main.append(statusPanel('This topic is locked.'));
  else main.append(user ? replyForm(topic, user) : signInBox('Sign in to reply.'));

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

function topicHeader(topic: ForumTopicDetail, user: AuthUser | null): HTMLElement {
  const header = document.createElement('header');
  header.className = 'forum-header';
  const breadcrumbs = document.createElement('nav');
  breadcrumbs.className = 'forum-breadcrumbs';
  breadcrumbs.setAttribute('aria-label', 'Forum breadcrumbs');
  const forum = document.createElement('a');
  forum.href = '/forum';
  forum.textContent = 'Forum';
  const separator = document.createElement('span');
  separator.className = 'forum-breadcrumb-separator';
  separator.setAttribute('aria-hidden', 'true');
  separator.textContent = '/';
  const category = document.createElement('a');
  category.href = categoryHref(topic.category);
  category.textContent = topic.category.name;
  breadcrumbs.append(forum, separator, category);
  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = topic.title;
  const titleRow = document.createElement('div');
  titleRow.className = 'forum-topic-title-row';
  titleRow.append(heading);
  if (canEditTopic(topic, user) && !topic.locked) titleRow.append(topicEditButton(topic, heading));
  const meta = document.createElement('p');
  meta.className = 'forum-sub';
  meta.textContent = `${topic.category.name} · ${topic.postCount} ${topic.postCount === 1 ? 'post' : 'posts'} · last activity ${formatDate(topic.lastPostAt)}`;
  header.append(breadcrumbs, titleRow, meta);
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
    card.href = categoryHref(category);
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
  const row = document.createElement('div');
  row.className = 'forum-category-index-row';

  const main = document.createElement('a');
  main.className = 'forum-category-index-main';
  main.href = categoryHref(category);
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
  if (!category.latestPost) {
    const cell = document.createElement('span');
    cell.className = 'forum-category-index-last';
    cell.textContent = 'No posts yet';
    return cell;
  }
  const cell = document.createElement('a');
  cell.className = 'forum-category-index-last';
  cell.href = postHref(
    category.latestPost.topic,
    category.latestPost.post.id,
    pageForPostCount(category.latestPost.topic.postCount),
  );
  const title = document.createElement('span');
  title.className = 'forum-category-latest-title';
  title.textContent = category.latestPost.topic.title;
  const meta = document.createElement('span');
  meta.textContent = latestPostMetaText(category.latestPost.author, category.latestPost.createdAt);
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

function searchHeaderBox(query: string): HTMLElement {
  const box = document.createElement('section');
  box.className = 'forum-category-header-box';
  const heading = document.createElement('h2');
  heading.textContent = 'Search results';
  const copy = document.createElement('p');
  copy.textContent = `"${query}"`;
  box.append(heading, copy);
  return box;
}

function sectionTitle(text: string): HTMLElement {
  const heading = document.createElement('h2');
  heading.className = 'forum-section-title';
  heading.textContent = text;
  return heading;
}

function topicList(
  topics: ForumTopicSummary[],
  emptyText = 'No forum topics yet.',
  options: { showCategory?: boolean } = {},
): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'forum-topic-list';
  if (topics.length === 0) {
    wrap.className = 'forum-topic-list-empty';
    wrap.append(statusPanel(emptyText));
    return wrap;
  }
  wrap.append(topicListHeader());
  for (const topic of topics) wrap.append(topicRow(topic, { showCategory: options.showCategory }));
  return wrap;
}

function topicListHeader(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'forum-topic-row forum-topic-list-header';
  row.append(
    indexCell('Topic', 'forum-topic-row-main'),
    indexCell('Replies', 'forum-topic-row-replies'),
    indexCell('Last post', 'forum-topic-row-latest'),
  );
  return row;
}

function topicPager(options: {
  categorySlug: string | null;
  searchQuery: string | null;
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
}): HTMLElement {
  return forumPager({
    ariaLabel: 'Forum topic pages',
    page: options.page,
    hasPrevious: options.hasPrevious,
    hasNext: options.hasNext,
    hrefForPage: (page) =>
      forumHref({ categorySlug: options.categorySlug, searchQuery: options.searchQuery }, page),
  });
}

function postPager(options: {
  topic: { id: string; slug: string };
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
}): HTMLElement {
  return forumPager({
    ariaLabel: 'Forum post pages',
    page: options.page,
    hasPrevious: options.hasPrevious,
    hasNext: options.hasNext,
    hrefForPage: (page) => topicPageHref(options.topic, page),
  });
}

function forumPager(options: {
  ariaLabel: string;
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
  hrefForPage: (page: number) => string;
}): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'forum-pager';
  nav.setAttribute('aria-label', options.ariaLabel);
  if (options.page > 2) nav.append(pagerLink('1', options.hrefForPage(1)));
  if (options.page > 3) nav.append(pagerEllipsis());
  if (options.hasPrevious) {
    nav.append(pagerLink(String(options.page - 1), options.hrefForPage(options.page - 1)));
  }
  const current = document.createElement('span');
  current.className = 'forum-pager-current';
  current.setAttribute('aria-current', 'page');
  current.textContent = String(options.page);
  nav.append(current);
  if (options.hasNext)
    nav.append(pagerLink(String(options.page + 1), options.hrefForPage(options.page + 1)));
  return nav;
}

function pagerLink(text: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'forum-pager-link';
  link.href = href;
  link.textContent = text;
  return link;
}

function pagerEllipsis(): HTMLElement {
  const ellipsis = document.createElement('span');
  ellipsis.className = 'forum-pager-ellipsis';
  ellipsis.setAttribute('aria-hidden', 'true');
  ellipsis.textContent = '...';
  return ellipsis;
}

function topicRow(topic: ForumTopicSummary, options: { showCategory?: boolean } = {}): HTMLElement {
  const row = document.createElement('article');
  row.className = 'forum-topic-row';

  const main = document.createElement('div');
  main.className = 'forum-topic-row-main';
  const flags = document.createElement('div');
  flags.className = 'forum-topic-flags';
  if (options.showCategory) flags.append(pill(topic.category.name));
  if (topic.pinned) flags.append(pill('Pinned'));
  if (topic.locked) flags.append(pill('Locked'));

  const title = document.createElement('a');
  title.className = 'forum-topic-title';
  title.href = topicHref(topic);
  title.textContent = topic.title;

  const meta = document.createElement('p');
  meta.className = 'forum-topic-meta';
  meta.append(
    document.createTextNode('Started by '),
    authorProfileLink(topic.author, 'forum-topic-author'),
    document.createTextNode(` · ${formatDate(topic.createdAt)}`),
  );
  if (flags.childElementCount > 0) main.append(flags);
  main.append(title, meta);

  const replies = document.createElement('span');
  replies.className = 'forum-topic-row-replies';
  replies.textContent = formatCount(replyCount(topic));

  const latestCell = document.createElement('span');
  latestCell.className = 'forum-topic-row-latest';
  if (topic.latestPost) {
    const latest = document.createElement('a');
    latest.className = 'forum-topic-latest-link';
    latest.href = postHref(topic, topic.latestPost.post.id, pageForPostCount(topic.postCount));
    latest.textContent = latestPostMetaText(topic.latestPost.author, topic.latestPost.createdAt);
    latestCell.append(latest);
  } else {
    latestCell.textContent = formatDate(topic.lastPostAt);
  }

  row.append(main, replies, latestCell);
  return row;
}

function replyCount(topic: ForumTopicSummary): number {
  return Math.max(0, topic.postCount - 1);
}

function topicEditButton(topic: ForumTopicDetail, heading: HTMLElement): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'forum-topic-edit';
  button.textContent = 'Edit title';
  button.setAttribute('aria-label', `Edit ${topic.title} title`);
  button.addEventListener('click', () => {
    showTopicEditForm(topic, heading);
  });
  return button;
}

function showTopicEditForm(topic: ForumTopicDetail, heading: HTMLElement): void {
  const header = heading.closest('.forum-header');
  if (!header || header.querySelector('.forum-topic-edit-form')) return;

  const form = document.createElement('form');
  form.className = 'forum-topic-edit-form';
  const input = document.createElement('input');
  input.name = 'title';
  input.maxLength = forumTopicTitleMaxLength;
  input.required = true;
  input.value = topic.title;
  const error = errorLine();
  const actions = document.createElement('div');
  actions.className = 'forum-post-edit-actions';
  const save = submitButton('Save title');
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  actions.append(save, cancel);
  form.append(labeled('Title', input), error, actions);

  const close = () => {
    form.remove();
  };
  cancel.addEventListener('click', close);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitTopicEdit(topic, form, save, error)
      .then((updated) => {
        topic.title = updated.title;
        topic.slug = updated.slug;
        topic.updatedAt = updated.updatedAt;
        heading.textContent = updated.title;
        document.title = `${updated.title} · Forum · Mistboard`;
        refreshTopicLinks(updated);
        window.history.replaceState(null, '', topicHref(updated));
        close();
      })
      .catch(() => undefined);
  });

  heading.closest('.forum-topic-title-row')?.after(form);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

async function submitTopicEdit(
  topic: ForumTopicDetail,
  form: HTMLFormElement,
  submit: HTMLButtonElement,
  error: HTMLElement,
): Promise<ForumTopicDetail> {
  submit.disabled = true;
  error.textContent = '';
  const data = new FormData(form);
  try {
    const resp = await fetch(`/api/forum/topics/${encodeURIComponent(topic.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ title: String(data.get('title') ?? '') }),
    });
    if (!resp.ok) throw new Error(errorMessageForTopicEditStatus(resp.status));
    const payload = (await resp.json()) as { topic: ForumTopicDetail };
    return payload.topic;
  } catch (err) {
    error.textContent = err instanceof Error ? err.message : 'Topic title could not be edited.';
    throw err;
  } finally {
    submit.disabled = false;
  }
}

function refreshTopicLinks(topic: { id: string; slug: string }): void {
  const prefix = `/forum/t/${encodeURIComponent(topic.id)}/`;
  const nextBase = topicHref(topic);
  for (const link of document.querySelectorAll<HTMLAnchorElement>(`a[href^="${prefix}"]`)) {
    const current = new URL(link.getAttribute('href') ?? '', window.location.origin);
    link.setAttribute('href', `${nextBase}${current.search}${current.hash}`);
  }
}

function postList(
  topic: ForumTopicDetail,
  posts: ForumPost[],
  user: AuthUser | null,
  emptyText = 'No forum posts yet.',
  page = 1,
): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'forum-post-list';
  if (posts.length === 0) {
    wrap.append(statusPanel(emptyText));
    return wrap;
  }
  for (const [index, post] of posts.entries()) {
    const postNumber = (page - 1) * postPageSize + index + 1;
    const article = document.createElement('article');
    article.className = 'forum-post';
    article.id = postDomId(post.id);
    const author = postAuthorRail(post.author);
    const content = document.createElement('div');
    content.className = 'forum-post-content';
    const meta = document.createElement('p');
    meta.className = 'forum-post-meta';
    const body = document.createElement('div');
    body.className = 'forum-post-body';
    renderPostBodyInto(body, post.bodyText);
    const edited = postEditedLabel(post);
    meta.append(postPermalink(topic, post, page, `#${postNumber}`));
    meta.append(document.createTextNode(` · ${formatDate(post.createdAt)}`));
    if (user && !topic.locked) {
      meta.append(document.createTextNode(' · '), postQuoteButton(post));
    }
    if (canEditPost(post, user) && !topic.locked) {
      meta.append(document.createTextNode(' · '), postEditButton(post, body, edited));
    }
    meta.append(edited);
    content.append(meta, body);
    if (user?.accountRole === 'admin') content.append(postModerationBox(post));
    article.append(author, content);
    wrap.append(article);
  }
  return wrap;
}

function postAuthorRail(author: ForumAuthor): HTMLElement {
  const rail = document.createElement('aside');
  rail.className = 'forum-post-author';
  rail.append(authorProfileLink(author, 'forum-post-author-name'));
  if (author) {
    const handle = document.createElement('span');
    handle.className = 'forum-post-author-handle';
    handle.textContent = `@${author.handle}`;
    rail.append(handle);
  }
  return rail;
}

function postPermalink(
  topic: { id: string; slug: string },
  post: ForumPost,
  page = 1,
  text = 'Link',
): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'forum-post-permalink';
  link.href = postHref(topic, post.id, page);
  link.textContent = text;
  return link;
}

function postQuoteButton(post: ForumPost): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'forum-post-quote';
  button.textContent = 'Quote';
  button.setAttribute('aria-label', `Quote ${authorLabel(post.author)}`);
  button.addEventListener('click', () => {
    insertPostQuote(post);
  });
  return button;
}

function postEditButton(
  post: ForumPost,
  body: HTMLElement,
  edited: HTMLElement,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'forum-post-edit';
  button.textContent = 'Edit';
  button.setAttribute('aria-label', `Edit ${authorLabel(post.author)} post`);
  button.addEventListener('click', () => {
    showPostEditForm(post, body, edited);
  });
  return button;
}

function showPostEditForm(post: ForumPost, body: HTMLElement, edited: HTMLElement): void {
  const article = body.closest('.forum-post');
  if (!article || article.querySelector('.forum-post-edit-form')) return;

  const form = document.createElement('form');
  form.className = 'forum-post-edit-form';
  const textarea = document.createElement('textarea');
  textarea.name = 'body';
  textarea.maxLength = forumPostBodyMaxLength;
  textarea.required = true;
  textarea.value = post.bodyText;
  const error = errorLine();
  const actions = document.createElement('div');
  actions.className = 'forum-post-edit-actions';
  const save = submitButton('Save');
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  actions.append(save, cancel);
  form.append(textarea, error, actions);

  const close = () => {
    form.remove();
    body.hidden = false;
  };
  cancel.addEventListener('click', close);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitPostEdit(post, form, save, error)
      .then((updated) => {
        post.bodyText = updated.bodyText;
        post.updatedAt = updated.updatedAt;
        renderPostBodyInto(body, updated.bodyText);
        updatePostEditedLabel(edited, post);
        close();
      })
      .catch(() => undefined);
  });

  body.hidden = true;
  body.after(form);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

async function submitPostEdit(
  post: ForumPost,
  form: HTMLFormElement,
  submit: HTMLButtonElement,
  error: HTMLElement,
): Promise<ForumPost> {
  submit.disabled = true;
  error.textContent = '';
  const data = new FormData(form);
  try {
    const resp = await fetch(`/api/forum/posts/${encodeURIComponent(post.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ body: String(data.get('body') ?? '') }),
    });
    if (!resp.ok) throw new Error(errorMessageForPostEditStatus(resp.status));
    const payload = (await resp.json()) as { post: ForumPost };
    return payload.post;
  } catch (err) {
    error.textContent = err instanceof Error ? err.message : 'Post could not be edited.';
    throw err;
  } finally {
    submit.disabled = false;
  }
}

function postEditedLabel(post: ForumPost): HTMLElement {
  const label = document.createElement('span');
  label.className = 'forum-post-edited';
  updatePostEditedLabel(label, post);
  return label;
}

function updatePostEditedLabel(label: HTMLElement, post: ForumPost): void {
  const edited = post.updatedAt !== post.createdAt;
  label.hidden = !edited;
  label.textContent = edited ? ` · edited ${formatDate(post.updatedAt)}` : '';
}

function insertPostQuote(post: ForumPost): void {
  const textarea = document.querySelector<HTMLTextAreaElement>(
    '.forum-reply-form textarea[name="body"]',
  );
  if (!textarea) return;
  const quote = quoteText(post);
  const prefix = textarea.value.trim().length > 0 ? `${textarea.value.trimEnd()}\n\n` : '';
  const nextValue = `${prefix}${quote}`;
  const maxLength = textarea.maxLength > 0 ? textarea.maxLength : forumPostBodyMaxLength;
  textarea.value = nextValue.slice(0, maxLength);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

function quoteText(post: ForumPost): string {
  const lines = post.bodyText.split(/\r?\n/).map((line) => `> ${line}`);
  return `> ${authorLabel(post.author)} wrote:\n${lines.join('\n')}\n\n`;
}

function renderPostBodyInto(body: HTMLElement, text: string): void {
  body.replaceChildren(...postBodyNodes(text));
}

function postBodyNodes(text: string): HTMLElement[] {
  const nodes: HTMLElement[] = [];
  let paragraphLines: string[] = [];
  let quoteLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const paragraph = document.createElement('p');
    paragraph.className = 'forum-post-paragraph';
    appendLinkedText(paragraph, paragraphLines.join('\n'));
    nodes.push(paragraph);
    paragraphLines = [];
  };
  const flushQuote = () => {
    if (quoteLines.length === 0) return;
    const quote = document.createElement('blockquote');
    quote.className = 'forum-post-quote-block';
    appendLinkedText(quote, quoteLines.join('\n'));
    nodes.push(quote);
    quoteLines = [];
  };

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('>')) {
      flushParagraph();
      quoteLines.push(line.replace(/^>\s?/, ''));
      continue;
    }
    flushQuote();
    if (line.trim().length === 0 && paragraphLines.length === 0) continue;
    paragraphLines.push(line);
  }

  flushQuote();
  flushParagraph();
  return nodes;
}

function appendLinkedText(parent: HTMLElement, text: string): void {
  const urlPattern = /\bhttps?:\/\/[^\s<>"']+/gi;
  let cursor = 0;
  for (const match of text.matchAll(urlPattern)) {
    const rawUrl = match[0];
    const start = match.index ?? 0;
    const { urlText, trailingText } = trimLinkedUrl(rawUrl);
    if (start > cursor) parent.append(document.createTextNode(text.slice(cursor, start)));
    const link = forumPostLink(urlText);
    parent.append(link ?? document.createTextNode(urlText));
    if (trailingText) parent.append(document.createTextNode(trailingText));
    cursor = start + rawUrl.length;
  }
  if (cursor < text.length) parent.append(document.createTextNode(text.slice(cursor)));
}

function trimLinkedUrl(rawUrl: string): { urlText: string; trailingText: string } {
  let urlText = rawUrl;
  let trailingText = '';
  while (/[),.;:!?]/.test(urlText.at(-1) ?? '')) {
    trailingText = `${urlText.at(-1)}${trailingText}`;
    urlText = urlText.slice(0, -1);
  }
  return { urlText, trailingText };
}

function forumPostLink(urlText: string): HTMLAnchorElement | null {
  try {
    const url = new URL(urlText);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const link = document.createElement('a');
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'nofollow noopener noreferrer';
    link.textContent = urlText;
    return link;
  } catch {
    return null;
  }
}

function canEditPost(post: ForumPost, user: AuthUser | null): boolean {
  return Boolean(user && (user.accountRole === 'admin' || post.author?.handle === user.handle));
}

function canEditTopic(topic: ForumTopicDetail, user: AuthUser | null): boolean {
  return Boolean(user && (user.accountRole === 'admin' || topic.author?.handle === user.handle));
}

function newTopicForm(
  categories: ForumCategory[],
  user: AuthUser,
  selectedCategorySlug: string | null = null,
): HTMLElement {
  const form = document.createElement('form');
  form.className = 'forum-form';
  const heading = document.createElement('h2');
  heading.textContent = 'Start a topic';
  const category = document.createElement('select');
  category.name = 'categorySlug';
  const availableCategories = categories.filter(
    (optionCategory) => optionCategory.topicWritePolicy !== 'admin' || user.accountRole === 'admin',
  );
  const defaultCategory =
    availableCategories.find((optionCategory) => optionCategory.slug === selectedCategorySlug) ??
    availableCategories[0] ??
    null;
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
    option.selected = optionCategory.slug === defaultCategory?.slug;
    category.append(option);
  }
  const title = document.createElement('input');
  title.name = 'title';
  title.maxLength = forumTopicTitleMaxLength;
  title.required = true;
  const body = document.createElement('textarea');
  body.name = 'body';
  body.maxLength = forumPostBodyMaxLength;
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

function forumSearchForm(query: string | null): HTMLElement {
  const form = document.createElement('form');
  form.className = 'forum-search-form';
  form.action = '/forum';
  form.method = 'get';
  const input = document.createElement('input');
  input.type = 'search';
  input.name = 'q';
  input.maxLength = 120;
  input.placeholder = 'Search forum';
  input.autocomplete = 'off';
  input.value = query ?? '';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Search';
  form.append(input, submit);
  if (query) {
    const clear = document.createElement('a');
    clear.className = 'forum-search-clear';
    clear.href = '/forum';
    clear.textContent = 'Clear';
    form.append(clear);
  }
  return form;
}

function replyForm(topic: ForumTopicDetail, _user: AuthUser): HTMLElement {
  const form = document.createElement('form');
  form.className = 'forum-form forum-reply-form';
  const heading = document.createElement('h2');
  heading.textContent = 'Reply';
  const body = document.createElement('textarea');
  body.name = 'body';
  body.maxLength = forumPostBodyMaxLength;
  body.required = true;
  const error = errorLine();
  const submit = submitButton('Post reply');
  form.append(heading, labeled('Reply', body), error, submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitReply(topic, form, submit, error);
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
  topic: ForumTopicDetail,
  form: HTMLFormElement,
  submit: HTMLButtonElement,
  error: HTMLElement,
): Promise<void> {
  submit.disabled = true;
  error.textContent = '';
  const data = new FormData(form);
  try {
    const resp = await fetch(`/api/forum/topics/${encodeURIComponent(topic.id)}/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ body: String(data.get('body') ?? '') }),
    });
    if (!resp.ok) throw new Error(errorMessageForStatus(resp.status));
    const payload = (await resp.json()) as { post: ForumPost };
    window.location.href = postHref(topic, payload.post.id, pageForPostCount(topic.postCount + 1));
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

function topicModerationBox(topic: ForumTopicDetail, categories: ForumCategory[]): HTMLElement {
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
    moderationButton('Hide topic', (reason) => submitTopicModeration(topic.id, 'hide', reason), {
      reasonPrompt: 'Reason for hiding this topic (optional)',
    }),
  );
  box.append(heading, actions);
  const move = topicMoveForm(topic, categories);
  if (move) box.append(move);
  return box;
}

function topicMoveForm(topic: ForumTopicDetail, categories: ForumCategory[]): HTMLElement | null {
  const moveTargets = categories.filter((category) => category.slug !== topic.category.slug);
  if (moveTargets.length === 0) return null;
  const form = document.createElement('form');
  form.className = 'forum-topic-move-form';
  const select = document.createElement('select');
  select.name = 'categorySlug';
  for (const category of moveTargets) {
    const option = document.createElement('option');
    option.value = category.slug;
    option.textContent = category.name;
    select.append(option);
  }
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Move';
  form.append(labeled('Move to', select), submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit.disabled = true;
    void submitTopicMove(topic, select.value).catch(() => {
      submit.disabled = false;
    });
  });
  return form;
}

function postModerationBox(post: ForumPost): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'forum-moderation-actions forum-post-actions';
  actions.append(
    moderationButton('Hide post', (reason) => submitPostModeration(post.id, reason), {
      reasonPrompt: 'Reason for hiding this post (optional)',
    }),
  );
  return actions;
}

function moderationButton(
  text: string,
  submit: (reason: string | null) => Promise<void>,
  options: { confirmAction?: boolean; reasonPrompt?: string } = {},
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'forum-moderation-button';
  button.textContent = text;
  button.addEventListener('click', () => {
    const reason = options.reasonPrompt ? promptModerationReason(options.reasonPrompt) : null;
    if (reason === false) return;
    if (options.confirmAction && !window.confirm(`${text}?`)) return;
    button.disabled = true;
    void submit(reason).catch(() => {
      button.disabled = false;
    });
  });
  return button;
}

function promptModerationReason(promptText: string): string | null | false {
  const value = window.prompt(promptText, '');
  if (value === null) return false;
  const reason = value.trim();
  if (reason.length > forumModerationReasonMaxLength) {
    window.alert(`Reason must be ${forumModerationReasonMaxLength} characters or less.`);
    return false;
  }
  return reason.length > 0 ? reason : null;
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

function topicPageHref(topic: { id: string; slug: string }, page: number): string {
  const href = topicHref(topic);
  return page > 1 ? `${href}?page=${page}` : href;
}

function categoryHref(category: { slug: string }): string {
  return `/forum/${encodeURIComponent(category.slug)}`;
}

function forumHref(
  options: { categorySlug?: string | null; searchQuery?: string | null },
  page: number,
): string {
  const params = new URLSearchParams();
  if (options.searchQuery) params.set('q', options.searchQuery);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  if (options.categorySlug && !options.searchQuery) {
    return `${categoryHref({ slug: options.categorySlug })}${query ? `?${query}` : ''}`;
  }
  return `/forum${query ? `?${query}` : ''}`;
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

function formatCount(value: number): string {
  return value.toLocaleString();
}

function authorLabel(author: ForumAuthor): string {
  return author?.displayName ?? 'Deleted account';
}

function latestPostMetaText(author: ForumAuthor, createdAt: string): string {
  return `by ${authorLabel(author)} · ${formatDate(createdAt)}`;
}

function authorProfileLink(author: ForumAuthor, className: string): HTMLElement {
  if (!author) {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = authorLabel(author);
    return span;
  }
  const link = document.createElement('a');
  link.className = className;
  link.href = `/@/${encodeURIComponent(author.handle)}`;
  link.textContent = author.displayName;
  return link;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function pageFromParam(value: string | null): number {
  const parsed = Number(value ?? '1');
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.trunc(parsed);
}

function searchQueryFromParam(value: string | null): string | null {
  const query = (value ?? '').trim().replace(/\s+/g, ' ');
  return query.length >= 2 && query.length <= 120 ? query : null;
}

function categorySlugFromPath(pathname: string): string | null {
  const match = pathname.replace(/\/+$/, '').match(/^\/forum\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

function errorMessageForStatus(status: number): string {
  if (status === 401) return 'Sign in to post.';
  if (status === 403) return 'This category is restricted.';
  if (status === 423) return 'This topic is locked.';
  if (status === 429) return 'You are posting too quickly.';
  if (status >= 500) return 'Forum is unavailable.';
  return 'Check the fields and try again.';
}

function errorMessageForPostEditStatus(status: number): string {
  if (status === 401) return 'Sign in to edit.';
  if (status === 403) return 'This post cannot be edited.';
  if (status === 404) return 'This post is not available.';
  if (status >= 500) return 'Forum is unavailable.';
  return 'Check the post and try again.';
}

function errorMessageForTopicEditStatus(status: number): string {
  if (status === 401) return 'Sign in to edit.';
  if (status === 403) return 'This topic title cannot be edited.';
  if (status === 404) return 'This topic is not available.';
  if (status >= 500) return 'Forum is unavailable.';
  return 'Check the title and try again.';
}

async function submitTopicModeration(
  topicId: string,
  action: 'pin' | 'unpin' | 'lock' | 'unlock' | 'hide',
  reason: string | null = null,
): Promise<void> {
  const body: { action: typeof action; reason?: string } = { action };
  if (reason) body.reason = reason;
  const resp = await fetch(`/api/forum/topics/${encodeURIComponent(topicId)}/moderation`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`topic_moderation_failed_${resp.status}`);
  if (action === 'hide') window.location.href = '/forum';
  else window.location.reload();
}

async function submitTopicMove(topic: ForumTopicDetail, categorySlug: string): Promise<void> {
  const resp = await fetch(`/api/forum/topics/${encodeURIComponent(topic.id)}/category`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ categorySlug }),
  });
  if (!resp.ok) throw new Error(`topic_move_failed_${resp.status}`);
  const payload = (await resp.json()) as { topic: ForumTopicDetail };
  window.location.href = topicHref(payload.topic);
}

async function submitPostModeration(postId: string, reason: string | null = null): Promise<void> {
  const body: { action: 'hide'; reason?: string } = { action: 'hide' };
  if (reason) body.reason = reason;
  const resp = await fetch(`/api/forum/posts/${encodeURIComponent(postId)}/moderation`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
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
  options: { categorySlug?: string | null; limit?: number; offset?: number } = {},
): Promise<ForumTopicSummary[]> {
  const params = new URLSearchParams();
  if (options.categorySlug) params.set('category', options.categorySlug);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));
  const resp = await fetch(`/api/forum/topics${params.size ? `?${params}` : ''}`, {
    headers: { accept: 'application/json' },
  });
  if (!resp.ok) throw new Error(`forum_topics_failed_${resp.status}`);
  const data = (await resp.json()) as { topics: ForumTopicSummary[] };
  return data.topics;
}

async function searchForumTopics(options: {
  query: string;
  limit?: number;
  offset?: number;
}): Promise<ForumTopicSummary[]> {
  const params = new URLSearchParams();
  params.set('q', options.query);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));
  const resp = await fetch(`/api/forum/search?${params}`, {
    headers: { accept: 'application/json' },
  });
  if (!resp.ok) throw new Error(`forum_search_failed_${resp.status}`);
  const data = (await resp.json()) as { topics: ForumTopicSummary[] };
  return data.topics;
}

async function fetchForumTopic(
  topicId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<ForumTopicDetail> {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));
  const resp = await fetch(
    `/api/forum/topics/${encodeURIComponent(topicId)}${params.size ? `?${params}` : ''}`,
    {
      headers: { accept: 'application/json' },
    },
  );
  if (resp.status === 404) throw new ForumNotFound();
  if (!resp.ok) throw new Error(`forum_topic_failed_${resp.status}`);
  const data = (await resp.json()) as { topic: ForumTopicDetail };
  return data.topic;
}
