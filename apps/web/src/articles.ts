import { articles, findArticle, type Article } from './articles-data.js';

// Nav + footer come from landing.ts. We avoid re-implementing them by accepting
// pre-built nodes from the caller — keeps this module standalone and testable.

export type ChromeNodes = {
  nav: HTMLElement;
  footer: HTMLElement;
};

export function buildArticlesIndex(): HTMLElement {
  const main = document.createElement('main');
  main.className = 'site-section articles-index';

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = 'Articles';

  const intro = document.createElement('p');
  intro.className = 'articles-index-intro';
  intro.textContent = 'Canonical references on Fog of War, Draft960, and the engine behind hidden-information chess.';

  const list = document.createElement('ul');
  list.className = 'articles-index-list';

  for (const article of articles) {
    list.append(articleCard(article));
  }

  main.append(heading, intro, list);
  return main;
}

export function buildArticlePage(slug: string): HTMLElement {
  const article = findArticle(slug);
  if (!article) return buildArticleNotFound();

  const main = document.createElement('main');
  main.className = 'site-section article-page';

  const breadcrumb = document.createElement('p');
  breadcrumb.className = 'article-breadcrumb';
  const back = document.createElement('a');
  back.href = '/articles';
  back.textContent = '← All articles';
  breadcrumb.append(back);

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading article-title';
  heading.textContent = article.title;

  const meta = document.createElement('p');
  meta.className = 'article-meta';
  if (article.status === 'outline' || article.status === 'draft') {
    const badge = document.createElement('span');
    badge.className = `article-status-badge article-status-${article.status}`;
    badge.textContent = article.status.charAt(0).toUpperCase() + article.status.slice(1);
    meta.append(badge, ' · ');
  }
  meta.append(document.createTextNode(article.summary));

  main.append(breadcrumb, heading, meta);

  if (article.tldr && article.tldr.length > 0) {
    const tldr = document.createElement('aside');
    tldr.className = 'article-tldr';
    const tldrHeading = document.createElement('strong');
    tldrHeading.className = 'article-tldr-heading';
    tldrHeading.textContent = 'TL;DR';
    const tldrList = document.createElement('ul');
    tldrList.className = 'article-tldr-list';
    for (const line of article.tldr) {
      const li = document.createElement('li');
      li.textContent = line;
      tldrList.append(li);
    }
    tldr.append(tldrHeading, tldrList);
    main.append(tldr);
  }

  for (const section of article.sections) {
    const h2 = document.createElement('h2');
    h2.className = 'article-section-heading';
    h2.textContent = section.heading;
    main.append(h2);
    for (const para of section.paragraphs) {
      const p = document.createElement('p');
      p.className = 'article-paragraph';
      p.textContent = para;
      main.append(p);
    }
  }

  return main;
}

function articleCard(article: Article): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'articles-index-item';

  const link = document.createElement('a');
  link.className = 'articles-index-card';
  link.href = `/articles/${article.slug}`;

  const title = document.createElement('strong');
  title.className = 'articles-index-card-title';
  title.textContent = article.title;

  const summary = document.createElement('p');
  summary.className = 'articles-index-card-summary';
  summary.textContent = article.summary;

  if (article.status === 'outline' || article.status === 'draft') {
    const badge = document.createElement('span');
    badge.className = `article-status-badge article-status-${article.status}`;
    badge.textContent = article.status.charAt(0).toUpperCase() + article.status.slice(1);
    title.append(' ', badge);
  }

  link.append(title, summary);
  item.append(link);
  return item;
}

function buildArticleNotFound(): HTMLElement {
  const main = document.createElement('main');
  main.className = 'site-section article-page';
  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = 'Article not found';
  const body = document.createElement('p');
  body.textContent = 'This article doesn’t exist (yet).';
  const back = document.createElement('p');
  const backLink = document.createElement('a');
  backLink.href = '/articles';
  backLink.textContent = '← All articles';
  back.append(backLink);
  main.append(heading, body, back);
  return main;
}
