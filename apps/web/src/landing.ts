import type { GameEvent } from '@bichess/game';
import { mountReplay, type GameMeta } from './replay.js';

type FeaturedGame = {
  roomId: string;
  variant: string;
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
};

type LandingGameSource = 'eve' | 'featured';

const GITHUB_URL = 'https://github.com/brianhliou/bichess';
const ENGINE_LAB_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_ENGINE_LAB === 'true';

export async function mountLanding(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page');

  const { games, source } = await fetchLandingGames();
  const demo = buildDemoSection();
  root.append(buildNav(), buildHero(source), demo.el, buildFooter());
  if (games.length === 0) {
    demo.replayRoot.textContent = 'No games available yet.';
    renderRecentGames(demo.listRoot, games, source);
    return;
  }

  const metadataByRoomId: Record<string, GameMeta> = {};
  for (const g of games) {
    metadataByRoomId[g.roomId] = {
      whiteName: g.whiteName,
      blackName: g.blackName,
      result: g.result,
      termination: g.termination,
      plyCount: g.plyCount,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const requested = params.get('demo');
  const sampleIds = games.map((g) => g.roomId);
  const currentSample =
    requested && sampleIds.includes(requested) ? requested : pickSample(sampleIds);

  await mountReplay(demo.replayRoot, currentSample, {
    autoplay: true,
    showControls: false,
    revealOnFinish: false,
    loopSamples: sampleIds,
    loaderForId: apiEventLoader,
    metadataByRoomId,
  });
  renderRecentGames(demo.listRoot, games, source, currentSample);
}

export async function mountWatch(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'watch-route');

  const { games, source } = await fetchLandingGames();
  const watch = buildWatchSection();
  root.append(buildNav(), watch.el, buildFooter());

  if (games.length === 0) {
    watch.replayRoot.textContent = 'No games available yet.';
    renderRecentGames(watch.listRoot, games, source);
    return;
  }

  const metadataByRoomId: Record<string, GameMeta> = {};
  for (const g of games) {
    metadataByRoomId[g.roomId] = {
      whiteName: g.whiteName,
      blackName: g.blackName,
      result: g.result,
      termination: g.termination,
      plyCount: g.plyCount,
    };
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
  renderRecentGames(watch.listRoot, games, source, currentSample, '/watch?game=');
}

async function fetchLandingGames(): Promise<{ games: FeaturedGame[]; source: LandingGameSource }> {
  const eveGames = await fetchRecentEveGames().catch((err) => {
    console.warn(err);
    return [];
  });
  if (eveGames.length > 0) return { games: eveGames, source: 'eve' };
  return { games: await fetchFeaturedGames(), source: 'featured' };
}

async function fetchFeaturedGames(): Promise<FeaturedGame[]> {
  const resp = await fetch('/api/featured-games');
  if (!resp.ok) throw new Error(`failed to load featured games: ${resp.status}`);
  const data = (await resp.json()) as { games: FeaturedGame[] };
  return data.games;
}

async function fetchRecentEveGames(): Promise<FeaturedGame[]> {
  const resp = await fetch('/api/eve-games/recent');
  if (!resp.ok) throw new Error(`failed to load recent EvE games: ${resp.status}`);
  const data = (await resp.json()) as { games: FeaturedGame[] };
  return data.games;
}

async function apiEventLoader(roomId: string): Promise<GameEvent[]> {
  const resp = await fetch(`/api/games/${encodeURIComponent(roomId)}/events`);
  if (!resp.ok) throw new Error(`failed to load events for ${roomId}: ${resp.status}`);
  const data = (await resp.json()) as { events: GameEvent[] };
  return data.events;
}

export function mountAbout(root: HTMLElement): void {
  root.replaceChildren();
  root.classList.add('landing-page', 'about-route');
  root.append(buildNav(), buildAbout(), buildFooter());
}

function buildNav(): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'site-nav';

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
  brandText.textContent = 'BICHESS';
  brand.append(brandLogo, brandText);

  const links = document.createElement('div');
  links.className = 'site-nav-links';

  const aboutLink = document.createElement('a');
  aboutLink.href = '/about';
  aboutLink.textContent = 'About';
  aboutLink.className = 'site-nav-link';

  const watchLink = document.createElement('a');
  watchLink.href = '/watch';
  watchLink.textContent = 'Watch';
  watchLink.className = 'site-nav-link';

  const ghLink = document.createElement('a');
  ghLink.href = GITHUB_URL;
  ghLink.target = '_blank';
  ghLink.rel = 'noreferrer noopener';
  ghLink.textContent = 'GitHub';
  ghLink.className = 'site-nav-link';

  if (ENGINE_LAB_ENABLED) {
    const labLink = document.createElement('a');
    labLink.href = '/engine-lab';
    labLink.textContent = 'Engine Lab';
    labLink.className = 'site-nav-link';
    links.append(labLink);
  }
  links.append(watchLink, aboutLink, ghLink);
  nav.append(brand, links);
  return nav;
}

function buildHero(source: LandingGameSource): HTMLElement {
  const hero = document.createElement('section');
  hero.className = 'landing-hero';

  const title = document.createElement('h1');
  title.className = 'landing-title';
  title.textContent = 'Bichess';

  const subtitle = document.createElement('p');
  subtitle.className = 'landing-subtitle';
  subtitle.textContent =
    'Hidden-information chess. You only see what your pieces can see.';

  const tag = document.createElement('p');
  tag.className = 'landing-tag';
  tag.textContent = source === 'eve'
    ? 'Engines are playing now. Watch the latest finished games.'
    : 'Watch what each side saw — and what was really there.';

  const ctas = document.createElement('div');
  ctas.className = 'landing-ctas';

  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'landing-cta-primary';
  playBtn.disabled = true;
  playBtn.textContent = 'Play vs the engine — coming soon';

  ctas.append(playBtn);
  const watchLink = document.createElement('a');
  watchLink.href = '/watch';
  watchLink.className = 'landing-cta-secondary';
  watchLink.textContent = 'Watch games';
  ctas.append(watchLink);
  if (ENGINE_LAB_ENABLED) {
    const labLink = document.createElement('a');
    labLink.href = '/engine-lab';
    labLink.className = 'landing-cta-secondary';
    labLink.textContent = 'Open Engine Lab';
    ctas.append(labLink);
  }
  hero.append(title, subtitle, tag, ctas);
  return hero;
}

function buildDemoSection(): { el: HTMLElement; replayRoot: HTMLElement; listRoot: HTMLElement } {
  const section = document.createElement('section');
  section.className = 'landing-demo';

  const listRoot = document.createElement('aside');
  listRoot.className = 'landing-games';

  const replayRoot = document.createElement('div');
  replayRoot.id = 'landing-replay';
  section.append(replayRoot, listRoot);

  return { el: section, replayRoot, listRoot };
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

function renderRecentGames(
  root: HTMLElement,
  games: FeaturedGame[],
  source: LandingGameSource,
  activeRoomId?: string,
  hrefPrefix = '/?demo=',
): void {
  root.replaceChildren();

  const heading = document.createElement('div');
  heading.className = 'landing-games-heading';
  heading.textContent = source === 'eve' ? 'Recent EvE' : 'Featured games';
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

  for (const game of games.slice(0, 8)) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `${hrefPrefix}${encodeURIComponent(game.roomId)}`;
    link.className = game.roomId === activeRoomId ? 'active' : '';

    const matchup = document.createElement('span');
    matchup.className = 'landing-game-matchup';
    matchup.textContent = `${shortEngineName(game.whiteEngineId ?? game.whiteName)} vs ${shortEngineName(game.blackEngineId ?? game.blackName)}`;

    const meta = document.createElement('span');
    meta.className = 'landing-game-meta';
    meta.textContent = `${resultLabel(game.result)} · ${game.plyCount} plies · ${terminationLabel(game.termination)}`;

    link.append(matchup, meta);
    item.append(link);
    list.append(item);
  }

  root.append(list);
}

function shortEngineName(name: string | null | undefined): string {
  if (!name) return 'engine';
  return name
    .replace(/^builtin-/, '')
    .replace(/-/g, ' ');
}

function resultLabel(result: string): string {
  if (result === 'white-wins') return 'White wins';
  if (result === 'black-wins') return 'Black wins';
  return 'Draw';
}

function terminationLabel(termination: string): string {
  return termination.replace(/-/g, ' ');
}

function buildAbout(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'site-section about-section';
  section.id = 'about';

  const heading = document.createElement('h2');
  heading.className = 'site-section-heading';
  heading.textContent = 'About Fog of War';

  const p1 = document.createElement('p');
  p1.textContent =
    'Fog of War is hidden-information chess. Each player sees only their own pieces and the squares those pieces could legally move to. The game ends when a king is captured.';

  const p2 = document.createElement('p');
  p2.textContent =
    'Bichess enforces hidden information at the server. Your opponent’s pieces and moves never reach your browser until your pieces can see them. Most fog implementations send the full board and rely on the UI to hide it — anyone inspecting network traffic can recover hidden information. Bichess doesn’t.';

  const p3 = document.createElement('p');
  p3.textContent =
    'We’re building bichess as the place to play, study, and understand Fog of War — with perspective replay, postgame reveal, and engines that reason about uncertainty. Open source under GPL-3.0.';

  section.append(heading, p1, p2, p3);
  return section;
}

function buildFooter(): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'site-footer';

  const left = document.createElement('div');
  left.className = 'site-footer-left';
  left.textContent = '© 2026 Bichess';

  const right = document.createElement('div');
  right.className = 'site-footer-right';

  const license = document.createElement('span');
  license.textContent = 'GPL-3.0';

  const sep = document.createElement('span');
  sep.className = 'site-footer-sep';
  sep.textContent = '·';

  const gh = document.createElement('a');
  gh.href = GITHUB_URL;
  gh.target = '_blank';
  gh.rel = 'noreferrer noopener';
  gh.textContent = 'GitHub';

  right.append(license, sep, gh);
  footer.append(left, right);
  return footer;
}

function pickSample(pool: string[], exclude?: string): string {
  const candidates = exclude ? pool.filter((id) => id !== exclude) : pool;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0]!;
}
