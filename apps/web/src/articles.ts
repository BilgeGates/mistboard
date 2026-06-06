import { piecesToBoard, renderBoardComposition } from '@mistboard/board-render';
import {
  type LiveBoardsController,
  mountLiveBoards,
  mountSteppedBoards,
  mountThumbnailBoard,
  type StepperController,
  type ThumbnailBoardController,
} from '@mistboard/board-render/interactive';
import './articles.css';
import { ARTICLE_LANG_PREFIX, type ArticleLang, translateArticle } from './article-i18n.js';
import {
  type Article,
  type ArticleBlock,
  type ArticleSection,
  type ArticleThumbnail,
  articles,
  type ChessReplayBlock,
  type CodeBlock,
  type CtaBlock,
  type DualReplayBlock,
  findArticle,
  type InteractiveBlock,
  type LiveBoardsBlock,
  type MiniXiangqiReplayBlock,
  type RawSvgBlock,
  type RawSvgStepperBlock,
  type StaticBoardsBlock,
  type SubHeadingBlock,
  withXiangqiPieceSet,
  type XiangqiReplayBlock,
} from './articles-data.js';
import { type ChessReplayController, mountChessReplay } from './chess-replay.js';
import { type DualChessReplayController, mountDualChessReplay } from './dual-chess-replay.js';
import { type MiniXiangqiReplayController, mountMiniXiangqiReplay } from './mini-xiangqi-replay.js';
import { readStoredXiangqiPieceSet, xiangqiAppearanceChangedEvent } from './theme.js';
import type { XiangqiPieceSet } from './xiangqi-piece-sets.js';
import { mountXiangqiReplay, type XiangqiReplayController } from './xiangqi-replay.js';

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

const ARTICLE_INDEX_COPY: Record<
  ArticleLang | 'en',
  {
    heading: string;
    intro: string;
    rulesHeading: string;
    rulesIntro: string;
    published: string;
    updated: string;
    dateLocale: string;
  }
> = {
  en: {
    heading: 'Articles',
    intro: 'Essays, variants, and engine work for dark chess.',
    rulesHeading: 'Rules',
    rulesIntro: 'Reference rules for Mistboard games and Fog of War variants.',
    published: 'Published',
    updated: 'Updated',
    dateLocale: 'en-US',
  },
  'zh-Hans': {
    heading: '文章',
    intro: '迷雾国际象棋的变体、策略与引擎工作。',
    rulesHeading: '规则',
    rulesIntro: 'Mistboard 游戏与战争迷雾变体的规则参考。',
    published: '发布于',
    updated: '更新于',
    dateLocale: 'zh-CN',
  },
  'zh-Hant': {
    heading: '文章',
    intro: '迷霧國際象棋的變體、策略與引擎工作。',
    rulesHeading: '規則',
    rulesIntro: 'Mistboard 遊戲與戰爭迷霧變體的規則參考。',
    published: '發布於',
    updated: '更新於',
    dateLocale: 'zh-TW',
  },
};

export function buildArticlesIndex(lang?: ArticleLang): HTMLElement {
  return buildContentIndex('article', lang);
}

export function buildRulesIndex(lang?: ArticleLang): HTMLElement {
  return buildContentIndex('rules', lang);
}

function buildContentIndex(kind: Article['kind'], lang?: ArticleLang): HTMLElement {
  const copy = ARTICLE_INDEX_COPY[lang ?? 'en'];
  const main = document.createElement('main');
  main.className = 'site-section articles-index';

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = kind === 'rules' ? copy.rulesHeading : copy.heading;

  const intro = document.createElement('p');
  intro.className = 'articles-index-intro';
  intro.textContent = kind === 'rules' ? copy.rulesIntro : copy.intro;

  const list = document.createElement('ul');
  list.className = 'articles-index-list';

  for (const article of articles) {
    if (article.kind !== kind) continue;
    if (!isArticleVisibleInThisEnv(article)) continue;
    if (article.showInIndex === false) continue;
    list.append(articleCard(lang ? translateArticle(article, lang) : article, lang));
  }

  main.append(heading, intro, list);
  return main;
}

// Compact article carousel for the homepage center column: a single row of
// compact cards (thumb on top, title below) spanning the column width, that
// auto-rotates like the lichess blog row. Returns null when there are no
// articles, so the caller can omit it. Thumbnails are bound by the caller's
// mountArticleThumbnails pass; rotation is started by initLandingCarousel once
// the section is in the document (it needs measured widths).
export function buildHomeArticleCards(limit = 8): HTMLElement | null {
  const eligible = articles.filter(
    (article) => isArticleVisibleInThisEnv(article) && article.showInIndex !== false,
  );
  // Articles first (the featured long-form), then the rules guides — enough
  // cards that the row has something to actually rotate through.
  const ordered = [
    ...eligible.filter((article) => article.kind === 'article'),
    ...eligible.filter((article) => article.kind === 'rules'),
  ];
  const cards = ordered.slice(0, limit).map(landingArticleCard);
  if (cards.length === 0) return null;

  const section = document.createElement('section');
  section.className = 'landing-articles';
  section.setAttribute('aria-label', 'Articles');

  const header = document.createElement('div');
  header.className = 'landing-articles-header';

  const heading = document.createElement('h2');
  heading.className = 'landing-articles-heading';
  heading.textContent = 'Read';

  const more = document.createElement('a');
  more.className = 'landing-articles-more';
  more.href = '/articles';
  const moreLabel = document.createElement('span');
  moreLabel.textContent = 'All articles';
  const moreArrow = document.createElement('span');
  moreArrow.className = 'landing-articles-more-arrow';
  moreArrow.setAttribute('aria-hidden', 'true');
  moreArrow.textContent = '→';
  more.append(moreLabel, moreArrow);
  header.append(heading, more);

  const carousel = document.createElement('div');
  carousel.className = 'landing-carousel';

  const track = document.createElement('div');
  track.className = 'landing-carousel-track';
  for (const card of cards) track.append(card);

  const prev = carouselNavButton('prev', '‹');
  const next = carouselNavButton('next', '›');

  carousel.append(prev, track, next);
  section.append(header, carousel);
  return section;
}

function carouselNavButton(dir: 'prev' | 'next', glyph: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `landing-carousel-nav landing-carousel-nav-${dir}`;
  button.setAttribute('aria-label', dir === 'prev' ? 'Previous articles' : 'More articles');
  button.textContent = glyph;
  return button;
}

function landingArticleCard(article: Article): HTMLElement {
  const link = document.createElement('a');
  link.className = 'landing-article-card';
  const base = article.kind === 'rules' ? 'rules' : 'articles';
  link.href = `/${base}/${article.slug}`;

  const thumb = document.createElement('div');
  thumb.className = 'landing-article-card-thumb';
  if (article.thumbnail) {
    thumb.append(renderArticleThumbnail(article.thumbnail));
  } else {
    thumb.classList.add('is-empty');
  }

  // Date pill overlaid on the thumbnail, lichess blog-card style.
  const dateIso = article.publishedAt ?? article.updatedAt;
  if (dateIso) {
    const date = document.createElement('span');
    date.className = 'landing-article-card-date';
    date.textContent = formatCardDate(dateIso);
    thumb.append(date);
  }

  const title = document.createElement('strong');
  title.className = 'landing-article-card-title';
  title.textContent = article.title;

  link.append(thumb, title);
  return link;
}

function formatCardDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// Auto-rotating horizontal carousel for the homepage article row. Ping-pongs
// the track between its start and the point where the last card is flush right,
// so any overflow scrolls into view without a jarring rewind. No-ops (and hides
// the arrows) when every card already fits. Self-clears its timer once the
// carousel leaves the DOM, matching the other landing pollers.
export function initLandingCarousel(root: HTMLElement): void {
  const carousel = root.querySelector<HTMLElement>('.landing-carousel');
  const track = carousel?.querySelector<HTMLElement>('.landing-carousel-track');
  if (!carousel || !track) return;
  const cards = [...track.children] as HTMLElement[];
  const prev = carousel.querySelector<HTMLButtonElement>('.landing-carousel-nav-prev');
  const next = carousel.querySelector<HTMLButtonElement>('.landing-carousel-nav-next');
  if (cards.length === 0) return;

  let index = 0;
  let dir = 1;
  let timer: number | null = null;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const stepPx = (): number => {
    if (cards.length < 2) return 0;
    return cards[1]!.getBoundingClientRect().left - cards[0]!.getBoundingClientRect().left;
  };
  const maxIndex = (): number => {
    const step = stepPx();
    if (step <= 0) return 0;
    const overflow = Math.max(0, track.scrollWidth - carousel.clientWidth);
    return Math.round(overflow / step);
  };

  const apply = () => {
    const mi = maxIndex();
    carousel.classList.toggle('is-static', mi <= 0);
    if (prev) prev.disabled = index <= 0;
    if (next) next.disabled = index >= mi;
    if (mi <= 0) {
      index = 0;
      track.style.transform = 'none';
      return;
    }
    index = Math.max(0, Math.min(index, mi));
    track.style.transform = `translateX(${-(index * stepPx())}px)`;
  };

  const tick = () => {
    const mi = maxIndex();
    if (mi <= 0) return;
    if (index >= mi) dir = -1;
    else if (index <= 0) dir = 1;
    index += dir;
    apply();
  };

  const stop = () => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
  const start = () => {
    stop();
    if (reduceMotion) return;
    timer = window.setInterval(() => {
      if (!document.body.contains(carousel)) {
        stop();
        return;
      }
      tick();
    }, 5000);
  };

  const nudge = (delta: number) => {
    const mi = maxIndex();
    if (mi <= 0) return;
    index = Math.max(0, Math.min(index + delta, mi));
    dir = delta >= 0 ? 1 : -1;
    apply();
  };
  prev?.addEventListener('click', () => nudge(-1));
  next?.addEventListener('click', () => nudge(1));

  carousel.addEventListener('mouseenter', stop);
  carousel.addEventListener('mouseleave', start);
  window.addEventListener('resize', apply);

  apply();
  start();
}

export function buildArticlePage(slug: string, lang?: ArticleLang): HTMLElement {
  const base = findArticle(slug);
  if (!base) return buildArticleNotFound();
  if (!isArticleVisibleInThisEnv(base)) return buildArticleNotFound();
  const article = lang ? translateArticle(base, lang) : base;

  const main = document.createElement('main');
  main.className = 'site-section article-page';
  main.dataset.articleSlug = article.slug;

  const breadcrumb = document.createElement('p');
  breadcrumb.className = 'article-breadcrumb';
  const back = document.createElement('a');
  const prefix = lang ? ARTICLE_LANG_PREFIX[lang] : '';
  back.href = article.kind === 'rules' ? `${prefix}/rules` : `${prefix}/articles`;
  back.textContent = article.kind === 'rules' ? '← All rules' : '← All articles';
  breadcrumb.append(back);

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading article-title';
  heading.textContent = article.title;

  main.append(breadcrumb, heading);

  const showStatusBadge = article.status === 'outline' || article.status === 'draft';
  const showSummaryOnPage = article.showSummaryOnPage ?? true;
  if (showStatusBadge || showSummaryOnPage) {
    const meta = document.createElement('p');
    meta.className = 'article-meta';
    if (showStatusBadge) {
      const badge = document.createElement('span');
      badge.className = `article-status-badge article-status-${article.status}`;
      badge.textContent = article.status.charAt(0).toUpperCase() + article.status.slice(1);
      meta.append(badge);
      if (showSummaryOnPage) meta.append(' · ');
    }
    if (showSummaryOnPage) meta.append(document.createTextNode(article.summary));
    main.append(meta);
  }

  if (article.publishedAt) {
    const dates = document.createElement('p');
    dates.className = 'article-dates';
    const fmt = (iso: string): string => {
      // YYYY-MM-DD → "Month D, YYYY"
      const d = new Date(`${iso}T00:00:00Z`);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      });
    };
    const published = fmt(article.publishedAt);
    dates.textContent = `Published ${published}`;
    if (article.updatedAt && article.updatedAt !== article.publishedAt) {
      dates.textContent += ` · Updated ${fmt(article.updatedAt)}`;
    }
    main.append(dates);
  }

  if (article.intro && article.intro.length > 0) {
    const intro = document.createElement('div');
    intro.className = 'article-intro';
    for (const block of article.intro) intro.append(renderBlock(block));
    main.append(intro);
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
  let base = text
    .toLowerCase()
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
type PendingBlock =
  | InteractiveBlock
  | LiveBoardsBlock
  | XiangqiReplayBlock
  | ChessReplayBlock
  | MiniXiangqiReplayBlock
  | DualReplayBlock;
const pendingMounts = new WeakMap<HTMLElement, PendingBlock>();

function renderBlock(block: ArticleBlock): HTMLElement {
  if (block.kind === 'paragraph') return paragraphNode(block.text);
  if (block.kind === 'sub-heading') return subHeadingNode(block);
  if (block.kind === 'static-boards') return renderStaticBoardsBlock(block);
  if (block.kind === 'cta') return renderCtaBlock(block);
  if (block.kind === 'raw-svg') return renderRawSvgBlock(block);
  if (block.kind === 'raw-svg-stepper') return renderRawSvgStepperBlock(block);
  if (block.kind === 'code') return renderCodeBlock(block);
  if (block.kind === 'live-boards') return renderLiveBoardsBlock(block);
  if (block.kind === 'xq-replay') return renderXiangqiReplayBlock(block);
  if (block.kind === 'mxq-replay') return renderMiniXiangqiReplayBlock(block);
  if (block.kind === 'chess-replay') return renderChessReplayBlock(block);
  if (block.kind === 'dual-replay') return renderDualReplayBlock(block);
  return renderInteractiveBlock(block);
}

function renderChessReplayBlock(block: ChessReplayBlock): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'article-figure article-figure-interactive';
  figure.dataset.pendingWidget = 'chess-replay';

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

function renderDualReplayBlock(block: DualReplayBlock): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'article-figure article-figure-interactive article-figure-dual';
  figure.dataset.pendingWidget = 'dual-replay';

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

function renderXiangqiReplayBlock(block: XiangqiReplayBlock): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'article-figure article-figure-interactive article-figure-xq';
  figure.dataset.pendingWidget = 'xq-replay';

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

function renderMiniXiangqiReplayBlock(block: MiniXiangqiReplayBlock): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'article-figure article-figure-interactive article-figure-xq';
  figure.dataset.pendingWidget = 'mxq-replay';

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

// Xiangqi diagrams draw pieces as inline SVG glyphs, so — unlike chess diagrams,
// which restyle through chessground CSS sprites — they must be re-rendered when
// the piece-set picker changes. Each reactive holder keeps its render thunk; a
// single app-life listener repaints every in-document holder on appearance
// change. Holders detached by SPA navigation drop out of the query and are
// garbage-collected with their WeakMap entry, so there is no per-figure listener
// and no leak. Board theme + fog react through CSS vars, so they need no JS.
const xqDiagramThunks = new WeakMap<HTMLElement, () => string>();
let xqDiagramListenerInstalled = false;

// Replace the holder's <svg> in place so the diagram stays a direct child (the
// article CSS targets `.article-figure-xq > .xq-article-svg`) and any caption is
// preserved. Each diagram thunk returns exactly one <svg> root.
function paintXqDiagram(holder: HTMLElement, set: XiangqiPieceSet): void {
  const thunk = xqDiagramThunks.get(holder);
  if (!thunk) return;
  const caption =
    Array.from(holder.children).find((child) =>
      child.classList.contains('article-figure-caption'),
    ) ?? null;
  for (const child of Array.from(holder.children)) {
    if (child.classList.contains('xq-article-svg')) child.remove();
  }
  const scratch = document.createElement('div');
  scratch.innerHTML = withXiangqiPieceSet(set, thunk);
  for (const node of Array.from(scratch.childNodes)) {
    holder.insertBefore(node, caption);
  }
}

// Index/announcement card thumbnails are also xiangqi SVGs, but they re-apply
// their own sizing attributes, so they carry a bespoke painter rather than the
// in-place diagram repaint. Same single listener drives both.
const xqThumbPainters = new WeakMap<HTMLElement, () => void>();

function ensureXqDiagramListener(): void {
  if (xqDiagramListenerInstalled) return;
  xqDiagramListenerInstalled = true;
  window.addEventListener(xiangqiAppearanceChangedEvent, () => {
    const set = readStoredXiangqiPieceSet();
    document.querySelectorAll<HTMLElement>('[data-xq-diagram]').forEach((holder) => {
      paintXqDiagram(holder, set);
    });
    document.querySelectorAll<HTMLElement>('[data-xq-thumb]').forEach((wrap) => {
      xqThumbPainters.get(wrap)?.();
    });
  });
}

function trackXqDiagram(holder: HTMLElement, thunk: () => string): void {
  holder.dataset.xqDiagram = '';
  xqDiagramThunks.set(holder, thunk);
  ensureXqDiagramListener();
}

function renderRawSvgBlock(block: RawSvgBlock): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'article-figure article-figure-static';
  if (typeof block.svg === 'function') {
    trackXqDiagram(figure, block.svg);
    paintXqDiagram(figure, readStoredXiangqiPieceSet());
    if (figure.querySelector('.xq-article-svg')) {
      figure.classList.add('article-figure-xq');
    }
  } else {
    figure.innerHTML = block.svg;
    if (figure.querySelector('.xq-article-svg')) {
      figure.classList.add('article-figure-xq');
    }
  }
  if (block.caption) {
    const cap = document.createElement('figcaption');
    cap.className = 'article-figure-caption';
    cap.textContent = block.caption;
    figure.append(cap);
  }
  return figure;
}

function renderRawSvgStepperBlock(block: RawSvgStepperBlock): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'article-figure article-figure-interactive article-figure-raw-svg-stepper';

  const host = document.createElement('div');
  host.className = 'raw-svg-stepper stepper';
  host.tabIndex = 0;

  const frame = document.createElement('div');
  frame.className = 'raw-svg-stepper-frame';

  const controls = document.createElement('div');
  controls.className = 'stepper-controls';

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'stepper-button stepper-button-prev';
  prev.setAttribute('aria-label', 'Previous step');
  prev.textContent = '←';

  const counter = document.createElement('span');
  counter.className = 'stepper-counter';

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'stepper-button stepper-button-next';
  next.setAttribute('aria-label', 'Next step');
  next.textContent = '→';

  const narrative = document.createElement('div');
  narrative.className = 'stepper-narrative';

  controls.append(prev, counter, next);
  if (block.header) {
    const header = document.createElement('div');
    header.className = 'xq-replay-header';
    const players = document.createElement('div');
    players.textContent = block.header.players;
    const event = document.createElement('div');
    event.className = 'xq-replay-header-event';
    event.textContent = block.header.event;
    header.append(players, event);
    host.append(header);
  }
  host.append(frame, controls, narrative);
  figure.append(host);

  if (block.caption) {
    const cap = document.createElement('figcaption');
    cap.className = 'article-figure-caption';
    cap.textContent = block.caption;
    figure.append(cap);
  }

  let stepIdx = 0;

  function render(): void {
    const step = block.steps[stepIdx];
    if (!step) return;
    frame.innerHTML =
      typeof step.svg === 'function'
        ? withXiangqiPieceSet(readStoredXiangqiPieceSet(), step.svg)
        : step.svg;
    const hasXiangqiDiagram = Boolean(frame.querySelector('.xq-article-svg'));
    frame.classList.toggle('raw-svg-stepper-frame-xq', hasXiangqiDiagram);
    figure.classList.toggle('article-figure-xq', hasXiangqiDiagram);
    narrative.textContent = step.narrative ?? '';
    counter.textContent = `${stepIdx + 1} / ${block.steps.length}`;

    const willDisablePrev = stepIdx === 0;
    const willDisableNext = stepIdx === block.steps.length - 1;
    const focused = document.activeElement;
    if ((focused === prev && willDisablePrev) || (focused === next && willDisableNext)) {
      host.focus();
    }
    prev.disabled = willDisablePrev;
    next.disabled = willDisableNext;
  }

  function onPrev(): void {
    if (stepIdx <= 0) return;
    stepIdx -= 1;
    render();
  }

  function onNext(): void {
    if (stepIdx >= block.steps.length - 1) return;
    stepIdx += 1;
    render();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    switch (event.key) {
      case 'ArrowLeft':
      case 'q':
      case 'Q':
        event.preventDefault();
        onPrev();
        return;
      case 'ArrowRight':
      case 'e':
      case 'E':
        event.preventDefault();
        onNext();
        return;
    }
  }

  prev.addEventListener('click', onPrev);
  next.addEventListener('click', onNext);
  host.addEventListener('keydown', onKeyDown);
  render();

  // Reactive piece set: repaint the frame's current step when the picker
  // changes. render() already painted it; the global listener handles changes.
  if (block.steps.some((step) => typeof step.svg === 'function')) {
    trackXqDiagram(frame, () => {
      const step = block.steps[stepIdx];
      if (!step) return '';
      return typeof step.svg === 'function' ? step.svg() : step.svg;
    });
  }

  return figure;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Minimal dark-theme tokenizer for the article's JSON and TypeScript blocks.
// One left-to-right pass: whichever token starts first wins, so words inside
// strings or comments are never re-tokenized. Run on already-escaped text.
const CODE_TOKEN =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"(?=\s*:))|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d[\d_.eE+-]*\b)|\b(true|false|null|undefined)\b|\b(function|return|const|let|new|for|of|if|else|in|typeof|void)\b/g;

function highlightCode(text: string): string {
  return escapeHtml(text).replace(CODE_TOKEN, (m, comment, key, str, num, bool, kw) => {
    const cls = comment
      ? 'tok-comment'
      : key
        ? 'tok-key'
        : str
          ? 'tok-string'
          : num
            ? 'tok-number'
            : bool
              ? 'tok-bool'
              : kw
                ? 'tok-keyword'
                : '';
    return cls ? `<span class="${cls}">${m}</span>` : m;
  });
}

function renderCodeBlock(block: CodeBlock): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'article-figure article-figure-code';
  const pre = document.createElement('pre');
  pre.className = 'article-code-block';
  if (block.language) pre.dataset.language = block.language;
  const code = document.createElement('code');
  code.innerHTML = highlightCode(block.text);
  pre.append(code);
  figure.append(pre);
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
): Array<
  | StepperController
  | LiveBoardsController
  | XiangqiReplayController
  | ChessReplayController
  | MiniXiangqiReplayController
  | DualChessReplayController
> {
  const controllers: Array<
    | StepperController
    | LiveBoardsController
    | XiangqiReplayController
    | ChessReplayController
    | MiniXiangqiReplayController
    | DualChessReplayController
  > = [];
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
    } else if (block.kind === 'xq-replay') {
      controllers.push(mountXiangqiReplay(target, block.spec));
    } else if (block.kind === 'mxq-replay') {
      controllers.push(mountMiniXiangqiReplay(target, block.spec));
    } else if (block.kind === 'chess-replay') {
      controllers.push(mountChessReplay(target, block.spec));
    } else if (block.kind === 'dual-replay') {
      controllers.push(mountDualChessReplay(target, block.spec));
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
  const bgRect =
    bg === 'transparent'
      ? ''
      : `<rect width="${block.canvasWidth}" height="${block.canvasHeight}" fill="${bg}"/>`;
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

function articleCard(article: Article, lang?: ArticleLang): HTMLLIElement {
  const copy = ARTICLE_INDEX_COPY[lang ?? 'en'];
  const item = document.createElement('li');
  item.className = 'articles-index-item';

  const link = document.createElement('a');
  link.className = 'articles-index-card';
  const base = article.kind === 'rules' ? 'rules' : 'articles';
  link.href = `${lang ? ARTICLE_LANG_PREFIX[lang] : ''}/${base}/${article.slug}`;

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
      return d.toLocaleDateString(copy.dateLocale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      });
    };
    const showUpdated = article.updatedAt && article.updatedAt !== article.publishedAt;
    dates.textContent = showUpdated
      ? `${copy.updated} ${fmt(article.updatedAt!)}`
      : `${copy.published} ${fmt(article.publishedAt)}`;
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
  if (thumb.kind === 'svg') {
    const applySvg = (raw: string): void => {
      const template = document.createElement('template');
      template.innerHTML = raw.trim();
      const svg = template.content.firstElementChild;
      if (svg instanceof SVGSVGElement) {
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.style.display = 'block';
        wrap.replaceChildren(svg);
      }
    };
    if (typeof thumb.svg === 'function') {
      const svgThunk = thumb.svg;
      const paint = () => applySvg(withXiangqiPieceSet(readStoredXiangqiPieceSet(), svgThunk));
      paint();
      wrap.dataset.xqThumb = '';
      xqThumbPainters.set(wrap, paint);
      ensureXqDiagramListener();
    } else {
      applySvg(thumb.svg);
    }
    return wrap;
  }
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
    if (thumb.kind === 'svg') return;
    controllers.push(
      mountThumbnailBoard(host, {
        board: piecesToBoard(thumb.pieces),
        fogSquares: thumb.fogSquares,
        orientation: thumb.orientation ?? 'white',
      }),
    );
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
