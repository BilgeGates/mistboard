// Static content pages — about / source / faq / terms / not-found / articles.

import { buildFooter, buildNav, GITHUB_URL } from './site-shell.js';

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

export function mountPrivacy(root: HTMLElement): void {
  root.replaceChildren();
  root.classList.add('landing-page', 'privacy-route');
  root.append(buildNav(), buildPrivacy(), buildFooter());
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

export async function mountArticle(
  root: HTMLElement,
  slug: string,
  lang?: import('./article-i18n.js').ArticleLang | null,
): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'articles-route');
  const { buildArticlePage, mountPendingWidgets, mountArticleEnhancements } = await import(
    './articles.js'
  );
  const { findArticle } = await import('./articles-data.js');
  const { translateArticle } = await import('./article-i18n.js');
  const base = findArticle(slug);
  const article = base && lang ? translateArticle(base, lang) : base;
  if (article) document.title = `${article.title} · Mistboard`;
  const articlePage = buildArticlePage(slug, lang ?? undefined);
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
    'Mistboard is a free, open-source platform for board games with fog of war, starting with dark chess.',
  ]);

  const whyHeading = aboutSubheading('Why this site exists');
  const whyP = aboutParagraph([
    'Hidden-information games have captured players’ imaginations for generations because the board is never just a board. Every move asks what you can see, what you can infer, what you are willing to risk, and what your opponent may be hiding. Mistboard exists to make that kind of play easy to start, fair to finish, and interesting to study.',
  ]);

  const rulesHeading = aboutSubheading('What dark chess is');
  const rulesP = aboutParagraph([
    'Dark chess is hidden-information chess. You see your own pieces and the squares they could legally move to. Everything else is dark. The game ends when a king is captured.',
  ]);

  const featuresHeading = aboutSubheading('Play and study');
  const featuresP = aboutParagraph([
    'Play dark chess over a link, join the lobby, or play an engine. Afterward, review the game from either player’s perspective or with the full board revealed. Read the ',
    aboutLink('articles', '/articles'),
    ' for rules, openings, variants such as Draft960, and engine research.',
  ]);

  const fairnessHeading = aboutSubheading('Trust by design');
  const fairnessP = aboutParagraph([
    'Fog of war has to be enforced by software, not trust. The server owns the full game state and sends each browser only what that player is allowed to see. Replays preserve both player perspectives, so finished games can be studied without weakening live hidden information.',
  ]);

  const engineHeading = aboutSubheading('Engines for hidden-information games');
  const engineP = aboutParagraph([
    'Mistboard hosts and develops engines for hidden-information play. They compete through the same redacted view a human player receives, making engine games useful as opponents, benchmarks, and research artifacts. The aim is for best-in-class fog-of-war engines to be playable, comparable, and inspectable.',
  ]);

  const oss1Heading = aboutSubheading('Open source foundation');
  const oss1P = aboutParagraph([
    'Mistboard is published under AGPL-3.0-or-later on ',
    aboutExternalLink('GitHub', GITHUB_URL),
    '. The rules, visibility boundary, replay model, and public site code are inspectable. Contributions, bug reports, and article drafts are welcome. See ',
    aboutLink('Source', '/source'),
    ' for license and third-party credits.',
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
    whyHeading,
    whyP,
    rulesHeading,
    rulesP,
    featuresHeading,
    featuresP,
    fairnessHeading,
    fairnessP,
    engineHeading,
    engineP,
    oss1Heading,
    oss1P,
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
    aboutLink('rules reference', '/articles/dark-chess-rules'),
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

  const q3 = aboutSubheading('How does Mistboard prevent cheating?');
  const a3 = aboutParagraph([
    'Mistboard is built so the hidden board is not sitting in your opponent’s browser waiting to be uncovered. The server owns the full position, computes each seat’s legal view, and sends only that redacted view over the wire. The code is ',
    aboutExternalLink('open source', GITHUB_URL),
    ', so this trust boundary can be inspected. See ',
    aboutLink('Server-Enforced Dark Chess', '/articles/server-enforced-fog'),
    ' for the model and checks. Outside assistance, account abuse, and attempts to break the fog filter are still fair-play violations.',
  ]);

  const q4 = aboutSubheading('Do Mistboard engines see the full board?');
  const a4 = aboutParagraph([
    'No. Engines get the same fogged view for their side, plus only the game facts that side is allowed to know. They are truly playing dark chess and hidden-information variants, not cheating by seeing the true board. The true board stays server-side for adjudication.',
  ]);

  const q5 = aboutSubheading('How does rated play work?');
  const a5 = aboutParagraph([
    'Rated dark chess is account-backed human-vs-human play. During beta, the ladder may be provisional while ratings calibrate. Engine games and casual games do not count. See ',
    aboutLink('Server-Enforced Dark Chess', '/articles/server-enforced-fog'),
    ' for the trust model.',
  ]);

  section.append(heading, q1, a1, q2, a2, q3, a3, q4, a4, q5, a5);
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

  const hr1 = aboutSubheading('Rated play needs an account');
  const pr1 = aboutParagraph([
    'Casual and link-based games stay anonymous and free. Rated play needs an account, so a rating belongs to a person. One person, one account.',
  ]);

  const hr2 = aboutSubheading('Ratings belong to the system');
  const pr2 = aboutParagraph([
    'We decide how ratings are calculated and what they mean. We may set, adjust, recompute, void, or reset any rating or the ladder itself, and change how the system works, at any time. A rating is a measurement we publish, not something you own.',
  ]);

  const hr3 = aboutSubheading('Fair play');
  const pr3 = aboutParagraph([
    'Rated play only works if results are honest. We don’t tolerate outside assistance, manipulating your own or others’ ratings, or any attempt to game the ladder. We decide what crosses the line, and we may remove ratings or accounts when it does.',
  ]);

  const hr4 = aboutSubheading('Integrity data');
  const pr4 = aboutParagraph([
    'We collect and analyze game and account data to protect the integrity of rated play. How we investigate, and what we do about it, is our call. See ',
    aboutLink('Privacy', '/privacy'),
    ' for what we collect.',
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

  section.append(
    heading,
    intro,
    h1,
    p1,
    h2,
    p2,
    h3,
    p3,
    hr1,
    pr1,
    hr2,
    pr2,
    hr3,
    pr3,
    hr4,
    pr4,
    h4,
    p4,
    h5,
    p5,
  );
  return section;
}

function buildPrivacy(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'site-section terms-section';

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = 'Privacy';

  const intro = aboutParagraph([
    'Mistboard is a free, open-source hobby project. This page describes what we collect on the hosted site at mistboard.com. It will change as the project grows; this page is always the current version.',
  ]);

  const h1 = aboutSubheading('What we collect');
  const p1 = aboutParagraph([
    'Aggregate analytics, the games you play, and, if you make an account, your handle and email. We collect more around rated play to keep it honest.',
  ]);

  const h2 = aboutSubheading('What we don’t do');
  const p2 = aboutParagraph([
    'No ads. We don’t sell your data. No recordings of your screen. We respect Do Not Track. Casual play needs no account.',
  ]);

  const h3 = aboutSubheading('Your games are public');
  const p3 = aboutParagraph([
    'Finished games are published under ',
    aboutExternalLink('CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'),
    '. To take down a specific game, use ',
    aboutLink('Contact', '/contact'),
    '.',
  ]);

  const h4 = aboutSubheading('What we promise, and don’t');
  const p4 = aboutParagraph([
    'We promise to keep hidden information hidden on the server and to tell you what we collect. We don’t promise your data, account, or rating survives development. It can change or disappear without notice. Don’t put anything on Mistboard you can’t afford to lose.',
  ]);

  section.append(heading, intro, h1, p1, h2, p2, h3, p3, h4, p4);
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
