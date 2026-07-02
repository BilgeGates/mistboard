import { describe, expect, it } from 'vitest';
import {
  reconstructMoveDelays,
  reconstructShowcaseClocks,
  showcaseResultMarks,
} from './showcase-clock';

describe('showcaseResultMarks', () => {
  it('marks the first-mover seat as the winner for red-wins and white-wins', () => {
    expect(showcaseResultMarks('red-wins')).toEqual({ first: '1', second: '0' });
    expect(showcaseResultMarks('white-wins')).toEqual({ first: '1', second: '0' });
  });

  it('marks the second seat as the winner for black-wins', () => {
    expect(showcaseResultMarks('black-wins')).toEqual({ first: '0', second: '1' });
  });

  it('marks a draw (or any unknown result) as half points both sides', () => {
    expect(showcaseResultMarks('draw')).toEqual({ first: '½', second: '½' });
    expect(showcaseResultMarks('some-future-result')).toEqual({ first: '½', second: '½' });
  });
});

describe('reconstructMoveDelays', () => {
  it('paces each move by its real gap, clamped to the band', () => {
    const delays = reconstructMoveDelays({
      minMs: 700,
      maxMs: 2500,
      moves: [
        { ply: 1, color: 'red', at: 0 }, // first move -> minMs
        { ply: 2, color: 'black', at: 1_200 }, // gap 1200 (in band)
        { ply: 3, color: 'red', at: 1_500 }, // gap 300 -> floored to 700
        { ply: 4, color: 'black', at: 60_000 }, // gap huge -> capped to 2500
      ],
    });
    expect(delays).toEqual([0, 700, 1_200, 700, 2_500]);
  });

  it('sorts by ply before differencing timestamps', () => {
    const delays = reconstructMoveDelays({
      minMs: 700,
      maxMs: 2500,
      moves: [
        { ply: 2, color: 'black', at: 2_000 },
        { ply: 1, color: 'red', at: 0 },
      ],
    });
    expect(delays[2]).toBe(2_000);
  });
});

describe('reconstructShowcaseClocks', () => {
  const base = { initialMs: 180_000, incrementMs: 2_000, firstColor: 'red' as const };

  it('reconstructs Fischer remaining time per ply from move timestamps', () => {
    const series = reconstructShowcaseClocks({
      ...base,
      startedAt: 0,
      moves: [
        { ply: 1, color: 'red', at: 1_000 }, // spent 1000 -> 180000-1000+2000
        { ply: 2, color: 'black', at: 3_000 }, // spent 2000 -> 180000-2000+2000
        { ply: 3, color: 'red', at: 3_500 }, // spent 500 -> 181000-500+2000
      ],
    });
    expect(series[0]).toEqual({ first: 180_000, second: 180_000 });
    expect(series[1]).toEqual({ first: 181_000, second: 180_000 });
    expect(series[2]).toEqual({ first: 181_000, second: 180_000 });
    expect(series[3]).toEqual({ first: 182_500, second: 180_000 });
  });

  it('sorts by ply and maps the non-first color to the second slot', () => {
    const series = reconstructShowcaseClocks({
      ...base,
      startedAt: 0,
      moves: [
        { ply: 2, color: 'black', at: 3_000 },
        { ply: 1, color: 'red', at: 1_000 },
      ],
    });
    expect(series[2].second).toBe(180_000);
  });

  it('charges no time for the first move when startedAt is unknown', () => {
    const series = reconstructShowcaseClocks({
      ...base,
      startedAt: null,
      moves: [{ ply: 1, color: 'red', at: 5_000 }],
    });
    expect(series[1]).toEqual({ first: 182_000, second: 180_000 });
  });

  it('never charges negative time on backwards/equal timestamps and floors at zero', () => {
    const series = reconstructShowcaseClocks({
      initialMs: 1_000,
      incrementMs: 0,
      firstColor: 'red',
      startedAt: 10_000,
      moves: [
        { ply: 1, color: 'red', at: 5_000 }, // backwards -> spent clamped to 0
        { ply: 2, color: 'black', at: 999_999 }, // huge spend -> floor at 0
      ],
    });
    expect(series[1].first).toBe(1_000);
    expect(series[2].second).toBe(0);
  });
});
