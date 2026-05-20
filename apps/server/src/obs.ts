// Observability: a single logger + a periodic metrics tick. Kept deliberately
// minimal: stdout-only, no SaaS dependency. In dev (TTY) we pretty-print; in
// prod we emit JSON lines that Railway's log capture indexes natively.
//
// Add structured fields to logs by passing an object as the first arg:
//   logger.info({ kind: 'engine_move', game_id, mode, ms }, 'engine move ok');
//
// The metrics tick emits a `kind: 'metrics'` line every N seconds with the
// gauges that matter for capacity decisions: room count, ws client count,
// event-loop lag percentiles, heap/rss.

import pino, { type Logger } from 'pino';
import { monitorEventLoopDelay } from 'node:perf_hooks';

const isProd = process.env.NODE_ENV === 'production' || !process.stdout.isTTY;
const level = process.env.LOG_LEVEL ?? 'info';

export const logger: Logger = pino(
  isProd
    ? { level }
    : {
        level,
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
        },
      },
);

export interface ObsSources {
  roomCount: () => number;
  wsClientCount: () => number;
}

// Engine-move counters. Incremented from the room-manager engine-move path.
// The metrics tick emits both "since last tick" deltas (for rate alerts) and
// running totals (for sanity checks on dashboards).
//
// Why this exists: a silent regression in 2026-05 caused 100% of live Tier1
// PvE moves to fall back to builtin-random-legal. Games kept completing, so
// nothing surfaced — except a fallback rate that should be ~0 but was 1.0.
// Watch the `engine_fallback_rate` and page when it's not near zero for any
// engine that's supposed to play.
class EngineCounters {
  totalMoves = 0;
  totalFallbacks = 0;
  private lastEmittedMoves = 0;
  private lastEmittedFallbacks = 0;

  recordMove(fallback: boolean): void {
    this.totalMoves += 1;
    if (fallback) this.totalFallbacks += 1;
  }

  snapshot(): { moves: number; fallbacks: number; movesDelta: number; fallbacksDelta: number; rate: number } {
    const movesDelta = this.totalMoves - this.lastEmittedMoves;
    const fallbacksDelta = this.totalFallbacks - this.lastEmittedFallbacks;
    this.lastEmittedMoves = this.totalMoves;
    this.lastEmittedFallbacks = this.totalFallbacks;
    const rate = movesDelta > 0 ? fallbacksDelta / movesDelta : 0;
    return { moves: this.totalMoves, fallbacks: this.totalFallbacks, movesDelta, fallbacksDelta, rate };
  }
}

export const engineCounters = new EngineCounters();

export function startObservability(sources: ObsSources, intervalMs = 5_000): () => void {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  let lastTickAt = Date.now();

  const timer = setInterval(() => {
    const now = Date.now();
    const tickMs = now - lastTickAt;
    lastTickAt = now;
    const mem = process.memoryUsage();
    const engine = engineCounters.snapshot();
    logger.info(
      {
        kind: 'metrics',
        rooms: sources.roomCount(),
        ws_clients: sources.wsClientCount(),
        loop_lag_p50_ms: nsToMs(histogram.percentile(50)),
        loop_lag_p99_ms: nsToMs(histogram.percentile(99)),
        loop_lag_max_ms: nsToMs(histogram.max),
        heap_used_mb: Math.round(mem.heapUsed / (1024 * 1024)),
        rss_mb: Math.round(mem.rss / (1024 * 1024)),
        tick_ms: tickMs,
        engine_moves_total: engine.moves,
        engine_fallbacks_total: engine.fallbacks,
        engine_moves_tick: engine.movesDelta,
        engine_fallbacks_tick: engine.fallbacksDelta,
        engine_fallback_rate: Number(engine.rate.toFixed(4)),
      },
      'metrics',
    );
    histogram.reset();
  }, intervalMs);
  timer.unref();

  return () => {
    clearInterval(timer);
    histogram.disable();
  };
}

function nsToMs(ns: number): number {
  return Math.round(ns / 1e4) / 100;
}
