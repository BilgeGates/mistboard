import { replayGameEvents, type Board, type GameEvent, type PlayerView, type Square } from '@bichess/game';
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
  participants?: GameParticipant[];
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

type LandingGameSource = 'recent' | 'eve' | 'featured' | 'sample';

const GITHUB_URL = 'https://github.com/brianhliou/bichess';
const SHOW_ENGINE_LAB_LINKS = import.meta.env.VITE_SHOW_ENGINE_LAB_NAV === 'true';

export async function mountLanding(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page');
  root.append(buildNav(), buildLoadingState('Loading games'), buildFooter());

  const [{ games, source }, engines] = await Promise.all([
    fetchLandingGames(),
    fetchPlayableEngines().catch((err) => {
      console.warn(err);
      return fallbackPlayableEngines();
    }),
  ]);
  const stage = buildLandingStage(source, engines);
  root.replaceChildren(buildNav(), stage.el, buildFooter());
  if (games.length === 0) {
    stage.replayRoot.textContent = 'No games available yet.';
    renderRecentGames(stage.listRoot, games, source, undefined, '/game/', 'Now showing', false, 4);
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

  await mountReplay(stage.replayRoot, currentSample, {
    autoplay: true,
    showControls: false,
    revealOnFinish: true,
    blackOrientation: 'white',
    loopSamples: sampleIds,
    loaderForId: landingEventLoader,
    metadataByRoomId,
  });
  renderRecentGames(
    stage.listRoot,
    games,
    source,
    currentSample,
    source === 'sample' ? '/?demo=' : '/game/',
    'Now showing',
    false,
    4,
  );
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
  const headerRoot = document.createElement('div');
  headerRoot.className = 'game-header-root';
  const replayRoot = document.createElement('div');
  replayRoot.className = 'game-replay';
  shell.append(headerRoot, replayRoot);
  root.append(buildNav(), shell, buildFooter());

  const loaded = await loadGameForReview(roomId);
  if (!loaded) {
    replayRoot.append(buildNotice('Game not found', 'This game is not available as a public replay.'));
    return;
  }

  const { game, events } = loaded;
  headerRoot.append(buildGameHeader(game));
  await mountReplay(replayRoot, game.roomId, {
    autoplay: false,
    initialPly: initialGamePly(),
    onPlyChange: syncGamePlyUrl,
    showControls: true,
    revealOnFinish: true,
    loaderForId: events ? async () => events : apiEventLoader,
    metadataByRoomId: {
      [game.roomId]: gameMetaForGame(game),
    },
  });
}

async function loadGameForReview(roomId: string): Promise<{ game: FeaturedGame; events?: GameEvent[] } | null> {
  const game = await fetchGameSummary(roomId).catch((err) => {
    console.warn(err);
    return null;
  });
  if (game) return { game };

  const events = await apiEventLoader(roomId).catch((err) => {
    console.warn(err);
    return null;
  });
  if (!events || events.length === 0) return null;

  const fallback = gameSummaryFromEvents(roomId, events);
  return fallback ? { game: fallback, events } : null;
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
  const featuredGames = await fetchFeaturedGames().catch((err) => {
    console.warn(err);
    return [];
  });
  if (featuredGames.length > 0) return { games: featuredGames, source: 'featured' };
  return { games: staticSampleGames(), source: 'sample' };
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

function gameSummaryFromEvents(roomId: string, events: GameEvent[]): FeaturedGame | null {
  const projection = replayGameEvents(events);
  const status = projection.state.status;
  if (status.type !== 'finished') return null;

  return {
    roomId,
    variant: projection.variant,
    mode: modeFromSeats(projection.seats.white, projection.seats.black),
    result: status.winner === 'white' ? 'white-wins' : status.winner === 'black' ? 'black-wins' : 'draw',
    termination: status.reason,
    plyCount: events.filter((event) => event.type === 'move-played').length,
    whiteName: null,
    blackName: null,
    corpusId: null,
    participants: [
      participantFromSeat('white', projection.seats.white, null),
      participantFromSeat('black', projection.seats.black, null),
    ],
  };
}

function modeFromSeats(whiteClient: string | undefined, blackClient: string | undefined): FeaturedGame['mode'] {
  const whiteEngine = isEngineClient(whiteClient);
  const blackEngine = isEngineClient(blackClient);
  if (whiteEngine && blackEngine) return 'eve';
  if (whiteEngine || blackEngine) return 'pve';
  return 'pvp';
}

function isEngineClient(clientId: string | undefined): boolean {
  return !!clientId && (
    clientId === 'random-engine'
    || clientId === 'engine:white'
    || clientId === 'engine:black'
    || clientId.startsWith('engine:')
    || clientId.startsWith('builtin-')
    || clientId.startsWith('python-')
  );
}

function participantFromSeat(
  color: 'white' | 'black',
  clientId: string | undefined,
  fallbackName: string | null,
): GameParticipant {
  if (isEngineClient(clientId)) {
    const subjectId = canonicalEngineId(clientId!);
    return {
      color,
      displayName: fallbackName ?? subjectId,
      subjectType: 'engine-version',
      subjectId,
      visibility: 'link',
    };
  }
  return {
    color,
    displayName: fallbackName ?? 'Guest',
    subjectType: 'guest',
    subjectId: null,
    visibility: 'link',
  };
}

function canonicalEngineId(clientId: string): string {
  if (clientId === 'random-engine') return 'builtin-random-legal';
  return clientId;
}

async function landingEventLoader(roomId: string): Promise<GameEvent[]> {
  const apiEvents = await apiEventLoader(roomId).catch(() => null);
  if (apiEvents) return apiEvents;
  return fetchStaticSample(roomId);
}

async function fetchStaticSample(sampleId: string): Promise<GameEvent[]> {
  const safeId = sampleId.replace(/[^a-zA-Z0-9_-]/g, '');
  const resp = await fetch(`/replay-samples/${safeId}.jsonl`);
  if (!resp.ok) throw new Error(`failed to load replay sample ${safeId}: ${resp.status}`);
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
    result: game.result,
    timeControl: game.timeControl,
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
  title.textContent = `${displayParticipantName(game, 'white')} vs ${displayParticipantName(game, 'black')}`;

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

function displayParticipantName(game: FeaturedGame, color: 'white' | 'black'): string {
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
  brandText.textContent = 'BICHESS';
  brand.append(brandLogo, brandText);

  const links = document.createElement('div');
  links.className = 'site-nav-links';

  const aboutLink = navLink('About', '/about');
  const watchLink = navLink('Watch', '/watch');
  const learnLink = navLink('Learn', '/learn');

  const ghLink = document.createElement('a');
  ghLink.href = GITHUB_URL;
  ghLink.target = '_blank';
  ghLink.rel = 'noreferrer noopener';
  ghLink.textContent = 'GitHub';
  ghLink.className = 'site-nav-link';

  if (SHOW_ENGINE_LAB_LINKS) {
    const labLink = navLink('Engine Lab', '/engine-lab');
    links.append(labLink);
  }
  links.append(watchLink, learnLink, aboutLink, ghLink);
  nav.append(brand, links);
  return nav;
}

function navLink(label: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  link.className = 'site-nav-link';
  if (currentPath() === href) {
    link.classList.add('active');
    link.setAttribute('aria-current', 'page');
  }
  return link;
}

function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

function buildLoadingState(label: string): HTMLElement {
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

function buildLandingStage(source: LandingGameSource, engines: PlayableEngine[]): { el: HTMLElement; replayRoot: HTMLElement; listRoot: HTMLElement } {
  const stage = document.createElement('main');
  stage.className = 'landing-stage';

  const hero = document.createElement('section');
  hero.className = 'landing-hero';

  const title = document.createElement('h1');
  title.className = 'landing-title';
  title.textContent = 'Bichess';

  const subtitle = document.createElement('p');
  subtitle.className = 'landing-subtitle';
  subtitle.textContent =
    'Server-enforced Fog of War chess. You only see what your pieces can see.';

  const tag = document.createElement('p');
  tag.className = 'landing-tag';
  tag.textContent = source === 'recent'
    ? "Now showing recent public Fog games with each side's private view."
    : source === 'eve'
      ? "Now showing recent engine games with each side's private view."
    : 'Watch what each side saw, then reveal what was really there.';

  const playPanel = buildLandingPlayPanel(engines);

  const ctas = document.createElement('div');
  ctas.className = 'landing-ctas';

  const watchLink = document.createElement('a');
  watchLink.href = '/watch';
  watchLink.className = 'landing-cta-secondary';
  watchLink.textContent = 'Watch Replays';
  ctas.append(watchLink);
  const learnLink = document.createElement('a');
  learnLink.href = '/learn';
  learnLink.className = 'landing-cta-secondary';
  learnLink.textContent = 'How It Works';
  ctas.append(learnLink);
  if (SHOW_ENGINE_LAB_LINKS) {
    const labLink = document.createElement('a');
    labLink.href = '/engine-lab';
    labLink.className = 'landing-cta-secondary';
    labLink.textContent = 'Open Engine Lab';
    ctas.append(labLink);
  }
  hero.append(title, subtitle, tag, playPanel, ctas);

  const section = document.createElement('section');
  section.className = 'landing-demo';

  const listRoot = document.createElement('aside');
  listRoot.className = 'landing-games';

  const replayRoot = document.createElement('div');
  replayRoot.id = 'landing-replay';
  section.append(replayRoot, listRoot);

  stage.append(hero, section);
  return { el: stage, replayRoot, listRoot };
}

function buildLandingPlayPanel(engines: PlayableEngine[]): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'landing-play-panel';

  const engineSelect = document.createElement('select');
  engineSelect.className = 'play-engine-select landing-engine-select';
  engineSelect.setAttribute('aria-label', 'Engine');
  for (const engine of engines.length > 0 ? engines : fallbackPlayableEngines()) {
    const option = document.createElement('option');
    option.value = engine.id;
    option.textContent = engine.name;
    engineSelect.append(option);
  }

  const engineButton = document.createElement('button');
  engineButton.type = 'button';
  engineButton.className = 'landing-cta-primary landing-play-action';
  engineButton.textContent = 'Play engine';
  engineButton.addEventListener('click', () => {
    void createRoomFromPlay(engineButton, 'pve', engineSelect.value);
  });

  const challengeButton = document.createElement('button');
  challengeButton.type = 'button';
  challengeButton.className = 'landing-cta-secondary landing-play-action';
  challengeButton.textContent = 'Challenge friend';
  challengeButton.addEventListener('click', () => {
    void createRoomFromPlay(challengeButton, 'pvp');
  });

  panel.append(engineSelect, engineButton, challengeButton);
  return panel;
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
    meta.textContent = `${sourceLabel(game.mode)} · ${resultLabel(game.result)} · ${game.plyCount} plies · ${terminationLabel(game.termination)}`;

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
  };
  return known[name] ?? null;
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

async function createRoomFromPlay(button: HTMLButtonElement, mode: 'pvp' | 'pve', engineId?: string): Promise<void> {
  const originalText = button.textContent ?? '';
  button.disabled = true;
  button.textContent = 'Creating';
  try {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode,
        variant: 'fog-of-war',
        ...(mode === 'pve' && engineId ? { engineId } : {}),
      }),
    });
    if (!response.ok) throw new Error(`room creation failed: ${response.status}`);
    const data = await response.json() as { url?: string };
    if (!data.url) throw new Error('room creation did not return a URL');
    window.location.href = data.url;
  } catch (err) {
    console.warn(err);
    button.textContent = 'Try again';
    button.disabled = false;
    window.setTimeout(() => {
      if (button.disabled) return;
      button.textContent = originalText;
    }, 1800);
  }
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
