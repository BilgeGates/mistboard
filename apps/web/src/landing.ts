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
};

const GITHUB_URL = 'https://github.com/brianhliou/bichess';
const ENGINE_LAB_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_ENGINE_LAB === 'true';

export async function mountLanding(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page');

  const demo = buildDemoSection();
  root.append(buildNav(), buildHero(), demo.el, buildFooter());

  const games = await fetchFeaturedGames();
  if (games.length === 0) {
    demo.replayRoot.textContent = 'No games available yet.';
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
}

async function fetchFeaturedGames(): Promise<FeaturedGame[]> {
  const resp = await fetch('/api/featured-games');
  if (!resp.ok) throw new Error(`failed to load featured games: ${resp.status}`);
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
  brand.textContent = 'BICHESS';

  const links = document.createElement('div');
  links.className = 'site-nav-links';

  const aboutLink = document.createElement('a');
  aboutLink.href = '/about';
  aboutLink.textContent = 'About';
  aboutLink.className = 'site-nav-link';

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
  links.append(aboutLink, ghLink);
  nav.append(brand, links);
  return nav;
}

function buildHero(): HTMLElement {
  const hero = document.createElement('section');
  hero.className = 'landing-hero';

  const title = document.createElement('h1');
  title.className = 'landing-title';
  title.textContent = 'Fog of War Chess';

  const subtitle = document.createElement('p');
  subtitle.className = 'landing-subtitle';
  subtitle.textContent =
    'Hidden-information chess. You only see what your pieces can see.';

  const tag = document.createElement('p');
  tag.className = 'landing-tag';
  tag.textContent = 'Watch what each side saw — and what was really there.';

  const ctas = document.createElement('div');
  ctas.className = 'landing-ctas';

  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'landing-cta-primary';
  playBtn.disabled = true;
  playBtn.textContent = 'Play vs the engine — coming soon';

  ctas.append(playBtn);
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

function buildDemoSection(): { el: HTMLElement; replayRoot: HTMLElement } {
  const section = document.createElement('section');
  section.className = 'landing-demo';

  const replayRoot = document.createElement('div');
  replayRoot.id = 'landing-replay';
  section.append(replayRoot);

  return { el: section, replayRoot };
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
