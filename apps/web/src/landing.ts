import type { GameEvent } from '@mistboard/game';
import './landing-play.css';
import './landing.css';
import './game-route.css';
import { loadCachedCurrentUser, readCachedUser } from './account-nav.js';
import { mountArticleThumbnails } from './articles.js';
import { buildContact } from './contact.js';
import type { FeaturedGame } from './game-display.js';
import { gameMetaForGame } from './game-meta.js';
import { buildLandingAnnouncements } from './landing-announcements.js';
import {
  buildLandingPlayPanel,
  closeActiveLandingDialog,
  fallbackPlayableEngines,
  maybeOpenPlayDeepLink,
  type PlayableEngine,
  setRoomNavigator,
} from './landing-play.js';
import { homepageShowcaseGames, pickHeroPovForGame } from './landing-showcase.js';
import { type GameMeta, mountReplay } from './replay.js';
import { enginePanelsForReview, loadGameForReview } from './review.js';
import { isLikelySignedIn } from './signed-in-state.js';
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

  const metadataByRoomId: Record<string, GameMeta> = {};
  const povByRoomId: Record<string, 'white' | 'black'> = {};
  for (const g of games) {
    metadataByRoomId[g.roomId] = gameMetaForGame(g);
    povByRoomId[g.roomId] = pickHeroPovForGame(g);
  }

  // Keep the "Review this game" link pointed at whatever game the hero is
  // currently showing. Only real games have a /game/:id page, so the static
  // engine fallback leaves the link hidden.
  const syncReviewLink = (sampleId: string) => {
    if (!usingRealGames) return;
    stage.reviewLink.href = `/game/${encodeURIComponent(sampleId)}`;
    stage.reviewLink.hidden = false;
  };

  const replay = await mountReplay(stage.replayRoot, currentSample, {
    autoplay: true,
    showControls: false,
    revealOnFinish: false,
    onSampleChange: syncReviewLink,
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

  // The review link is wired via onSampleChange (synced to the cycling hero);
  // ensure it reflects the initial sample in case the first load fired before
  // the handle returned.
  syncReviewLink(replay.activeSampleId());

  // Hand off room navigation to an in-place SPA transition so the starting
  // click's user activation survives into the room. A full-document nav would
  // drop it, and browser autoplay policy would then swallow the engine's
  // opening-move sound until the visitor clicked again. The navigator is wired
  // only after the hero replay exists, so a click before then uses the default
  // full reload (safe, just no opening-move sound).
  const teardownLanding = () => {
    setRoomNavigator(null);
    closeActiveLandingDialog();
    replay.destroy();
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
  const liveModule = await import('./live.js').catch((err) => {
    console.warn('live room chunk failed to load; falling back to full reload', err);
    return null;
  });
  if (!liveModule) {
    window.location.href = url;
    return;
  }
  teardownLanding();
  window.history.pushState(null, '', url);
  root.classList.remove('landing-page', 'game-route');
  root.replaceChildren();
  window.addEventListener('popstate', reloadOnPopState);
  liveModule.bootstrapLiveRoom();
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
  reviewLink: HTMLAnchorElement;
} {
  const stage = document.createElement('main');
  stage.className = 'landing-stage';

  const section = document.createElement('section');
  section.className = 'landing-demo';

  const boardColumn = document.createElement('div');
  boardColumn.className = 'landing-board-column';

  const replayRoot = document.createElement('div');
  replayRoot.id = 'landing-replay';

  const fogNote = document.createElement('p');
  fogNote.className = 'landing-hero-fog-note';
  fogNote.textContent = 'One player’s view. The rest is hidden in the fog.';

  // Small, explicit CTA so only this target opens the full replay — the board
  // itself is not clickable. Shown/wired only for real games (the static engine
  // fallback samples have no /game/:id page). Href tracks the cycling hero.
  const reviewLink = document.createElement('a');
  reviewLink.className = 'landing-review-link';
  reviewLink.textContent = 'Review this game →';
  reviewLink.hidden = true;

  boardColumn.append(replayRoot, fogNote, reviewLink);

  const announcements = buildLandingAnnouncements();
  const playPanel = buildLandingPlayPanel(engines, { showLobbyRequests: true });

  section.append(announcements, boardColumn, playPanel);
  stage.append(section);
  return { el: stage, replayRoot, reviewLink };
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
