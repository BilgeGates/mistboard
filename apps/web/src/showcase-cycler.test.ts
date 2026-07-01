import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplayHandle } from './replay';

// Mock the board mount + skeleton so the cycler logic can be driven without a
// real renderer, and force a deterministic "kind = spec id" so same-spec games
// share a renderer and different-spec games force a re-mount.
vi.mock('./showcase-board.js', () => ({ mountShowcaseBoard: vi.fn() }));
vi.mock('./replay-skeleton.js', () => ({ renderWatchReplaySkeleton: vi.fn() }));
vi.mock('./showcase-dispatch.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./showcase-dispatch')>();
  return { ...actual, showcaseRendererKindForSpec: (specId: string | null) => specId ?? 'chess' };
});

import { renderWatchReplaySkeleton } from './replay-skeleton.js';
import { mountShowcaseBoard } from './showcase-board.js';
import { mountShowcaseCycler, type ShowcaseEntry } from './showcase-cycler.js';

const mountMock = vi.mocked(mountShowcaseBoard);
const skeletonMock = vi.mocked(renderWatchReplaySkeleton);

type FakeHandle = ReplayHandle & {
  loadGame: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};
const mounted: Array<{ roomId: string; specId: string; handle: FakeHandle }> = [];
let capturedOnGameEnd: (() => void) | null | undefined = null;

function makeHandle(roomId: string): FakeHandle {
  return {
    activeSampleId: () => roomId,
    destroy: vi.fn(),
    loadGame: vi.fn().mockResolvedValue(undefined),
    updateLoopPool: vi.fn(),
  } as FakeHandle;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const POOL: ShowcaseEntry[] = [
  { roomId: 'g1', specId: 'dark-chess', pov: 'white' },
  { roomId: 'g2', specId: 'dark-chess', pov: 'white' },
  { roomId: 'j1', specId: 'jieqi', pov: 'white' },
];

beforeEach(() => {
  mounted.length = 0;
  capturedOnGameEnd = null;
  skeletonMock.mockClear();
  mountMock.mockReset();
  mountMock.mockImplementation(async (_root, specId, roomId, opts) => {
    capturedOnGameEnd = opts.onGameEnd;
    const handle = makeHandle(roomId);
    mounted.push({ roomId, specId, handle });
    return handle;
  });
});

const opts = { metadataByRoomId: {}, namesByRoomId: {}, loaderForId: async () => [] };

describe('mountShowcaseCycler', () => {
  it('mounts the first pooled game on start', async () => {
    await mountShowcaseCycler(document.createElement('div'), POOL, opts);
    expect(mountMock).toHaveBeenCalledTimes(1);
    expect(mounted[0]!.roomId).toBe('g1');
  });

  it('advances same-kind games via loadGame (no re-mount)', async () => {
    await mountShowcaseCycler(document.createElement('div'), POOL, opts);
    capturedOnGameEnd!(); // g1 finished
    await flush();
    // Still one mount; g1's handle loaded g2 in place.
    expect(mountMock).toHaveBeenCalledTimes(1);
    expect(mounted[0]!.handle.loadGame).toHaveBeenCalledWith('g2');
  });

  it('re-mounts (destroy + skeleton) when the next game is a different kind', async () => {
    await mountShowcaseCycler(document.createElement('div'), POOL, opts);
    capturedOnGameEnd!(); // g1 -> g2 (loadGame)
    await flush();
    capturedOnGameEnd!(); // g2 -> j1 (different kind)
    await flush();
    expect(mountMock).toHaveBeenCalledTimes(2);
    expect(mounted[1]!.roomId).toBe('j1');
    expect(mounted[0]!.handle.destroy).toHaveBeenCalledTimes(1);
    expect(skeletonMock).toHaveBeenCalledTimes(1);
  });

  it('wraps to the front of the pool after the last game', async () => {
    await mountShowcaseCycler(document.createElement('div'), POOL, opts);
    capturedOnGameEnd!(); // -> g2
    await flush();
    capturedOnGameEnd!(); // -> j1 (re-mount)
    await flush();
    capturedOnGameEnd!(); // j1 is last -> wraps to g1 (re-mount)
    await flush();
    expect(mounted[mounted.length - 1]!.roomId).toBe('g1');
  });

  it('jumpNow cuts to the new pool immediately', async () => {
    const handle = await mountShowcaseCycler(document.createElement('div'), POOL, opts);
    handle.updatePool([{ roomId: 'x1', specId: 'banqi', pov: 'white' }], { jumpNow: true });
    await flush();
    expect(mounted[mounted.length - 1]!.roomId).toBe('x1');
  });

  it('destroy tears down the active handle', async () => {
    const handle = await mountShowcaseCycler(document.createElement('div'), POOL, opts);
    handle.destroy();
    expect(mounted[0]!.handle.destroy).toHaveBeenCalled();
  });
});
