import { renderBoardComposition } from '@mistboard/board-render';
import {
  articles,
  findArticle,
  type Article,
  type ArticleBlock,
  type ArticleSection,
  type StaticBoardsBlock,
} from './articles-data.js';

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
    for (const node of renderSectionBody(section)) main.append(node);
  }

  return main;
}

function renderSectionBody(section: ArticleSection): HTMLElement[] {
  if (section.blocks && section.blocks.length > 0) {
    return section.blocks.map(renderBlock);
  }
  if (section.paragraphs) {
    return section.paragraphs.map(paragraphNode);
  }
  return [];
}

function renderBlock(block: ArticleBlock): HTMLElement {
  if (block.kind === 'paragraph') return paragraphNode(block.text);
  if (block.kind === 'static-boards') return renderStaticBoardsBlock(block);
  // 'interactive' renders as a placeholder until widgets land in the next step.
  const div = document.createElement('div');
  div.className = 'article-interactive-placeholder';
  div.textContent = `[interactive: ${block.widget}]`;
  return div;
}

function paragraphNode(text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = 'article-paragraph';
  p.textContent = text;
  return p;
}

function renderStaticBoardsBlock(block: StaticBoardsBlock): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'article-figure article-figure-static';

  const inner = renderBoardComposition({
    layout: block.layout,
    boards: block.boards,
    canvasWidth: block.canvasWidth,
    boardY: block.boardY,
    boardSize: block.boardSize,
    gap: block.gap,
    labelY: block.labelY,
    labelFill: block.labelFill,
    labelFontSize: block.labelFontSize,
    labelLetterSpacing: block.labelLetterSpacing,
  });

  const bg = block.background ?? 'transparent';
  const bgRect = bg === 'transparent' ? '' : `<rect width="${block.canvasWidth}" height="${block.canvasHeight}" fill="${bg}"/>`;
  figure.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${block.canvasWidth} ${block.canvasHeight}" width="100%" preserveAspectRatio="xMidYMid meet" role="img">${bgRect}${inner}</svg>`;

  if (block.caption) {
    const cap = document.createElement('figcaption');
    cap.className = 'article-figure-caption';
    cap.textContent = block.caption;
    figure.append(cap);
  }
  return figure;
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
