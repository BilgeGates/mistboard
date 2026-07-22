import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PuzzleSummary } from './adapter.js';
import { rotatePuzzleOrder } from './storage.js';

function puzzle(id: string, rating: number, theme: string): PuzzleSummary {
  return {
    id,
    variant: 'xiangqi',
    title: id,
    sideToMove: 'red',
    goal: { type: 'winning-advantage', winner: 'red' },
    themes: [theme],
    solutionPlyCount: 3,
    rating,
    ratingProvisional: false,
  };
}

describe('adaptive puzzle rotation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('starts near the player rating, explores, then appends oldest seen puzzles', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const puzzles = [
      puzzle('far', 2100, 'mate'),
      puzzle('near', 1510, 'fork'),
      puzzle('nearer', 1495, 'pin'),
      puzzle('mid', 1650, 'capture'),
      puzzle('explore', 2300, 'quiet'),
      puzzle('seen-new', 1500, 'fork'),
      puzzle('seen-old', 1500, 'fork'),
    ];
    const ordered = rotatePuzzleOrder(
      puzzles,
      new Map([
        ['seen-new', 20],
        ['seen-old', 10],
      ]),
      new Map([['xiangqi', 1500]]),
    );

    expect(ordered[0]?.id).toBe('nearer');
    expect(ordered.slice(0, 5).map(({ id }) => id)).toContain('explore');
    expect(ordered.slice(-2).map(({ id }) => id)).toEqual(['seen-old', 'seen-new']);
  });
});
