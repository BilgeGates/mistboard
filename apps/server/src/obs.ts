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
import { sendEngineAlertNotification } from './engine-alert-email.js';

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
export class EngineCounters {
  totalMoves = 0;
  totalFallbacks = 0;
  totalMoveFailures = 0;
  totalReservationFailures = 0;
  totalReservationBusy = 0;
  totalReservationReleaseFailures = 0;
  totalTurnsStarted = 0;
  totalTurnsCompleted = 0;
  totalTurnsFailed = 0;
  totalTurnTimeouts = 0;
  totalTurnDeadlineGuards = 0;
  totalPythonPoolErrors = 0;
  totalPythonPoolTimeouts = 0;
  totalPythonPoolRetries = 0;
  private lastEmittedMoves = 0;
  private lastEmittedFallbacks = 0;
  private lastEmittedMoveFailures = 0;
  private lastEmittedReservationFailures = 0;
  private lastEmittedReservationBusy = 0;
  private lastEmittedReservationReleaseFailures = 0;
  private lastEmittedTurnsStarted = 0;
  private lastEmittedTurnsCompleted = 0;
  private lastEmittedTurnsFailed = 0;
  private lastEmittedTurnTimeouts = 0;
  private lastEmittedTurnDeadlineGuards = 0;
  private lastEmittedPythonPoolErrors = 0;
  private lastEmittedPythonPoolTimeouts = 0;
  private lastEmittedPythonPoolRetries = 0;
  private turnElapsedSamples: number[] = [];
  private turnQueueWaitSamples: number[] = [];

  recordMove(fallback: boolean): void {
    this.totalMoves += 1;
    if (fallback) this.totalFallbacks += 1;
  }

  recordMoveFailure(): void {
    this.totalMoveFailures += 1;
  }

  recordReservationFailure(input: { busy: boolean }): void {
    this.totalReservationFailures += 1;
    if (input.busy) this.totalReservationBusy += 1;
  }

  recordReservationReleaseFailure(): void {
    this.totalReservationReleaseFailures += 1;
  }

  recordTurnStarted(): void {
    this.totalTurnsStarted += 1;
  }

  recordTurnCompleted(input: {
    decisionSource?: string | null;
    elapsedMs: number;
    queueWaitMs: number;
  }): void {
    this.totalTurnsCompleted += 1;
    if (input.decisionSource === 'deadline-guard') this.totalTurnDeadlineGuards += 1;
    this.recordTurnTiming(input);
  }

  recordTurnFailed(input: {
    elapsedMs?: number | null;
    error?: string | null;
    queueWaitMs?: number | null;
  }): void {
    this.totalTurnsFailed += 1;
    if (isTimeoutish(input.error)) this.totalTurnTimeouts += 1;
    this.recordTurnTiming(input);
  }

  recordPythonPoolError(input: { timeout?: boolean } = {}): void {
    this.totalPythonPoolErrors += 1;
    if (input.timeout) this.totalPythonPoolTimeouts += 1;
  }

  // R1-recover: a move failure that we re-dispatched to a healthy worker rather
  // than surfacing as a failed turn. Retry rate ≈ recovery health.
  recordPythonPoolRetry(): void {
    this.totalPythonPoolRetries += 1;
  }

  private recordTurnTiming(input: {
    elapsedMs?: number | null;
    queueWaitMs?: number | null;
  }): void {
    if (typeof input.elapsedMs === 'number' && Number.isFinite(input.elapsedMs)) {
      this.turnElapsedSamples.push(input.elapsedMs);
    }
    if (typeof input.queueWaitMs === 'number' && Number.isFinite(input.queueWaitMs)) {
      this.turnQueueWaitSamples.push(input.queueWaitMs);
    }
  }

  snapshot(): {
    deadlineGuards: number;
    deadlineGuardsDelta: number;
    moves: number;
    fallbacks: number;
    moveFailures: number;
    movesDelta: number;
    fallbacksDelta: number;
    moveFailuresDelta: number;
    pythonPoolErrors: number;
    pythonPoolErrorsDelta: number;
    pythonPoolTimeouts: number;
    pythonPoolTimeoutsDelta: number;
    pythonPoolRetries: number;
    pythonPoolRetriesDelta: number;
    rate: number;
    reservationFailures: number;
    reservationFailuresDelta: number;
    reservationBusy: number;
    reservationBusyDelta: number;
    reservationReleaseFailures: number;
    reservationReleaseFailuresDelta: number;
    turnElapsedMax: number | null;
    turnElapsedP50: number | null;
    turnElapsedP95: number | null;
    turnLatencySamples: number;
    turnQueueWaitMax: number | null;
    turnQueueWaitP50: number | null;
    turnQueueWaitP95: number | null;
    turnTimeouts: number;
    turnTimeoutsDelta: number;
    turnsCompleted: number;
    turnsCompletedDelta: number;
    turnsFailed: number;
    turnsFailedDelta: number;
    turnsStarted: number;
    turnsStartedDelta: number;
  } {
    const movesDelta = this.totalMoves - this.lastEmittedMoves;
    const fallbacksDelta = this.totalFallbacks - this.lastEmittedFallbacks;
    const moveFailuresDelta = this.totalMoveFailures - this.lastEmittedMoveFailures;
    const reservationFailuresDelta =
      this.totalReservationFailures - this.lastEmittedReservationFailures;
    const reservationBusyDelta = this.totalReservationBusy - this.lastEmittedReservationBusy;
    const reservationReleaseFailuresDelta =
      this.totalReservationReleaseFailures - this.lastEmittedReservationReleaseFailures;
    const turnsStartedDelta = this.totalTurnsStarted - this.lastEmittedTurnsStarted;
    const turnsCompletedDelta = this.totalTurnsCompleted - this.lastEmittedTurnsCompleted;
    const turnsFailedDelta = this.totalTurnsFailed - this.lastEmittedTurnsFailed;
    const turnTimeoutsDelta = this.totalTurnTimeouts - this.lastEmittedTurnTimeouts;
    const deadlineGuardsDelta = this.totalTurnDeadlineGuards - this.lastEmittedTurnDeadlineGuards;
    const pythonPoolErrorsDelta = this.totalPythonPoolErrors - this.lastEmittedPythonPoolErrors;
    const pythonPoolTimeoutsDelta =
      this.totalPythonPoolTimeouts - this.lastEmittedPythonPoolTimeouts;
    const pythonPoolRetriesDelta = this.totalPythonPoolRetries - this.lastEmittedPythonPoolRetries;
    this.lastEmittedMoves = this.totalMoves;
    this.lastEmittedFallbacks = this.totalFallbacks;
    this.lastEmittedMoveFailures = this.totalMoveFailures;
    this.lastEmittedReservationFailures = this.totalReservationFailures;
    this.lastEmittedReservationBusy = this.totalReservationBusy;
    this.lastEmittedReservationReleaseFailures = this.totalReservationReleaseFailures;
    this.lastEmittedTurnsStarted = this.totalTurnsStarted;
    this.lastEmittedTurnsCompleted = this.totalTurnsCompleted;
    this.lastEmittedTurnsFailed = this.totalTurnsFailed;
    this.lastEmittedTurnTimeouts = this.totalTurnTimeouts;
    this.lastEmittedTurnDeadlineGuards = this.totalTurnDeadlineGuards;
    this.lastEmittedPythonPoolErrors = this.totalPythonPoolErrors;
    this.lastEmittedPythonPoolTimeouts = this.totalPythonPoolTimeouts;
    this.lastEmittedPythonPoolRetries = this.totalPythonPoolRetries;
    const rate = movesDelta > 0 ? fallbacksDelta / movesDelta : 0;
    const elapsedStats =
      this.turnElapsedSamples.length > 0 ? latencyStats(this.turnElapsedSamples) : null;
    const queueStats =
      this.turnQueueWaitSamples.length > 0 ? latencyStats(this.turnQueueWaitSamples) : null;
    this.turnElapsedSamples = [];
    this.turnQueueWaitSamples = [];
    return {
      deadlineGuards: this.totalTurnDeadlineGuards,
      deadlineGuardsDelta,
      moves: this.totalMoves,
      fallbacks: this.totalFallbacks,
      moveFailures: this.totalMoveFailures,
      movesDelta,
      fallbacksDelta,
      moveFailuresDelta,
      pythonPoolErrors: this.totalPythonPoolErrors,
      pythonPoolErrorsDelta,
      pythonPoolTimeouts: this.totalPythonPoolTimeouts,
      pythonPoolTimeoutsDelta,
      pythonPoolRetries: this.totalPythonPoolRetries,
      pythonPoolRetriesDelta,
      rate,
      reservationFailures: this.totalReservationFailures,
      reservationFailuresDelta,
      reservationBusy: this.totalReservationBusy,
      reservationBusyDelta,
      reservationReleaseFailures: this.totalReservationReleaseFailures,
      reservationReleaseFailuresDelta,
      turnElapsedMax: elapsedStats?.max ?? null,
      turnElapsedP50: elapsedStats?.p50 ?? null,
      turnElapsedP95: elapsedStats?.p95 ?? null,
      turnLatencySamples: elapsedStats?.samples ?? 0,
      turnQueueWaitMax: queueStats?.max ?? null,
      turnQueueWaitP50: queueStats?.p50 ?? null,
      turnQueueWaitP95: queueStats?.p95 ?? null,
      turnTimeouts: this.totalTurnTimeouts,
      turnTimeoutsDelta,
      turnsCompleted: this.totalTurnsCompleted,
      turnsCompletedDelta,
      turnsFailed: this.totalTurnsFailed,
      turnsFailedDelta,
      turnsStarted: this.totalTurnsStarted,
      turnsStartedDelta,
    };
  }
}

function isTimeoutish(error: string | null | undefined): boolean {
  if (!error) return false;
  return /\b(timeout|timed out|abort)\b/i.test(error);
}

export const engineCounters = new EngineCounters();

type EngineCounterSnapshot = ReturnType<EngineCounters['snapshot']>;

export type EngineAlertFields = {
  severity: 'critical' | 'warning';
  engine_fallbacks_tick?: number;
  engine_move_failures_tick?: number;
  engine_reservation_busy_tick?: number;
  engine_reservation_errors_tick?: number;
  engine_reservation_release_failures_tick?: number;
  engine_turn_timeouts_tick?: number;
  engine_turns_failed_tick?: number;
  python_pool_errors_tick?: number;
  python_pool_timeouts_tick?: number;
  python_pool_retries_tick?: number;
};

export function engineAlertFields(engine: EngineCounterSnapshot): EngineAlertFields | null {
  const critical: EngineAlertFields = { severity: 'critical' };
  let hasCritical = false;
  const setCritical = (key: keyof Omit<EngineAlertFields, 'severity'>, value: number) => {
    if (value <= 0) return;
    critical[key] = value;
    hasCritical = true;
  };
  const reservationErrorsDelta = Math.max(
    0,
    engine.reservationFailuresDelta - engine.reservationBusyDelta,
  );
  setCritical('engine_fallbacks_tick', engine.fallbacksDelta);
  setCritical('engine_move_failures_tick', engine.moveFailuresDelta);
  setCritical('engine_turns_failed_tick', engine.turnsFailedDelta);
  setCritical('engine_turn_timeouts_tick', engine.turnTimeoutsDelta);
  setCritical('python_pool_errors_tick', engine.pythonPoolErrorsDelta);
  setCritical('python_pool_timeouts_tick', engine.pythonPoolTimeoutsDelta);
  setCritical('engine_reservation_errors_tick', reservationErrorsDelta);
  setCritical('engine_reservation_release_failures_tick', engine.reservationReleaseFailuresDelta);
  if (hasCritical) return critical;

  // Warning-level: no move actually failed this tick, but something is off.
  // - reservation_busy: capacity pressure (seat cap hit).
  // - pool_retries: a worker crashed/errored but R1-recover recovered the move
  //   on a healthy peer. The move succeeded, so it's not critical — but recovery
  //   MASKS worker instability, so surface it (else a crash-looping worker stays
  //   invisible behind successful retries).
  if (engine.reservationBusyDelta > 0 || engine.pythonPoolRetriesDelta > 0) {
    const warning: EngineAlertFields = { severity: 'warning' };
    if (engine.reservationBusyDelta > 0) {
      warning.engine_reservation_busy_tick = engine.reservationBusyDelta;
    }
    if (engine.pythonPoolRetriesDelta > 0) {
      warning.python_pool_retries_tick = engine.pythonPoolRetriesDelta;
    }
    return warning;
  }
  return null;
}

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
    const engineAlert = engineAlertFields(engine);
    if (engineAlert) {
      const logAlert = engineAlert.severity === 'critical' ? logger.error : logger.warn;
      logAlert.call(
        logger,
        {
          kind: 'engine_alert',
          ...engineAlert,
        },
        'engine alert',
      );
      void sendEngineAlertNotification(engineAlert)
        .then((result) => {
          if (result.status === 'sent') {
            logger.info(
              {
                kind: 'engine_alert_email_sent',
                severity: engineAlert.severity,
              },
              'engine alert email sent',
            );
          }
          if (result.status === 'failed') {
            logger.error(
              {
                kind: 'engine_alert_email_failed',
                provider: 'resend',
                severity: engineAlert.severity,
                status: result.statusCode,
                error: result.error,
              },
              'engine alert email failed',
            );
          }
        })
        .catch((err) => {
          logger.error(
            {
              kind: 'engine_alert_email_failed',
              provider: 'resend',
              severity: engineAlert.severity,
              error: (err as Error).message,
            },
            'engine alert email failed',
          );
        });
    }
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
        engine_move_failures_total: engine.moveFailures,
        engine_moves_tick: engine.movesDelta,
        engine_fallbacks_tick: engine.fallbacksDelta,
        engine_move_failures_tick: engine.moveFailuresDelta,
        engine_fallback_rate: Number(engine.rate.toFixed(4)),
        engine_reservation_failures_total: engine.reservationFailures,
        engine_reservation_failures_tick: engine.reservationFailuresDelta,
        engine_reservation_busy_total: engine.reservationBusy,
        engine_reservation_busy_tick: engine.reservationBusyDelta,
        engine_reservation_release_failures_total: engine.reservationReleaseFailures,
        engine_reservation_release_failures_tick: engine.reservationReleaseFailuresDelta,
        engine_turns_started_total: engine.turnsStarted,
        engine_turns_started_tick: engine.turnsStartedDelta,
        engine_turns_completed_total: engine.turnsCompleted,
        engine_turns_completed_tick: engine.turnsCompletedDelta,
        engine_turns_failed_total: engine.turnsFailed,
        engine_turns_failed_tick: engine.turnsFailedDelta,
        engine_turn_timeouts_total: engine.turnTimeouts,
        engine_turn_timeouts_tick: engine.turnTimeoutsDelta,
        engine_turn_deadline_guards_total: engine.deadlineGuards,
        engine_turn_deadline_guards_tick: engine.deadlineGuardsDelta,
        engine_turn_latency_samples_tick: engine.turnLatencySamples,
        engine_turn_elapsed_p50_ms: engine.turnElapsedP50,
        engine_turn_elapsed_p95_ms: engine.turnElapsedP95,
        engine_turn_elapsed_max_ms: engine.turnElapsedMax,
        engine_turn_queue_wait_p50_ms: engine.turnQueueWaitP50,
        engine_turn_queue_wait_p95_ms: engine.turnQueueWaitP95,
        engine_turn_queue_wait_max_ms: engine.turnQueueWaitMax,
        python_pool_errors_total: engine.pythonPoolErrors,
        python_pool_errors_tick: engine.pythonPoolErrorsDelta,
        python_pool_timeouts_total: engine.pythonPoolTimeouts,
        python_pool_timeouts_tick: engine.pythonPoolTimeoutsDelta,
        python_pool_retries_total: engine.pythonPoolRetries,
        python_pool_retries_tick: engine.pythonPoolRetriesDelta,
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
