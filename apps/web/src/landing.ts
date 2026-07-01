import type { GameEvent } from '@mistboard/game';
import './landing-play.css';
import './landing.css';
import './game-route.css';
import { buildHomeArticleCards, initLandingCarousel, mountArticleThumbnails } from './articles.js';
import { displayParticipantName, type FeaturedGame } from './game-display.js';
import { gameMetaForGame } from './game-meta.js';
import { buildHomePuzzleWidget } from './home-puzzle-widget.js';
import { t } from './i18n/catalog.js';
import { currentLocale } from './i18n/locale.js';
import { buildLandingActivity } from './landing-activity.js';
import { buildLandingAnnouncements } from './landing-announcements.js';
import { buildLandingForumPreview } from './landing-forum-preview.js';
import {
  buildLandingPlayPanel,
  buildLobbyRequestsWindow,
  closeActiveLandingDialog,
  fallbackPlayableEngines,
  maybeOpenPlayDeepLink,
  type PlayableEngine,
  setRoomNavigator,
} from './landing-play.js';
import { homepageShowcaseGames, pickHeroPovForGame } from './landing-showcase.js';
import { type GameMeta, mountReplay } from './replay.js';
import { enginePanelsForReview, loadGameForReview } from './review.js';
import { roomIdFromPath } from './room-url.js';
import { mountShowcaseCycler, type ShowcaseEntry } from './showcase-cycler.js';
import { specIdForShowcaseVariant } from './showcase-dispatch.js';
import { buildHomeFooter, buildNav, buildNotice } from './site-shell.js';
import { type WebVariantTenant, webVariantTenantForRoomId } from './variant-tenant/registry.js';

// Adaptive hero-pool refresh. Poll faster while games are being played (they
// unlock on completion, soon), slower when idle. Pool is capped. These three are
// the only knobs — tune from traffic (mirrors the server's SHOWCASE_POOL_SIZE).
const SHOWCASE_REFRESH_ACTIVE_MS = 45_000;
const SHOWCASE_REFRESH_IDLE_MS = 5 * 60_000;
const SHOWCASE_POOL_CAP = 14;

export async function mountLanding(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page');

  // Render the homepage shell immediately from synchronous fallbacks: the static
  // engine showcase drives the hero board and a built-in engine seeds the play
  // panel. First paint never waits on a network round-trip. The two homepage APIs
  // (playable engines, recent showcase games) then upgrade both in place below.
  //
  // Previously these two were awaited serially before anything but the nav
  // painted, so a slow /api/games/showcase hung the whole page behind a "Loading
  // games" spinner (much worse over high-latency links). Shell-first also makes a
  // hanging API non-blocking: the static content just keeps playing until real
  // data arrives, instead of stalling the page.
  // [render-jank: render the shell first, fill async — feedback_render_jank_prevention]
  let usingRealGames = false;
  const games = homepageShowcaseGames();

  // Shared, by-reference maps the cycler reads: pre-registered here for the static
  // fallback pool, then merged with each live-showcase refresh below.
  const metadataByRoomId: Record<string, GameMeta> = {};
  const povByRoomId: Record<string, 'white' | 'black'> = {};
  // Red/black participant names for the tenant compact seats. GameMeta's
  // white/black slots mangle red/black variants, so derive them straight from the
  // feed's participants; first = red/first-mover side, second = black.
  const namesByRoomId: Record<string, { first: string; second: string }> = {};
  const toShowcaseEntry = (game: FeaturedGame): ShowcaseEntry => {
    metadataByRoomId[game.roomId] ??= gameMetaForGame(game);
    const pov = povByRoomId[game.roomId] ?? pickHeroPovForGame(game);
    povByRoomId[game.roomId] = pov;
    namesByRoomId[game.roomId] ??= {
      first: displayParticipantName(
        game,
        game.participants?.some((p) => p.color === 'red') ? 'red' : 'white',
      ),
      second: displayParticipantName(game, 'black'),
    };
    return { roomId: game.roomId, specId: specIdForShowcaseVariant(game.variant), pov };
  };
  const initialPool = games.map(toShowcaseEntry);

  // ?demo=<sampleId> forces a specific bundled game to open first.
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('demo');
  const forcedIdx = requested ? initialPool.findIndex((entry) => entry.roomId === requested) : -1;
  if (forcedIdx > 0) {
    const [forced] = initialPool.splice(forcedIdx, 1);
    initialPool.unshift(forced!);
  }

  const stage = buildLandingStage(fallbackPlayableEngines());
  root.replaceChildren(buildNav(), stage.el);
  mountArticleThumbnails(stage.el);
  initLandingCarousel(stage.el);

  // The showcase cycler owns cross-game advancement so it can cross renderer kinds
  // (dark-chess chessground -> jieqi/banqi/jungle SVG). Each game plays as a single
  // compact board and hands off at its end; the pool refreshes live below.
  const cycler = await mountShowcaseCycler(stage.replayRoot, initialPool, {
    metadataByRoomId,
    namesByRoomId,
    loaderForId: landingEventLoader,
  });

  // Upgrade the play panel + deep-link handling once the real playable engines
  // load. The shell already rendered with the "Misty" placeholder, so this is an
  // in-place swap, not a blocker. The fetch is retried with backoff so a
  // transient failure (e.g. the web service restarting mid-deploy) doesn't strand
  // the placeholder until a manual reload; the real roster swaps in on success.
  let enginesLoaded = false;
  const applyRealEngines = (engines: PlayableEngine[]): void => {
    if (enginesLoaded || !stage.el.isConnected) return;
    enginesLoaded = true;
    stage.applyEngines(engines);
    maybeOpenPlayDeepLink(engines);
  };
  void loadPlayableEnginesWithRetry().then((engines) => {
    if (engines) {
      applyRealEngines(engines);
    } else {
      // Every retry failed. Keep the placeholder, but still honor a ?play deep
      // link against it; the focus handler below retries when the tab returns.
      maybeOpenPlayDeepLink(fallbackPlayableEngines());
    }
  });

  // Self-heal a stranded placeholder: if the initial load and its retries never
  // landed the real roster (e.g. the tab was opened mid-deploy), fetch again when
  // the tab regains focus so the visitor never has to reload to get the real
  // engine. Self-removes once the landing unmounts (mirrors the showcase poll's
  // isConnected guard) and is also torn down on the room transition below.
  const refetchEnginesOnFocus = (): void => {
    if (!stage.el.isConnected) {
      document.removeEventListener('visibilitychange', refetchEnginesOnFocus);
      return;
    }
    if (enginesLoaded || document.visibilityState !== 'visible') return;
    void fetchPlayableEnginesOnce().then((engines) => {
      if (engines) applyRealEngines(engines);
    });
  };
  document.addEventListener('visibilitychange', refetchEnginesOnFocus);

  // Adaptively refresh the hero pool so newly finished games rotate in without a
  // page reload. New games' metadata/POV merge into the shared maps the replay
  // reads by reference, then the loop pool is swapped (the current game finishes
  // first). Polls fast while games are live, slow when idle; self-clears on
  // unmount.
  const poolIds = new Set(initialPool.map((entry) => entry.roomId));
  let showcaseTimer: number | null = null;
  const stopShowcaseRefresh = () => {
    if (showcaseTimer !== null) {
      window.clearTimeout(showcaseTimer);
      showcaseTimer = null;
    }
  };
  const refreshShowcasePool = async () => {
    let fresh: FeaturedGame[];
    try {
      fresh = await fetchShowcaseGames();
    } catch (err) {
      console.warn('showcase refresh failed', err);
      return;
    }
    if (fresh.length < 3) return; // not enough real games yet; keep the pool
    const nextEntries = fresh.slice(0, SHOWCASE_POOL_CAP).map(toShowcaseEntry);
    const nextIds = nextEntries.map((entry) => entry.roomId);
    const changed = nextIds.length !== poolIds.size || nextIds.some((id) => !poolIds.has(id));
    if (!changed) return;
    poolIds.clear();
    for (const id of nextIds) poolIds.add(id);
    // First time real games arrive, jump straight to one instead of letting the
    // static Misty-vs-Misty placeholder play out — it runs minutes before the loop
    // would rotate, so visitors otherwise only ever see the fallback.
    const leavingStaticFallback = !usingRealGames;
    if (leavingStaticFallback) usingRealGames = true;
    cycler.updatePool(nextEntries, { jumpNow: leavingStaticFallback });
  };
  const tickShowcaseRefresh = async () => {
    if (!stage.el.isConnected) {
      stopShowcaseRefresh();
      return;
    }
    let playing = 0;
    try {
      const resp = await fetch('/api/live-stats');
      if (resp.ok) playing = ((await resp.json()) as { playing?: number }).playing ?? 0;
    } catch {
      // ignore — treat as idle
    }
    await refreshShowcasePool();
    if (!stage.el.isConnected) {
      stopShowcaseRefresh();
      return;
    }
    showcaseTimer = window.setTimeout(
      () => void tickShowcaseRefresh(),
      playing > 0 ? SHOWCASE_REFRESH_ACTIVE_MS : SHOWCASE_REFRESH_IDLE_MS,
    );
  };
  // Kick the first refresh promptly so real games replace the static showcase as
  // soon as /api/games/showcase responds (the shell rendered with the static set
  // up front). Subsequent ticks reschedule at the adaptive active/idle cadence.
  showcaseTimer = window.setTimeout(() => void tickShowcaseRefresh(), 0);

  // Hand off room navigation to an in-place SPA transition so the starting
  // click's user activation survives into the room. A full-document nav would
  // drop it, and browser autoplay policy would then swallow the engine's
  // opening-move sound until the visitor clicked again. The navigator is wired
  // only after the hero replay exists, so a click before then uses the default
  // full reload (safe, just no opening-move sound).
  const teardownLanding = () => {
    setRoomNavigator(null);
    closeActiveLandingDialog();
    stopShowcaseRefresh();
    document.removeEventListener('visibilitychange', refetchEnginesOnFocus);
    cycler.destroy();
  };
  setRoomNavigator((url) => {
    void transitionToRoom(root, url, teardownLanding);
  });
}

async function transitionToRoom(
  root: HTMLElement,
  url: string,
  teardownLanding: () => void,
): Promise<void> {
  // Load the live room chunk while the landing is still on screen (no blank
  // flash), then dispose the landing and swap the room in place. Same-document
  // navigation preserves the click's sticky user activation.
  const tenant = landingRoomTenantForUrl(url);
  if (tenant?.loadLiveRoomClient) {
    const bootstrap = await tenant.loadLiveRoomClient().catch((err) => {
      console.warn('live room chunk failed to load; falling back to full reload', err);
      return null;
    });
    if (bootstrap === null) {
      window.location.href = url;
      return;
    }
    prepareRoomTransition(root, url, teardownLanding);
    bootstrap();
    return;
  }
  const liveModule = await import('./live.js').catch((err) => {
    console.warn('live room chunk failed to load; falling back to full reload', err);
    return null;
  });
  if (liveModule === null) {
    window.location.href = url;
    return;
  }
  prepareRoomTransition(root, url, teardownLanding);
  liveModule.bootstrapLiveRoom();
}

// Tenants with a self-contained live client (Crossroads) transition through
// their own chunk; everything else boots the shared chess live shell.
export function landingRoomTenantForUrl(url: string): WebVariantTenant | null {
  const next = new URL(url, window.location.href);
  const roomId = roomIdFromPath(next.pathname) ?? next.searchParams.get('room');
  const tenant = roomId ? webVariantTenantForRoomId(roomId) : null;
  return tenant?.loadLiveRoomClient && tenant.enabled() ? tenant : null;
}

export function landingRoomClientKindForUrl(url: string): 'tenant' | 'standard' {
  return landingRoomTenantForUrl(url) ? 'tenant' : 'standard';
}

function prepareRoomTransition(root: HTMLElement, url: string, teardownLanding: () => void): void {
  teardownLanding();
  window.history.pushState(null, '', url);
  root.classList.remove('landing-page', 'game-route');
  root.replaceChildren();
  window.addEventListener('popstate', reloadOnPopState);
}

// After an in-place landing -> room swap, Back/Forward changes the URL without a
// document load, leaving the live DOM stranded on a non-room URL. A full reload
// re-runs main.ts route dispatch for whatever URL we landed on. The listener
// dies with the document on reload, so it never needs explicit removal.
function reloadOnPopState(): void {
  window.location.reload();
}

async function fetchShowcaseGames(): Promise<FeaturedGame[]> {
  const resp = await fetch('/api/games/showcase');
  if (!resp.ok) throw new Error(`failed to load showcase games: ${resp.status}`);
  const data = (await resp.json()) as { games: FeaturedGame[] };
  return data.games;
}

export async function mountGame(root: HTMLElement, roomId: string): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'game-route');

  const shell = document.createElement('main');
  shell.className = 'game-shell';
  const replayRoot = document.createElement('div');
  replayRoot.className = 'game-replay';
  shell.append(replayRoot);
  root.append(buildNav(), shell);

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

// One attempt at loading the real playable roster. Returns the engines on
// success, or null if the API is unreachable, errors, or (defensively) returns
// an empty list — callers keep the placeholder and may retry. Never throws.
export async function fetchPlayableEnginesOnce(): Promise<PlayableEngine[] | null> {
  try {
    const resp = await fetch('/api/engines/playable');
    if (!resp.ok) return null;
    const data = (await resp.json()) as { engines: PlayableEngine[] };
    return data.engines.length > 0 ? data.engines : null;
  } catch {
    return null;
  }
}

// Retry the engines fetch with backoff so a transient failure (a deploy/restart,
// a cold start, a network blip) doesn't strand the placeholder until the visitor
// manually reloads. Returns the roster, or null if every attempt failed.
export async function loadPlayableEnginesWithRetry(): Promise<PlayableEngine[] | null> {
  const backoffMs = [600, 1200, 2400, 4800];
  for (let attempt = 0; ; attempt += 1) {
    const engines = await fetchPlayableEnginesOnce();
    if (engines) return engines;
    if (attempt >= backoffMs.length) return null;
    await delay(backoffMs[attempt]!);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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

function buildLandingStage(
  engines: PlayableEngine[],
  opts: { skipLiveWidgets?: boolean } = {},
): {
  el: HTMLElement;
  replayRoot: HTMLElement;
  applyEngines: (engines: PlayableEngine[]) => void;
} {
  const locale = currentLocale();
  const stage = document.createElement('main');
  stage.className = 'landing-stage';

  const section = document.createElement('section');
  section.className = 'landing-demo';

  // ── Left rail: announcements, then a small one-line "about" heading. It is the
  // page's single h1, kept small (body-text sized) to fit the board-centered
  // design, so the homepage still has a real heading for search + screen readers
  // without a marketing hero. ──
  const leftRail = document.createElement('div');
  leftRail.className = 'landing-rail landing-rail-left';
  const about = document.createElement('h1');
  about.className = 'landing-about';
  about.textContent = t('home.tagline', {}, locale);
  leftRail.append(buildLandingAnnouncements(locale), about);
  // Activity box arrives async (two API fetches) and may not render at all
  // (no persistence, API down), so it slots in above the about line on
  // success instead of reserving space.
  void buildLandingActivity().then((activity) => {
    if (activity) leftRail.insertBefore(activity, about);
  });

  // ── Center (wide): the fog board hero, with article cards stacked beneath. ──
  const centerColumn = document.createElement('div');
  centerColumn.className = 'landing-center';

  const boardColumn = document.createElement('div');
  boardColumn.className = 'landing-board-column';

  const replayRoot = document.createElement('div');
  replayRoot.id = 'landing-replay';

  boardColumn.append(replayRoot);
  centerColumn.append(boardColumn);
  const articleCards = buildHomeArticleCards(8, locale);
  if (articleCards) centerColumn.append(articleCards);
  centerColumn.append(buildLandingForumPreview({ hydrate: !opts.skipLiveWidgets }));

  // ── Right rail: the pairing CTAs, with the open-pairing-requests browser
  // stacked beneath them. ──
  const rightRail = document.createElement('div');
  rightRail.className = 'landing-rail landing-rail-right';
  let playPanel = buildLandingPlayPanel(engines, { locale, showLobbyRequests: false });
  rightRail.append(playPanel);
  // The lobby-requests browser fetches + polls on construction, so it is skipped
  // when rendering the static shell at build time (the prerender path).
  if (!opts.skipLiveWidgets) {
    const lobbyRequests = buildLobbyRequestsWindow(locale);
    rightRail.append(lobbyRequests);
    void buildHomePuzzleWidget().then((widget) => {
      if (widget) rightRail.append(widget);
    });
  }

  // Swap the play panel in place once the real playable engines arrive (the shell
  // renders first with a built-in fallback). The displaced panel's live-stats
  // poll self-clears on its next tick when it finds itself detached from the DOM.
  const applyEngines = (next: PlayableEngine[]): void => {
    const replacement = buildLandingPlayPanel(next, { locale, showLobbyRequests: false });
    playPanel.replaceWith(replacement);
    playPanel = replacement;
  };

  section.append(leftRail, centerColumn, rightRail);
  // The footer lives only on the homepage now (stripped from interior routes),
  // blended into the bottom of the stage rather than rendered as a separate bar.
  stage.append(section, buildHomeFooter(locale));
  return { el: stage, replayRoot, applyEngines };
}

// Build-time static render of the homepage (nav + stage), baked by the prerender
// so crawlers, no-JS clients, and first paint get real content (the heading, play
// panel, article links, footer) instead of the empty SPA shell. The board replay
// and live game pool stay client-hydrated; the live lobby widget is skipped
// because it fetches on construction. Returns the inner HTML for `#app`.
export function renderLandingShellForPrerender(): string {
  const nav = buildNav();
  const stage = buildLandingStage(fallbackPlayableEngines(), { skipLiveWidgets: true });
  return `${nav.outerHTML}${stage.el.outerHTML}`;
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
  return `${white} vs ${black} · Mistboard`;
}
