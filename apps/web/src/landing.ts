import { TIME_CONTROLS, type Board, type GameEvent, type PlayerView, type Square, type TimeControlId } from '@mistboard/game';
import type * as cg from 'chessground/types';
import { createReadOnlyBoard, hiddenSquareClasses, setBoardPosition } from '@mistboard/board-render/interactive';
import { mountReplay, type GameMeta } from './replay.js';
import { loadGameForReview, enginePanelsForReview } from './review.js';
import { buildContact } from './contact.js';
import { primaryNavItems, utilityNavItems } from './nav-items.js';
import { classifyTimeControl, track } from './analytics.js';
import { announcements, type Announcement } from './announcements.js';
import { findArticle } from './articles-data.js';
import { renderArticleThumbnail, mountArticleThumbnails } from './articles.js';
import { isLikelySignedIn, loadCachedCurrentUser, readCachedUser } from './account-nav.js';

type FeaturedGame = {
  roomId: string;
  variant: string;
  mode?: 'pvp' | 'pve' | 'eve' | 'imported' | 'manual';
  result: string;
  termination: string;
  plyCount: number;
  whiteName: string | null;
  blackName: string | null;
  corpusId: string | null;
  endedAt?: string;
  jobId?: string | null;
  gameIndex?: number | null;
  whiteEngineId?: string | null;
  blackEngineId?: string | null;
  timeControl?: Record<string, unknown> | null;
  participants?: GameParticipant[];
  playerColor?: 'white' | 'black';
};

type GameParticipant = {
  color: 'white' | 'black';
  displayName: string;
  subjectType: 'guest' | 'user' | 'engine-version' | 'manual' | 'imported';
  subjectId: string | null;
  visibility: 'private' | 'link' | 'unlisted' | 'public';
};

type PlayableEngine = {
  id: string;
  name: string;
  familyName: string;
  kind: string;
};

type AuthUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  handle: string;
  handleChangedAt: string | null;
  displayName: string;
  displayNameChangedAt: string | null;
  profileVisibility: 'private' | 'unlisted' | 'public';
  accountRole: 'player' | 'test' | 'admin';
};

type LandingGameSource = 'recent' | 'eve' | 'sample';
type LandingPlayChoice = {
  engineId?: string;
  engines?: PlayableEngine[];
  mode: 'lobby' | 'pvp' | 'pve';
  ratedDisabled?: boolean;
  title: string;
};
type LandingStartFormat = 'standard' | 'draft960';
type LandingTimePresetId = TimeControlId;
type LandingTimePreset = {
  id: LandingTimePresetId;
  label: string;
  initialMs: number;
  incrementMs: number;
};
type LandingColorPreference = 'white' | 'black' | 'random';
type LandingRoomSetup = {
  startFormat: LandingStartFormat;
  rated: boolean;
  timeControl: {
    initialMs: number;
    incrementMs: number;
  };
  preferredColor: LandingColorPreference;
};
type LobbyTicketResponse = {
  pollAfterMs?: number;
  status?: 'waiting' | 'matched';
  ticketId?: string;
  url?: string;
};
type OpenLobbyRequest = {
  hiddenDraft960: boolean;
  rated?: boolean;
  timeControl: {
    initialMs: number;
    incrementMs: number;
  };
  waitingMs: number;
};

const GITHUB_URL = 'https://github.com/brianhliou/mistboard';
const LANDING_TIME_PRESETS: LandingTimePreset[] = TIME_CONTROLS.map((tc) => ({
  id: tc.id,
  label: tc.label,
  initialMs: tc.initialMs,
  incrementMs: tc.incrementMs,
}));

export async function mountLanding(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page');
  root.append(buildNav(), buildLoadingState('Loading games'), buildFooter());

  const [{ games: allGames }, engines] = await Promise.all([
    fetchLandingGames(),
    fetchPlayableEngines().catch((err) => {
      console.warn(err);
      return fallbackPlayableEngines();
    }),
  ]);
  const games = allGames.filter(isHeroEligibleGame);
  const stage = buildLandingStage(engines);
  root.replaceChildren(buildNav(), stage.el, buildFooter());
  mountArticleThumbnails(stage.el);
  if (games.length === 0) {
    stage.replayRoot.textContent = 'No games available yet.';
    return;
  }

  const metadataByRoomId: Record<string, GameMeta> = {};
  const povByRoomId: Record<string, 'white' | 'black'> = {};
  for (const g of games) {
    metadataByRoomId[g.roomId] = gameMetaForGame(g);
    povByRoomId[g.roomId] = pickHeroPovForGame(g);
  }

  const params = new URLSearchParams(window.location.search);
  const requested = params.get('demo');
  const sampleIds = games.map((g) => g.roomId);
  const currentSample =
    requested && sampleIds.includes(requested) ? requested : pickSample(sampleIds);

  await mountReplay(stage.replayRoot, currentSample, {
    autoplay: true,
    showControls: false,
    revealOnFinish: false,
    blackOrientation: 'white',
    loopSamples: sampleIds,
    loaderForId: landingEventLoader,
    metadataMode: 'compact',
    metadataByRoomId,
    hideGameIdPill: true,
    panes: { resolver: (sampleId) => povByRoomId[sampleId] ?? 'white' },
  });
}

function pickHeroPovForGame(game: FeaturedGame): 'white' | 'black' {
  // PvE: show the human player's POV.
  if (game.mode === 'pve' && game.playerColor) return game.playerColor;
  // EvE / PvP / unknown: show the winner; draws and unknown results fall back to white.
  if (game.result === '0-1') return 'black';
  return 'white';
}

// Weak engines that make for unimpressive hero demos. Used only by the landing
// hero; /watch still shows everything.
const HERO_INELIGIBLE_ENGINE_IDS = new Set([
  'builtin-random-legal',
  'python-random-legal',
  'builtin-capture-seeker',
]);

function isHeroEligibleGame(game: FeaturedGame): boolean {
  for (const participant of game.participants ?? []) {
    if (participant.subjectType !== 'engine-version') continue;
    if (participant.subjectId && HERO_INELIGIBLE_ENGINE_IDS.has(participant.subjectId)) {
      return false;
    }
  }
  return true;
}

export async function mountWatch(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'watch-route');
  root.append(buildNav(), buildLoadingState('Loading replays'), buildFooter());

  const { games, source } = await fetchLandingGames();
  const watch = buildWatchSection();
  root.replaceChildren(buildNav(), watch.el, buildFooter());

  if (games.length === 0) {
    watch.replayRoot.textContent = 'No games available yet.';
    renderRecentGames(watch.listRoot, games, source);
    return;
  }

  const metadataByRoomId: Record<string, GameMeta> = {};
  for (const g of games) {
    metadataByRoomId[g.roomId] = gameMetaForGame(g);
  }

  const params = new URLSearchParams(window.location.search);
  const requested = params.get('game');
  const sampleIds = games.map((g) => g.roomId);
  const currentSample =
    requested && sampleIds.includes(requested) ? requested : sampleIds[0]!;

  await mountReplay(watch.replayRoot, currentSample, {
    autoplay: false,
    showControls: true,
    revealOnFinish: true,
    loopSamples: sampleIds,
    loaderForId: apiEventLoader,
    metadataByRoomId,
  });
  renderRecentGames(watch.listRoot, games, source, currentSample, '/game/');
}

export async function mountGame(root: HTMLElement, roomId: string): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'game-route');

  const shell = document.createElement('main');
  shell.className = 'game-shell';
  const replayRoot = document.createElement('div');
  replayRoot.className = 'game-replay';
  shell.append(replayRoot);
  root.append(buildNav(), shell, buildFooter());

  const loaded = await loadGameForReview(roomId);
  if (!loaded) {
    replayRoot.append(buildNotice('Game not found', 'This game is not available as a public replay.'));
    return;
  }

  const { game, events } = loaded;
  document.title = buildGamePageTitle(game);
  const exportLinks = buildGameExportLinks(game.roomId, game.variant);
  if (exportLinks) shell.append(exportLinks);
  await mountReplay(replayRoot, game.roomId, {
    autoplay: false,
    initialPly: initialGamePly(),
    onPlyChange: syncGamePlyUrl,
    showControls: true,
    controlsMode: 'panel',
    metadataMode: 'header',
    // FoW review preserves each player's perspective: keep their fog as it
    // was at game end. Truth is always shown on the truth pane; the only
    // post-finish change to the POVs is the king-capture attacker reveal —
    // i.e. the attacker becoming visible at the moment of death, which is
    // what the loser actually saw.
    revealOnFinish: false,
    loaderForId: events ? async () => events : apiEventLoader,
    metadataByRoomId: {
      [game.roomId]: gameMetaForGame(game),
    },
    enginePanels: loaded.review
      ? enginePanelsForReview(
          loaded.review,
          loaded.beliefRows.length > 0,
          loaded.beliefRows.length > 0 && loaded.traceRows.length > 0,
        )
      : undefined,
    belief: loaded.beliefRows.length > 0
      ? {
          rowsForSampleId: () => loaded.beliefRows,
          traceRowsForSampleId: () => loaded.traceRows,
        }
      : undefined,
    // Annotation panel is research-only — not shown on the public game viewer
    // (use a dedicated research surface when annotating).
    annotation: undefined,
  });
}

async function fetchLandingGames(): Promise<{ games: FeaturedGame[]; source: LandingGameSource }> {
  const recentGames = await fetchRecentGames().catch((err) => {
    console.warn(err);
    return [];
  });
  if (recentGames.length > 0) return { games: recentGames, source: 'recent' };
  const eveGames = await fetchRecentEveGames().catch((err) => {
    console.warn(err);
    return [];
  });
  if (eveGames.length > 0) return { games: eveGames, source: 'eve' };
  return { games: staticSampleGames(), source: 'sample' };
}


async function fetchRecentGames(): Promise<FeaturedGame[]> {
  const resp = await fetch('/api/games/recent');
  if (!resp.ok) throw new Error(`failed to load recent games: ${resp.status}`);
  const data = (await resp.json()) as { games: FeaturedGame[] };
  return data.games;
}

async function fetchRecentEveGames(): Promise<FeaturedGame[]> {
  const resp = await fetch('/api/eve-games/recent');
  if (!resp.ok) throw new Error(`failed to load recent EvE games: ${resp.status}`);
  const data = (await resp.json()) as { games: FeaturedGame[] };
  return data.games;
}

async function fetchPlayableEngines(): Promise<PlayableEngine[]> {
  const resp = await fetch('/api/engines/playable');
  if (!resp.ok) throw new Error(`failed to load playable engines: ${resp.status}`);
  const data = (await resp.json()) as { engines: PlayableEngine[] };
  return data.engines.length > 0 ? data.engines : fallbackPlayableEngines();
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const resp = await fetch('/api/auth/me');
  if (!resp.ok) throw new Error(`failed to load account: ${resp.status}`);
  const data = (await resp.json()) as { user: AuthUser | null };
  return data.user;
}

function fallbackPlayableEngines(): PlayableEngine[] {
  return [{
    id: 'builtin-random-legal',
    name: 'Random Legal v1',
    familyName: 'Random Legal',
    kind: 'builtin',
  }];
}

async function apiEventLoader(roomId: string): Promise<GameEvent[]> {
  const resp = await fetch(`/api/games/${encodeURIComponent(roomId)}/events`);
  if (!resp.ok) throw new Error(`failed to load events for ${roomId}: ${resp.status}`);
  const data = (await resp.json()) as { events: GameEvent[] };
  return data.events;
}


async function landingEventLoader(roomId: string): Promise<GameEvent[]> {
  const apiEvents = await apiEventLoader(roomId).catch(() => null);
  if (apiEvents) return apiEvents;
  // Only fall back to bundled static samples for synthetic IDs — real DB room IDs (UUIDs, engine
  // corpus IDs) won't have a matching file and would get the Vite SPA HTML fallback.
  if (!/^sample-\d+$/.test(roomId)) throw new Error(`no events for game: ${roomId}`);
  return fetchStaticSample(roomId);
}

async function fetchStaticSample(sampleId: string): Promise<GameEvent[]> {
  const safeId = sampleId.replace(/[^a-zA-Z0-9_-]/g, '');
  const resp = await fetch(`/replay-samples/${safeId}.jsonl`);
  if (!resp.ok) throw new Error(`failed to load replay sample ${safeId}: ${resp.status}`);
  // Vite's SPA fallback returns 200 + text/html for any unmatched path. Detect it so we get a
  // clear error instead of a JSON.parse crash on <!doctype html>.
  const contentType = resp.headers.get('content-type') ?? '';
  if (contentType.startsWith('text/html')) throw new Error(`static sample not found: ${safeId}`);
  const text = await resp.text();
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as GameEvent);
}

function staticSampleGames(): FeaturedGame[] {
  return Array.from({ length: 7 }, (_, index) => ({
    roomId: `sample-${index + 1}`,
    variant: 'fog-of-war',
    mode: 'manual',
    result: index % 3 === 0 ? 'white-wins' : index % 3 === 1 ? 'black-wins' : 'draw',
    termination: index % 3 === 2 ? 'draw' : 'king-captured',
    plyCount: 24 + index * 3,
    whiteName: 'White',
    blackName: 'Black',
    corpusId: 'replay-samples',
    participants: [
      {
        color: 'white',
        displayName: 'White',
        subjectType: 'manual',
        subjectId: null,
        visibility: 'public',
      },
      {
        color: 'black',
        displayName: 'Black',
        subjectType: 'manual',
        subjectId: null,
        visibility: 'public',
      },
    ],
  }));
}

function gameMetaForGame(game: FeaturedGame): GameMeta {
  return {
    whiteName: displayParticipantName(game, 'white'),
    blackName: displayParticipantName(game, 'black'),
    gameUrl: reviewUrlForGame(game),
    modeLabel: sourceLabel(game.mode),
    result: game.result,
    timeControl: game.timeControl,
    termination: game.termination,
    plyCount: game.plyCount,
  };
}

function reviewUrlForGame(game: FeaturedGame): string | null {
  if (game.corpusId === 'replay-samples') return null;
  return `/game/${encodeURIComponent(game.roomId)}`;
}

export function displayParticipantName(game: FeaturedGame, color: 'white' | 'black'): string {
  const participant = participantForColor(game, color);
  if (participant) return displayParticipant(participant.displayName, color === 'white' ? 'White' : 'Black', participant.subjectId);
  const fallback = color === 'white' ? 'White' : 'Black';
  const legacyName = color === 'white'
    ? game.whiteEngineId ?? game.whiteName
    : game.blackEngineId ?? game.blackName;
  return displayParticipant(legacyName, fallback);
}

function participantForColor(game: FeaturedGame, color: 'white' | 'black'): GameParticipant | null {
  return game.participants?.find((participant) => participant.color === color) ?? null;
}

function displayParticipant(name: string | null | undefined, fallback: string, subjectId?: string | null): string {
  const detailed = engineDisplayName(subjectId ?? name);
  if (detailed) return detailed;
  if (!name) return fallback;
  return name;
}

export function sourceLabel(mode: FeaturedGame['mode']): string {
  if (mode === 'eve') return 'Engine vs engine';
  if (mode === 'pve') return 'Human vs engine';
  if (mode === 'pvp') return 'Human vs human';
  if (mode === 'imported') return 'Imported game';
  if (mode === 'manual') return 'Manual game';
  return 'Dark chess game';
}

function initialGamePly(): number {
  const value = new URLSearchParams(window.location.search).get('ply');
  if (!value) return 0;
  const ply = Number.parseInt(value, 10);
  return Number.isFinite(ply) ? ply : 0;
}

function syncGamePlyUrl(ply: number): void {
  const url = new URL(window.location.href);
  if (ply <= 0) {
    url.searchParams.delete('ply');
  } else {
    url.searchParams.set('ply', String(ply));
  }
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

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

export function mountContact(root: HTMLElement): void {
  root.replaceChildren();
  root.classList.add('landing-page', 'contact-route');
  // Synchronous best-guess from localStorage so the lane shape and text are
  // right on first paint for returning signed-in users. The full user object
  // is cached when present (handle, email) so we can render the real banner
  // immediately; the boolean hint is a fallback for stale-cache cases.
  // Reconciled below with the authoritative cached /api/auth/me result.
  const cachedUser = readCachedUser();
  const contact = buildContact(cachedUser, isLikelySignedIn());
  root.append(buildNav(), contact.el, buildFooter());
  void loadCachedCurrentUser()
    .then((user) => contact.applyAuth(user))
    .catch(() => contact.applyAuth(null));
}

export function mountNotFound(root: HTMLElement): void {
  root.replaceChildren();
  root.classList.add('landing-page', 'not-found-route');
  root.append(buildNav(), buildNotFound(), buildFooter());
}

export function mountLearn(root: HTMLElement): void {
  root.replaceChildren();
  root.classList.add('landing-page', 'learn-route');
  const learn = buildLearn();
  root.append(buildNav(), learn.el, buildFooter());
  mountLearnBoard(learn.boardEl);
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
  const { buildArticlePage, mountPendingWidgets, mountArticleEnhancements } = await import('./articles.js');
  const { findArticle } = await import('./articles-data.js');
  const article = findArticle(slug);
  if (article) document.title = `${article.title} · Mistboard`;
  const articlePage = buildArticlePage(slug);
  root.append(buildNav(), articlePage, buildFooter());
  mountPendingWidgets(articlePage);
  mountArticleEnhancements(articlePage);
}

export function buildNav(): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'site-nav';
  nav.setAttribute('aria-label', 'Primary');

  const brand = document.createElement('a');
  brand.className = 'site-nav-brand';
  brand.href = '/';
  const brandLogo = document.createElement('img');
  brandLogo.className = 'site-nav-logo';
  brandLogo.src = '/logo.svg';
  brandLogo.alt = '';
  brandLogo.width = 28;
  brandLogo.height = 28;

  const brandText = document.createElement('span');
  brandText.textContent = 'MISTBOARD';
  brand.append(brandLogo, brandText);

  const links = document.createElement('div');
  links.className = 'site-nav-links';

  for (const item of primaryNavItems()) {
    links.append(navLink(item.label, item.href));
  }

  const utilities = document.createElement('div');
  utilities.className = 'site-nav-utilities';

  for (const item of utilityNavItems()) {
    utilities.append(navLink(item.label, item.href));
  }
  utilities.append(buildSignedOutAccountLinks());
  nav.append(brand, links, utilities);
  return nav;
}

function buildSignedOutAccountLinks(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'site-nav-auth';
  wrap.dataset.accountSlot = '';

  const path = currentPath();
  const tab: 'login' | 'register' =
    new URLSearchParams(window.location.search).get('tab') === 'register' ? 'register' : 'login';

  const signIn = document.createElement('a');
  signIn.href = '/account?tab=login';
  signIn.className = 'site-nav-link site-nav-link-signin';
  signIn.textContent = 'Sign in';
  if (path === '/account' && tab === 'login') {
    signIn.classList.add('active');
    signIn.setAttribute('aria-current', 'page');
  }

  const register = document.createElement('a');
  register.href = '/account?tab=register';
  register.className = 'site-nav-link site-nav-link-register';
  register.textContent = 'Register';
  if (path === '/account' && tab === 'register') {
    register.classList.add('active');
    register.setAttribute('aria-current', 'page');
  }

  wrap.append(signIn, register);
  return wrap;
}

function navLink(label: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  link.className = 'site-nav-link';
  const path = currentPath();
  if (path === href || (href === '/account' && path.startsWith('/account/')) || (href === '/articles' && path.startsWith('/articles/'))) {
    link.classList.add('active');
    link.setAttribute('aria-current', 'page');
  }
  return link;
}

function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

export function buildLoadingState(label: string): HTMLElement {
  const section = document.createElement('main');
  section.className = 'site-loading';
  section.setAttribute('aria-live', 'polite');

  const mark = document.createElement('div');
  mark.className = 'site-loading-mark';
  mark.setAttribute('aria-hidden', 'true');

  const text = document.createElement('p');
  text.textContent = label;

  section.append(mark, text);
  return section;
}

function buildLandingStage(engines: PlayableEngine[]): { el: HTMLElement; replayRoot: HTMLElement } {
  const stage = document.createElement('main');
  stage.className = 'landing-stage';

  const section = document.createElement('section');
  section.className = 'landing-demo';

  const boardColumn = document.createElement('div');
  boardColumn.className = 'landing-board-column';

  const heroHeader = document.createElement('header');
  heroHeader.className = 'landing-hero-header';

  const tagline = document.createElement('h1');
  tagline.className = 'landing-hero-tagline';
  tagline.textContent = 'Dark chess';

  const subtagline = document.createElement('p');
  subtagline.className = 'landing-hero-subtagline';
  subtagline.textContent = 'You only see what your pieces see.';

  heroHeader.append(tagline, subtagline);

  const replayRoot = document.createElement('div');
  replayRoot.id = 'landing-replay';

  boardColumn.append(heroHeader, replayRoot);

  const announcements = buildLandingAnnouncements();
  const playPanel = buildLandingPlayPanel(engines, { showLobbyRequests: true });

  section.append(announcements, boardColumn, playPanel);
  stage.append(section);
  return { el: stage, replayRoot };
}

function buildLandingAnnouncements(): HTMLElement {
  const panel = document.createElement('aside');
  panel.className = 'landing-announcements';
  panel.setAttribute('aria-label', 'Announcements');

  const heading = document.createElement('h2');
  heading.className = 'landing-announcements-heading';
  heading.textContent = 'Announcements';
  panel.append(heading);

  if (announcements.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'landing-announcements-empty';
    empty.textContent = 'Nothing new yet.';
    panel.append(empty);
    return panel;
  }

  const list = document.createElement('ol');
  list.className = 'landing-announcements-list';

  const ordered = [...announcements].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (b.pinned && !a.pinned) return 1;
    return b.date.localeCompare(a.date);
  });

  const MAX_VISIBLE = 3;
  const visible = ordered.slice(0, MAX_VISIBLE);
  const overflow = ordered.length - visible.length;

  for (const entry of visible) {
    list.append(renderAnnouncementCard(entry));
  }

  panel.append(list);

  if (overflow > 0) {
    const more = document.createElement('a');
    more.className = 'landing-announcements-more';
    more.href = '/articles';
    const label = document.createElement('span');
    label.textContent = 'View all announcements';
    const arrow = document.createElement('span');
    arrow.className = 'landing-announcements-more-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    more.append(label, arrow);
    panel.append(more);
  }

  return panel;
}

function renderAnnouncementCard(entry: Announcement): HTMLElement {
  const item = document.createElement('li');
  item.className = 'landing-announcement-card';
  item.classList.add(`is-${entry.kind}`);
  if (entry.pinned) item.classList.add('is-pinned');

  const isExternal = !!entry.href && /^https?:/.test(entry.href);

  const container = document.createElement(entry.href ? 'a' : 'div');
  container.className = 'landing-announcement-card-inner';
  if (entry.href && container instanceof HTMLAnchorElement) {
    container.href = entry.href;
    if (isExternal) {
      container.target = '_blank';
      container.rel = 'noopener noreferrer';
    }
    item.classList.add('is-clickable');
  }

  let thumbEl: HTMLElement | null = null;
  if (entry.kind === 'article' && entry.href) {
    const match = entry.href.match(/^\/articles\/([^/?#]+)/);
    const article = match ? findArticle(match[1]!) : undefined;
    if (article?.thumbnail) {
      thumbEl = renderArticleThumbnail(article.thumbnail);
      thumbEl.classList.add('landing-announcement-thumb');
      container.classList.add('has-thumb');
    }
  }

  const header = document.createElement('div');
  header.className = 'landing-announcement-meta';

  const kind = document.createElement('span');
  kind.className = `landing-announcement-kind kind-${entry.kind}`;
  kind.textContent = announcementKindLabel(entry.kind);
  header.append(kind);

  if (entry.date) {
    const sep = document.createElement('span');
    sep.className = 'landing-announcement-meta-sep';
    sep.setAttribute('aria-hidden', 'true');
    sep.textContent = '·';
    header.append(sep);

    const date = document.createElement('time');
    date.className = 'landing-announcement-date';
    date.dateTime = entry.date;
    date.textContent = formatAnnouncementDate(entry.date);
    header.append(date);
  }

  const headline = document.createElement('p');
  headline.className = 'landing-announcement-headline';
  headline.textContent = entry.headline;

  if (thumbEl) {
    const top = document.createElement('div');
    top.className = 'landing-announcement-top';
    const topText = document.createElement('div');
    topText.className = 'landing-announcement-top-text';
    topText.append(header, headline);
    top.append(thumbEl, topText);
    container.append(top);
  } else {
    container.append(header, headline);
  }

  if (entry.body) {
    const body = document.createElement('p');
    body.className = 'landing-announcement-body';
    body.textContent = entry.body;
    container.append(body);
  }

  if (entry.href) {
    const cta = document.createElement('span');
    cta.className = 'landing-announcement-cta';
    const label = document.createElement('span');
    label.className = 'landing-announcement-cta-label';
    label.textContent = entry.cta ?? announcementCtaLabel(entry.kind);
    const arrow = document.createElement('span');
    arrow.className = 'landing-announcement-cta-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = isExternal ? '↗' : '→';
    cta.append(label, arrow);
    container.append(cta);
  }

  item.append(container);
  return item;
}

function announcementKindLabel(kind: Announcement['kind']): string {
  switch (kind) {
    case 'status':
      return 'Status';
    case 'article':
      return 'Article';
    case 'release':
      return 'Release';
    case 'update':
      return 'Update';
  }
}

function announcementCtaLabel(kind: Announcement['kind']): string {
  switch (kind) {
    case 'status':
      return 'Learn more';
    case 'article':
      return 'Read article';
    case 'release':
      return 'See what shipped';
    case 'update':
      return 'Read update';
  }
}

function formatAnnouncementDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function buildLandingPlayPanel(engines: PlayableEngine[], options: { showLobbyRequests?: boolean } = {}): HTMLElement {
  const panel = document.createElement('aside');
  panel.className = 'landing-play-panel';
  panel.setAttribute('aria-label', 'Start playing');

  const availableEngines = engines.length > 0 ? engines : fallbackPlayableEngines();
  const defaultEngineId = availableEngines[0]?.id;
  const lobbyButton = landingPlayAction('Find opponent', 'lobby');
  const challengeButton = landingPlayAction('Challenge a friend', 'friend');
  const engineButton = landingPlayAction('Play against computer', 'computer');

  lobbyButton.addEventListener('click', () => {
    openLandingSetupDialog({
      mode: 'lobby',
      title: 'Find opponent',
      ratedDisabled: true,
    });
  });
  challengeButton.addEventListener('click', () => {
    openLandingSetupDialog({
      mode: 'pvp',
      title: 'Challenge a friend',
      ratedDisabled: true,
    });
  });
  engineButton.addEventListener('click', () => {
    openLandingSetupDialog({
      engineId: defaultEngineId,
      engines: availableEngines,
      mode: 'pve',
      title: 'Play against computer',
    });
  });

  panel.append(lobbyButton, challengeButton, engineButton);

  const anonNote = document.createElement('p');
  anonNote.className = 'landing-play-anon-note';
  anonNote.textContent = 'No account needed.';
  panel.append(anonNote);

  const stats = document.createElement('p');
  stats.className = 'landing-play-stats';
  stats.hidden = true;
  panel.append(stats);
  startLiveStatsPolling(stats);

  if (options.showLobbyRequests) {
    panel.append(buildLobbyRequestsWindow());
  }
  return panel;
}

function startLiveStatsPolling(stats: HTMLElement): void {
  const render = (data: { playing: number; online: number } | null) => {
    if (!data || (data.playing === 0 && data.online === 0)) {
      stats.hidden = true;
      stats.textContent = '';
      return;
    }
    const parts: string[] = [];
    if (data.playing > 0) parts.push(`${data.playing} playing now`);
    if (data.online > 0) parts.push(`${data.online} online`);
    stats.textContent = parts.join(' · ');
    stats.hidden = false;
  };

  const refresh = async () => {
    try {
      const resp = await fetch('/api/live-stats');
      if (!resp.ok) return;
      const data = (await resp.json()) as { playing: number; online: number };
      render(data);
    } catch (err) {
      console.warn(err);
    }
  };

  void refresh();
  const timer = window.setInterval(() => {
    if (!document.body.contains(stats)) {
      window.clearInterval(timer);
      return;
    }
    void refresh();
  }, 5_000);
}

const LANDING_PLAY_ICON_SVG: Record<'computer' | 'friend' | 'lobby', string> = {
  lobby: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="5.5" cy="5.5" r="2"/><path d="M2.5 16.5 4 9.5h3l1.5 7z"/><rect x="2" y="16.5" width="7" height="2" rx="0.5"/><circle cx="18.5" cy="5.5" r="2"/><path d="M15.5 16.5 17 9.5h3l1.5 7z"/><rect x="15" y="16.5" width="7" height="2" rx="0.5"/><path d="M10 11.5q1-1 2 0t2 0" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.55"/><path d="M9.5 14q1-1 2 0t2 0 1 0" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.55"/></svg>`,
  friend: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9.5 14.5l-2 2a3.5 3.5 0 1 1-5-5l2-2"/><path d="M14.5 9.5l2-2a3.5 3.5 0 1 1 5 5l-2 2"/><path d="M9 15l6-6"/></svg>`,
  computer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="3.2" r="1" fill="currentColor" stroke="none"/><path d="M12 4.2v2"/><rect x="2" y="11" width="2" height="4" rx="0.5"/><rect x="20" y="11" width="2" height="4" rx="0.5"/><rect x="4.5" y="6.5" width="15" height="13" rx="2.5"/><circle cx="9.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="14.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><path d="M9.5 16h5"/></svg>`,
};

function landingPlayAction(label: string, icon: 'computer' | 'friend' | 'lobby'): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `landing-play-action landing-play-action-${icon}`;
  const iconEl = document.createElement('span');
  iconEl.className = 'landing-play-icon';
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.innerHTML = LANDING_PLAY_ICON_SVG[icon];
  const labelEl = document.createElement('span');
  labelEl.className = 'landing-play-action-label';
  labelEl.textContent = label;
  button.append(iconEl, labelEl);
  return button;
}

function buildLobbyRequestsWindow(): HTMLElement {
  const shell = document.createElement('section');
  shell.className = 'landing-lobby-requests';
  shell.setAttribute('aria-label', 'Open pairing requests');

  const header = document.createElement('div');
  header.className = 'landing-lobby-requests-header';
  const title = document.createElement('strong');
  title.textContent = 'Open requests';
  const count = document.createElement('span');
  count.textContent = 'Checking';
  header.append(title, count);

  const list = document.createElement('div');
  list.className = 'landing-lobby-requests-list';

  shell.append(header, list);

  const render = (requests: OpenLobbyRequest[]) => {
    count.textContent = requests.length === 1 ? '1 waiting' : `${requests.length} waiting`;
    list.replaceChildren();
    if (requests.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'landing-lobby-requests-empty';
      empty.textContent = 'No open requests right now.';
      list.append(empty);
      return;
    }
    for (const request of requests) {
      list.append(lobbyRequestRow(request));
    }
  };

  const refresh = async () => {
    try {
      const requests = await fetchOpenLobbyRequests();
      render(requests);
    } catch (err) {
      console.warn(err);
      count.textContent = 'Unavailable';
      list.replaceChildren();
      const empty = document.createElement('p');
      empty.className = 'landing-lobby-requests-empty';
      empty.textContent = 'Open requests could not load.';
      list.append(empty);
    }
  };

  void refresh();
  const refreshTimer = window.setInterval(() => {
    if (!document.body.contains(shell)) {
      window.clearInterval(refreshTimer);
      return;
    }
    void refresh();
  }, 3_000);

  return shell;
}

function lobbyRequestRow(request: OpenLobbyRequest): HTMLElement {
  const row = document.createElement('div');
  row.className = 'landing-lobby-request-row';

  const details = document.createElement('div');
  details.className = 'landing-lobby-request-details';

  const primary = document.createElement('span');
  const ratedLabel = request.rated === false ? 'Casual' : 'Rated';
  primary.textContent = `${formatTimeControl(request.timeControl)} ${request.hiddenDraft960 ? 'Draft960' : 'Standard'} · ${ratedLabel}`;
  const secondary = document.createElement('small');
  secondary.textContent = `${formatWaitAge(request.waitingMs)} waiting`;
  details.append(primary, secondary);

  const join = document.createElement('button');
  join.type = 'button';
  join.textContent = 'Join';
  join.addEventListener('click', () => {
    join.disabled = true;
    join.textContent = 'Joining';
    const status = document.createElement('span');
    const setup: LandingRoomSetup = {
      startFormat: request.hiddenDraft960 ? 'draft960' : 'standard',
      rated: request.rated ?? true,
      timeControl: request.timeControl,
      preferredColor: 'random',
    };
    joinLobbyFromPlay(join, setup, status);
  });

  row.append(details, join);
  return row;
}

async function fetchOpenLobbyRequests(): Promise<OpenLobbyRequest[]> {
  const response = await fetch('/api/lobby');
  if (!response.ok) throw new Error(`lobby requests failed: ${response.status}`);
  const data = await response.json() as { requests?: OpenLobbyRequest[] };
  return Array.isArray(data.requests) ? data.requests : [];
}

function formatTimeControl(timeControl: OpenLobbyRequest['timeControl']): string {
  const minutes = timeControl.initialMs / 60_000;
  const increment = timeControl.incrementMs / 1000;
  const minuteLabel = Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
  return `${minuteLabel} + ${increment}`;
}

function formatWaitAge(waitingMs: number): string {
  const seconds = Math.max(0, Math.floor(waitingMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m`;
}

function openLandingSetupDialog(choice: LandingPlayChoice): void {
  const existing = document.querySelector('.landing-setup-overlay');
  existing?.remove();

  let startFormat: LandingStartFormat = 'standard';
  let rated = (choice.mode === 'pve' || choice.ratedDisabled) ? false : true;
  let selectedPreset: LandingTimePresetId = '3m2';
  let selectedEngineId = choice.engineId;
  let preferredColor: LandingColorPreference = loadStoredColorPreference();

  const overlay = document.createElement('div');
  overlay.className = 'landing-setup-overlay';
  overlay.setAttribute('role', 'presentation');

  const dialog = document.createElement('section');
  dialog.className = 'landing-setup-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'landing-setup-title');

  const heading = document.createElement('strong');
  heading.className = 'landing-setup-title';
  heading.id = 'landing-setup-title';
  heading.textContent = choice.title;

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'landing-setup-close';
  closeButton.setAttribute('aria-label', 'Close setup');
  closeButton.textContent = 'x';

  const header = document.createElement('div');
  header.className = 'landing-setup-header';
  header.append(heading, closeButton);

  const variantSection = document.createElement('div');
  variantSection.className = 'landing-setup-section';
  variantSection.append(setupSectionLabel('Variant'));

  const variantControl = document.createElement('div');
  variantControl.className = 'landing-variant-control';
  variantControl.textContent = 'Dark chess';
  variantSection.append(variantControl);

  const engineSection = choice.mode === 'pve' ? buildEngineSetupSection(choice.engines ?? fallbackPlayableEngines(), selectedEngineId, (engineId) => {
    selectedEngineId = engineId;
  }) : null;

  const draft960Enabled = import.meta.env.VITE_DRAFT960_ENABLED === 'true';
  const draft960Selectable = draft960Enabled && choice.mode !== 'lobby';
  const standardButton = startOptionButton('Standard', true);
  const draftButton = startOptionButton(draft960Selectable ? 'Draft960' : 'Draft960 (soon)', false);
  if (draft960Enabled) {
    const startGroup = document.createElement('div');
    startGroup.className = 'landing-start-options';
    startGroup.setAttribute('role', 'radiogroup');
    startGroup.setAttribute('aria-label', 'Fog start format');
    if (!draft960Selectable) {
      draftButton.disabled = true;
      draftButton.classList.add('disabled');
      draftButton.title = 'Coming soon';
    }
    const syncOptions = () => {
      standardButton.classList.toggle('selected', startFormat === 'standard');
      standardButton.setAttribute('aria-checked', startFormat === 'standard' ? 'true' : 'false');
      draftButton.classList.toggle('selected', startFormat === 'draft960');
      draftButton.setAttribute('aria-checked', startFormat === 'draft960' ? 'true' : 'false');
    };
    standardButton.addEventListener('click', () => {
      startFormat = 'standard';
      syncOptions();
    });
    if (draft960Selectable) {
      draftButton.addEventListener('click', () => {
        startFormat = 'draft960';
        syncOptions();
      });
    }
    startGroup.append(standardButton, draftButton);
    variantSection.append(startGroup);
  }

  const timeSection = document.createElement('div');
  timeSection.className = 'landing-setup-section';
  timeSection.append(setupSectionLabel('Time control'));

  const presetGroup = document.createElement('div');
  presetGroup.className = 'landing-time-presets';
  presetGroup.setAttribute('role', 'radiogroup');
  presetGroup.setAttribute('aria-label', 'Time control');

  const presetButtons = LANDING_TIME_PRESETS.map((preset) => {
    const enabled = preset.id === '3m2';
    const button = startOptionButton(enabled ? preset.label : `${preset.label} (soon)`, preset.id === selectedPreset);
    if (!enabled) {
      button.disabled = true;
      button.classList.add('disabled');
      button.title = 'Coming soon';
    } else {
      button.addEventListener('click', () => {
        selectedPreset = preset.id;
        syncTimeControls();
      });
    }
    presetGroup.append(button);
    return { button, preset };
  });

  const syncTimeControls = () => {
    for (const { button, preset } of presetButtons) {
      const selected = selectedPreset === preset.id;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
    }
  };
  syncTimeControls();
  timeSection.append(presetGroup);

  const actions = document.createElement('div');
  actions.className = 'landing-setup-actions';

  const status = document.createElement('p');
  status.className = 'landing-setup-status';
  status.setAttribute('aria-live', 'polite');

  let cancelLobbyWait: (() => void) | null = null;
  const startButton = document.createElement('button');
  startButton.type = 'button';
  startButton.className = 'landing-setup-start';
  startButton.textContent = choice.mode === 'lobby' ? 'Find opponent' : choice.mode === 'pvp' ? 'Create room' : 'Start game';
  startButton.addEventListener('click', () => {
    const setup = selectedRoomSetup(startFormat, rated, selectedPreset, preferredColor);
    if (choice.mode === 'lobby') {
      cancelLobbyWait?.();
      cancelLobbyWait = joinLobbyFromPlay(startButton, setup, status);
      return;
    }
    void createRoomFromPlay(startButton, choice.mode, selectedEngineId, setup);
  });

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'landing-setup-back';
  backButton.textContent = 'Cancel';

  const close = () => {
    cancelLobbyWait?.();
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };
  closeButton.addEventListener('click', close);
  backButton.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', onKeyDown);

  const ratingSection = (choice.mode === 'pvp' || choice.mode === 'lobby')
    ? buildRatedToggleSection(() => rated, (v) => { rated = v; }, choice.ratedDisabled)
    : null;

  // Color picker shows for PvE and Challenge-a-friend. Hidden for casual/rated
  // lobby matchmaking — color is server-assigned there so the pool stays unified.
  const colorSection = (choice.mode === 'pve' || choice.mode === 'pvp')
    ? buildColorPreferenceSection(() => preferredColor, (value) => {
      preferredColor = value;
      storeColorPreference(value);
    })
    : null;

  actions.append(startButton, backButton);
  dialog.append(header, variantSection);
  if (engineSection) dialog.append(engineSection);
  dialog.append(timeSection);
  if (colorSection) dialog.append(colorSection);
  if (ratingSection) dialog.append(ratingSection);
  dialog.append(status, actions);
  overlay.append(dialog);
  document.body.append(overlay);
  (draft960Enabled ? standardButton : startButton).focus();
}

function buildEngineSetupSection(
  engines: PlayableEngine[],
  selectedEngineId: string | undefined,
  onSelect: (engineId: string) => void,
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'landing-setup-section';
  section.append(setupSectionLabel('Engine'));

  const select = document.createElement('select');
  select.className = 'landing-engine-select';
  select.setAttribute('aria-label', 'Engine');

  const availableEngines = engines.length > 0 ? engines : fallbackPlayableEngines();
  for (const engine of availableEngines) {
    const option = document.createElement('option');
    option.value = engine.id;
    option.textContent = engine.name;
    select.append(option);
  }

  const fallbackEngineId = availableEngines[0]?.id;
  select.value = selectedEngineId && availableEngines.some((engine) => engine.id === selectedEngineId)
    ? selectedEngineId
    : fallbackEngineId ?? '';
  if (select.value) onSelect(select.value);
  select.addEventListener('change', () => onSelect(select.value));

  section.append(select);
  return section;
}

function buildRatedToggleSection(get: () => boolean, set: (v: boolean) => void, ratedDisabled = false): HTMLElement {
  const section = document.createElement('div');
  section.className = 'landing-setup-section';
  section.append(setupSectionLabel('Game type'));

  const group = document.createElement('div');
  group.className = 'landing-start-options';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', 'Game type');

  const ratedButton = startOptionButton(ratedDisabled ? 'Rated (coming soon)' : 'Rated', true);
  const casualButton = startOptionButton('Casual', false);

  if (ratedDisabled) {
    ratedButton.disabled = true;
    ratedButton.classList.add('disabled');
  }

  const sync = () => {
    const isRated = get();
    ratedButton.classList.toggle('selected', isRated && !ratedDisabled);
    ratedButton.setAttribute('aria-checked', isRated && !ratedDisabled ? 'true' : 'false');
    casualButton.classList.toggle('selected', !isRated || ratedDisabled);
    casualButton.setAttribute('aria-checked', !isRated || ratedDisabled ? 'true' : 'false');
  };
  if (!ratedDisabled) {
    ratedButton.addEventListener('click', () => { set(true); sync(); });
  }
  casualButton.addEventListener('click', () => { set(false); sync(); });
  sync();
  group.append(ratedButton, casualButton);
  section.append(group);
  return section;
}

const COLOR_PREFERENCE_STORAGE_KEY = 'mistboard:setup:preferredColor';

function loadStoredColorPreference(): LandingColorPreference {
  try {
    const raw = window.localStorage.getItem(COLOR_PREFERENCE_STORAGE_KEY);
    if (raw === 'white' || raw === 'black' || raw === 'random') return raw;
  } catch {
    // ignore — storage may be disabled (private mode, quota); fall through to default
  }
  return 'random';
}

function storeColorPreference(value: LandingColorPreference): void {
  try {
    window.localStorage.setItem(COLOR_PREFERENCE_STORAGE_KEY, value);
  } catch {
    // ignore
  }
}

function buildColorPreferenceSection(
  get: () => LandingColorPreference,
  set: (value: LandingColorPreference) => void,
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'landing-setup-section';
  section.append(setupSectionLabel('Color'));

  const group = document.createElement('div');
  group.className = 'landing-start-options three';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', 'Color');

  const initial = get();
  const whiteButton = colorOptionButton('white', 'White', initial === 'white');
  const randomButton = colorOptionButton('random', 'Random', initial === 'random');
  const blackButton = colorOptionButton('black', 'Black', initial === 'black');

  const sync = () => {
    const current = get();
    for (const [button, value] of [
      [whiteButton, 'white'],
      [randomButton, 'random'],
      [blackButton, 'black'],
    ] as const) {
      const selected = current === value;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
    }
  };

  whiteButton.addEventListener('click', () => { set('white'); sync(); });
  randomButton.addEventListener('click', () => { set('random'); sync(); });
  blackButton.addEventListener('click', () => { set('black'); sync(); });

  group.append(whiteButton, randomButton, blackButton);
  section.append(group);
  return section;
}

function colorOptionButton(
  value: LandingColorPreference,
  label: string,
  selected: boolean,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `landing-start-option landing-color-option${selected ? ' selected' : ''}`;
  button.setAttribute('role', 'radio');
  button.setAttribute('aria-checked', selected ? 'true' : 'false');

  const glyph = document.createElement('span');
  glyph.className = `landing-color-glyph ${value}`;
  glyph.setAttribute('aria-hidden', 'true');
  if (value === 'random') {
    const w = document.createElement('span');
    w.className = 'white';
    w.textContent = '♔';
    const b = document.createElement('span');
    b.className = 'black';
    b.textContent = '♚';
    glyph.append(w, b);
  } else {
    glyph.textContent = value === 'white' ? '♔' : '♚';
  }

  const text = document.createElement('span');
  text.className = 'landing-color-label';
  text.textContent = label;

  button.append(glyph, text);
  return button;
}

function setupSectionLabel(text: string): HTMLSpanElement {
  const label = document.createElement('span');
  label.className = 'landing-setup-label';
  label.textContent = text;
  return label;
}

function selectedRoomSetup(
  startFormat: LandingStartFormat,
  rated: boolean,
  presetId: LandingTimePresetId,
  preferredColor: LandingColorPreference,
): LandingRoomSetup {
  const preset = LANDING_TIME_PRESETS.find((candidate) => candidate.id === presetId) ?? LANDING_TIME_PRESETS[1];
  return {
    startFormat,
    rated,
    timeControl: {
      initialMs: preset.initialMs,
      incrementMs: preset.incrementMs,
    },
    preferredColor,
  };
}

function startOptionButton(label: string, selected: boolean): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `landing-start-option${selected ? ' selected' : ''}`;
  button.setAttribute('role', 'radio');
  button.setAttribute('aria-checked', selected ? 'true' : 'false');
  button.textContent = label;
  return button;
}

function buildWatchSection(): { el: HTMLElement; replayRoot: HTMLElement; listRoot: HTMLElement } {
  const section = document.createElement('main');
  section.className = 'watch-shell';

  const listRoot = document.createElement('aside');
  listRoot.className = 'landing-games watch-games';

  const replayRoot = document.createElement('div');
  replayRoot.className = 'watch-replay';

  section.append(listRoot, replayRoot);
  return { el: section, replayRoot, listRoot };
}

export function buildNotice(titleText: string, bodyText: string): HTMLElement {
  const notice = document.createElement('section');
  notice.className = 'site-section game-notice';
  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = titleText;
  const body = document.createElement('p');
  body.textContent = bodyText;
  notice.append(heading, body);
  return notice;
}

function buildGameExportLinks(roomId: string, variant: string | undefined): HTMLElement | null {
  // Draft960 export is deferred until the schema can encode post-draft starting
  // positions. Hide the section entirely for now to avoid shipping broken PGN.
  if (variant === 'draft960') return null;

  const section = document.createElement('section');
  section.className = 'game-export-links';

  const heading = document.createElement('span');
  heading.className = 'game-export-links-label';
  heading.textContent = 'Download';

  const encoded = encodeURIComponent(roomId);
  const pgnLink = document.createElement('a');
  pgnLink.href = `/api/games/${encoded}/export.pgn`;
  pgnLink.textContent = 'PGN';
  pgnLink.setAttribute('download', `mistboard-${roomId}.pgn`);

  const jsonLink = document.createElement('a');
  jsonLink.href = `/api/games/${encoded}/export.json`;
  jsonLink.textContent = 'JSON';
  jsonLink.setAttribute('download', `mistboard-${roomId}.json`);

  section.append(heading, pgnLink, jsonLink);
  return section;
}

function renderRecentGames(
  root: HTMLElement,
  games: FeaturedGame[],
  source: LandingGameSource,
  activeRoomId?: string,
  hrefPrefix = '/?demo=',
  headingText?: string,
  clickable = true,
  limit = 10,
): void {
  root.replaceChildren();

  const heading = document.createElement('div');
  heading.className = 'landing-games-heading';
  heading.textContent = headingText ?? (
    source === 'recent' ? 'Recent games' : source === 'eve' ? 'Recent EvE' : source === 'sample' ? 'Replay samples' : 'Featured games'
  );
  root.append(heading);

  if (games.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'landing-games-empty';
    empty.textContent = 'No games yet.';
    root.append(empty);
    return;
  }

  const list = document.createElement('ol');
  list.className = 'landing-games-list';

  for (const game of games.slice(0, limit)) {
    const item = document.createElement('li');
    const row = clickable ? document.createElement('a') : document.createElement('div');
    row.className = 'landing-game-row';
    if (clickable) {
      (row as HTMLAnchorElement).href = `${hrefPrefix}${encodeURIComponent(game.roomId)}`;
    }
    if (game.roomId === activeRoomId) row.classList.add('active');

    const matchup = document.createElement('span');
    matchup.className = 'landing-game-matchup';
    matchup.textContent = `${displayParticipantName(game, 'white')} vs ${displayParticipantName(game, 'black')}`;

    const meta = document.createElement('span');
    meta.className = 'landing-game-meta';
    const result = document.createElement('span');
    result.className = 'landing-game-result';
    result.textContent = resultLabel(game.result);
    const detail = document.createElement('span');
    detail.textContent = `${sourceLabel(game.mode)} · ${game.plyCount} plies · ${terminationLabel(game.termination)}`;
    meta.append(result, detail);

    row.append(matchup, meta);
    item.append(row);
    list.append(item);
  }

  root.append(list);
}

function engineDisplayName(name: string | null | undefined): string | null {
  if (!name) return null;
  const known: Record<string, string> = {
    'builtin-capture-seeker': 'Capture Seeker v1',
    'builtin-random-legal': 'Random Legal v1',
    'python-random-legal': 'Random Legal Python v1',
    'python-tier1-v0.7.0': 'Tier-1 v0.7.0',
    'python-tier1-v0.7.22': 'Tier-1 v0.7.22',
    'python-tier1-v0.8.9': 'Tier-1 v0.8.9',
    'python-tier1-v0.9.1': 'Tier-1 v0.9.1',
    'python-tier1-v0.9.5': 'Tier-1 v0.9.5',
    'python-tier1-current': 'Tier-1 current src',
  };
  return known[name] ?? null;
}

function resultLabel(result: string): string {
  if (result === 'white-wins') return 'White wins';
  if (result === 'black-wins') return 'Black wins';
  return 'Draw';
}

function buildGamePageTitle(game: FeaturedGame): string {
  const white = game.whiteName ?? 'White';
  const black = game.blackName ?? 'Black';
  const result =
    game.result === 'white-wins' ? `${white} beats ${black}` :
    game.result === 'black-wins' ? `${black} beats ${white}` : `${white} vs ${black} · Draw`;
  return `${result} · Mistboard`;
}

function terminationLabel(termination: string): string {
  return termination.replace(/-/g, ' ');
}

function buildAbout(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'site-section about-section';
  section.id = 'about';

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = 'About Mistboard';

  const lede = aboutParagraph(['Mistboard is a free, open-source site for dark chess (also called Fog of War).']);

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
    rulesHeading, rulesP,
    whyHeading, whyP,
    featuresHeading, featuresP,
    fairnessHeading, fairnessP,
    oss1Heading, oss1P,
    engineHeading, engineP,
    statusHeading, statusP,
    contactHeading, contactP,
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
    textLine('Stockfish: optional engine/runtime dependency for research and engine-worker flows, GPL family.'),
  ]);

  const identity = sourceBlock('Project identity', [
    textLine('The Mistboard name, logo, mistboard.com domain, hosted service identity, and official events are controlled project assets.'),
    textLine('Forks are allowed under the AGPL, but should use a distinct name and avoid implying they are the official Mistboard service.'),
    textLine('Forks and derivatives should present their own public brand, domain, and hosted service identity.'),
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

  section.append(
    heading,
    q1, a1,
    q2, a2,
  );
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
    'Don’t harass other players, spam, abuse the service, try to break the fog filter, or hammer the site with scrapers. Don’t use external engine help during rated play once rated mode launches. Handles, rooms, and accounts may be revoked for abuse.',
  ]);

  const h4 = aboutSubheading('Finished games are public by default');
  const p4 = aboutParagraph([
    'Completed games are published under ',
    aboutExternalLink('CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'),
    '. Anyone can share or reuse the game record as long as they credit Mistboard. To take down a specific game, use ',
    aboutLink('Contact', '/contact'),
    '. A self-serve opt-out is on the roadmap.',
  ]);

  const h5 = aboutSubheading('Open source and brand');
  const p5 = aboutParagraph([
    'The source is AGPL-3.0-or-later. The Mistboard name, logo, domain, and hosted service identity are project assets. Forks are welcome but should pick their own name. See ',
    aboutLink('Source', '/source'),
    ' for license and credits.',
  ]);

  const h6 = aboutSubheading('Contact');
  const p6 = aboutParagraph([
    'Questions, takedown requests, anything else: ',
    aboutLink('Contact', '/contact'),
    '.',
  ]);

  section.append(
    heading,
    intro,
    h1, p1,
    h2, p2,
    h3, p3,
    h4, p4,
    h5, p5,
    h6, p6,
  );
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

async function createRoomFromPlay(
  button: HTMLButtonElement,
  mode: 'pvp' | 'pve',
  engineId?: string,
  setup: LandingRoomSetup = {
    startFormat: 'standard',
    rated: true,
    timeControl: { initialMs: 30_000, incrementMs: 2_000 },
    preferredColor: 'random',
  },
): Promise<void> {
  const label = button.querySelector<HTMLElement>('.landing-play-action-label');
  const originalText = label?.textContent ?? button.textContent ?? '';
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  setButtonLabel(button, 'Creating');
  try {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode,
        variant: 'fog-of-war',
        hiddenDraft960: setup.startFormat === 'draft960',
        timeControl: setup.timeControl,
        rated: setup.rated,
        preferredColor: setup.preferredColor,
        ...(mode === 'pve' && engineId ? { engineId } : {}),
      }),
    });
    if (!response.ok) throw new Error(`room creation failed: ${response.status}`);
    const data = await response.json() as { url?: string };
    if (!data.url) throw new Error('room creation did not return a URL');
    window.location.href = data.url;
  } catch (err) {
    console.warn(err);
    setButtonLabel(button, 'Try again');
    button.disabled = false;
    button.removeAttribute('aria-busy');
    window.setTimeout(() => {
      if (button.disabled) return;
      setButtonLabel(button, originalText);
    }, 1800);
  }
}

function joinLobbyFromPlay(
  button: HTMLButtonElement,
  setup: LandingRoomSetup,
  status: HTMLElement,
): () => void {
  const controller = new AbortController();
  const originalText = button.textContent ?? '';
  const queueJoinedAt = Date.now();
  const bucketProps = {
    variant: setup.startFormat,
    initialMs: setup.timeControl.initialMs,
    incrementMs: setup.timeControl.incrementMs,
    time_class: classifyTimeControl(setup.timeControl.initialMs, setup.timeControl.incrementMs),
    rated: setup.rated,
  };
  let active = true;
  let ticketId: string | null = null;
  let pollTimer: number | null = null;

  const cancel = () => {
    active = false;
    controller.abort();
    if (pollTimer !== null) window.clearTimeout(pollTimer);
    if (ticketId) {
      void fetch(`/api/lobby/${encodeURIComponent(ticketId)}`, { method: 'DELETE' }).catch(() => {});
    }
  };

  const redirectIfMatched = (ticket: LobbyTicketResponse): boolean => {
    if (ticket.status !== 'matched' || !ticket.url) return false;
    track('lobby_match_found', { ...bucketProps, waitMs: Date.now() - queueJoinedAt });
    window.location.href = ticket.url;
    return true;
  };

  const handleLobbyError = (err: unknown) => {
    if (!active) return;
    console.warn(err);
    button.disabled = false;
    button.removeAttribute('aria-busy');
    setButtonLabel(button, 'Try again');
    status.textContent = 'Could not join the lobby. Try again.';
    window.setTimeout(() => {
      if (button.disabled) return;
      setButtonLabel(button, originalText);
    }, 1800);
  };

  const poll = async () => {
    if (!active || !ticketId) return;
    const response = await fetch(`/api/lobby/${encodeURIComponent(ticketId)}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`lobby poll failed: ${response.status}`);
    const ticket = await response.json() as LobbyTicketResponse;
    if (!active || redirectIfMatched(ticket)) return;
    pollTimer = window.setTimeout(() => {
      void poll().catch(handleLobbyError);
    }, ticket.pollAfterMs ?? 1_000);
  };

  const start = async () => {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    setButtonLabel(button, 'Waiting');
    status.textContent = 'Waiting for a matching opponent. Keep this tab open.';
    const response = await fetch('/api/lobby', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        hiddenDraft960: setup.startFormat === 'draft960',
        timeControl: setup.timeControl,
        rated: setup.rated,
      }),
    });
    if (!response.ok) throw new Error(`lobby join failed: ${response.status}`);
    const ticket = await response.json() as LobbyTicketResponse;
    track('lobby_queue_joined', bucketProps);
    if (!active || redirectIfMatched(ticket)) return;
    if (!ticket.ticketId) throw new Error('lobby did not return a ticket');
    ticketId = ticket.ticketId;
    pollTimer = window.setTimeout(() => {
      void poll().catch(handleLobbyError);
    }, ticket.pollAfterMs ?? 1_000);
  };

  void start().catch(handleLobbyError);
  return cancel;
}

function setButtonLabel(button: HTMLButtonElement, text: string): void {
  const label = button.querySelector<HTMLElement>('.landing-play-action-label');
  if (label) {
    label.textContent = text;
  } else {
    button.textContent = text;
  }
}

function buildLearn(): { el: HTMLElement; boardEl: HTMLElement } {
  const section = document.createElement('main');
  section.className = 'learn-shell';

  const boardPanel = document.createElement('section');
  boardPanel.className = 'learn-board-panel';
  const boardEl = document.createElement('div');
  boardEl.className = 'board learn-board';
  boardEl.setAttribute('aria-label', 'Tutorial dark chess board');
  boardPanel.append(boardEl);

  const panel = document.createElement('section');
  panel.className = 'learn-panel';

  const progress = document.createElement('div');
  progress.className = 'learn-progress';
  progress.textContent = 'Lesson 1 of 4';

  const heading = document.createElement('h1');
  heading.className = 'learn-heading';
  heading.textContent = 'See With Your Pieces';

  const intro = document.createElement('p');
  intro.className = 'learn-copy';
  intro.textContent =
    'In dark chess, your board is built from your pieces and the squares they can legally move to. Everything else stays hidden.';

  const steps = document.createElement('ol');
  steps.className = 'learn-steps';
  for (const text of [
    'Select a piece to inspect its vision.',
    'Use vision to scout before your king is exposed.',
    'Replay later reveals what both sides could actually see.',
  ]) {
    const item = document.createElement('li');
    item.textContent = text;
    steps.append(item);
  }

  const actions = document.createElement('div');
  actions.className = 'learn-actions';

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'landing-cta-primary';
  next.disabled = true;
  next.textContent = 'Interactive lessons coming soon';

  const watch = document.createElement('a');
  watch.href = '/watch';
  watch.className = 'landing-cta-secondary';
  watch.textContent = 'Watch games';

  actions.append(next, watch);
  panel.append(progress, heading, intro, steps, actions);
  section.append(boardPanel, panel);
  return { el: section, boardEl };
}

function mountLearnBoard(boardEl: HTMLElement): void {
  const board: Board = {
    a1: { color: 'white', role: 'rook' },
    d1: { color: 'white', role: 'queen' },
    e1: { color: 'white', role: 'king' },
    e4: { color: 'white', role: 'knight' },
  };
  const visibleSquares: Square[] = [
    'a1', 'b1', 'c1', 'd1', 'e1', 'f1', 'g1', 'h1',
    'c3', 'd2', 'f2', 'g3', 'c5', 'd6', 'e4', 'f6', 'g5',
  ];
  const squareClasses = hiddenSquareClasses({
    variant: 'fog-of-war',
    status: { type: 'playing', turn: 'white' },
    visibleSquares,
  } satisfies Pick<PlayerView, 'variant' | 'status' | 'visibleSquares'>);
  for (const square of ['c5', 'd6', 'f6', 'g5'] as const) {
    squareClasses.set(square as cg.Key, `${squareClasses.get(square as cg.Key) ?? ''} learn-highlight`.trim());
  }
  const api = createReadOnlyBoard(boardEl, 'white');
  setBoardPosition(api, board, squareClasses);
}

export function buildFooter(): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'site-footer';

  const links = document.createElement('div');
  links.className = 'site-footer-links';

  const about = document.createElement('a');
  about.href = '/about';
  about.textContent = 'About';

  const contact = document.createElement('a');
  contact.href = '/contact';
  contact.textContent = 'Contact';

  const source = document.createElement('a');
  source.href = '/source';
  source.textContent = 'Source';

  const faq = document.createElement('a');
  faq.href = '/faq';
  faq.textContent = 'FAQ';

  const terms = document.createElement('a');
  terms.href = '/terms';
  terms.textContent = 'Terms';

  const gh = document.createElement('a');
  gh.href = GITHUB_URL;
  gh.target = '_blank';
  gh.rel = 'noreferrer noopener';
  gh.textContent = 'GitHub';

  const identity = document.createElement('span');
  identity.className = 'site-footer-identity';
  identity.textContent = '© 2026 Mistboard · AGPL-3.0';

  links.append(about, contact, source, faq, terms, gh, identity);
  footer.append(links);
  return footer;
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


function pickSample(pool: string[], exclude?: string): string {
  const candidates = exclude ? pool.filter((id) => id !== exclude) : pool;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0]!;
}
