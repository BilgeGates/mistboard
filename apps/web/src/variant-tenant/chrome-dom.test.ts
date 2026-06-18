import { describe, expect, it } from 'vitest';
import { shouldFollowLatestMove } from './chrome-dom.js';

// shouldFollowLatestMove decides whether a live tenant move list jumps to the
// latest move. It mirrors the chess shell's shouldAutoScrollMoveList so every
// variant room follows new moves the same way.
describe('shouldFollowLatestMove', () => {
  it('follows the latest move on the first live render with moves', () => {
    expect(shouldFollowLatestMove({ live: true, plyCount: 3 }, undefined)).toBe(true);
  });

  it('follows when a new ply arrives while already live', () => {
    expect(
      shouldFollowLatestMove({ live: true, plyCount: 4 }, { plyCount: 3, wasLive: true }),
    ).toBe(true);
  });

  it('stays put on an unchanged live render (e.g. a clock tick)', () => {
    expect(
      shouldFollowLatestMove({ live: true, plyCount: 4 }, { plyCount: 4, wasLive: true }),
    ).toBe(false);
  });

  it('does not pull the list while scrubbing an older position', () => {
    expect(
      shouldFollowLatestMove({ live: false, plyCount: 4 }, { plyCount: 4, wasLive: true }),
    ).toBe(false);
  });

  it('follows when returning from a scrubbed position to live', () => {
    expect(
      shouldFollowLatestMove({ live: true, plyCount: 4 }, { plyCount: 4, wasLive: false }),
    ).toBe(true);
  });

  it('does not follow when there are no moves yet', () => {
    expect(shouldFollowLatestMove({ live: true, plyCount: 0 }, undefined)).toBe(false);
  });

  it('follows after a reset when a reused list drops to a smaller ply count', () => {
    // A new game reuses the same list element; the ply count shrinks, which
    // reads as "changed" and re-follows rather than getting stuck.
    expect(
      shouldFollowLatestMove({ live: true, plyCount: 1 }, { plyCount: 9, wasLive: true }),
    ).toBe(true);
  });
});
