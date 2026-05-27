import { type GameEvent, TIME_CONTROLS, type TimeControlId } from '@mistboard/game';
import './landing.css';
import { isLikelySignedIn, loadCachedCurrentUser, readCachedUser } from './account-nav.js';
import { classifyTimeControl, gameSpecAnalyticsProps, track } from './analytics.js';
import { mountArticleThumbnails } from './articles.js';
import { buildContact } from './contact.js';
import {
  displayParticipantName,
  type FeaturedGame,
  type GameParticipant,
  participantForColor,
  sourceLabel,
} from './game-display.js';
import { buildLandingAnnouncements } from './landing-announcements.js';
import { homepageShowcaseGames, pickHeroPovForGame } from './landing-showcase.js';
import { isRatedModeEnabled } from './rated-flag.js';
import { type GameMeta, mountReplay } from './replay.js';
import { enginePanelsForReview, loadGameForReview } from './review.js';
import { buildFooter, buildLoadingState, buildNav, buildNotice } from './site-shell.js';
import { isVariantEnabled } from './variants.js';
import { ENGINE_OFFER_AFTER_MS, shouldOfferEngine } from './web-utils.js';

type PlayableEngine = {
  id: string;
  name: string;
  familyName: string;
  kind: string;
};

type WatchChannelSummary = {
  family: string;
  gameSpecIds: string[];
  id: string;
  label: string;
  sealedCount: number;
  unlockedCount: number;
};
type WatchFeed = {
  activeChannel: string;
  channels: WatchChannelSummary[];
  now: string;
  sealedActivityWindowMs?: number;
  unlockLimit: number;
  sealedCount: number;
  unlocked: FeaturedGame[];
};
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
type RoomCreationFailure = {
  error?: string;
};

const HOMEPAGE_CORPUS_PLY_MS = 900;
const HOMEPAGE_CORPUS_HOLD_MS = 8000;
const HOMEPAGE_CORPUS_CLOCK_TICK_MS = 16;
const ENGINE_SEAT_RETRY_MS = 3_000;
const WATCH_ACTIVE_POLL_MS = 15_000;
const WATCH_IDLE_POLL_MS = 60_000;
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

  const engines = await fetchPlayableEngines().catch((err) => {
    console.warn(err);
    return fallbackPlayableEngines();
  });
  const games = homepageShowcaseGames();
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('demo');
  const sampleIds = games.map((g) => g.roomId);
  const forcedSample = requested && sampleIds.includes(requested) ? requested : null;
  const currentSample = forcedSample ?? sampleIds[0]!;
  const wallClockLoop = forcedSample
    ? undefined
    : {
        holdMs: HOMEPAGE_CORPUS_HOLD_MS,
        plyMs: HOMEPAGE_CORPUS_PLY_MS,
        samples: games.map((game) => ({
          plyCount: game.plyCount,
          sampleId: game.roomId,
        })),
        tickMs: HOMEPAGE_CORPUS_CLOCK_TICK_MS,
      };
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

  await mountReplay(stage.replayRoot, currentSample, {
    autoplay: forcedSample !== null,
    showControls: false,
    revealOnFinish: false,
    orientationForId: (sampleId) => povByRoomId[sampleId] ?? 'white',
    loopSamples: forcedSample ? sampleIds : undefined,
    wallClockLoop,
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
}

export async function mountWatch(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'watch-route');
  root.append(buildNav(), buildLoadingState('Loading replays'), buildFooter());

  let currentFeed = await fetchWatchFeed().catch((err) => {
    console.warn(err);
    return null;
  });
  const watch = buildWatchSection(currentFeed);
  root.replaceChildren(buildNav(), watch.el, buildFooter());
  document.title = 'Mistboard TV · Mistboard';

  let activeRoomId: string | null = null;
  let replayMounted = false;
  let pollTimer: number | null = null;
  let refreshInFlight = false;

  const renderFeed = async (
    nextFeed: WatchFeed | null,
    previousFeed: WatchFeed | null,
    animateNewRows: boolean,
  ): Promise<void> => {
    const previousRoomIds =
      animateNewRows && previousFeed
        ? new Set(previousFeed.unlocked.map((game) => game.roomId))
        : null;
    renderWatchStatus(watch.statusRoot, nextFeed);

    if (!nextFeed || nextFeed.unlocked.length === 0) {
      if (!replayMounted) renderWatchEmptyState(watch.replayRoot, nextFeed);
      renderWatchQueue(watch.queueRoot, nextFeed, activeRoomId, { previousRoomIds });
      currentFeed = nextFeed;
      return;
    }

    const sampleIds = nextFeed.unlocked.map((game) => game.roomId);
    if (!replayMounted) {
      const params = new URLSearchParams(window.location.search);
      const requested = params.get('game');
      activeRoomId = requested && sampleIds.includes(requested) ? requested : sampleIds[0]!;
      await mountWatchReplay(watch.replayRoot, activeRoomId, nextFeed);
      replayMounted = true;
    }

    renderWatchQueue(watch.queueRoot, nextFeed, activeRoomId, { previousRoomIds });
    currentFeed = nextFeed;
  };

  const clearPollTimer = (): void => {
    if (pollTimer === null) return;
    window.clearTimeout(pollTimer);
    pollTimer = null;
  };

  const pollDelay = (feed: WatchFeed | null): number =>
    feed && feed.sealedCount > 0 ? WATCH_ACTIVE_POLL_MS : WATCH_IDLE_POLL_MS;

  const refreshFeed = async (): Promise<void> => {
    if (refreshInFlight) return;
    refreshInFlight = true;
    try {
      const nextFeed = await fetchWatchFeed();
      const previousFeed = currentFeed;
      await renderFeed(nextFeed, previousFeed, true);
    } catch (err) {
      console.warn(err);
      if (!currentFeed && !replayMounted) {
        await renderFeed(null, null, false);
      }
    } finally {
      refreshInFlight = false;
      clearPollTimer();
      if (!document.hidden) {
        pollTimer = window.setTimeout(() => void refreshFeed(), pollDelay(currentFeed));
      }
    }
  };

  const handleVisibilityChange = (): void => {
    clearPollTimer();
    if (!document.hidden) void refreshFeed();
  };

  await renderFeed(currentFeed, null, false);
  if (!document.hidden) {
    pollTimer = window.setTimeout(() => void refreshFeed(), pollDelay(currentFeed));
  }
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

async function mountWatchReplay(root: HTMLElement, roomId: string, feed: WatchFeed): Promise<void> {
  const metadataByRoomId: Record<string, GameMeta> = {};
  for (const game of feed.unlocked) {
    metadataByRoomId[game.roomId] = gameMetaForGame(game);
  }

  await mountReplay(root, roomId, {
    autoplay: true,
    showControls: true,
    metadataMode: 'header',
    revealOnFinish: true,
    loaderForId: apiEventLoader,
    metadataByRoomId,
  });
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

async function fetchWatchFeed(): Promise<WatchFeed> {
  const params = new URLSearchParams(window.location.search);
  const channel = params.get('channel');
  const url = channel ? `/api/watch?channel=${encodeURIComponent(channel)}` : '/api/watch';
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`failed to load watch feed: ${resp.status}`);
  return (await resp.json()) as WatchFeed;
}

async function fetchPlayableEngines(): Promise<PlayableEngine[]> {
  const resp = await fetch('/api/engines/playable');
  if (!resp.ok) throw new Error(`failed to load playable engines: ${resp.status}`);
  const data = (await resp.json()) as { engines: PlayableEngine[] };
  return data.engines.length > 0 ? data.engines : fallbackPlayableEngines();
}

function fallbackPlayableEngines(): PlayableEngine[] {
  return [
    {
      id: 'builtin-random-legal',
      name: 'Random Legal v1',
      familyName: 'Random Legal',
      kind: 'builtin',
    },
  ];
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

function gameMetaForGame(game: FeaturedGame): GameMeta {
  return {
    whiteName: withRatingDelta(
      displayParticipantName(game, 'white'),
      participantForColor(game, 'white'),
    ),
    blackName: withRatingDelta(
      displayParticipantName(game, 'black'),
      participantForColor(game, 'black'),
    ),
    gameUrl: reviewUrlForGame(game),
    modeLabel: sourceLabel(game.mode),
    result: game.result,
    timeControl: game.timeControl,
    termination: game.termination,
    plyCount: game.plyCount,
  };
}

// Append the post-game rating change to a player's name on the game page, e.g.
// "alice · 1662 (+162)". Only for rated games (both ratings present); casual
// games and engines have no ratingBefore/After, so the name is returned as-is.
function withRatingDelta(name: string, participant: GameParticipant | null): string {
  if (!participant || participant.ratingBefore == null || participant.ratingAfter == null) {
    return name;
  }
  const delta = participant.ratingAfter - participant.ratingBefore;
  const sign = delta >= 0 ? '+' : '';
  return `${name} · ${participant.ratingAfter} (${sign}${delta})`;
}

function reviewUrlForGame(game: FeaturedGame): string | null {
  if (game.corpusId === 'replay-samples') return null;
  return `/game/${encodeURIComponent(game.roomId)}`;
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

  heroHeader.append(tagline, subtagline);

  const replayRoot = document.createElement('div');
  replayRoot.id = 'landing-replay';

  boardColumn.append(replayRoot);

  const announcements = buildLandingAnnouncements();
  const playPanel = buildLandingPlayPanel(engines, { showLobbyRequests: true });

  section.append(heroHeader, announcements, boardColumn, playPanel);
  stage.append(section);
  return { el: stage, replayRoot };
}

function buildLandingPlayPanel(
  engines: PlayableEngine[],
  options: { showLobbyRequests?: boolean } = {},
): HTMLElement {
  const panel = document.createElement('aside');
  panel.className = 'landing-play-panel';
  panel.setAttribute('aria-label', 'Start playing');

  const availableEngines = engines.length > 0 ? engines : fallbackPlayableEngines();
  const defaultEngineId = availableEngines[0]?.id;
  const lobbyButton = landingPlayAction('Find opponent', 'lobby');
  const challengeButton = landingPlayAction('Challenge a friend', 'friend');
  const engineButton = landingPlayAction('Play the engine', 'computer');

  lobbyButton.addEventListener('click', () => {
    openLandingSetupDialog({
      engineId: defaultEngineId,
      mode: 'lobby',
      title: 'Find opponent',
      ratedDisabled: !isRatedModeEnabled(),
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
      title: 'Play the engine',
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

function landingPlayAction(
  label: string,
  icon: 'computer' | 'friend' | 'lobby',
): HTMLButtonElement {
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
  const data = (await response.json()) as { requests?: OpenLobbyRequest[] };
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

// Deep link: `/?play=lobby` (also `friend` / `computer`) auto-opens the
// matching play-setup modal on landing load, so article CTAs can drop a
// visitor straight into "Find opponent". Consumed params are cleared from the
// URL so a refresh doesn't reopen the modal or trigger the dev live shortcut.
function maybeOpenPlayDeepLink(engines: PlayableEngine[]): void {
  const params = new URLSearchParams(window.location.search);
  const play = params.get('play');
  if (!play) return;

  const availableEngines = engines.length > 0 ? engines : fallbackPlayableEngines();
  const defaultEngineId = availableEngines[0]?.id;

  switch (play) {
    case 'lobby':
      openLandingSetupDialog({
        engineId: defaultEngineId,
        mode: 'lobby',
        title: 'Find opponent',
        ratedDisabled: !isRatedModeEnabled(),
      });
      break;
    case 'friend':
      openLandingSetupDialog({
        mode: 'pvp',
        title: 'Challenge a friend',
        ratedDisabled: true,
      });
      break;
    case 'computer':
      openLandingSetupDialog({
        engineId: defaultEngineId,
        engines: availableEngines,
        mode: 'pve',
        title: 'Play the engine',
      });
      break;
    default:
      return;
  }

  params.delete('play');
  params.delete('variant');
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', url);
}

function openLandingSetupDialog(choice: LandingPlayChoice): void {
  const existing = document.querySelector('.landing-setup-overlay');
  existing?.remove();

  let startFormat: LandingStartFormat = 'standard';
  let rated = !(choice.mode === 'pve' || choice.ratedDisabled);
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

  const engineSection =
    choice.mode === 'pve'
      ? buildEngineSetupSection(
          choice.engines ?? fallbackPlayableEngines(),
          selectedEngineId,
          (engineId) => {
            selectedEngineId = engineId;
          },
        )
      : null;

  const draft960Enabled = isVariantEnabled('fog_draft960');
  const draft960Selectable = draft960Enabled && choice.mode !== 'lobby';
  const standardButton = startOptionButton('Standard', true);
  const draftButton = startOptionButton(
    draft960Selectable ? 'Draft960' : 'Draft960 (coming soon)',
    false,
  );
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
    const button = startOptionButton(
      enabled ? preset.label : `${preset.label} (coming soon)`,
      preset.id === selectedPreset,
    );
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
  startButton.textContent =
    choice.mode === 'lobby'
      ? 'Find opponent'
      : choice.mode === 'pvp'
        ? 'Create room'
        : 'Start game';
  startButton.addEventListener('click', () => {
    const setup = selectedRoomSetup(startFormat, rated, selectedPreset, preferredColor);
    if (choice.mode === 'lobby') {
      cancelLobbyWait?.();
      cancelLobbyWait = joinLobbyFromPlay(startButton, setup, status, selectedEngineId);
      return;
    }
    void createRoomFromPlay(startButton, choice.mode, selectedEngineId, setup, status);
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

  const ratingSection =
    choice.mode === 'pvp' || choice.mode === 'lobby'
      ? buildRatedToggleSection(
          () => rated,
          (v) => {
            rated = v;
          },
          choice.ratedDisabled,
        )
      : null;

  // Color picker shows for PvE and Challenge-a-friend. Hidden for casual/rated
  // lobby matchmaking — color is server-assigned there so the pool stays unified.
  const colorSection =
    choice.mode === 'pve' || choice.mode === 'pvp'
      ? buildColorPreferenceSection(
          () => preferredColor,
          (value) => {
            preferredColor = value;
            storeColorPreference(value);
          },
        )
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
  select.value =
    selectedEngineId && availableEngines.some((engine) => engine.id === selectedEngineId)
      ? selectedEngineId
      : (fallbackEngineId ?? '');
  if (select.value) onSelect(select.value);
  select.addEventListener('change', () => onSelect(select.value));

  section.append(select);
  return section;
}

function buildRatedToggleSection(
  get: () => boolean,
  set: (v: boolean) => void,
  ratedDisabled = false,
): HTMLElement {
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
    ratedButton.addEventListener('click', () => {
      set(true);
      sync();
    });
  }
  casualButton.addEventListener('click', () => {
    set(false);
    sync();
  });
  sync();
  group.append(ratedButton, casualButton);

  const helper = document.createElement('p');
  helper.className = 'landing-rated-helper';
  helper.append(
    ratedDisabled
      ? 'Rated beta is not launched yet. Casual games are open anytime. '
      : 'Rated games require an account and count toward the dark chess ladder. During beta, ratings may be recalibrated. ',
  );
  const link = document.createElement('a');
  link.href = '/faq';
  link.textContent = 'How rated works';
  helper.append(link);

  section.append(group, helper);
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

  whiteButton.addEventListener('click', () => {
    set('white');
    sync();
  });
  randomButton.addEventListener('click', () => {
    set('random');
    sync();
  });
  blackButton.addEventListener('click', () => {
    set('black');
    sync();
  });

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
    w.textContent = '♚';
    const b = document.createElement('span');
    b.className = 'black';
    b.textContent = '♚';
    glyph.append(w, b);
  } else {
    glyph.textContent = '♚';
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
  const preset =
    LANDING_TIME_PRESETS.find((candidate) => candidate.id === presetId) ?? LANDING_TIME_PRESETS[1];
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
  // Split a trailing parenthetical ("3 + 2 (coming soon)") into a muted hint badge so
  // the live label stays prominent and the not-yet-available note de-emphasizes.
  const hintMatch = label.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (hintMatch) {
    const main = document.createElement('span');
    main.className = 'landing-start-option-text';
    main.textContent = hintMatch[1];
    const hint = document.createElement('span');
    hint.className = 'landing-start-option-hint';
    hint.textContent = hintMatch[2];
    button.append(main, hint);
  } else {
    button.textContent = label;
  }
  return button;
}

function buildWatchSection(feed: WatchFeed | null): {
  el: HTMLElement;
  replayRoot: HTMLElement;
  queueRoot: HTMLElement;
  statusRoot: HTMLElement;
} {
  const section = document.createElement('main');
  section.className = 'watch-shell';

  const header = document.createElement('header');
  header.className = 'watch-header';

  const copy = document.createElement('div');
  copy.className = 'watch-header-copy';
  const eyebrow = document.createElement('span');
  eyebrow.className = 'watch-eyebrow';
  eyebrow.textContent = 'Mistboard TV';
  const title = document.createElement('h1');
  title.textContent = feed ? `${activeWatchChannelLabel(feed)} replays` : 'Recent replays';
  const description = document.createElement('p');
  description.textContent =
    'Games stay sealed while they are being played. Finished games unlock here, with older replays filling quiet windows.';
  copy.append(eyebrow, title, description);
  const channelList = buildWatchChannelList(feed);
  if (channelList) copy.append(channelList);

  const status = document.createElement('div');
  status.className = 'watch-status';
  renderWatchStatus(status, feed);

  header.append(copy, status);

  const replayRoot = document.createElement('div');
  replayRoot.className = 'watch-replay';

  const queueRoot = document.createElement('aside');
  queueRoot.className = 'watch-queue';

  const stage = document.createElement('div');
  stage.className = 'watch-stage';
  stage.append(replayRoot, queueRoot);

  section.append(header, stage);
  return { el: section, replayRoot, queueRoot, statusRoot: status };
}

function renderWatchStatus(root: HTMLElement, feed: WatchFeed | null): void {
  root.replaceChildren();

  const sealed = document.createElement('strong');
  sealed.textContent = feed ? String(feed.sealedCount) : 'n/a';
  const sealedLabel = document.createElement('span');
  sealedLabel.className = 'watch-status-label';
  sealedLabel.textContent = 'sealed in progress';
  const hint = document.createElement('span');
  hint.className = 'watch-status-hint';
  hint.textContent = feed ? 'unlock after completion' : 'feed unavailable';
  root.append(sealed, sealedLabel, hint);
}

function activeWatchChannelLabel(feed: WatchFeed): string {
  return feed.channels.find((channel) => channel.id === feed.activeChannel)?.label ?? 'Recent';
}

function buildWatchChannelList(feed: WatchFeed | null): HTMLElement | null {
  if (!feed || feed.channels.length <= 1) return null;

  const list = document.createElement('nav');
  list.className = 'watch-channel-list';
  list.setAttribute('aria-label', 'Watch channels');

  for (const channel of feed.channels) {
    const link = document.createElement('a');
    link.href = `/watch?channel=${encodeURIComponent(channel.id)}`;
    link.textContent = channel.label;
    if (channel.id === feed.activeChannel) link.classList.add('active');
    list.append(link);
  }

  return list;
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

function renderWatchEmptyState(root: HTMLElement, feed: WatchFeed | null): void {
  root.replaceChildren();

  const empty = document.createElement('section');
  empty.className = 'watch-empty';
  const title = document.createElement('h2');
  title.textContent = feed ? 'No unlocked replays yet' : 'Replay feed unavailable';
  const body = document.createElement('p');
  body.textContent = feed
    ? feed.sealedCount > 0
      ? 'Games are being played, but they stay hidden until completion.'
      : 'Start a game and it can become the next replay after it finishes.'
    : 'The watch feed needs persistence, so it is not available in this runtime.';

  const actions = document.createElement('div');
  actions.className = 'watch-empty-actions';
  const engine = document.createElement('a');
  engine.href = '/?play=computer';
  engine.textContent = 'Play engine';
  const friend = document.createElement('a');
  friend.href = '/?play=friend';
  friend.textContent = 'Start friend game';
  actions.append(engine, friend);

  empty.append(title, body, actions);
  root.append(empty);
}

function renderWatchQueue(
  root: HTMLElement,
  feed: WatchFeed | null,
  activeRoomId: string | null,
  options: { previousRoomIds?: ReadonlySet<string> | null } = {},
): void {
  root.replaceChildren();
  const previousRoomIds = options.previousRoomIds ?? null;

  const heading = document.createElement('div');
  heading.className = 'watch-queue-heading';
  const headingCopy = document.createElement('div');
  headingCopy.className = 'watch-queue-heading-copy';
  const title = document.createElement('h2');
  title.textContent = 'Unlocked replays';
  const unlockedCount = document.createElement('span');
  unlockedCount.className = 'watch-queue-count';
  unlockedCount.textContent = feed ? `${feed.unlocked.length} shown` : 'offline';
  headingCopy.append(title, unlockedCount);
  const windowLabel = document.createElement('span');
  windowLabel.className = 'watch-queue-scope';
  windowLabel.textContent = feed ? formatWatchScope(feed) : 'feed unavailable';
  heading.append(headingCopy, windowLabel);
  root.append(heading);

  if (!feed) {
    const empty = document.createElement('p');
    empty.className = 'watch-queue-empty';
    empty.textContent = 'Feed unavailable.';
    root.append(empty);
    return;
  }

  if (feed.unlocked.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'watch-queue-empty';
    empty.textContent = 'No completed games in the current replay window.';
    root.append(empty);
    return;
  }

  const list = document.createElement('ol');
  list.className = 'watch-queue-list';

  for (const game of feed.unlocked) {
    const item = document.createElement('li');
    item.className = 'watch-queue-item';
    if (previousRoomIds && !previousRoomIds.has(game.roomId)) item.classList.add('is-new');

    const row = document.createElement('a');
    row.className = 'watch-queue-row';
    row.href = watchQueueGameHref(feed, game.roomId);
    if (game.roomId === activeRoomId) {
      item.classList.add('active');
      row.classList.add('active');
    }

    const matchup = document.createElement('span');
    matchup.className = 'watch-queue-matchup';
    matchup.textContent = `${displayParticipantName(game, 'white')} vs ${displayParticipantName(game, 'black')}`;

    const meta = document.createElement('span');
    meta.className = 'watch-queue-meta';
    const result = document.createElement('span');
    result.className = 'watch-queue-result';
    result.textContent = resultLabel(game.result);
    const detail = document.createElement('span');
    detail.className = 'watch-queue-detail';
    const detailParts = [
      sourceLabel(game.mode),
      `${game.plyCount} plies`,
      formatEndedAge(game.endedAt, feed.now),
    ]
      .filter(Boolean)
      .map(String);
    for (const part of detailParts) {
      const detailPart = document.createElement('span');
      detailPart.textContent = part;
      detail.append(detailPart);
    }
    meta.append(result, detail);

    row.append(matchup, meta);
    const reviewUrl = reviewUrlForGame(game);
    if (reviewUrl) {
      const review = document.createElement('a');
      review.className = 'watch-queue-review';
      review.href = reviewUrl;
      review.textContent = 'Review';
      item.append(row, review);
    } else {
      item.append(row);
    }
    list.append(item);
  }

  root.append(list);
}

function watchQueueGameHref(feed: WatchFeed, roomId: string): string {
  const params = new URLSearchParams();
  params.set('game', roomId);
  params.set('channel', feed.activeChannel);
  return `/watch?${params.toString()}`;
}

function formatWatchScope(feed: WatchFeed): string {
  return `latest replays · up to ${feed.unlockLimit}`;
}

function formatEndedAge(endedAt: string | undefined, nowIso: string): string | null {
  if (!endedAt) return null;
  const endedMs = Date.parse(endedAt);
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(endedMs) || !Number.isFinite(nowMs)) return null;
  const ageSeconds = Math.max(0, Math.floor((nowMs - endedMs) / 1000));
  if (ageSeconds < 60) return 'just finished';
  const minutes = Math.floor(ageSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
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
    game.result === 'white-wins'
      ? `${white} beats ${black}`
      : game.result === 'black-wins'
        ? `${black} beats ${white}`
        : `${white} vs ${black} · Draw`;
  return `${result} · Mistboard`;
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
  status?: HTMLElement,
): Promise<void> {
  const label = button.querySelector<HTMLElement>('.landing-play-action-label');
  const originalText = label?.textContent ?? button.textContent ?? '';
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  setButtonLabel(button, 'Creating');
  if (status) {
    status.hidden = false;
    status.textContent = mode === 'pve' ? 'Checking engine seats.' : '';
  }
  try {
    while (true) {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode,
          variant: 'dark-chess',
          hiddenDraft960: setup.startFormat === 'draft960',
          timeControl: setup.timeControl,
          rated: setup.rated,
          preferredColor: setup.preferredColor,
          ...(mode === 'pve' && engineId ? { engineId } : {}),
        }),
      });
      if (status && !status.isConnected) return;
      if (response.ok) {
        const data = (await response.json()) as { url?: string };
        if (!data.url) throw new Error('room creation did not return a URL');
        if (status && !status.isConnected) return;
        window.location.href = data.url;
        return;
      }
      const failure = await readRoomCreationFailure(response);
      if (mode === 'pve' && failure.error === 'engine_busy' && status?.isConnected) {
        status.textContent = 'All engine seats are active. Waiting for the next seat.';
        setButtonLabel(button, 'Waiting for seat');
        await sleep(ENGINE_SEAT_RETRY_MS);
        if (status.isConnected) continue;
        return;
      }
      throw roomCreationError(response.status, failure);
    }
  } catch (err) {
    console.warn(err);
    if (status?.isConnected) {
      status.textContent = roomCreationStatusText(err, mode);
    }
    setButtonLabel(button, 'Try again');
    button.disabled = false;
    button.removeAttribute('aria-busy');
    window.setTimeout(() => {
      if (button.disabled) return;
      setButtonLabel(button, originalText);
    }, 1800);
  }
}

async function readRoomCreationFailure(response: Response): Promise<RoomCreationFailure> {
  try {
    return (await response.json()) as RoomCreationFailure;
  } catch {
    return {};
  }
}

function roomCreationError(status: number, failure: RoomCreationFailure): Error {
  const err = new Error(`room creation failed: ${status}`);
  err.name = failure.error ?? 'room_creation_failed';
  return err;
}

function roomCreationStatusText(err: unknown, mode: 'pvp' | 'pve'): string {
  if (mode === 'pve' && err instanceof Error && err.name === 'engine_unavailable') {
    return 'The engine service is unavailable. Try again soon.';
  }
  if (mode === 'pve') return 'Could not start an engine game. Try again.';
  return 'Could not create the room. Try again.';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function joinLobbyFromPlay(
  button: HTMLButtonElement,
  setup: LandingRoomSetup,
  status: HTMLElement,
  engineId?: string,
): () => void {
  const controller = new AbortController();
  const originalText = button.textContent ?? '';
  const queueJoinedAt = Date.now();
  const bucketProps = {
    variant: setup.startFormat,
    ...gameSpecAnalyticsProps({
      variant: 'dark-chess',
      hiddenDraft960: setup.startFormat === 'draft960',
    }),
    initialMs: setup.timeControl.initialMs,
    incrementMs: setup.timeControl.incrementMs,
    time_class: classifyTimeControl(setup.timeControl.initialMs, setup.timeControl.incrementMs),
    rated: setup.rated,
  };
  let active = true;
  let ticketId: string | null = null;
  let pollTimer: number | null = null;
  let offerTimer: number | null = null;
  let offerEl: HTMLElement | null = null;

  const clearOfferTimer = () => {
    if (offerTimer !== null) {
      window.clearTimeout(offerTimer);
      offerTimer = null;
    }
  };

  const removeOffer = () => {
    offerEl?.remove();
    offerEl = null;
    status.hidden = false;
  };

  const cancel = () => {
    active = false;
    controller.abort();
    if (pollTimer !== null) window.clearTimeout(pollTimer);
    clearOfferTimer();
    if (ticketId) {
      void fetch(`/api/lobby/${encodeURIComponent(ticketId)}`, { method: 'DELETE' }).catch(
        () => {},
      );
    }
  };

  const acceptEngineOffer = (playButton: HTMLButtonElement) => {
    if (!engineId) return;
    track('lobby_engine_offer_accepted', { ...bucketProps, waitMs: Date.now() - queueJoinedAt });
    cancel();
    void createRoomFromPlay(playButton, 'pve', engineId, setup, status);
  };

  const dismissEngineOffer = () => {
    track('lobby_engine_offer_dismissed', { ...bucketProps, waitMs: Date.now() - queueJoinedAt });
    removeOffer();
    scheduleEngineOffer();
  };

  const showEngineOffer = () => {
    if (!engineId || offerEl !== null || !status.isConnected) return;
    status.hidden = true;
    track('lobby_engine_offer_shown', { ...bucketProps, waitMs: Date.now() - queueJoinedAt });

    const block = document.createElement('div');
    block.className = 'landing-engine-offer';

    const prompt = document.createElement('p');
    prompt.className = 'landing-engine-offer-prompt';
    prompt.textContent = 'No opponents right now. Play the engine instead?';

    const actions = document.createElement('div');
    actions.className = 'landing-engine-offer-actions';

    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'landing-setup-start';
    play.textContent = 'Play the engine';
    play.addEventListener('click', () => acceptEngineOffer(play));

    const keep = document.createElement('button');
    keep.type = 'button';
    keep.className = 'landing-setup-back';
    keep.textContent = 'Keep waiting';
    keep.addEventListener('click', dismissEngineOffer);

    actions.append(play, keep);
    block.append(prompt, actions);
    status.insertAdjacentElement('afterend', block);
    offerEl = block;
  };

  const scheduleEngineOffer = () => {
    if (!engineId) return;
    clearOfferTimer();
    offerTimer = window.setTimeout(() => {
      offerTimer = null;
      if (
        shouldOfferEngine({
          elapsedMs: Date.now() - queueJoinedAt,
          thresholdMs: ENGINE_OFFER_AFTER_MS,
          stillWaiting: active && offerEl === null,
          hasEngine: Boolean(engineId),
        })
      ) {
        showEngineOffer();
      }
    }, ENGINE_OFFER_AFTER_MS);
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
    clearOfferTimer();
    removeOffer();
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
    const response = await fetch(`/api/lobby/${encodeURIComponent(ticketId)}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`lobby poll failed: ${response.status}`);
    const ticket = (await response.json()) as LobbyTicketResponse;
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
    const ticket = (await response.json()) as LobbyTicketResponse;
    track('lobby_queue_joined', bucketProps);
    if (!active || redirectIfMatched(ticket)) return;
    if (!ticket.ticketId) throw new Error('lobby did not return a ticket');
    ticketId = ticket.ticketId;
    pollTimer = window.setTimeout(() => {
      void poll().catch(handleLobbyError);
    }, ticket.pollAfterMs ?? 1_000);
    scheduleEngineOffer();
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
