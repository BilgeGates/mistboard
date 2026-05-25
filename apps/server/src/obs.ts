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

import { monitorEventLoopDelay } from 'node:perf_hooks';
import pino, { type Logger } from 'pino';

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

  snapshot(): {
    moves: number;
    fallbacks: number;
    movesDelta: number;
    fallbacksDelta: number;
    rate: number;
  } {
    const movesDelta = this.totalMoves - this.lastEmittedMoves;
    const fallbacksDelta = this.totalFallbacks - this.lastEmittedFallbacks;
    this.lastEmittedMoves = this.totalMoves;
    this.lastEmittedFallbacks = this.totalFallbacks;
    const rate = movesDelta > 0 ? fallbacksDelta / movesDelta : 0;
    return {
      moves: this.totalMoves,
      fallbacks: this.totalFallbacks,
      movesDelta,
      fallbacksDelta,
      rate,
    };
  }
}

export const engineCounters = new EngineCounters();

// Wire-format counters for the snapshot→delta protocol. Watching:
// - `snapshot_requests`: rate of clients asking for a fresh snapshot.
//   Should be near-zero in steady state. A sustained nonzero rate
//   indicates a gap-detection loop on some client (seq skip → request →
//   reconcile → next event also skipped → repeat). Added 2026-05-22 as
//   the readback signal for the snapshot→delta migration (Phase 3).
// - `unknown_messages`: rate of WS frames with no matching handler.
// - `parse_failures`: rate of WS frames that failed JSON.parse or
//   shape validation.
class WsCounters {
  totalSnapshotRequests = 0;
  totalUnknownMessages = 0;
  totalParseFailures = 0;
  private latencyByRegion = new Map<string, number[]>();
  private lastEmittedSnapshotRequests = 0;
  private lastEmittedUnknownMessages = 0;
  private lastEmittedParseFailures = 0;

  recordSnapshotRequest(): void {
    this.totalSnapshotRequests += 1;
  }
  recordUnknownMessage(): void {
    this.totalUnknownMessages += 1;
  }
  recordParseFailure(): void {
    this.totalParseFailures += 1;
  }
  recordLatencySample(region: string, rttMs: number): void {
    const normalizedRegion = normalizeRegion(region);
    const samples = this.latencyByRegion.get(normalizedRegion) ?? [];
    samples.push(rttMs);
    this.latencyByRegion.set(normalizedRegion, samples);
  }

  snapshot(): {
    snapshotRequests: number;
    unknownMessages: number;
    parseFailures: number;
    snapshotRequestsDelta: number;
    unknownMessagesDelta: number;
    parseFailuresDelta: number;
    latencySamples: number;
    latencyP50: number | null;
    latencyP95: number | null;
    latencyMax: number | null;
    latencyByRegion: Record<string, { samples: number; p50: number; p95: number; max: number }>;
  } {
    const snapshotRequestsDelta = this.totalSnapshotRequests - this.lastEmittedSnapshotRequests;
    const unknownMessagesDelta = this.totalUnknownMessages - this.lastEmittedUnknownMessages;
    const parseFailuresDelta = this.totalParseFailures - this.lastEmittedParseFailures;
    this.lastEmittedSnapshotRequests = this.totalSnapshotRequests;
    this.lastEmittedUnknownMessages = this.totalUnknownMessages;
    this.lastEmittedParseFailures = this.totalParseFailures;
    const allLatency: number[] = [];
    const latencyByRegion: Record<
      string,
      { samples: number; p50: number; p95: number; max: number }
    > = {};
    for (const [region, samples] of this.latencyByRegion) {
      allLatency.push(...samples);
      latencyByRegion[region] = latencyStats(samples);
    }
    this.latencyByRegion.clear();
    const globalLatency = allLatency.length > 0 ? latencyStats(allLatency) : null;
    return {
      snapshotRequests: this.totalSnapshotRequests,
      unknownMessages: this.totalUnknownMessages,
      parseFailures: this.totalParseFailures,
      snapshotRequestsDelta,
      unknownMessagesDelta,
      parseFailuresDelta,
      latencySamples: allLatency.length,
      latencyP50: globalLatency?.p50 ?? null,
      latencyP95: globalLatency?.p95 ?? null,
      latencyMax: globalLatency?.max ?? null,
      latencyByRegion,
    };
  }
}

export const wsCounters = new WsCounters();

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
    const ws = wsCounters.snapshot();
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
        ws_snapshot_requests_total: ws.snapshotRequests,
        ws_snapshot_requests_tick: ws.snapshotRequestsDelta,
        ws_unknown_messages_total: ws.unknownMessages,
        ws_unknown_messages_tick: ws.unknownMessagesDelta,
        ws_parse_failures_total: ws.parseFailures,
        ws_parse_failures_tick: ws.parseFailuresDelta,
        ws_latency_samples_tick: ws.latencySamples,
        ws_latency_p50_ms: ws.latencyP50,
        ws_latency_p95_ms: ws.latencyP95,
        ws_latency_max_ms: ws.latencyMax,
        ws_latency_by_region: ws.latencyByRegion,
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

function latencyStats(samples: number[]): {
  samples: number;
  p50: number;
  p95: number;
  max: number;
} {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    samples: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[index]!;
}

function normalizeRegion(region: string): string {
  return /^[a-z0-9-]{1,32}$/.test(region) ? region : 'global';
}
