import { describe, expect, it } from 'vitest';
import { compactReplayClockSidesForOrientation, resolveWallClockReplayPosition } from './replay.js';

describe('compactReplayClockSidesForOrientation', () => {
  it('puts the side facing the top of a white-oriented board above the board', () => {
    expect(compactReplayClockSidesForOrientation('white')).toEqual({
      top: 'black',
      bottom: 'white',
    });
  });

  it('puts the side facing the bottom of a black-oriented board below the board', () => {
    expect(compactReplayClockSidesForOrientation('black')).toEqual({
      top: 'white',
      bottom: 'black',
    });
  });
});

describe('resolveWallClockReplayPosition', () => {
  const samples = [
    { sampleId: 'a', plyCount: 2 },
    { sampleId: 'b', plyCount: 1 },
  ];
  const timing = { epochMs: 100, holdMs: 500, plyMs: 1000 };

  it('maps elapsed wall-clock time to the current sample and ply', () => {
    expect(resolveWallClockReplayPosition(samples, 100, timing)).toMatchObject({
      ply: 0,
      sampleId: 'a',
      sampleIndex: 0,
    });
    expect(resolveWallClockReplayPosition(samples, 1100, timing)).toMatchObject({
      ply: 1,
      sampleId: 'a',
    });
    expect(resolveWallClockReplayPosition(samples, 2100, timing)).toMatchObject({
      ply: 2,
      sampleId: 'a',
    });
    expect(resolveWallClockReplayPosition(samples, 2600, timing)).toMatchObject({
      ply: 0,
      sampleId: 'b',
      sampleIndex: 1,
    });
  });

  it('wraps deterministically across the whole corpus cycle', () => {
    const cycle = resolveWallClockReplayPosition(samples, 100, timing)?.cycleMs;
    expect(cycle).toBe(4000);
    expect(resolveWallClockReplayPosition(samples, 4100, timing)).toMatchObject({
      ply: 0,
      sampleId: 'a',
    });
    expect(resolveWallClockReplayPosition(samples, 99, timing)).toMatchObject({
      ply: 1,
      sampleId: 'b',
    });
  });

  it('returns null for an empty corpus', () => {
    expect(resolveWallClockReplayPosition([], 100, timing)).toBeNull();
  });
});
