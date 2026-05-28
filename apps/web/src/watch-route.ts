import type { GameEvent } from '@mistboard/game';
import './watch-route.css';
import { displayParticipantName, type FeaturedGame, sourceLabel } from './game-display.js';
import { gameMetaForGame, reviewUrlForGame } from './game-meta.js';
import { type GameMeta, mountReplay } from './replay.js';
import { buildFooter, buildLoadingState, buildNav } from './site-shell.js';

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

const WATCH_ACTIVE_POLL_MS = 15_000;
const WATCH_IDLE_POLL_MS = 60_000;

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
    captureLayout: 'split',
    showControls: true,
    metadataMode: 'header',
    revealOnFinish: false,
    loaderForId: apiEventLoader,
    metadataByRoomId,
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

async function apiEventLoader(roomId: string): Promise<GameEvent[]> {
  const resp = await fetch(`/api/games/${encodeURIComponent(roomId)}/events`);
  if (!resp.ok) throw new Error(`failed to load events for ${roomId}: ${resp.status}`);
  const data = (await resp.json()) as { events: GameEvent[] };
  return data.events;
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
    const matchupLabel = `${displayParticipantName(game, 'white')} vs ${displayParticipantName(game, 'black')}`;
    matchup.textContent = matchupLabel;
    matchup.title = matchupLabel;

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
