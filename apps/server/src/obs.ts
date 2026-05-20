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

export function startObservability(sources: ObsSources, intervalMs = 5_000): () => void {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  let lastTickAt = Date.now();

  const timer = setInterval(() => {
    const now = Date.now();
    const tickMs = now - lastTickAt;
    lastTickAt = now;
    const mem = process.memoryUsage();
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
