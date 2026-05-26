import type { Color } from '@mistboard/game';

export const FALLBACK_PLAY_MS = 900;
export const DEFAULT_BETWEEN_GAME_DELAY_MS = 8000;
export const DEFAULT_WALL_CLOCK_TICK_MS = 250;

export function compactReplayClockSidesForOrientation(orientation: Color): {
  bottom: Color;
  top: Color;
} {
  return orientation === 'black'
    ? { top: 'white', bottom: 'black' }
    : { top: 'black', bottom: 'white' };
}

export type WallClockReplayLoopSample = {
  plyCount: number;
  sampleId: string;
};

export type WallClockReplayTiming = {
  epochMs?: number;
  holdMs?: number;
  plyMs?: number;
};

export type WallClockReplayLoop = WallClockReplayTiming & {
  now?: () => number;
  samples: WallClockReplayLoopSample[];
  tickMs?: number;
};

export type WallClockReplayPosition = {
  cycleMs: number;
  ply: number;
  plyElapsedMs: number;
  sampleElapsedMs: number;
  sampleId: string;
  sampleIndex: number;
};

export function resolveWallClockReplayPosition(
  samples: readonly WallClockReplayLoopSample[],
  nowMs: number,
  timing: WallClockReplayTiming = {},
): WallClockReplayPosition | null {
  if (samples.length === 0) return null;

  const plyMs = positiveMs(timing.plyMs, FALLBACK_PLAY_MS);
  const holdMs = nonNegativeMs(timing.holdMs, DEFAULT_BETWEEN_GAME_DELAY_MS);
  const epochMs =
    typeof timing.epochMs === 'number' && Number.isFinite(timing.epochMs) ? timing.epochMs : 0;
  const atMs = Number.isFinite(nowMs) ? nowMs : epochMs;
  const durations = samples.map((sample) =>
    Math.max(1, normalizedPlyCount(sample.plyCount) * plyMs + holdMs),
  );
  const cycleMs = durations.reduce((total, duration) => total + duration, 0);
  let offset = positiveModulo(atMs - epochMs, cycleMs);

  for (let index = 0; index < samples.length; index += 1) {
    const duration = durations[index]!;
    const sample = samples[index]!;
    if (offset >= duration) {
      offset -= duration;
      continue;
    }

    const plyCount = normalizedPlyCount(sample.plyCount);
    const playMs = plyCount * plyMs;
    const inPlay = offset < playMs;
    const ply = inPlay ? Math.floor(offset / plyMs) : plyCount;
    return {
      cycleMs,
      ply,
      plyElapsedMs: inPlay ? offset - ply * plyMs : 0,
      sampleElapsedMs: offset,
      sampleId: sample.sampleId,
      sampleIndex: index,
    };
  }

  const first = samples[0]!;
  return {
    cycleMs,
    ply: 0,
    plyElapsedMs: 0,
    sampleElapsedMs: 0,
    sampleId: first.sampleId,
    sampleIndex: 0,
  };
}

export function resolveWallClockThinkingElapsedMs(plyElapsedMs: number, thinkMs: number): number {
  return Math.min(nonNegativeMs(plyElapsedMs, 0), nonNegativeMs(thinkMs, 0));
}

export function positiveMs(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.max(1, Math.floor(value))
    : fallback;
}

function normalizedPlyCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function nonNegativeMs(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
