import { piecesToBoard, renderBoardComposition } from '@mistboard/board-render';
import {
  mountLiveBoards,
  mountSteppedBoards,
  mountThumbnailBoard,
  type LiveBoardsController,
  type StepperController,
  type ThumbnailBoardController,
} from '@mistboard/board-render/interactive';
import {
  articles,
  findArticle,
  type Article,
  type ArticleBlock,
  type ArticleSection,
  type ArticleThumbnail,
  type CtaBlock,
  type InteractiveBlock,
  type LiveBoardsBlock,
  type RawSvgBlock,
  type StaticBoardsBlock,
  type SubHeadingBlock,
} from './articles-data.js';

// Nav + footer come from landing.ts. We avoid re-implementing them by accepting
// pre-built nodes from the caller — keeps this module standalone and testable.

export type ChromeNodes = {
  nav: HTMLElement;
  footer: HTMLElement;
};

// Production hides non-published articles from both the index list and direct
// URL access (the URL 404s). Dev shows everything so we can review outlines
// and drafts locally before promoting them. Vite injects import.meta.env.DEV
// as true in the dev server and false in the production build.
function isArticleVisibleInThisEnv(article: Article): boolean {
  if (article.status === 'published') return true;
  return import.meta.env.DEV;
}

export function buildArticlesIndex(): HTMLElement {
  const main = document.createElement('main');
  main.className = 'site-section articles-index';

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = 'Articles';

  const intro = document.createElement('p');
  intro.className = 'articles-index-intro';
  intro.textContent = 'Rules, variants, and engine work for dark chess.';

  const list = document.createElement('ul');
  list.className = 'articles-index-list';

  for (const article of articles) {
    if (!isArticleVisibleInThisEnv(article)) continue;
    list.append(articleCard(article));
  }

  main.append(heading, intro, list);
  return main;
}

export function buildArticlePage(slug: string): HTMLElement {
  const article = findArticle(slug);
  if (!article) return buildArticleNotFound();
  if (!isArticleVisibleInThisEnv(article)) return buildArticleNotFound();

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

  if (article.publishedAt) {
    const dates = document.createElement('p');
    dates.className = 'article-dates';
    const fmt = (iso: string): string => {
      // YYYY-MM-DD → "Month D, YYYY"
      const d = new Date(`${iso}T00:00:00Z`);
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
    };
    const published = fmt(article.publishedAt);
    dates.textContent = `Published ${published}`;
    if (article.updatedAt && article.updatedAt !== article.publishedAt) {
      dates.textContent += ` · Updated ${fmt(article.updatedAt)}`;
    }
    main.append(dates);
  }

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

  const body = document.createElement('div');
  body.className = 'article-body';

  const usedIds = new Set<string>();
  let headingIndex = 0;
  for (const section of article.sections) {
    const h2 = document.createElement('h2');
    h2.className = 'article-section-heading';
    h2.textContent = section.heading;
    h2.id = uniqueId(section.heading, usedIds, headingIndex++);
    body.append(h2);
    for (const node of renderSectionBody(section)) {
      if (node instanceof HTMLHeadingElement && node.tagName === 'H3') {
        node.id = uniqueId(node.textContent ?? '', usedIds, headingIndex++);
      }
      body.append(node);
    }
  }

  const sidebar = buildTocSidebar(body);
  if (sidebar) main.append(sidebar);
  main.append(body);

  return main;
}

function uniqueId(text: string, used: Set<string>, fallback: number): string {
  let base = text.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!base) base = `section-${fallback}`;
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}

function buildTocSidebar(body: HTMLElement): HTMLElement | null {
  const headings = body.querySelectorAll<HTMLHeadingElement>('h2, h3');
  if (headings.length === 0) return null;

  const aside = document.createElement('aside');
  aside.className = 'article-toc-sidebar';
  const sticky = document.createElement('div');
  sticky.className = 'article-toc-sticky';
  const title = document.createElement('h3');
  title.className = 'article-toc-title';
  title.textContent = 'On this page';
  const nav = document.createElement('nav');
  nav.className = 'article-toc-nav';
  nav.setAttribute('aria-label', 'Table of contents');

  const rootList = document.createElement('ul');
  let currentH2Li: HTMLLIElement | null = null;
  let currentH3Ul: HTMLUListElement | null = null;

  headings.forEach((h) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${h.id}`;
    a.textContent = h.textContent ?? '';
    a.dataset.headingId = h.id;
    li.append(a);
    if (h.tagName === 'H2') {
      rootList.append(li);
      currentH2Li = li;
      currentH3Ul = null;
    } else if (currentH2Li) {
      if (!currentH3Ul) {
        currentH3Ul = document.createElement('ul');
        currentH2Li.append(currentH3Ul);
      }
      currentH3Ul.append(li);
    } else {
      rootList.append(li);
    }
  });

  nav.append(rootList);
  sticky.append(title, nav);
  aside.append(sticky);
  return aside;
}

export function mountArticleEnhancements(root: HTMLElement): () => void {
  const sidebar = root.querySelector<HTMLElement>('.article-toc-sidebar');
  const body = root.querySelector<HTMLElement>('.article-body');
  if (!sidebar || !body) return () => {};

  const headings = Array.from(body.querySelectorAll<HTMLHeadingElement>('h2, h3'));
  if (headings.length === 0) {
    sidebar.style.display = 'none';
    return () => {};
  }

  const links = Array.from(sidebar.querySelectorAll<HTMLAnchorElement>('a[data-heading-id]'));
  const linkById = new Map(links.map((l) => [l.dataset.headingId!, l]));

  const setActive = (id: string): void => {
    for (const l of links) l.classList.remove('active');
    const active = linkById.get(id);
    if (!active) return;
    active.classList.add('active');
    // Auto-scroll the TOC pane to keep the active item visible.
    const sidebarRect = sidebar.getBoundingClientRect();
    const linkRect = active.getBoundingClientRect();
    if (linkRect.top < sidebarRect.top || linkRect.bottom > sidebarRect.bottom) {
      active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const observer = new IntersectionObserver(
    (entries) => {
      // The most-recently-intersected heading wins. With the rootMargin we
      // use, only one heading is typically intersecting at a time.
      const intersecting = entries.filter((e) => e.isIntersecting);
      if (intersecting.length === 0) return;
      const last = intersecting[intersecting.length - 1]!;
      setActive(last.target.id);
    },
    { rootMargin: '-80px 0px -75% 0px' },
  );
  for (const h of headings) observer.observe(h);

  const onLinkClick = (e: Event): void => {
    const target = e.currentTarget as HTMLAnchorElement;
    e.preventDefault();
    const id = target.getAttribute('href')!.slice(1);
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.pageYOffset - 64;
    window.scrollTo({ top, behavior: 'smooth' });
    history.replaceState(null, '', `#${id}`);
  };
  for (const l of links) l.addEventListener('click', onLinkClick);

  let scrollFrame: number | null = null;
  const onScroll = (): void => {
    if (scrollFrame !== null) return;
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = null;
      const atBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 10;
      if (atBottom) {
        const last = headings[headings.length - 1]!;
        setActive(last.id);
      }
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  return () => {
    observer.disconnect();
    for (const l of links) l.removeEventListener('click', onLinkClick);
    window.removeEventListener('scroll', onScroll);
    if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
  };
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

// Interactive blocks need their parent DOM tree to be sized before chessground
// boots, so we defer the actual mount until the article element is attached.
// renderBlock stamps the wrapper with a `data-pending-widget` marker that
// mountPendingWidgets() picks up and dispatches by widget kind.
type PendingBlock = InteractiveBlock | LiveBoardsBlock;
const pendingMounts = new WeakMap<HTMLElement, PendingBlock>();

function renderBlock(block: ArticleBlock): HTMLElement {
  if (block.kind === 'paragraph') return paragraphNode(block.text);
  if (block.kind === 'sub-heading') return subHeadingNode(block);
  if (block.kind === 'static-boards') return renderStaticBoardsBlock(block);
  if (block.kind === 'cta') return renderCtaBlock(block);
  if (block.kind === 'raw-svg') return renderRawSvgBlock(block);
  if (block.kind === 'live-boards') return renderLiveBoardsBlock(block);
  return renderInteractiveBlock(block);
}

function renderLiveBoardsBlock(block: LiveBoardsBlock): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'article-figure article-figure-interactive';
  figure.dataset.pendingWidget = 'live-boards';

  const mountTarget = document.createElement('div');
  mountTarget.className = 'article-interactive-target';
  figure.append(mountTarget);

  if (block.caption) {
    const cap = document.createElement('figcaption');
    cap.className = 'article-figure-caption';
    cap.textContent = block.caption;
    figure.append(cap);
  }

  pendingMounts.set(figure, block);
  return figure;
}

function renderRawSvgBlock(block: RawSvgBlock): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'article-figure article-figure-static';
  figure.innerHTML = block.svg;
  if (block.caption) {
    const cap = document.createElement('figcaption');
    cap.className = 'article-figure-caption';
    cap.textContent = block.caption;
    figure.append(cap);
  }
  return figure;
}

function renderCtaBlock(block: CtaBlock): HTMLElement {
  const row = document.createElement('div');
  row.className = 'article-cta-row';
  for (const btn of block.buttons) {
    const a = document.createElement('a');
    a.className = `article-cta article-cta-${btn.emphasis ?? 'primary'}`;
    a.href = btn.href;
    a.textContent = btn.label;
    if (btn.external) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    row.append(a);
  }
  return row;
}

function subHeadingNode(block: SubHeadingBlock): HTMLHeadingElement {
  const h3 = document.createElement('h3');
  h3.className = 'article-sub-heading';
  h3.textContent = block.text;
  return h3;
}

function paragraphNode(text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = 'article-paragraph';
  appendRichText(p, text);
  return p;
}

// Lightweight inline parser. Recognizes Markdown-style [text](href) for
// links and **text** for bold. External link hrefs (http/https) open in a
// new tab; internal hrefs (/foo, #foo) do not. Anything that isn't a
// recognized token is appended as a plain text node.
const INLINE_REGEX = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
function appendRichText(el: HTMLElement, text: string): void {
  let lastIndex = 0;
  for (const match of text.matchAll(INLINE_REGEX)) {
    const start = match.index ?? 0;
    if (start > lastIndex) el.append(text.slice(lastIndex, start));
    if (match[1] !== undefined) {
      const strong = document.createElement('strong');
      strong.textContent = match[1];
      el.append(strong);
    } else {
      const linkText = match[2]!;
      const href = match[3]!;
      const a = document.createElement('a');
      a.href = href;
      a.textContent = linkText;
      if (/^https?:\/\//.test(href)) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      el.append(a);
    }
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) el.append(text.slice(lastIndex));
}

function renderInteractiveBlock(block: InteractiveBlock): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'article-figure article-figure-interactive';
  figure.dataset.pendingWidget = block.widget;

  const mountTarget = document.createElement('div');
  mountTarget.className = 'article-interactive-target';
  figure.append(mountTarget);

  if (block.caption) {
    const cap = document.createElement('figcaption');
    cap.className = 'article-figure-caption';
    cap.textContent = block.caption;
    figure.append(cap);
  }

  pendingMounts.set(figure, block);
  return figure;
}

export function mountPendingWidgets(
  root: HTMLElement,
): Array<StepperController | LiveBoardsController> {
  const controllers: Array<StepperController | LiveBoardsController> = [];
  const pending = root.querySelectorAll<HTMLElement>('[data-pending-widget]');
  pending.forEach((figure) => {
    const block = pendingMounts.get(figure);
    if (!block) return;
    const target = figure.querySelector<HTMLElement>('.article-interactive-target');
    if (!target) return;
    if (block.kind === 'interactive' && block.widget === 'stepper') {
      controllers.push(mountSteppedBoards(target, block.spec));
    } else if (block.kind === 'live-boards') {
      controllers.push(mountLiveBoards(target, block.spec));
    }
    pendingMounts.delete(figure);
    delete figure.dataset.pendingWidget;
  });
  return controllers;
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

// Article thumbnails are bound to chessground after the index lands in the
// DOM (chessground needs the host sized to render correctly). We stash the
// spec on each pending wrap and consume it in mountArticleThumbnails.
const pendingThumbnails = new WeakMap<HTMLElement, ArticleThumbnail>();

function articleCard(article: Article): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'articles-index-item';

  const link = document.createElement('a');
  link.className = 'articles-index-card';
  link.href = `/articles/${article.slug}`;

  if (article.thumbnail) {
    link.append(renderArticleThumbnail(article.thumbnail));
  }

  const body = document.createElement('div');
  body.className = 'articles-index-card-body';

  if (article.status === 'outline' || article.status === 'draft') {
    const meta = document.createElement('div');
    meta.className = 'articles-index-card-meta';
    const badge = document.createElement('span');
    badge.className = `article-status-badge article-status-${article.status}`;
    badge.textContent = article.status.charAt(0).toUpperCase() + article.status.slice(1);
    meta.append(badge);
    body.append(meta);
  }

  const title = document.createElement('strong');
  title.className = 'articles-index-card-title';
  title.textContent = article.title;

  const summary = document.createElement('p');
  summary.className = 'articles-index-card-summary';
  summary.textContent = article.summary;

  body.append(title, summary);

  if (article.publishedAt) {
    const dates = document.createElement('p');
    dates.className = 'articles-index-card-dates';
    const fmt = (iso: string): string => {
      const d = new Date(`${iso}T00:00:00Z`);
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
    };
    const showUpdated = article.updatedAt && article.updatedAt !== article.publishedAt;
    dates.textContent = showUpdated ? `Updated ${fmt(article.updatedAt!)}` : `Published ${fmt(article.publishedAt)}`;
    body.append(dates);
  }

  const arrow = document.createElement('span');
  arrow.className = 'articles-index-card-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '→';

  link.append(body, arrow);
  item.append(link);
  return item;
}

export function renderArticleThumbnail(thumb: ArticleThumbnail): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'articles-index-card-thumb';
  wrap.setAttribute('aria-hidden', 'true');
  const board = document.createElement('div');
  board.className = 'articles-thumb-board cg-wrap';
  wrap.append(board);
  pendingThumbnails.set(board, thumb);
  return wrap;
}

export function mountArticleThumbnails(root: HTMLElement): ThumbnailBoardController[] {
  const controllers: ThumbnailBoardController[] = [];
  const hosts = root.querySelectorAll<HTMLElement>('.articles-thumb-board.cg-wrap');
  hosts.forEach((host) => {
    const thumb = pendingThumbnails.get(host);
    if (!thumb) return;
    controllers.push(mountThumbnailBoard(host, {
      board: piecesToBoard(thumb.pieces),
      fogSquares: thumb.fogSquares,
      orientation: thumb.orientation ?? 'white',
    }));
    pendingThumbnails.delete(host);
  });
  return controllers;
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
