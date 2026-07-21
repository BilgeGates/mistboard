// Landing TV controller state machine: live-follow via /api/watch/live, air a
// completed game once, freeze thereafter, never replay. mountShowcaseBoard is
// mocked; the tests drive the poll with fake timers and a stubbed fetch.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

type MountRecord = {
  specId: string;
  roomId: string;
  options: {
    autoplay?: boolean;
    live?: boolean;
    onGameEnd?: () => void;
    loadPostgameOverride?: (
      roomId: string,
    ) => Promise<{ ok: true; postgame: unknown } | { ok: false }>;
  };
  handle: {
    destroy: ReturnType<typeof vi.fn>;
    loadGame: ReturnType<typeof vi.fn>;
    jumpToPly: ReturnType<typeof vi.fn>;
  };
};

const mounts: MountRecord[] = [];

vi.mock('./showcase-board.js', () => ({
  mountShowcaseBoard: vi.fn(
    async (_root: HTMLElement, specId: string, roomId: string, options: MountRecord['options']) => {
      const handle = {
        activeSampleId: () => roomId,
        destroy: vi.fn(),
        loadGame: vi.fn(async () => {}),
        jumpToPly: vi.fn(),
        plyCount: () => 6,
        updateLoopPool: () => {},
      };
      mounts.push({ handle, options, roomId, specId });
      return handle;
    },
  ),
}));

import { mountLandingTv } from './landing-tv.js';

const POLL_MS = 4_000;

let featuredResponse: { featured: unknown } = { featured: null };
let root: HTMLElement;

function liveFeatured(roomId: string, ply: number, withPayload = true): unknown {
  return {
    roomId,
    gameSpecId: 'xiangqi',
    ply,
    players: [
      { color: 'red', isEngine: false, name: 'Ada' },
      { color: 'black', isEngine: true, name: 'Pikafish' },
    ],
    ...(withPayload ? { payload: { marker: `${roomId}@${ply}` } } : {}),
  };
}

async function flush(): Promise<void> {
  // Let the poll fetch + the serialized mount chain settle.
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

async function tick(): Promise<void> {
  await vi.advanceTimersByTimeAsync(POLL_MS);
  await flush();
}

function mountController(initialPool: Array<{ roomId: string; specId: string; pov: 'white' }>) {
  return mountLandingTv(root, initialPool, {
    isConnected: () => true,
    loaderForId: async () => [],
    metadataByRoomId: {},
    namesByRoomId: {},
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mounts.length = 0;
  featuredResponse = { featured: null };
  root = document.createElement('div');
  document.body.append(root);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ json: async () => featuredResponse, ok: true })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  root.remove();
});

const entryA = { pov: 'white' as const, roomId: 'gameA', specId: 'xiangqi' };
const entryB = { pov: 'white' as const, roomId: 'gameB', specId: 'xiangqi' };

test('boot airs the pool head once with autoplay, then freezes and never re-airs it', async () => {
  const tv = await mountController([entryA]);
  await flush();
  expect(mounts).toHaveLength(1);
  expect(mounts[0]!.roomId).toBe('gameA');
  expect(mounts[0]!.options.autoplay).toBe(true);
  expect(mounts[0]!.options.live).toBeUndefined();

  // The replay ends: the board freezes in place, no new mount.
  mounts[0]!.options.onGameEnd?.();
  await flush();
  expect(mounts).toHaveLength(1);

  // The same (now aired) head never replays on later pool refreshes.
  tv.updateCompletedPool([entryA]);
  await flush();
  await tick();
  expect(mounts).toHaveLength(1);
  tv.destroy();
});

test('a live featured game mounts paused+live, follows new plies, and hands off on finish', async () => {
  featuredResponse = { featured: liveFeatured('liveGame', 3) };
  const tv = await mountController([]);
  await flush();

  // Live mount: paused board in live mode, jumped to the latest ply.
  expect(mounts).toHaveLength(1);
  const live = mounts[0]!;
  expect(live.roomId).toBe('liveGame');
  expect(live.options.live).toBe(true);
  expect(live.options.autoplay).toBe(false);
  expect(live.handle.jumpToPly).toHaveBeenCalled();

  // The override serves the poll payload for the live room.
  const served = await live.options.loadPostgameOverride?.('liveGame');
  expect(served).toEqual({ ok: true, postgame: { marker: 'liveGame@3' } });

  // A new ply arrives: same handle reloads and re-jumps (no re-mount).
  featuredResponse = { featured: liveFeatured('liveGame', 4) };
  await tick();
  expect(mounts).toHaveLength(1);
  expect(live.handle.loadGame).toHaveBeenCalledWith('liveGame');

  // The game ends: featured null triggers the finished re-mount (live off).
  featuredResponse = { featured: null };
  await tick();
  expect(mounts).toHaveLength(2);
  const finished = mounts[1]!;
  expect(finished.roomId).toBe('liveGame');
  expect(finished.options.live).toBeUndefined();
  expect(finished.options.autoplay).toBe(false);
  expect(finished.handle.jumpToPly).toHaveBeenCalled();
  tv.destroy();
});

test('an aired pool head never clobbers the board after a live handoff; an unaired one airs', async () => {
  // Air gameA at boot, then go live, then finish.
  const tv = await mountController([entryA]);
  await flush();
  mounts[0]!.options.onGameEnd?.();
  featuredResponse = { featured: liveFeatured('liveGame', 2) };
  await tick();
  featuredResponse = { featured: null };
  await tick();
  const beforeCount = mounts.length;
  expect(mounts[beforeCount - 1]!.roomId).toBe('liveGame');

  // Stale pool still headed by the already-aired gameA: board stays put.
  tv.updateCompletedPool([entryA]);
  await tick();
  expect(mounts).toHaveLength(beforeCount);

  // A NEW unaired game arrives at the head: it airs once.
  tv.updateCompletedPool([entryB, entryA]);
  await flush();
  expect(mounts).toHaveLength(beforeCount + 1);
  expect(mounts[beforeCount]!.roomId).toBe('gameB');
  expect(mounts[beforeCount]!.options.autoplay).toBe(true);
  tv.destroy();
});

test('the live game is never cut by pool updates, and jumpNow cuts a playing replay', async () => {
  featuredResponse = { featured: liveFeatured('liveGame', 2) };
  const tv = await mountController([]);
  await flush();
  expect(mounts).toHaveLength(1);

  // Pool refresh while live: no board change, even with jumpNow.
  tv.updateCompletedPool([entryB], { jumpNow: true });
  await flush();
  expect(mounts).toHaveLength(1);
  tv.destroy();

  // Separately: a playing replay IS cut by jumpNow (the demo-swap path).
  mounts.length = 0;
  featuredResponse = { featured: null };
  const tv2 = await mountController([entryA]);
  await flush();
  expect(mounts).toHaveLength(1); // gameA airing
  tv2.updateCompletedPool([entryB], { jumpNow: true });
  await flush();
  expect(mounts).toHaveLength(2);
  expect(mounts[1]!.roomId).toBe('gameB');
  tv2.destroy();
});
