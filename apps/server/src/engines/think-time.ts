import { clockRemainingMs } from '@mistboard/game';
import type { EngineMoveContext } from './types.js';

export type EngineRuntime = 'in-process' | 'subprocess';

export type EngineThinkTimeInput = {
  captureMoveCount?: number;
  context: EngineMoveContext;
  runtime: EngineRuntime;
};

const DEFAULT_BASE_THINK_TIME_MS = 650;
const DEFAULT_MIN_THINK_TIME_MS = 180;
const DEFAULT_MAX_THINK_TIME_MS = 1_800;
const CLOCK_RESERVE_MS = 250;

export function engineThinkTimeMs(input: EngineThinkTimeInput): number {
  const baseThinkTimeMs = Math.max(0, input.context.baseThinkTimeMs ?? DEFAULT_BASE_THINK_TIME_MS);
  if (baseThinkTimeMs === 0) return 0;

  const captureMoveCount = input.captureMoveCount ?? countVisibleCaptures(input.context);
  const complexityMs = clamp(
    (input.context.legalMoves.length - 12) * 10 + captureMoveCount * 40,
    -180,
    420,
  );
  const phaseMs = input.context.ply < 8 ? -90 : input.context.ply > 50 ? -70 : 0;
  const subprocessAdjustmentMs =
    input.runtime === 'subprocess' ? -Math.round(baseThinkTimeMs * 0.6) : 0;
  const jitterSpanMs = Math.max(120, Math.round(baseThinkTimeMs * 0.55));
  const jitterMs = Math.round(
    (seededUnit(input.context.seed + BigInt(input.context.ply) * 0x9e3779b97f4a7c15n) * 2 - 1) *
      jitterSpanMs,
  );

  let thinkTimeMs = baseThinkTimeMs + complexityMs + phaseMs + subprocessAdjustmentMs + jitterMs;
  let maxThinkTimeMs = DEFAULT_MAX_THINK_TIME_MS;
  let minThinkTimeMs = DEFAULT_MIN_THINK_TIME_MS;

  const remainingMs = remainingClockMs(input.context);
  if (remainingMs !== undefined) {
    if (remainingMs <= CLOCK_RESERVE_MS) return 0;

    const incrementMs = Math.max(
      0,
      input.context.incrementMs ?? input.context.state.clock?.incrementMs ?? 0,
    );
    maxThinkTimeMs = Math.min(
      DEFAULT_MAX_THINK_TIME_MS,
      remainingMs - CLOCK_RESERVE_MS,
      Math.max(0, Math.floor((remainingMs - CLOCK_RESERVE_MS) * 0.35 + incrementMs * 0.5)),
    );
    if (remainingMs < 3_000) thinkTimeMs *= 0.35;
    else if (remainingMs < 8_000) thinkTimeMs *= 0.65;

    minThinkTimeMs = remainingMs < 1_000 ? 0 : Math.min(DEFAULT_MIN_THINK_TIME_MS, maxThinkTimeMs);
  }

  return Math.round(clamp(thinkTimeMs, minThinkTimeMs, maxThinkTimeMs));
}

function remainingClockMs(context: EngineMoveContext): number | undefined {
  if (context.clockRemainingMs !== undefined) return Math.max(0, context.clockRemainingMs);
  const clock = context.state.clock;
  if (!clock) return undefined;
  return clockRemainingMs(clock, context.color, Date.now());
}

function countVisibleCaptures(context: EngineMoveContext): number {
  return context.legalMoves.filter((move) => {
    const target = context.state.board?.[move.to];
    return Boolean(target && target.color !== context.color);
  }).length;
}

function seededUnit(seed: bigint): number {
  let x = BigInt.asUintN(64, seed + 0x9e3779b97f4a7c15n);
  x = BigInt.asUintN(64, (x ^ (x >> 30n)) * 0xbf58476d1ce4e5b9n);
  x = BigInt.asUintN(64, (x ^ (x >> 27n)) * 0x94d049bb133111ebn);
  x = x ^ (x >> 31n);
  return Number(x >> 11n) / 2 ** 53;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
