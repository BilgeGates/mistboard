// Static content pages — about / source / faq / terms / not-found / articles / rules.

import './pages-static.css';

import { buildNav, GITHUB_URL } from './site-shell.js';

type PublicStatsMode = 'pvp' | 'pve' | 'eve';

type PublicStatsDay = {
  date: string;
  completedGames: number;
  cumulativeGames: number;
};

type PublicSiteStats = {
  generatedAt: string;
  totalCompletedGames: number;
  last30dCompletedGames: number;
  publicGames: number;
  modeTotals: Record<PublicStatsMode, number>;
  dailyCompletedGames: PublicStatsDay[];
};

const publicStatsModes: Array<{
  key: PublicStatsMode;
  label: string;
}> = [
  { key: 'pvp', label: 'Player vs player' },
  { key: 'pve', label: 'Player vs engine' },
  { key: 'eve', label: 'Engine lab' },
];

const numberFormat = new Intl.NumberFormat('en-US');

export function mountAbout(root: HTMLElement): void {
  root.replaceChildren();
  root.classList.add('landing-page', 'about-route');
  root.append(buildNav(), buildAbout());
}

export function mountSource(root: HTMLElement): void {
  root.replaceChildren();
  root.classList.add('landing-page', 'source-route');
  root.append(buildNav(), buildSource());
}

export function mountFaq(root: HTMLElement): void {
  root.replaceChildren();
  root.classList.add('landing-page', 'faq-route');
  root.append(buildNav(), buildFaq());
}

export function mountTerms(root: HTMLElement): void {
  root.replaceChildren();
  root.classList.add('landing-page', 'terms-route');
  root.append(buildNav(), buildTerms());
}

export function mountPrivacy(root: HTMLElement): void {
  root.replaceChildren();
  root.classList.add('landing-page', 'privacy-route');
  root.append(buildNav(), buildPrivacy());
}

export function mountNotFound(root: HTMLElement): void {
  root.replaceChildren();
  root.classList.add('landing-page', 'not-found-route');
  root.append(buildNav(), buildNotFound());
}

export async function mountArticlesIndex(
  root: HTMLElement,
  lang?: import('./article-i18n.js').ArticleLang | null,
): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'articles-route');
  const { buildArticlesIndex, mountArticleThumbnails } = await import('./articles.js');
  const index = buildArticlesIndex(lang ?? undefined);
  root.append(buildNav(), index);
  mountArticleThumbnails(index);
}

export async function mountRulesIndex(
  root: HTMLElement,
  lang?: import('./article-i18n.js').ArticleLang | null,
): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'articles-route', 'rules-route');
  const { buildRulesIndex, mountArticleThumbnails } = await import('./articles.js');
  const index = buildRulesIndex(lang ?? undefined);
  root.append(buildNav(), index);
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
  const { setBoardFamily, xiangqiAppearanceEnabled } = await import('./theme.js');
  const base = findArticle(slug);
  // Show the family's board/piece pickers while the article is open so the
  // diagrams react to the right controls (xiangqi only when its flag is on).
  setBoardFamily(base?.boardFamily === 'xiangqi' && xiangqiAppearanceEnabled() ? 'xiangqi' : 'chess');
  const article = base && lang ? translateArticle(base, lang) : base;
  if (article) document.title = `${article.title} · Mistboard`;
  const articlePage = buildArticlePage(slug, lang ?? undefined);
  root.append(buildNav(), articlePage);
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
    'Play dark chess over a link, join the lobby, or play an engine. Afterward, review the game from either player’s perspective or with the full board revealed. Rules and articles cover openings and future hidden-information variants such as dark xiangqi.',
  ]);

  const fairnessHeading = aboutSubheading('Trust by design');
  const fairnessP = aboutParagraph([
    'Fog of war has to be enforced by software, not trust. The server owns the full game state and sends each browser only what that player is allowed to see. Live games are not spectatable; full-truth review unlocks only after a game has finished.',
  ]);

  const engineHeading = aboutSubheading('Engines for hidden-information games');
  const engineP = aboutParagraph([
    'Mistboard hosts and develops engines for hidden-information play. They compete through the same redacted view a human player receives, making engine games useful both as opponents and as research artifacts.',
  ]);

  const oss1Heading = aboutSubheading('Open source foundation');
  const oss1P = aboutParagraph([
    'Mistboard is published under AGPL-3.0-or-later on ',
    aboutExternalLink('GitHub', GITHUB_URL),
    '. The rules, visibility boundary, replay model, and public site code are inspectable. Contributions, bug reports, and article drafts are welcome. See ',
    aboutLink('Source', '/source'),
    ' for license and third-party credits.',
  ]);

  const platformActivity = buildPlatformActivity();
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
    platformActivity,
  );
  void hydratePlatformActivity(platformActivity);
  return section;
}

function buildPlatformActivity(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'platform-activity';
  section.setAttribute('aria-labelledby', 'platform-activity-heading');

  const heading = document.createElement('h2');
  heading.id = 'platform-activity-heading';
  heading.className = 'about-subheading';
  heading.textContent = 'Player game activity';

  const intro = aboutParagraph([
    'Mistboard tracks completed games as durable replay records. The main totals count player-facing games only: player vs player and player vs engine. Engine lab games are shown separately because they can be generated in batches.',
  ]);

  const body = document.createElement('div');
  body.className = 'platform-activity-body';
  body.setAttribute('aria-live', 'polite');
  renderPlatformActivityLoading(body);

  section.append(heading, intro, body);
  return section;
}

async function hydratePlatformActivity(section: HTMLElement): Promise<void> {
  const body = section.querySelector<HTMLElement>('.platform-activity-body');
  if (!body) return;
  try {
    const stats = await fetchPublicStats();
    renderPlatformActivityStats(body, stats);
  } catch {
    renderPlatformActivityUnavailable(body);
  }
}

async function fetchPublicStats(): Promise<PublicSiteStats> {
  const response = await fetch('/api/stats/public', { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`stats unavailable: ${response.status}`);
  return (await response.json()) as PublicSiteStats;
}

function renderPlatformActivityLoading(body: HTMLElement): void {
  const loading = document.createElement('p');
  loading.className = 'platform-activity-status';
  loading.textContent = 'Loading activity totals...';
  body.replaceChildren(loading);
}

function renderPlatformActivityUnavailable(body: HTMLElement): void {
  const status = document.createElement('p');
  status.className = 'platform-activity-status';
  status.textContent = 'Activity totals are unavailable while persistent storage is offline.';
  body.replaceChildren(status);
}

function renderPlatformActivityStats(body: HTMLElement, stats: PublicSiteStats): void {
  const summary = document.createElement('p');
  summary.className = 'platform-activity-summary';
  summary.append(
    document.createTextNode(
      `${numberFormat.format(stats.totalCompletedGames)} player-facing completed games tracked`,
    ),
  );
  if (stats.last30dCompletedGames > 0) {
    summary.append(
      document.createTextNode(
        `, including ${numberFormat.format(stats.last30dCompletedGames)} in the last 30 days`,
      ),
    );
  }
  summary.append(document.createTextNode('.'));
  const chart = buildActivityChart(stats.dailyCompletedGames);
  body.replaceChildren(summary, chart, buildModeSplit(stats.modeTotals));
}

function buildActivityChart(days: PublicStatsDay[]): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'platform-activity-chart';

  const label = document.createElement('h3');
  label.textContent = 'Cumulative player-facing games';

  if (days.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'platform-activity-status';
    empty.textContent = 'No completed games have been recorded yet.';
    panel.append(label, empty);
    return panel;
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 340 150');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    `${numberFormat.format(days.at(-1)?.cumulativeGames ?? 0)} completed games over time`,
  );

  const yScale = yAxisScale(days);
  const xTicks = xAxisTicks(days);
  const points = chartPoints(days, yScale.max);
  const area = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  area.setAttribute('class', 'platform-activity-area');
  area.setAttribute(
    'points',
    `${points} ${chartBounds.xMax},${chartBounds.yMax} ${chartBounds.xMin},${chartBounds.yMax}`,
  );

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('class', 'platform-activity-line');
  line.setAttribute('points', points);

  svg.append(buildYGrid(yScale), buildXAxisTicks(xTicks), area, line);

  panel.append(label, svg);
  return panel;
}

const chartBounds = {
  xMin: 42,
  xMax: 322,
  yMin: 20,
  yMax: 112,
};

function chartPoints(days: PublicStatsDay[], scaleMax: number): string {
  return chartCoordinates(days, scaleMax)
    .map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');
}

function chartCoordinates(
  days: PublicStatsDay[],
  scaleMax: number,
): Array<{
  x: number;
  y: number;
}> {
  const max = Math.max(scaleMax, 1);
  return days.map((day, index) => {
    const x =
      days.length === 1
        ? (chartBounds.xMin + chartBounds.xMax) / 2
        : chartBounds.xMin + (index / (days.length - 1)) * (chartBounds.xMax - chartBounds.xMin);
    const y =
      chartBounds.yMax - (day.cumulativeGames / max) * (chartBounds.yMax - chartBounds.yMin);
    return { x, y };
  });
}

function buildYGrid(scale: { max: number; ticks: number[] }): SVGElement {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('class', 'platform-activity-y-axis');
  for (const tick of scale.ticks) {
    const y = chartBounds.yMax - (tick / scale.max) * (chartBounds.yMax - chartBounds.yMin);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(chartBounds.xMin));
    line.setAttribute('x2', String(chartBounds.xMax));
    line.setAttribute('y1', y.toFixed(1));
    line.setAttribute('y2', y.toFixed(1));
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(chartBounds.xMin - 10));
    label.setAttribute('y', String(y + 4));
    label.textContent = numberFormat.format(tick);
    group.append(line, label);
  }
  return group;
}

function buildXAxisTicks(ticks: Array<{ position: number; date: string }>): SVGElement {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('class', 'platform-activity-x-axis');
  for (const tick of ticks) {
    const x = chartBounds.xMin + tick.position * (chartBounds.xMax - chartBounds.xMin);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x.toFixed(1));
    line.setAttribute('x2', x.toFixed(1));
    line.setAttribute('y1', String(chartBounds.yMax));
    line.setAttribute('y2', String(chartBounds.yMax + 5));
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', x.toFixed(1));
    label.setAttribute('y', String(chartBounds.yMax + 20));
    label.textContent = formatDateLabel(tick.date);
    group.append(line, label);
  }
  return group;
}

function yAxisScale(days: PublicStatsDay[]): { max: number; ticks: number[] } {
  const max = chartMax(days);
  if (max <= 6) return { max, ticks: Array.from({ length: max + 1 }, (_, i) => i) };
  const step = niceTickStep(max / 3);
  const scaleMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= scaleMax; value += step) ticks.push(value);
  return { max: scaleMax, ticks };
}

function chartMax(days: PublicStatsDay[]): number {
  return Math.max(...days.map((day) => day.cumulativeGames), 1);
}

function niceTickStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function xAxisTicks(days: PublicStatsDay[]): Array<{ position: number; date: string }> {
  if (days.length === 1) return [{ position: 0.5, date: days[0]?.date ?? '' }];
  const tickCount = Math.min(days.length, 5);
  const lastIndex = days.length - 1;
  const ticks: Array<{ position: number; date: string }> = [];
  for (let i = 0; i < tickCount; i++) {
    const position = i / (tickCount - 1);
    const index = Math.round(position * lastIndex);
    const day = days[index];
    if (day) ticks.push({ position, date: day.date });
  }
  return ticks;
}

function buildModeSplit(modeTotals: Record<PublicStatsMode, number>): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'platform-activity-mode-list';
  list.setAttribute('aria-label', 'Mode split');
  for (const mode of publicStatsModes) {
    const item = document.createElement('li');
    item.className = `platform-activity-mode-item mode-${mode.key}`;

    const name = document.createElement('span');
    name.textContent = `${mode.label} `;

    const value = document.createElement('strong');
    value.textContent = numberFormat.format(modeTotals[mode.key] ?? 0);

    item.append(name, value);
    list.append(item);
  }

  return list;
}

function formatDateLabel(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00.000Z`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
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
    aboutLink('rules reference', '/rules'),
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
    ', so this trust boundary can be inspected. Outside assistance, account abuse, and attempts to break the fog filter are still fair-play violations.',
  ]);

  const q4 = aboutSubheading('Do Mistboard engines see the full board?');
  const a4 = aboutParagraph([
    'No. Engines get the same fogged view for their side, plus only the game facts that side is allowed to know. They are truly playing dark chess and hidden-information variants, not cheating by seeing the true board. The true board stays server-side for adjudication.',
  ]);

  const q5 = aboutSubheading('How does rated play work?');
  const a5 = aboutParagraph([
    'Rated dark chess is account-backed human-vs-human play. During beta, the ladder may be provisional while ratings calibrate. Engine games and casual games do not count.',
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
