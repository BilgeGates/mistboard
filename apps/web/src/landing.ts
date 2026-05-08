import type { Board, GameEvent, PlayerView, Square } from '@bichess/game';
import type * as cg from 'chessground/types';
import { createReadOnlyBoard, hiddenSquareClasses, setBoardPosition } from './board-ui.js';
import { mountReplay, type GameMeta } from './replay.js';

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
    metadataByRoomId[g.roomId] = gameMetaForGame(g);
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
  const headerRoot = document.createElement('div');
  headerRoot.className = 'game-header-root';
  const replayRoot = document.createElement('div');
  replayRoot.className = 'game-replay';
  shell.append(headerRoot, replayRoot);
  root.append(buildNav(), shell, buildFooter());

  const game = await fetchGameSummary(roomId).catch((err) => {
    console.warn(err);
    return null;
  });
  if (!game) {
    replayRoot.append(buildNotice('Game not found', 'This game is not available as a public replay.'));
    return;
  }

  headerRoot.append(buildGameHeader(game));
  await mountReplay(replayRoot, game.roomId, {
    autoplay: false,
    initialPly: initialGamePly(),
    onPlyChange: syncGamePlyUrl,
    showControls: true,
    revealOnFinish: true,
    loaderForId: apiEventLoader,
    metadataByRoomId: {
      [game.roomId]: gameMetaForGame(game),
    },
  });
}

async function fetchLandingGames(): Promise<{ games: FeaturedGame[]; source: LandingGameSource }> {
  const eveGames = await fetchRecentEveGames().catch((err) => {
    console.warn(err);
    return [];
  });
  if (eveGames.length > 0) return { games: eveGames, source: 'eve' };
  return { games: await fetchFeaturedGames(), source: 'featured' };
}

async function fetchGameSummary(roomId: string): Promise<FeaturedGame | null> {
  const resp = await fetch(`/api/games/${encodeURIComponent(roomId)}`);
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`failed to load game summary for ${roomId}: ${resp.status}`);
  const data = (await resp.json()) as { game: FeaturedGame };
  return data.game;
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

function gameMetaForGame(game: FeaturedGame): GameMeta {
  return {
    whiteName: game.whiteEngineId ?? game.whiteName,
    blackName: game.blackEngineId ?? game.blackName,
    result: game.result,
    termination: game.termination,
    plyCount: game.plyCount,
  };
}

function buildGameHeader(game: FeaturedGame): HTMLElement {
  const header = document.createElement('section');
  header.className = 'game-header';

  const text = document.createElement('div');
  text.className = 'game-header-text';

  const source = document.createElement('div');
  source.className = 'game-source';
  source.textContent = sourceLabel(game.mode);

  const title = document.createElement('h1');
  title.className = 'game-title';
  title.textContent = `${displayParticipant(game.whiteEngineId ?? game.whiteName, 'White')} vs ${displayParticipant(game.blackEngineId ?? game.blackName, 'Black')}`;

  const meta = document.createElement('p');
  meta.className = 'game-summary-line';
  meta.textContent = `${resultLabel(game.result)} · ${game.plyCount} plies · ${terminationLabel(game.termination)}`;
  text.append(source, title, meta);

  const actions = document.createElement('div');
  actions.className = 'game-header-actions';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'game-copy-link';
  copy.textContent = 'Copy link';
  copy.addEventListener('click', () => copyGameLink(copy));
  actions.append(copy);

  header.append(text, actions);
  return header;
}

function displayParticipant(name: string | null | undefined, fallback: string): string {
  if (!name) return fallback;
  return shortEngineName(name);
}

function sourceLabel(mode: FeaturedGame['mode']): string {
  if (mode === 'eve') return 'Engine vs engine';
  if (mode === 'pve') return 'Human vs engine';
  if (mode === 'pvp') return 'Human vs human';
  if (mode === 'imported') return 'Imported game';
  if (mode === 'manual') return 'Manual game';
  return 'Fog of War game';
}

async function copyGameLink(button: HTMLButtonElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(window.location.href);
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Copy failed';
  }
  window.setTimeout(() => {
    button.textContent = 'Copy link';
  }, 1600);
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

export function mountLearn(root: HTMLElement): void {
  root.replaceChildren();
  root.classList.add('landing-page', 'learn-route');
  const learn = buildLearn();
  root.append(buildNav(), learn.el, buildFooter());
  mountLearnBoard(learn.boardEl);
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

  const learnLink = document.createElement('a');
  learnLink.href = '/learn';
  learnLink.textContent = 'Learn';
  learnLink.className = 'site-nav-link';

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
  links.append(watchLink, learnLink, aboutLink, ghLink);
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
  const learnLink = document.createElement('a');
  learnLink.href = '/learn';
  learnLink.className = 'landing-cta-secondary';
  learnLink.textContent = 'Learn Fog of War';
  ctas.append(learnLink);
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

function buildNotice(titleText: string, bodyText: string): HTMLElement {
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

function buildLearn(): { el: HTMLElement; boardEl: HTMLElement } {
  const section = document.createElement('main');
  section.className = 'learn-shell';

  const boardPanel = document.createElement('section');
  boardPanel.className = 'learn-board-panel';
  const boardEl = document.createElement('div');
  boardEl.className = 'board learn-board';
  boardEl.setAttribute('aria-label', 'Tutorial Fog of War board');
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
    'In Fog of War, your board is built from your pieces and the squares they can legally move to. Everything else stays hidden.';

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
