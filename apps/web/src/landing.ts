import type { GameEvent } from '@mistboard/game';
import './landing-play.css';
import './landing.css';
import './game-route.css';
import { isLikelySignedIn, loadCachedCurrentUser, readCachedUser } from './account-nav.js';
import { mountArticleThumbnails } from './articles.js';
import { buildContact } from './contact.js';
import type { FeaturedGame } from './game-display.js';
import { gameMetaForGame } from './game-meta.js';
import { buildLandingAnnouncements } from './landing-announcements.js';
import {
  buildLandingPlayPanel,
  fallbackPlayableEngines,
  maybeOpenPlayDeepLink,
  type PlayableEngine,
} from './landing-play.js';
import { homepageShowcaseGames, pickHeroPovForGame } from './landing-showcase.js';
import { type GameMeta, mountReplay } from './replay.js';
import { enginePanelsForReview, loadGameForReview } from './review.js';
import { buildFooter, buildLoadingState, buildNav, buildNotice } from './site-shell.js';

const HOMEPAGE_CORPUS_HOLD_MS = 8000;

export async function mountLanding(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page');
  root.append(buildNav(), buildLoadingState('Loading games'), buildFooter());

  const engines = await fetchPlayableEngines().catch((err) => {
    console.warn(err);
    return fallbackPlayableEngines();
  });
  // Prefer recent real games (quality-filtered, PvP-first) so the hero reads as
  // a live place; fall back to the static engine showcase if the API is thin or
  // unreachable, so the hero is never empty.
  let usingRealGames = false;
  let games = homepageShowcaseGames();
  try {
    const showcase = await fetchShowcaseGames();
    if (showcase.length >= 3) {
      games = showcase;
      usingRealGames = true;
    }
  } catch (err) {
    console.warn('showcase games unavailable; using engine fallback', err);
  }
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('demo');
  const sampleIds = games.map((g) => g.roomId);
  const forcedSample = requested && sampleIds.includes(requested) ? requested : null;
  const currentSample = forcedSample ?? sampleIds[0]!;
  const stage = buildLandingStage(engines);
  root.replaceChildren(buildNav(), stage.el, buildFooter());
  mountArticleThumbnails(stage.el);
  maybeOpenPlayDeepLink(engines);
  void renderHeroActivity(stage.activity);

  const metadataByRoomId: Record<string, GameMeta> = {};
  const povByRoomId: Record<string, 'white' | 'black'> = {};
  for (const g of games) {
    metadataByRoomId[g.roomId] = gameMetaForGame(g);
    povByRoomId[g.roomId] = pickHeroPovForGame(g);
  }

  const replay = await mountReplay(stage.replayRoot, currentSample, {
    autoplay: true,
    showControls: false,
    revealOnFinish: false,
    orientationForId: (sampleId) => povByRoomId[sampleId] ?? 'white',
    // Cycle the corpus per-visitor, pacing each game by its real per-move
    // timing: PvP uses recorded move deltas, EvE uses engine think time.
    // clampPace bounds the raw think-time path so flat-budget EvE fallback
    // games don't play as a 5s/move metronome.
    loopSamples: sampleIds,
    clampPace: true,
    betweenGameDelayMs: HOMEPAGE_CORPUS_HOLD_MS,
    loaderForId: landingEventLoader,
    metadataMode: 'compact',
    metadataByRoomId,
    hideGameIdPill: true,
    showCaptures: true,
    captureLayout: 'split',
    compactClockLayout: 'stacked',
    endStatusMode: 'clock',
    panes: { resolver: (sampleId) => povByRoomId[sampleId] ?? 'white' },
  });

  // Click the hero → open the game currently showing. Only for real games:
  // the static engine fallback samples have no /game/:id replay page.
  if (usingRealGames) {
    stage.replayRoot.classList.add('landing-replay-clickable');
    stage.replayRoot.setAttribute('role', 'link');
    stage.replayRoot.tabIndex = 0;
    stage.replayRoot.title = 'Watch this game';
    const openCurrent = () => {
      const id = replay.activeSampleId();
      if (id) window.location.assign(`/game/${encodeURIComponent(id)}`);
    };
    stage.replayRoot.addEventListener('click', openCurrent);
    stage.replayRoot.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openCurrent();
      }
    });
  }
}

async function fetchShowcaseGames(): Promise<FeaturedGame[]> {
  const resp = await fetch('/api/games/showcase');
  if (!resp.ok) throw new Error(`failed to load showcase games: ${resp.status}`);
  const data = (await resp.json()) as { games: FeaturedGame[] };
  return data.games;
}

// Hero activity line: always-present "N games played" (credibility, from public
// stats) plus "M playing now" when there's live play. Conveys "this place is
// alive" even in a quiet beta moment.
async function renderHeroActivity(el: HTMLElement): Promise<void> {
  try {
    const [stats, live] = await Promise.all([
      fetch('/api/stats/public').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/live-stats').then((r) => (r.ok ? r.json() : null)),
    ]);
    const total = stats?.totalCompletedGames as number | undefined;
    const playing = live?.playing as number | undefined;
    const parts: string[] = [];
    if (typeof total === 'number' && total > 0)
      parts.push(`${total.toLocaleString()} games played`);
    if (typeof playing === 'number' && playing > 0) parts.push(`${playing} playing now`);
    if (parts.length === 0) return;
    el.textContent = parts.join(' · ');
    el.hidden = false;
  } catch (err) {
    console.warn(err);
  }
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
    replayRoot.append(
      buildNotice('Game not found', 'This game is not available as a public replay.'),
    );
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
    captureLayout: 'split',
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
    belief:
      loaded.beliefRows.length > 0
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

async function fetchPlayableEngines(): Promise<PlayableEngine[]> {
  const resp = await fetch('/api/engines/playable');
  if (!resp.ok) throw new Error(`failed to load playable engines: ${resp.status}`);
  const data = (await resp.json()) as { engines: PlayableEngine[] };
  return data.engines.length > 0 ? data.engines : fallbackPlayableEngines();
}

async function apiEventLoader(roomId: string): Promise<GameEvent[]> {
  const resp = await fetch(`/api/games/${encodeURIComponent(roomId)}/events`);
  if (!resp.ok) throw new Error(`failed to load events for ${roomId}: ${resp.status}`);
  const data = (await resp.json()) as { events: GameEvent[] };
  return data.events;
}

async function landingEventLoader(roomId: string): Promise<GameEvent[]> {
  if (isStaticReplaySampleId(roomId)) return fetchStaticSample(roomId);
  return apiEventLoader(roomId);
}

function isStaticReplaySampleId(roomId: string): boolean {
  return /^(sample-\d+|engine-v2-g\d{4})$/.test(roomId);
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

function buildLandingStage(engines: PlayableEngine[]): {
  el: HTMLElement;
  replayRoot: HTMLElement;
  activity: HTMLElement;
} {
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
  subtagline.textContent =
    'Server-enforced hidden information. Play people or the Mistboard engine.';

  const activity = document.createElement('p');
  activity.className = 'landing-hero-activity';
  activity.hidden = true;

  heroHeader.append(tagline, subtagline, activity);

  const replayRoot = document.createElement('div');
  replayRoot.id = 'landing-replay';

  const fogNote = document.createElement('p');
  fogNote.className = 'landing-hero-fog-note';
  fogNote.textContent = 'One player’s view — the rest is hidden in the fog.';

  boardColumn.append(replayRoot, fogNote);

  const announcements = buildLandingAnnouncements();
  const playPanel = buildLandingPlayPanel(engines, { showLobbyRequests: true });

  section.append(heroHeader, announcements, boardColumn, playPanel);
  stage.append(section);
  return { el: stage, replayRoot, activity };
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

function buildGamePageTitle(game: FeaturedGame): string {
  const white = game.whiteName ?? 'White';
  const black = game.blackName ?? 'Black';
  const result =
    game.result === 'white-wins'
      ? `${white} beats ${black}`
      : game.result === 'black-wins'
        ? `${black} beats ${white}`
        : `${white} vs ${black} · Draw`;
  return `${result} · Mistboard`;
}
