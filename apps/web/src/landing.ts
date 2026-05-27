import type { GameEvent } from '@mistboard/game';
import './landing.css';
import { isLikelySignedIn, loadCachedCurrentUser, readCachedUser } from './account-nav.js';
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

const HOMEPAGE_CORPUS_PLY_MS = 900;
const HOMEPAGE_CORPUS_HOLD_MS = 8000;
const HOMEPAGE_CORPUS_CLOCK_TICK_MS = 16;
const WATCH_ACTIVE_POLL_MS = 15_000;
const WATCH_IDLE_POLL_MS = 60_000;

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
    revealOnFinish: false,
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
