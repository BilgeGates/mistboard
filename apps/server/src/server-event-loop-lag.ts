import { monitorEventLoopDelay } from 'node:perf_hooks';

// Server-side event-loop lag, surfaced as the "SERVER" value in the account
// dropdown's connection footer. perf_hooks' histogram runs on the C++ side with
// negligible overhead, so we keep one always-on monitor and read its mean since
// the last read. Reading resets the window, so each /api/ping reflects only the
// lag accumulated since the previous ping (recent, not lifetime).
const RESOLUTION_MS = 20;
let monitor: ReturnType<typeof monitorEventLoopDelay> | null = null;

function ensureMonitor(): ReturnType<typeof monitorEventLoopDelay> {
  if (!monitor) {
    monitor = monitorEventLoopDelay({ resolution: RESOLUTION_MS });
    monitor.enable();
  }
  return monitor;
}

// Current event-loop lag in whole milliseconds (mean since the previous read).
// Lazily starts the monitor on first call. The histogram samples on a timer, so
// its mean sits at ~resolution when idle (each sample fires one resolution-tick
// after the last); the real contention signal is the delay *beyond* that floor,
// hence the subtraction. A healthy idle server reports ~0-1ms; it climbs under
// load. (obs.ts reports the raw percentile, which is why that metric reads ~20.)
export function readEventLoopLagMs(): number {
  const m = ensureMonitor();
  // mean is in nanoseconds; NaN before the first sample lands.
  const meanNs = m.mean;
  m.reset();
  if (!Number.isFinite(meanNs)) return 0;
  return Math.max(0, Math.round(meanNs / 1e6) - RESOLUTION_MS);
}
