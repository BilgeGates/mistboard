// Static content pages — about / source / faq / terms / not-found / articles.
// Extracted from landing.ts (shell-helper inversion: buildNav, buildFooter,
// GITHUB_URL imported back). See feedback_shell_helper_inversion.

import { buildFooter, buildNav, GITHUB_URL } from './landing.js';

export function mountAbout(root: HTMLElement): void {
  root.replaceChildren();
  root.classList.add('landing-page', 'about-route');
  root.append(buildNav(), buildAbout(), buildFooter());
}

export function mountSource(root: HTMLElement): void {
  root.replaceChildren();
  root.classList.add('landing-page', 'source-route');
  root.append(buildNav(), buildSource(), buildFooter());
}

export function mountFaq(root: HTMLElement): void {
  root.replaceChildren();
  root.classList.add('landing-page', 'faq-route');
  root.append(buildNav(), buildFaq(), buildFooter());
}

export function mountTerms(root: HTMLElement): void {
  root.replaceChildren();
  root.classList.add('landing-page', 'terms-route');
  root.append(buildNav(), buildTerms(), buildFooter());
}

export function mountNotFound(root: HTMLElement): void {
  root.replaceChildren();
  root.classList.add('landing-page', 'not-found-route');
  root.append(buildNav(), buildNotFound(), buildFooter());
}

export async function mountArticlesIndex(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'articles-route');
  const { buildArticlesIndex, mountArticleThumbnails } = await import('./articles.js');
  const index = buildArticlesIndex();
  root.append(buildNav(), index, buildFooter());
  mountArticleThumbnails(index);
}

export async function mountArticle(root: HTMLElement, slug: string): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'articles-route');
  const { buildArticlePage, mountPendingWidgets, mountArticleEnhancements } = await import(
    './articles.js'
  );
  const { findArticle } = await import('./articles-data.js');
  const article = findArticle(slug);
  if (article) document.title = `${article.title} · Mistboard`;
  const articlePage = buildArticlePage(slug);
  root.append(buildNav(), articlePage, buildFooter());
  mountPendingWidgets(articlePage);
  mountArticleEnhancements(articlePage);
}

function buildAbout(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'site-section about-section';
  section.id = 'about';

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = 'About Mistboard';

  const lede = aboutParagraph([
    'Mistboard is a free, open-source site for dark chess (also called Fog of War).',
  ]);

  const rulesHeading = aboutSubheading('What dark chess is');
  const rulesP = aboutParagraph([
    'Dark chess is hidden-information chess. You see your own pieces and the squares they could legally move to. Everything else is dark. The game ends when a king is captured.',
  ]);

  const whyHeading = aboutSubheading('Why this site exists');
  const whyP = aboutParagraph([
    'Dark chess has lived for years as a side mode on larger chess sites. Mistboard treats it as the main event: a server, a board, replays that show what each side actually saw, and engines built for hidden-information play.',
  ]);

  const featuresHeading = aboutSubheading('What you can do here');
  const featuresP = aboutParagraph([
    'Play a friend over a link. Join a lobby for a random opponent. Play the engine. Replay any finished game and toggle reveal mode to see both perspectives. Try Draft960, a pregame variant where each player drafts their own back rank. Read the ',
    aboutLink('articles', '/articles'),
    ' for rules, openings, and engine research, or browse the ',
    aboutLink('leaderboard', '/leaderboard'),
    ' for top players (rated play arrives later).',
  ]);

  const fairnessHeading = aboutSubheading('Fairness and integrity');
  const fairnessP = aboutParagraph([
    'No ads, no trackers beyond aggregate analytics, no account required to play. Hidden information is enforced on the server: your opponent’s pieces and moves never reach your browser until your own pieces can see them.',
  ]);

  const oss1Heading = aboutSubheading('Open source');
  const oss1P = aboutParagraph([
    'Mistboard is published under AGPL-3.0-or-later on ',
    aboutExternalLink('GitHub', GITHUB_URL),
    '. Contributions, bug reports, and article drafts are welcome. See ',
    aboutLink('Source', '/source'),
    ' for license and third-party credits.',
  ]);

  const engineHeading = aboutSubheading('Engines for hidden-information chess');
  const engineP = aboutParagraph([
    'Standard chess engines need to see the full board. The techniques that work for dark chess (belief-state search, particle filters, Monte Carlo tree search over determinized positions) come from the Reconnaissance Blind Chess literature. Mistboard’s engine is in active development and open source. A protocol for third-party engines (FUCI) is in design. Engine tournaments and calibration runs follow once it stabilizes.',
  ]);

  const statusHeading = aboutSubheading('Project status');
  const statusP = aboutParagraph([
    'Early, single-maintainer, and shipping in public. New features, articles, and engine versions land regularly. Accounts and ratings aren’t stable yet. Expect things to change.',
  ]);

  const contactHeading = aboutSubheading('Get in touch');
  const contactP = aboutParagraph([
    'Bug reports, feature ideas, broken games: send anything via ',
    aboutLink('Contact', '/contact'),
    '. Email is optional.',
  ]);

  section.append(
    heading,
    lede,
    rulesHeading,
    rulesP,
    whyHeading,
    whyP,
    featuresHeading,
    featuresP,
    fairnessHeading,
    fairnessP,
    oss1Heading,
    oss1P,
    engineHeading,
    engineP,
    statusHeading,
    statusP,
    contactHeading,
    contactP,
  );
  return section;
}

function aboutSubheading(text: string): HTMLElement {
  const h = document.createElement('h2');
  h.className = 'about-subheading';
  h.textContent = text;
  return h;
}

function aboutParagraph(parts: Array<string | Node>): HTMLParagraphElement {
  const p = document.createElement('p');
  for (const part of parts) {
    p.append(typeof part === 'string' ? document.createTextNode(part) : part);
  }
  return p;
}

function aboutLink(label: string, href: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = label;
  return a;
}

function aboutExternalLink(label: string, href: string): HTMLAnchorElement {
  const a = aboutLink(label, href);
  a.target = '_blank';
  a.rel = 'noreferrer noopener';
  return a;
}

function buildSource(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'site-section source-section';

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = 'Source And Licenses';

  const intro = document.createElement('p');
  intro.textContent =
    'Mistboard is an independent open-source dark chess project. The source code is published under AGPL-3.0-or-later. The hosted service is not affiliated with lichess, chess.com, or any other chess platform.';

  const source = sourceBlock('Project source', [
    linkLine('GitHub repository', GITHUB_URL),
    textLine('License: AGPL-3.0-or-later'),
    textLine('No warranty is provided. See the repository license for the full terms.'),
  ]);

  const thirdParty = sourceBlock('Third-party components', [
    textLine('chessground: board interaction and piece rendering, GPL-3.0-or-later.'),
    textLine('chessops: chess rules primitives, GPL-3.0-or-later.'),
    textLine(
      'Stockfish: optional engine/runtime dependency for research and engine-worker flows, GPL family.',
    ),
  ]);

  const identity = sourceBlock('Project identity', [
    textLine(
      'The Mistboard name, logo, mistboard.com domain, hosted service identity, and official events are controlled project assets.',
    ),
    textLine(
      'Forks are allowed under the AGPL, but should use a distinct name and avoid implying they are the official Mistboard service.',
    ),
    textLine(
      'Forks and derivatives should present their own public brand, domain, and hosted service identity.',
    ),
  ]);

  section.append(heading, intro, source, thirdParty, identity);
  return section;
}

function buildFaq(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'site-section faq-section';

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = 'FAQ';

  const q1 = aboutSubheading('What is dark chess?');
  const a1 = aboutParagraph([
    'Hidden-information chess. You see your own pieces and the squares they could legally move to. Everything else is dark, so an opponent’s pieces and moves stay hidden until your pieces can see them. The game ends when a king is captured. The ',
    aboutLink('canonical reference', '/articles/fog-of-war-rules'),
    ' has the full rules.',
  ]);

  const q2 = aboutSubheading('How do I report a bug or get in touch?');
  const a2 = aboutParagraph([
    'File an issue on ',
    aboutExternalLink('GitHub', GITHUB_URL),
    ' or send a note via ',
    aboutLink('Contact', '/contact'),
    '. Include the room link if it’s about a specific game.',
  ]);

  section.append(heading, q1, a1, q2, a2);
  return section;
}

function buildTerms(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'site-section terms-section';

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = 'Terms of Use';

  const intro = aboutParagraph([
    'Mistboard is a free, open-source hobby project. These are the basic rules for using the hosted site at mistboard.com. They will change as the project grows; this page is always the current version.',
  ]);

  const h1 = aboutSubheading('The site is offered as-is');
  const p1 = aboutParagraph([
    'No warranty. Games, accounts, ratings, and stored data can be lost, reset, or removed without notice during development. Don’t put anything on Mistboard you can’t afford to lose.',
  ]);

  const h2 = aboutSubheading('Anonymous play');
  const p2 = aboutParagraph([
    'Play is anonymous and link-based by default. Accounts are optional and add a profile and a handle. Don’t use the service for anything that needs an identity you can’t lose.',
  ]);

  const h3 = aboutSubheading('Acceptable use');
  const p3 = aboutParagraph([
    'Don’t harass other players, spam, abuse the service, try to break the fog filter, or hammer the site with scrapers. Don’t use external engine help in rated games. Handles, rooms, and accounts may be revoked for abuse.',
  ]);

  const h4 = aboutSubheading('Finished games are public by default');
  const p4 = aboutParagraph([
    'Completed games are published under ',
    aboutExternalLink('CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'),
    '. Anyone can share or reuse the game record as long as they credit Mistboard. To take down a specific game, use ',
    aboutLink('Contact', '/contact'),
    '.',
  ]);

  const h5 = aboutSubheading('Open source and brand');
  const p5 = aboutParagraph([
    'The source is AGPL-3.0-or-later. The Mistboard name, logo, domain, and hosted service identity are project assets. Forks are welcome but should pick their own name. See ',
    aboutLink('Source', '/source'),
    ' for license and credits.',
  ]);

  section.append(heading, intro, h1, p1, h2, p2, h3, p3, h4, p4, h5, p5);
  return section;
}

function sourceBlock(titleText: string, lines: HTMLElement[]): HTMLElement {
  const block = document.createElement('section');
  block.className = 'source-block';
  const title = document.createElement('h2');
  title.textContent = titleText;
  const list = document.createElement('ul');
  for (const line of lines) {
    const item = document.createElement('li');
    item.append(line);
    list.append(item);
  }
  block.append(title, list);
  return block;
}

function textLine(value: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = value;
  return span;
}

function linkLine(label: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noreferrer noopener';
  link.textContent = label;
  return link;
}

function buildNotFound(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'site-section not-found-section';

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = 'Page not found';

  const p = document.createElement('p');
  p.append(
    document.createTextNode('Nothing here. Try the '),
    aboutLink('home page', '/'),
    document.createTextNode(', or let me know what you were looking for via '),
    aboutLink('Contact', '/contact'),
    document.createTextNode('.'),
  );

  section.append(heading, p);
  return section;
}
