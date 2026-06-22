import type { GameEvent } from '@mistboard/game';
import { banqiResultLabel } from './banqi-result-label.js';
import { renderVariantMiniBoard, type VariantMiniId } from './variant-mini-boards.js';
import { webVariantTenantForSpecId } from './variant-tenant/registry.js';
import './watch-route.css';
import { displayParticipantName, type FeaturedGame, sourceLabel } from './game-display.js';
import { gameMetaForGame, reviewUrlForGame } from './game-meta.js';
import type { GameMeta, ReplayHandle } from './replay.js';
import { buildLoadingState, buildNav } from './site-shell.js';

// replay.js statically pulls in chessground (~64KB). Importing it dynamically
// keeps it out of watch-route's module-init path, so mountWatch can fire
// /api/watch before that bundle parses. loadReplayModule() is kicked off at the
// top of mountWatch to prefetch the chunk in parallel with the feed fetch, so
// the dynamic import costs no extra round trip by the time the board mounts.
let replayModulePromise: Promise<typeof import('./replay.js')> | null = null;
function loadReplayModule(): Promise<typeof import('./replay.js')> {
  replayModulePromise ??= import('./replay.js');
  return replayModulePromise;
}

type WatchChannelSummary = {
  family: string;
  gameSpecIds: string[];
  id: string;
  label: string;
  sealedCount: number;
  unlockedCount: number;
};
type WatchInitialReplay = {
  events: GameEvent[];
  roomId: string;
};
type WatchFeed = {
  activeChannel: string;
  channels: WatchChannelSummary[];
  now: string;
  sealedActivityWindowMs?: number;
  unlockLimit: number;
  sealedCount: number;
  unlocked: FeaturedGame[];
  initialReplay?: WatchInitialReplay;
};

// Which replay renderer a channel needs, keyed by the channel's primary
// gameSpecId (the registry's unambiguous tenant key), or 'chess' (the
// chessground fallback for the unregistered dark-chess stack). It must NOT key
// on the coarse watch.family: jieqi and Dark Mini Xiangqi both render in the
// 'xiangqi' family, so a family key would resolve both channels to the same
// tenant. A channel switch across renderers must re-mount, not loadGame.
type WatchRendererKind = string;

const WATCH_ACTIVE_POLL_MS = 15_000;
const WATCH_IDLE_POLL_MS = 60_000;

export async function mountWatch(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'watch-route');
  root.append(buildNav(), buildLoadingState('Loading replays'));

  // Start downloading the replay/chessground chunk now, in parallel with the
  // feed fetch below, rather than serializing it behind /api/watch.
  void loadReplayModule();

  let currentFeed = await fetchWatchFeed().catch((err) => {
    console.warn(err);
    return null;
  });
  const watch = buildWatchSection(currentFeed);
  root.replaceChildren(buildNav(), watch.el);
  document.title = 'Mistboard TV · Mistboard';

  let activeRoomId: string | null = null;
  let replayHandle: ReplayHandle | null = null;
  // Which renderer the live handle is: chess (chessground) vs xiangqi (native
  // SVG). A channel switch across families must re-mount, not loadGame.
  let replayHandleKind: WatchRendererKind | null = null;
  let pollTimer: number | null = null;
  let refreshInFlight = false;
  const selectedRoomByChannel = new Map<string, string>();
  const metadataByRoomId: Record<string, GameMeta> = {};
  const abortController = new AbortController();

  const watchRendererKind = (feed: WatchFeed): WatchRendererKind => {
    const channel = feed.channels.find((entry) => entry.id === feed.activeChannel);
    const specId = channel?.gameSpecIds[0] ?? null;
    const tenant = webVariantTenantForSpecId(specId);
    // Key on the channel's primary spec id (unambiguous per tenant) so two
    // channels in the same render family resolve to distinct renderers; only a
    // tenant that owns a watch renderer counts, else fall back to chessground.
    return tenant?.watch && specId ? specId : 'chess';
  };

  // Mount the right-kind replay handle, re-mounting when the family changes
  // (chess chessground vs xiangqi SVG can't loadGame across each other); else
  // reuse the handle and just load the next game.
  const ensureReplay = async (
    feed: WatchFeed,
    roomId: string,
    seed?: WatchInitialReplay,
  ): Promise<void> => {
    const kind = watchRendererKind(feed);
    if (!replayHandle || replayHandleKind !== kind) {
      // Family change (e.g. switching the channel to Crossroads): the live
      // renderer can't load the new game, so it's torn down and a different
      // chunk + postgame are fetched — two round trips. Paint a skeleton in the
      // board slot up front so the area gives feedback instead of going blank
      // while the swap lands. Null the handle before the await so a failed
      // mount surfaces the empty state rather than a stale, destroyed handle.
      replayHandle?.destroy();
      replayHandle = null;
      replayHandleKind = null;
      renderWatchReplaySkeleton(watch.replayRoot);
      replayHandle = await mountWatchReplay(watch.replayRoot, roomId, metadataByRoomId, seed, kind);
      replayHandleKind = kind;
      return;
    }
    if (replayHandle.activeSampleId() !== roomId) {
      await replayHandle.loadGame(roomId);
    }
  };

  const renderFeed = async (
    nextFeed: WatchFeed | null,
    previousFeed: WatchFeed | null,
    animateNewRows: boolean,
    options: { urlMode?: 'push' | 'replace' | false } = {},
  ): Promise<void> => {
    const previousRoomIds =
      animateNewRows && previousFeed
        ? new Set(previousFeed.unlocked.map((game) => game.roomId))
        : null;
    mergeWatchMetadata(metadataByRoomId, nextFeed);
    renderWatchChannelList(watch.channelRoot, nextFeed);
    renderWatchStatus(watch.statusRoot, nextFeed);

    if (!nextFeed || nextFeed.unlocked.length === 0) {
      replayHandle?.destroy();
      replayHandle = null;
      replayHandleKind = null;
      activeRoomId = null;
      renderWatchEmptyState(watch.replayRoot, nextFeed);
      renderWatchQueue(watch.queueRoot, nextFeed, activeRoomId, { previousRoomIds });
      currentFeed = nextFeed;
      if (options.urlMode && nextFeed) {
        syncWatchUrl(options.urlMode, nextFeed.activeChannel, activeRoomId);
      }
      return;
    }

    const nextRoomId = resolveWatchRoomId(nextFeed, activeRoomId, selectedRoomByChannel);
    const priorRoomId = activeRoomId;
    activeRoomId = nextRoomId;
    selectedRoomByChannel.set(nextFeed.activeChannel, nextRoomId);
    renderWatchQueue(watch.queueRoot, nextFeed, activeRoomId, { previousRoomIds });

    try {
      await ensureReplay(nextFeed, nextRoomId, nextFeed.initialReplay);
    } catch (err) {
      console.warn(err);
      activeRoomId = priorRoomId;
      if (!replayHandle) renderWatchEmptyState(watch.replayRoot, null);
      renderWatchQueue(watch.queueRoot, nextFeed, activeRoomId, { previousRoomIds: null });
      return;
    }

    currentFeed = nextFeed;
    if (options.urlMode) {
      syncWatchUrl(options.urlMode, nextFeed.activeChannel, activeRoomId);
    }
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
      if (!currentFeed && !replayHandle) {
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

  const handleNavigationClick = (event: MouseEvent): void => {
    const target = event.target as Element | null;
    const link = target?.closest<HTMLAnchorElement>('a.watch-queue-row, a.watch-channel-link');
    if (!link) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== '/watch') return;

    event.preventDefault();
    const channel = url.searchParams.get('channel');
    const roomId = url.searchParams.get('game');
    if (link.classList.contains('watch-channel-link')) {
      void switchWatchChannel(channel, 'push');
      return;
    }
    if (roomId) void switchWatchGame(roomId, 'push');
  };

  const switchWatchChannel = async (
    channelId: string | null,
    urlMode: 'push' | 'replace',
  ): Promise<void> => {
    try {
      const nextFeed = await fetchWatchFeed(channelId);
      await renderFeed(nextFeed, currentFeed, true, { urlMode });
    } catch (err) {
      console.warn(err);
    }
  };

  const switchWatchGame = async (roomId: string, urlMode: 'push' | 'replace'): Promise<void> => {
    if (!currentFeed?.unlocked.some((game) => game.roomId === roomId)) return;
    if (roomId === activeRoomId) {
      syncWatchUrl(urlMode, currentFeed.activeChannel, activeRoomId);
      return;
    }
    const previousRoomId = activeRoomId;
    activeRoomId = roomId;
    selectedRoomByChannel.set(currentFeed.activeChannel, roomId);
    updateWatchQueueActive(watch.queueRoot, activeRoomId);
    try {
      await ensureReplay(currentFeed, roomId, currentFeed.initialReplay);
      syncWatchUrl(urlMode, currentFeed.activeChannel, activeRoomId);
    } catch (err) {
      console.warn(err);
      activeRoomId = previousRoomId;
      updateWatchQueueActive(watch.queueRoot, activeRoomId);
    }
  };

  const handlePopState = (): void => {
    const channel = watchChannelFromLocation();
    const currentChannel = currentFeed?.activeChannel ?? null;
    if (channel !== currentChannel) {
      void switchWatchChannel(channel, 'replace');
      return;
    }
    const roomId = watchRoomFromLocation();
    if (roomId) void switchWatchGame(roomId, 'replace');
  };

  document.addEventListener('visibilitychange', handleVisibilityChange, {
    signal: abortController.signal,
  });
  window.addEventListener('popstate', handlePopState, { signal: abortController.signal });
  watch.el.addEventListener('click', handleNavigationClick, { signal: abortController.signal });
  await renderFeed(currentFeed, null, false, { urlMode: 'replace' });
  if (!document.hidden) {
    pollTimer = window.setTimeout(() => void refreshFeed(), pollDelay(currentFeed));
  }
}

async function mountWatchReplay(
  root: HTMLElement,
  roomId: string,
  metadataByRoomId: Record<string, GameMeta>,
  seed?: WatchInitialReplay,
  kind: WatchRendererKind = 'chess',
): Promise<ReplayHandle> {
  // Tenant renderers load through the registry's dynamic-import closures, so
  // they stay out of the chess path's bundle. `kind` is the channel's spec id
  // (chess uses the chessground fallback below), so the tenant resolves
  // unambiguously even when two channels share a render family.
  const tenant = kind === 'chess' ? null : webVariantTenantForSpecId(kind);
  if (tenant?.watch) {
    return await tenant.watch.mountReplay(root, roomId, {
      autoplay: true,
      metadataByRoomId,
    });
  }
  const { mountReplay } = await loadReplayModule();
  return await mountReplay(root, roomId, {
    autoplay: true,
    captureLayout: 'split',
    showControls: true,
    metadataMode: 'header',
    revealOnFinish: false,
    loaderForId: makeWatchEventLoader(seed),
    metadataByRoomId,
  });
}

// The initial replay's events ride along in the /api/watch response, so the
// first board paints pieces without a second round trip. The seed is consumed
// once: a later reload of the same game (after polling or queue navigation)
// refetches fresh events, and every other game uses the per-game loader.
function makeWatchEventLoader(seed?: WatchInitialReplay): (roomId: string) => Promise<GameEvent[]> {
  let pending = seed;
  return async (roomId: string) => {
    if (pending && pending.roomId === roomId) {
      const events = pending.events;
      pending = undefined;
      return events;
    }
    return apiEventLoader(roomId);
  };
}

async function fetchWatchFeed(channelOverride?: string | null): Promise<WatchFeed> {
  const channel = channelOverride ?? watchChannelFromLocation();
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

function mergeWatchMetadata(
  target: Record<string, GameMeta>,
  feed: WatchFeed | null | undefined,
): void {
  if (!feed) return;
  for (const game of feed.unlocked) {
    target[game.roomId] = gameMetaForGame(game);
  }
}

function resolveWatchRoomId(
  feed: WatchFeed,
  activeRoomId: string | null,
  selectedRoomByChannel: ReadonlyMap<string, string>,
): string {
  const roomIds = new Set(feed.unlocked.map((game) => game.roomId));
  const candidates = [
    selectedRoomByChannel.get(feed.activeChannel),
    activeRoomId,
    watchRoomFromLocation(),
    feed.unlocked[0]?.roomId,
  ];
  for (const candidate of candidates) {
    if (candidate && roomIds.has(candidate)) return candidate;
  }
  return feed.unlocked[0]!.roomId;
}

function watchChannelFromLocation(): string | null {
  return new URLSearchParams(window.location.search).get('channel');
}

function watchRoomFromLocation(): string | null {
  return new URLSearchParams(window.location.search).get('game');
}

function syncWatchUrl(mode: 'push' | 'replace', channelId: string, roomId: string | null): void {
  const params = new URLSearchParams();
  params.set('channel', channelId);
  if (roomId) params.set('game', roomId);
  const nextUrl = `/watch?${params.toString()}`;
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (nextUrl === currentUrl) return;
  const method = mode === 'push' ? 'pushState' : 'replaceState';
  window.history[method](null, '', nextUrl);
}

function buildWatchSection(feed: WatchFeed | null): {
  el: HTMLElement;
  channelRoot: HTMLElement;
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
  const title = document.createElement('h1');
  title.textContent = 'Mistboard TV';
  copy.append(title);

  const status = document.createElement('div');
  status.className = 'watch-status';
  renderWatchStatus(status, feed);

  header.append(copy, status);

  const channelRail = document.createElement('aside');
  channelRail.className = 'watch-channel-rail';
  const channelHeading = document.createElement('h2');
  channelHeading.textContent = 'Variants';
  const channelRoot = document.createElement('nav');
  channelRoot.className = 'watch-channel-list';
  channelRoot.setAttribute('aria-label', 'Watch channels');
  channelRail.append(channelHeading, channelRoot);

  const replayRoot = document.createElement('div');
  replayRoot.className = 'watch-replay';

  const queueRoot = document.createElement('aside');
  queueRoot.className = 'watch-queue';

  const stage = document.createElement('div');
  stage.className = 'watch-stage';
  stage.append(channelRail, replayRoot, queueRoot);
  renderWatchChannelList(channelRoot, feed);

  section.append(header, stage);
  return { el: section, channelRoot, replayRoot, queueRoot, statusRoot: status };
}

function renderWatchStatus(root: HTMLElement, feed: WatchFeed | null): void {
  root.replaceChildren();

  const sealed = document.createElement('strong');
  sealed.textContent = feed ? String(feed.sealedCount) : 'n/a';
  const sealedLabel = document.createElement('span');
  sealedLabel.className = 'watch-status-label';
  // Every variant seals until the game finishes — the watch feed only ever
  // serves completed games (listWatchUnlockedGames) and each tenant's postgame
  // route 404s a running game. So the status is uniform across channels; the
  // old "games in progress / available while live" branch claimed a live feed
  // that never existed and read as a hidden-info leak for jieqi/banqi.
  sealedLabel.textContent = 'games sealed';
  const hint = document.createElement('span');
  hint.className = 'watch-status-hint';
  hint.textContent = feed ? 'unlock after completion' : 'feed unavailable';
  root.append(sealed, sealedLabel, hint);
}

// The shared mini-board marker for each watch channel, so the TV rail reads in
// the same icon language as the picker, rules rail, leaderboard, and profile.
// Channel ids match VariantMiniId ids except crossroads-chess -> crossroads;
// the dark-chess channel (which also carries dark-draft960 games) shows the
// dark-chess marker. An unmapped channel keeps its (empty) marker slot so the
// rows stay grid-aligned.
const CHANNEL_MINI_BY_ID: Record<string, VariantMiniId> = {
  'dark-chess': 'dark-chess',
  'dark-xiangqi': 'dark-xiangqi',
  'mini-xiangqi': 'mini-xiangqi',
  'dark-mini-xiangqi': 'dark-mini-xiangqi',
  'drop-mini-xiangqi': 'drop-mini-xiangqi',
  jieqi: 'jieqi',
  banqi: 'banqi',
  'crossroads-chess': 'crossroads',
  'dark-crossroads-chess': 'dark-crossroads',
  'dark-shogi': 'dark-shogi',
  'dark-crazyhouse': 'dark-crazyhouse',
  kriegspiel: 'kriegspiel',
  'reveal-chess': 'reveal-chess',
};

export function renderWatchChannelList(root: HTMLElement, feed: WatchFeed | null): void {
  root.replaceChildren();
  root.hidden = !feed || feed.channels.length <= 1;
  const rail = root.closest<HTMLElement>('.watch-channel-rail');
  if (rail) rail.hidden = root.hidden;
  const stage = root.closest<HTMLElement>('.watch-stage');
  stage?.classList.toggle('has-channel-rail', !root.hidden);
  if (!feed || feed.channels.length <= 1) return;

  for (const channel of feed.channels) {
    const link = document.createElement('a');
    link.className = 'watch-channel-link';
    link.href = `/watch?channel=${encodeURIComponent(channel.id)}`;
    link.setAttribute('aria-label', `${channel.label} (${channel.unlockedCount})`);
    // Decorative variant marker; aria-hidden because the link's aria-label
    // already names the channel. notranslate keeps Google Translate off the
    // SVG's aria-label text.
    const thumb = document.createElement('span');
    thumb.className = 'watch-channel-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    const miniId = CHANNEL_MINI_BY_ID[channel.id];
    if (miniId) {
      thumb.classList.add('notranslate');
      thumb.setAttribute('translate', 'no');
      thumb.innerHTML = renderVariantMiniBoard(miniId, {
        size: 112,
        label: `${channel.label} board`,
      });
    }
    const label = document.createElement('span');
    label.className = 'watch-channel-name';
    label.textContent = channel.label;
    const count = document.createElement('span');
    count.className = 'watch-channel-count';
    count.textContent = String(channel.unlockedCount);
    // Name + count stacked beside the big marker (mirrors the rules-page
    // variant rail's marker-left / text-right row).
    const text = document.createElement('span');
    text.className = 'watch-channel-text';
    text.append(label, count);
    link.append(thumb, text);
    if (channel.id === feed.activeChannel) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
    root.append(link);
  }
}

// A sized placeholder for the board slot while a renderer swap is in flight
// (channel switch across families, or the first mount). It reserves the board's
// footprint so the swap doesn't shift layout, and every renderer's mount path
// calls root.replaceChildren(), so the skeleton is wiped the moment real
// content is ready. aria-hidden: it's a transient loading affordance, not state.
export function renderWatchReplaySkeleton(root: HTMLElement): void {
  const skeleton = document.createElement('div');
  skeleton.className = 'watch-replay-skeleton';
  skeleton.setAttribute('aria-hidden', 'true');
  const board = document.createElement('div');
  board.className = 'watch-replay-skeleton-board';
  const caption = document.createElement('div');
  caption.className = 'watch-replay-skeleton-caption';
  caption.textContent = 'Loading game';
  skeleton.append(board, caption);
  root.replaceChildren(skeleton);
}

function renderWatchEmptyState(root: HTMLElement, feed: WatchFeed | null): void {
  root.replaceChildren();

  const empty = document.createElement('section');
  empty.className = 'watch-empty';
  const title = document.createElement('h2');
  title.textContent = feed
    ? watchFeedIsDark(feed)
      ? 'No unlocked dark replays yet'
      : 'No replays yet'
    : 'Replay feed unavailable';
  const body = document.createElement('p');
  body.textContent = feed
    ? feed.sealedCount > 0
      ? watchFeedIsDark(feed)
        ? 'Dark games are being played, but they stay hidden until completion.'
        : 'Games are being played now, but they stay hidden until completion.'
      : watchFeedIsDark(feed)
        ? 'Start a dark game and it can become the next replay after it finishes.'
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
  title.textContent = feed && watchFeedIsDark(feed) ? 'Unlocked dark replays' : 'Recent replays';
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
    item.dataset.roomId = game.roomId;
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
    const matchupLabel = watchQueueMatchupLabel(game);
    matchup.textContent = matchupLabel;
    matchup.title = matchupLabel;

    const meta = document.createElement('span');
    meta.className = 'watch-queue-meta';
    const result = document.createElement('span');
    result.className = 'watch-queue-result';
    result.textContent = watchQueueResultLabel(game);
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

function updateWatchQueueActive(root: HTMLElement, activeRoomId: string | null): void {
  for (const item of root.querySelectorAll<HTMLElement>('.watch-queue-item')) {
    const active = activeRoomId !== null && item.dataset.roomId === activeRoomId;
    item.classList.toggle('active', active);
    const row = item.querySelector<HTMLAnchorElement>('.watch-queue-row');
    row?.classList.toggle('active', active);
  }
}

function watchQueueGameHref(feed: WatchFeed, roomId: string): string {
  const params = new URLSearchParams();
  params.set('game', roomId);
  params.set('channel', feed.activeChannel);
  return `/watch?${params.toString()}`;
}

export function watchFeedIsDark(feed: Pick<WatchFeed, 'activeChannel' | 'channels'>): boolean {
  const channel = feed.channels.find((candidate) => candidate.id === feed.activeChannel);
  if (!channel) return false;
  return channel.id.includes('dark') || channel.gameSpecIds.some((id) => id.includes('dark'));
}

export function watchQueueMatchupLabel(game: FeaturedGame): string {
  if (isCrossroadsChessVariant(game.variant)) {
    return `${displayParticipantName(game, 'white')} vs ${displayParticipantName(game, 'red')}`;
  }
  if (game.participants?.some((participant) => participant.color === 'red')) {
    return `${displayParticipantName(game, 'red')} vs ${displayParticipantName(game, 'black')}`;
  }
  return `${displayParticipantName(game, 'white')} vs ${displayParticipantName(game, 'black')}`;
}

function isCrossroadsChessVariant(variant: string): boolean {
  return variant === 'crossroads-chess' || variant === 'dual-chess';
}

export function formatWatchScope(
  feed: Pick<WatchFeed, 'activeChannel' | 'channels' | 'unlockLimit'>,
): string {
  return watchFeedIsDark(feed)
    ? `dark variants · latest ${feed.unlockLimit}`
    : `latest ${feed.unlockLimit}`;
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

export function resultLabel(result: string): string {
  if (result === 'white-wins') return 'White wins';
  if (result === 'black-wins') return 'Black wins';
  if (result === 'red-wins') return 'Red wins';
  return 'Draw';
}

// Banqi seats are decoupled from ink, so its seat-keyed result needs the game's
// firstColor to read by ink ("Black wins"). Every other variant has seat == ink
// and uses the plain label.
export function watchQueueResultLabel(game: FeaturedGame): string {
  if (game.variant === 'banqi') return banqiResultLabel(game.result, game.firstColor ?? null);
  return resultLabel(game.result);
}
