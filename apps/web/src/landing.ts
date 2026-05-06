import { mountReplay } from './replay.js';

const SAMPLE_IDS = [
  'sample-1',
  'sample-2',
  'sample-3',
  'sample-4',
  'sample-5',
  'sample-6',
  'sample-7',
];

const GITHUB_URL = 'https://github.com/brianhliou/bichess';

export async function mountLanding(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page');

  const params = new URLSearchParams(window.location.search);
  const requested = params.get('demo');
  const currentSample =
    requested && SAMPLE_IDS.includes(requested) ? requested : pickSample();

  const demo = buildDemoSection();

  root.append(buildNav(), buildHero(), demo.el, buildFooter());

  await mountReplay(demo.replayRoot, currentSample, {
    autoplay: true,
    showControls: false,
    revealOnFinish: false,
    loopSamples: SAMPLE_IDS,
  });
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
  aboutLink.href = '/?page=about';
  aboutLink.textContent = 'About';
  aboutLink.className = 'site-nav-link';

  const ghLink = document.createElement('a');
  ghLink.href = GITHUB_URL;
  ghLink.target = '_blank';
  ghLink.rel = 'noreferrer noopener';
  ghLink.textContent = 'GitHub';
  ghLink.className = 'site-nav-link';

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
    'Bichess enforces hidden information at the server. The opponent’s moves and pieces never reach your browser until your pieces can legally see them. Existing implementations send hidden truth and rely on the UI to hide it; bichess does not.';

  const p3 = document.createElement('p');
  p3.textContent =
    'We’re building bichess as the place to play, study, and understand Fog of War — with replay, postgame reveal, and engines that reason about uncertainty rather than pretending the full board is known.';

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

function pickSample(exclude?: string): string {
  const pool = exclude ? SAMPLE_IDS.filter((id) => id !== exclude) : SAMPLE_IDS;
  return pool[Math.floor(Math.random() * pool.length)] ?? SAMPLE_IDS[0];
}
