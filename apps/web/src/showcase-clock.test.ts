import { describe, expect, it } from 'vitest';
import { reconstructShowcaseClocks } from './showcase-clock';

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
