// Homepage Mistboard TV controller: one board that honors TRUE LIVE.
//
// Replaces the old showcase cycler's endless replay loop with the TV model
// (decided 2026-07-20): follow the top-rated live game when one exists (moves
// arrive via a short poll of /api/watch/live), otherwise air the freshest
// not-yet-shown completed game ONCE at recorded pace, otherwise FREEZE on the
// last game's final position. A game never replays once it has aired this
// session. Fog games can never appear live — the server's visibility policy is
// fail-closed — so they only ever reach this board as post-completion reveals
// from the completed pool.

import type { GameEvent } from '@mistboard/game';
import { reloadForChunkLoadError } from './chunk-load-recovery.js';
import type { GameMeta, ReplayHandle } from './replay.js';
import { renderWatchReplayFailure } from './replay-skeleton.js';
import { mountShowcaseBoard } from './showcase-board.js';
import type { ShowcaseEntry } from './showcase-cycler.js';
import { showcaseRendererKindForSpec } from './showcase-dispatch.js';

const LIVE_POLL_MS = 4_000;

export type LandingTvMode = 'live' | 'replay' | 'frozen';

type LiveFeatured = {
  roomId: string;
  gameSpecId: string;
  ply: number;
  players?: Array<{ color: string; name: string | null; isEngine: boolean }>;
  payload?: Record<string, unknown>;
};

export type LandingTvOptions = {
  metadataByRoomId: Record<string, GameMeta>;
  namesByRoomId: Record<string, { first: string; second: string }>;
  loaderForId: (roomId: string) => Promise<GameEvent[]>;
  // Fired when the board commits to a game/mode, so the caller can update the
  // out-of-board caption ("Xiangqi · live" / "recent · 2h ago").
  onGameChange?: (info: { roomId: string; specId: string; mode: LandingTvMode }) => void;
  // Polling stops for good once this reports false (landing unmounted).
  isConnected: () => boolean;
};

export type LandingTvController = {
  // Freshest-first completed games (the existing showcase pool). The head entry
  // is "the last game": aired once if unseen, else the frozen final position.
  // `jumpNow` cuts a playing replay short (used when real games replace the
  // dev-only bundled demo); a live game is never cut.
  updateCompletedPool(entries: ShowcaseEntry[], opts?: { jumpNow?: boolean }): void;
  destroy(): void;
};

export async function mountLandingTv(
  root: HTMLElement,
  initialPool: ShowcaseEntry[],
  options: LandingTvOptions,
): Promise<LandingTvController> {
  let destroyed = false;
  let handle: ReplayHandle | null = null;
  let handleKind: string | null = null;
  // Whether the mounted handle was created live / autoplaying — a handle is
  // only reused across games when both match (the flags are baked at mount).
  let handleLive = false;
  let handleAutoplay = false;
  let mode: LandingTvMode | null = null;
  let currentRoomId: string | null = null;
  let currentSpecId: string | null = null;
  let completedPool = initialPool.slice();
  // Rooms fully shown this session (live-followed, aired, or frozen-displayed):
  // never re-aired. Failed rooms land here too so a broken payload can't loop.
  const airedRoomIds = new Set<string>();
  // Latest live payload per featured room; the loadPostgameOverride below reads
  // it, and clearing it makes the override fall back to the real finished-game
  // endpoint (the live→finished handoff).
  let livePayload: { roomId: string; payload: Record<string, unknown> } | null = null;
  let shownLivePly = -1;
  let pollTimer: number | null = null;

  // Serializes every mount/load: poll ticks, pool swaps, and onGameEnd all
  // funnel through here so re-mounts can't interleave.
  let chain: Promise<void> = Promise.resolve();
  const enqueue = (task: () => Promise<void>): void => {
    chain = chain
      .then(() => (destroyed ? undefined : task()))
      .catch((err) => {
        console.warn('[landing-tv] step failed', err);
        reloadForChunkLoadError(err);
      });
  };

  const notify = (roomId: string, specId: string, nextMode: LandingTvMode): void => {
    mode = nextMode;
    currentRoomId = roomId;
    currentSpecId = specId;
    options.onGameChange?.({ mode: nextMode, roomId, specId });
  };

  const loadPostgameOverride = async (
    roomId: string,
  ): Promise<{ ok: true; postgame: unknown } | { ok: false }> => {
    if (livePayload && livePayload.roomId === roomId) {
      return { ok: true, postgame: livePayload.payload };
    }
    return { ok: false };
  };

  const destroyHandle = (): void => {
    handle?.destroy();
    handle = null;
    handleKind = null;
  };

  // Mount (or re-mount) the board for a game. Same renderer kind reloads in
  // place; a different kind tears down and re-mounts, pinning the panel height
  // so the page doesn't jump across the swap (cycler behavior, kept).
  const mountGame = async (
    entry: { roomId: string; specId: string; pov: 'white' | 'black' },
    mountOptions: { autoplay: boolean; live: boolean; onGameEnd?: () => void },
  ): Promise<void> => {
    const kind = showcaseRendererKindForSpec(entry.specId);
    // Reuse the mounted handle only when its baked flags match; live and
    // autoplay are mount-time options, so a mismatch needs a fresh mount.
    if (
      handle &&
      handleKind === kind &&
      handleLive === mountOptions.live &&
      handleAutoplay === mountOptions.autoplay &&
      !mountOptions.live &&
      !mountOptions.onGameEnd
    ) {
      await handle.loadGame(entry.roomId);
      return;
    }
    const priorHeight = handle ? root.offsetHeight : 0;
    destroyHandle();
    if (priorHeight > 0) root.style.minHeight = `${priorHeight}px`;
    try {
      const next = await mountShowcaseBoard(root, entry.specId, entry.roomId, {
        metadataByRoomId: options.metadataByRoomId,
        namesByRoomId: options.namesByRoomId,
        loaderForId: options.loaderForId,
        pov: entry.pov,
        autoplay: mountOptions.autoplay,
        ...(mountOptions.onGameEnd ? { onGameEnd: mountOptions.onGameEnd } : {}),
        ...(mountOptions.live ? { live: true, loadPostgameOverride } : {}),
      });
      if (destroyed) {
        next.destroy();
        return;
      }
      handle = next;
      handleKind = kind;
      handleLive = mountOptions.live;
      handleAutoplay = mountOptions.autoplay;
    } finally {
      root.style.minHeight = '';
    }
  };

  const jumpToEnd = (glideFrom?: number): void => {
    if (!handle?.jumpToPly || !handle.plyCount) return;
    const end = handle.plyCount();
    if (glideFrom !== undefined && end - glideFrom === 1 && end > 0) {
      // One new move: paint the previous position, then step so the piece glides.
      handle.jumpToPly(end - 1);
    }
    handle.jumpToPly(end);
  };

  // First/second seat names from the featured players (red is the first mover
  // for every live-capable tenant today; fall back to seat order).
  const registerLiveNames = (featured: LiveFeatured): void => {
    const players = featured.players ?? [];
    if (players.length < 2 || options.namesByRoomId[featured.roomId]) return;
    const first = players.find((player) => player.color === 'red') ?? players[0]!;
    const second = players.find((player) => player !== first)!;
    options.namesByRoomId[featured.roomId] = {
      first: first.name ?? 'Anonymous',
      second: second.name ?? 'Anonymous',
    };
  };

  const showLive = async (featured: LiveFeatured): Promise<void> => {
    if (featured.payload) {
      livePayload = { payload: featured.payload, roomId: featured.roomId };
    }
    registerLiveNames(featured);
    airedRoomIds.add(featured.roomId);
    const following = mode === 'live' && currentRoomId === featured.roomId;
    if (!following) {
      if (!featured.payload) return; // need a payload to mount; next poll carries one
      await mountGame(
        { pov: 'white', roomId: featured.roomId, specId: featured.gameSpecId },
        { autoplay: false, live: true },
      );
      jumpToEnd();
      shownLivePly = featured.ply;
      notify(featured.roomId, featured.gameSpecId, 'live');
      return;
    }
    if (featured.ply > shownLivePly && featured.payload && handle) {
      const from = shownLivePly === featured.ply - 1 ? (handle.plyCount?.() ?? 0) : undefined;
      await handle.loadGame(featured.roomId);
      jumpToEnd(from);
      shownLivePly = featured.ply;
    }
  };

  // The live game ended (or vanished): re-mount its real finished replay so
  // the board lands on the true final position + result marks, then freeze.
  const finishLiveHandoff = async (): Promise<void> => {
    const roomId = currentRoomId;
    const specId = currentSpecId;
    if (!roomId || !specId) return;
    livePayload = null;
    await mountGame({ pov: 'white', roomId, specId }, { autoplay: false, live: false });
    jumpToEnd();
    notify(roomId, specId, 'frozen');
  };

  const syncCompleted = async (): Promise<void> => {
    const target = completedPool[0];
    if (!target) return;
    if (currentRoomId === target.roomId && mode !== 'live') return;
    if (airedRoomIds.has(target.roomId)) {
      // An already-shown pool head never replaces what's on the board: the
      // board stays frozen on the most recent thing it showed (e.g. the live
      // game that just ended), which the stale pool may not contain yet. Only
      // an empty board (first paint) freezes onto an aired head.
      if (currentRoomId !== null && mode !== 'live') return;
      await mountGame(target, { autoplay: false, live: false });
      jumpToEnd();
      notify(target.roomId, target.specId, 'frozen');
      return;
    }
    airedRoomIds.add(target.roomId);
    await mountGame(target, {
      autoplay: true,
      live: false,
      onGameEnd: () => {
        if (destroyed) return;
        notify(target.roomId, target.specId, 'frozen');
        // A newer unaired game may have arrived while this one aired.
        enqueue(syncCompleted);
      },
    });
    notify(target.roomId, target.specId, 'replay');
  };

  const stopPolling = (): void => {
    if (pollTimer !== null) {
      window.clearTimeout(pollTimer);
      pollTimer = null;
    }
  };

  const schedulePoll = (): void => {
    if (destroyed) return;
    pollTimer = window.setTimeout(() => void pollLive(), LIVE_POLL_MS);
  };

  const pollLive = async (): Promise<void> => {
    if (destroyed) return;
    if (!options.isConnected()) {
      stopPolling();
      return;
    }
    if (document.visibilityState === 'hidden') {
      schedulePoll();
      return;
    }
    try {
      const following = mode === 'live' && currentRoomId !== null;
      const query = following
        ? `?channel=top&room=${encodeURIComponent(currentRoomId!)}&ply=${shownLivePly}`
        : '?channel=top';
      const resp = await fetch(`/api/watch/live${query}`);
      if (resp.ok) {
        const data = (await resp.json()) as { featured: LiveFeatured | null };
        if (data.featured) {
          const featured = data.featured;
          enqueue(() => showLive(featured));
        } else if (mode === 'live') {
          enqueue(finishLiveHandoff);
        } else {
          enqueue(syncCompleted);
        }
      }
    } catch {
      // Transient network failure: keep whatever is on the board.
    }
    schedulePoll();
  };

  // Hidden tabs skip the fetch (see pollLive), so poll immediately when the
  // tab comes back instead of waiting out the current interval.
  const onVisibilityChange = (): void => {
    if (destroyed || document.visibilityState !== 'visible') return;
    stopPolling();
    void pollLive();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  // Boot: show the completed pool immediately (airs the head game once if this
  // session hasn't seen it), then start watching for live games.
  enqueue(async () => {
    try {
      await syncCompleted();
    } catch (err) {
      renderWatchReplayFailure(root);
      throw err;
    }
  });
  void pollLive();

  return {
    updateCompletedPool: (entries, opts) => {
      if (destroyed) return;
      completedPool = entries.slice();
      if (mode === 'live') return;
      if (mode !== 'replay' || opts?.jumpNow) enqueue(syncCompleted);
    },
    destroy: () => {
      destroyed = true;
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      destroyHandle();
    },
  };
}
