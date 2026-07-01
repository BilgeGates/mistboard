// The homepage showcase viewer: one board that cycles through the latest finished
// games across variants from a rolling pool. It owns cross-game advancement (the
// chess replay engine used to own it via loopSamples) so it can cross renderer
// kinds — same kind loads the next game in place, a different kind (e.g. chess ->
// jieqi) tears down and re-mounts. The pool is refreshed live (drop oldest /
// ingest newest); the current game finishes before the swap unless jumpNow cuts
// it short.

import type { GameEvent } from '@mistboard/game';
import type { GameMeta, ReplayHandle } from './replay.js';
import { renderWatchReplaySkeleton } from './replay-skeleton.js';
import { mountShowcaseBoard } from './showcase-board.js';
import { nextShowcaseIndex, showcaseRendererKindForSpec } from './showcase-dispatch.js';

export type ShowcaseEntry = {
  roomId: string;
  specId: string;
  pov: 'white' | 'black';
};

export type ShowcaseCyclerOptions = {
  metadataByRoomId: Record<string, GameMeta>;
  // Player names for tenant compact seats (first = red, second = black), by room id.
  namesByRoomId: Record<string, { first: string; second: string }>;
  loaderForId: (roomId: string) => Promise<GameEvent[]>;
};

export type ShowcaseCyclerHandle = {
  // Swap the rolling pool. By default the current game finishes and the next pick
  // comes from the new pool; { jumpNow: true } cuts the current game short.
  updatePool: (next: ShowcaseEntry[], options?: { jumpNow?: boolean }) => void;
  destroy: () => void;
};

export async function mountShowcaseCycler(
  root: HTMLElement,
  initialPool: ShowcaseEntry[],
  options: ShowcaseCyclerOptions,
): Promise<ShowcaseCyclerHandle> {
  let pool = initialPool.slice();
  let destroyed = false;
  let handle: ReplayHandle | null = null;
  let handleKind: string | null = null;
  let currentRoomId: string | null = null;
  // Serializes mounts: a re-mount is async, and both onGameEnd and a jumpNow pool
  // swap can call advance(); the guard drops overlapping requests.
  let mounting = false;

  const nextEntry = (): ShowcaseEntry | null => {
    if (pool.length === 0) return null;
    const idx = currentRoomId ? pool.findIndex((entry) => entry.roomId === currentRoomId) : -1;
    return pool[nextShowcaseIndex(pool.length, idx)] ?? null;
  };

  const onGameEnd = (): void => {
    if (destroyed) return;
    void advance(nextEntry());
  };

  async function advance(entry: ShowcaseEntry | null): Promise<void> {
    if (destroyed || mounting || !entry) return;
    const kind = showcaseRendererKindForSpec(entry.specId);

    // Same renderer kind: keep the mounted handle, just load the next game.
    if (handle && handleKind === kind) {
      currentRoomId = entry.roomId;
      try {
        await handle.loadGame(entry.roomId);
      } catch (err) {
        console.warn('[showcase] loadGame failed, skipping', entry.roomId, err);
        onGameEnd();
      }
      return;
    }

    // Different kind: tear down and re-mount. Skeleton fills the gap so the slot
    // doesn't flash blank while the new renderer (and its chunk) loads — but only
    // when replacing an existing board; the initial mount paints into the already
    // rendered shell without a "Loading game" flash.
    mounting = true;
    const hadHandle = handle !== null;
    handle?.destroy();
    handle = null;
    handleKind = null;
    if (hadHandle) renderWatchReplaySkeleton(root);
    try {
      const next = await mountShowcaseBoard(root, entry.specId, entry.roomId, {
        metadataByRoomId: options.metadataByRoomId,
        namesByRoomId: options.namesByRoomId,
        onGameEnd,
        pov: entry.pov,
        loaderForId: options.loaderForId,
      });
      if (destroyed) {
        next.destroy();
        return;
      }
      handle = next;
      handleKind = kind;
      currentRoomId = entry.roomId;
    } catch (err) {
      console.warn('[showcase] mount failed, skipping', entry.roomId, err);
      mounting = false;
      onGameEnd();
      return;
    }
    mounting = false;
  }

  await advance(pool[0] ?? null);

  return {
    updatePool: (next, opts) => {
      if (destroyed) return;
      pool = next.slice();
      if (opts?.jumpNow) void advance(pool[0] ?? nextEntry());
    },
    destroy: () => {
      destroyed = true;
      handle?.destroy();
      handle = null;
    },
  };
}
