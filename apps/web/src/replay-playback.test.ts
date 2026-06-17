import type { GameEvent } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import {
  clampPlay,
  delayForPly,
  moveEventAtPly,
  thinkingDurationForPly,
} from './replay-playback.js';
import { FALLBACK_PLAY_MS } from './replay-wall-clock.js';

const ROOM = 'room';

type MoveExt = Extract<GameEvent, { type: 'move-played' }> & {
  compute_ms?: number;
  thinkTimeMs?: number;
};

function roomCreated(at = 0): GameEvent {
  return {
    type: 'room-created',
    at,
    roomId: ROOM,
    variant: 'dark-chess',
    offer: [],
    timeControl: { initialMs: 60_000, incrementMs: 0 },
  } as Extract<GameEvent, { type: 'room-created' }>;
}

function move(
  opts: { at?: number; color?: 'white' | 'black'; thinkTimeMs?: number; compute_ms?: number } = {},
): GameEvent {
  const base = {
    type: 'move-played',
    at: opts.at ?? 1,
    roomId: ROOM,
    color: opts.color ?? 'white',
    move: { from: 'e2' as never, to: 'e4' as never },
  } as Extract<GameEvent, { type: 'move-played' }>;
  return {
    ...base,
    ...(opts.thinkTimeMs !== undefined ? { thinkTimeMs: opts.thinkTimeMs } : {}),
    ...(opts.compute_ms !== undefined ? { compute_ms: opts.compute_ms } : {}),
  } as MoveExt as GameEvent;
}

describe('moveEventAtPly', () => {
  it('is 1-indexed over move-played events and skips non-move events', () => {
    const m1 = move({ at: 10 });
    const m2 = move({ at: 20, color: 'black' });
    const events = [roomCreated(), m1, m2];
    expect(moveEventAtPly(events, 1)).toBe(m1);
    expect(moveEventAtPly(events, 2)).toBe(m2);
  });

  it('returns null for ply < 1 or past the last move', () => {
    const events = [roomCreated(), move()];
    expect(moveEventAtPly(events, 0)).toBeNull();
    expect(moveEventAtPly(events, -1)).toBeNull();
    expect(moveEventAtPly(events, 2)).toBeNull();
    expect(moveEventAtPly([], 1)).toBeNull();
  });
});

describe('clampPlay', () => {
  it('clamps into the [700, 2500] watchable band', () => {
    expect(clampPlay(100)).toBe(700);
    expect(clampPlay(5000)).toBe(2500);
    expect(clampPlay(1500)).toBe(1500);
  });
});

describe('thinkingDurationForPly', () => {
  it('prefers thinkTimeMs, falls back to compute_ms, else null', () => {
    expect(thinkingDurationForPly([move({ thinkTimeMs: 1234, compute_ms: 99 })], 1)).toBe(1234);
    expect(thinkingDurationForPly([move({ compute_ms: 50 })], 1)).toBe(50);
    expect(thinkingDurationForPly([move()], 1)).toBeNull();
  });

  it('treats a zero think time as recorded, not absent', () => {
    expect(thinkingDurationForPly([move({ thinkTimeMs: 0 })], 1)).toBe(0);
  });

  it('returns null for an out-of-range ply', () => {
    expect(thinkingDurationForPly([move({ thinkTimeMs: 100 })], 5)).toBeNull();
  });
});

describe('delayForPly', () => {
  it('uses recorded think time directly when no thinking budget is set', () => {
    expect(delayForPly([move({ thinkTimeMs: 1500 })], 1, null, false)).toBe(1500);
  });

  it('floors the think-time path at 700ms when a thinking budget exists', () => {
    expect(delayForPly([move({ thinkTimeMs: 100 })], 1, 5000, false)).toBe(700);
    expect(delayForPly([move({ thinkTimeMs: 1200 })], 1, 5000, false)).toBe(1200);
  });

  it('ignores a negative think time and falls through', () => {
    expect(delayForPly([move({ thinkTimeMs: -5 })], 1, null, false)).toBe(FALLBACK_PLAY_MS);
  });

  it('falls back to the scaled recorded wall-clock delta', () => {
    // room at 0, move at 10s → 10000 * 0.12 = 1200ms, in band.
    const events = [roomCreated(0), move({ at: 10_000 })];
    expect(delayForPly(events, 1, null, false)).toBe(1200);
  });

  it('skips a recorded delta below the 150ms minimum', () => {
    const events = [roomCreated(0), move({ at: 100 })];
    expect(delayForPly(events, 1, null, false)).toBe(FALLBACK_PLAY_MS);
  });

  it('uses the prior move as the delta anchor past ply 1', () => {
    const events = [roomCreated(0), move({ at: 1000 }), move({ at: 9000, color: 'black' })];
    // (9000 - 1000) * 0.12 = 960ms, in band.
    expect(delayForPly(events, 2, null, false)).toBe(960);
  });

  it('falls back to scaled compute time when no recorded delta is available', () => {
    // No start event → no recorded anchor; 30 * 50 = 1500ms.
    expect(delayForPly([move({ compute_ms: 30 })], 1, null, false)).toBe(1500);
  });

  it('prefers think time over recorded delta and compute time', () => {
    const events = [roomCreated(0), move({ at: 10_000, thinkTimeMs: 1300, compute_ms: 30 })];
    expect(delayForPly(events, 1, null, false)).toBe(1300);
  });

  it('falls back to the fixed delay when the move carries no timing signal', () => {
    expect(delayForPly([move()], 1, null, false)).toBe(FALLBACK_PLAY_MS);
  });

  it('clamps the raw think-time path into the band only when clampPace is set', () => {
    expect(delayForPly([move({ thinkTimeMs: 5000 })], 1, null, false)).toBe(5000);
    expect(delayForPly([move({ thinkTimeMs: 5000 })], 1, null, true)).toBe(2500);
  });
});
