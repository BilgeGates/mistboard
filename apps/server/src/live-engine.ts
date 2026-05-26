import { clockRemainingMs, type EngineTurnResponse, type Move } from '@mistboard/game';
import { buildEngineTurnRequest } from './engine-protocol/build.js';
import {
  defaultEngineId,
  type EngineDefinition,
  type EngineMoveContext,
  type EngineMoveDecision,
  loadEngine,
} from './engine-registry.js';
import { InternalEngineClientError, requestInternalEngineTurn } from './internal-engine-client.js';

/**
 * Per-engine secret used to derive deterministic per-turn engineSeed.
 * In production set MISTBOARD_ENGINE_SECRET so the same game produces
 * the same engine play across restarts. In dev a fixed fallback keeps
 * play deterministic across local sessions.
 *
 * This secret never leaves the server — engines receive only the
 * derived engineSeed.
 */
const ENGINE_SECRET = process.env.MISTBOARD_ENGINE_SECRET ?? 'mistboard-dev-engine-secret';

export type LiveEngineFallbackReason =
  | 'timeout'
  | 'unsupported_engine'
  | 'illegal_move'
  | 'invalid_json'
  | 'internal_error';

export type LiveEngineFallbackEvent = {
  diagnostics?: Record<string, unknown>;
  durationMs: number;
  engineId: string;
  fallbackEngineId: string;
  ply: number;
  reason: LiveEngineFallbackReason;
  timeoutMs?: number;
};

export type LiveEngineMoveResult = {
  decision: EngineMoveDecision;
  engineId: string;
  fallback: boolean;
};

type ChooseLiveEngineMoveOptions = {
  context: EngineMoveContext;
  engine: EngineDefinition;
  onFallback?: (event: LiveEngineFallbackEvent) => void;
  timeoutMs?: number;
};

const DEFAULT_LIVE_ENGINE_TIMEOUT_MS = 3_000;
// Padding added to the per-move budget when computing the watchdog timeout.
// Originally sized for subprocess spawn overhead. The engine-worker pool no
// longer spawns per move, but the buffer also covers HTTP, JSON round-trip,
// P-update variance, and gives v0.9.5 enough headroom in late-game positions where
// |P| is large. Bumped again to 10s in 2026-05-25 after production PvE
// reached 14-15s engine replies around ply 40; those should spend clock,
// not trip the service watchdog first.
const PYTHON_LIVE_PROCESS_OVERHEAD_MS = 10_000;
const PYTHON_LIVE_CLOCK_GRACE_MS = 1_000;
const PYTHON_LIVE_BUDGET_SAFETY_MS = 200;
const DEFAULT_PYTHON_LIVE_MAX_TIMEOUT_MS = 30_000;
const DEFAULT_PYTHON_LIVE_MOVES_REMAINING_ESTIMATE = 12;
const DEFAULT_PYTHON_LIVE_SOFT_BUDGET_CAP_MS = 12_000;

export async function chooseLiveEngineMove({
  context,
  engine,
  onFallback,
  timeoutMs = DEFAULT_LIVE_ENGINE_TIMEOUT_MS,
}: ChooseLiveEngineMoveOptions): Promise<LiveEngineMoveResult> {
  const startedAt = Date.now();
  try {
    const decision = await chooseWithTimeout(
      engine,
      context,
      engine.livePolicy?.timeoutMs ?? timeoutMs,
    );
    validateDecision(engine.id, decision, context.legalMoves);
    return { decision, engineId: engine.id, fallback: false };
  } catch (err) {
    const reason = fallbackReason(err);
    const diagnostics = fallbackDiagnostics(err);
    const fallbackEngineId =
      engine.livePolicy?.fallbackEngineId === undefined
        ? defaultFallbackEngineId(engine)
        : engine.livePolicy.fallbackEngineId;
    if (!fallbackEngineId || fallbackEngineId === engine.id) throw err;

    const fallbackEngine = loadEngine(fallbackEngineId);
    const decision = await chooseWithTimeout(
      fallbackEngine,
      context,
      fallbackEngine.livePolicy?.timeoutMs ?? timeoutMs,
    );
    validateDecision(fallbackEngine.id, decision, context.legalMoves);
    onFallback?.({
      durationMs: Date.now() - startedAt,
      engineId: engine.id,
      fallbackEngineId,
      ply: context.ply,
      reason,
      ...(diagnostics ? { diagnostics } : {}),
      ...(err instanceof LiveEngineError && err.timeoutMs !== undefined
        ? { timeoutMs: err.timeoutMs }
        : {}),
    });
    return { decision, engineId: fallbackEngineId, fallback: true };
  }
}

function defaultFallbackEngineId(engine: EngineDefinition): string | null {
  if (engine.config.kind === 'python-subprocess') return null;
  return defaultEngineId();
}

async function chooseWithTimeout(
  engine: EngineDefinition,
  context: EngineMoveContext,
  timeoutMs: number,
): Promise<EngineMoveDecision> {
  if (engine.config.kind === 'python-subprocess')
    return choosePythonSubprocessMove(engine, context, timeoutMs);
  if (!engine.chooseMove)
    throw new LiveEngineError(
      'unsupported_engine',
      `engine ${engine.id} does not support live move selection`,
    );
  if (timeoutMs <= 0) return Promise.resolve().then(() => engine.chooseMove!(context));

  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve().then(() => engine.chooseMove!(context)),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            new LiveEngineError('timeout', `engine ${engine.id} timed out after ${timeoutMs}ms`, {
              timeoutMs,
            }),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function choosePythonSubprocessMove(
  engine: EngineDefinition,
  context: EngineMoveContext,
  timeoutMs: number,
): Promise<EngineMoveDecision> {
  if (!context.events || !context.roomId) {
    throw new LiveEngineError(
      'unsupported_engine',
      `engine ${engine.id} requires live room events`,
    );
  }
  const { computeBudgetMs, watchdogTimeoutMs } = pythonLiveTimeoutBudgetMs(context, timeoutMs);

  // Build the redacted EngineTurnRequest — the sole game-state channel
  // to the engine (Phase 3c). Construction is the security boundary:
  // see apps/server/src/engine-protocol/build.ts for the redaction
  // guarantees, and build.test.ts for the redaction tests.
  const engineTurnRequest = buildEngineTurnRequest({
    gameId: context.roomId,
    engineId: engine.id,
    engineSecret: ENGINE_SECRET,
    engineColor: context.color,
    state: context.state,
    events: context.events,
    ply: context.ply,
    cold: true,
  });

  const result = await requestInternalEngineTurn(
    engineTurnRequest,
    watchdogTimeoutMs,
    context.engineReservationId,
    { computeBudgetMs },
  ).catch((err) => {
    throw liveEngineErrorFromInternalEngine(err, engine.id, watchdogTimeoutMs);
  });
  return {
    move: result.move,
    scores: [
      {
        move: result.move,
        score: 0,
        reason: remoteEngineDecisionReason(result),
      },
    ],
  };
}

export function pythonLiveWatchdogTimeoutMs(
  context: EngineMoveContext,
  configuredTimeoutMs: number,
): number {
  return pythonLiveTimeoutBudgetMs(context, configuredTimeoutMs).watchdogTimeoutMs;
}

export function pythonLiveTimeoutBudgetMs(
  context: EngineMoveContext,
  configuredTimeoutMs: number,
): { computeBudgetMs: number; watchdogTimeoutMs: number } {
  const remainingMs = liveClockRemainingMs(context);
  if (remainingMs === undefined) {
    return { computeBudgetMs: configuredTimeoutMs, watchdogTimeoutMs: configuredTimeoutMs };
  }

  const usableClockMs = Math.max(0, remainingMs - PYTHON_LIVE_BUDGET_SAFETY_MS);
  const computeBudgetMs = Math.min(
    usableClockMs > 0 ? usableClockMs : 50,
    computePythonPerMoveBudgetMs(usableClockMs, liveIncrementMs(context)),
  );
  const dynamicTimeoutMs = Math.ceil(computeBudgetMs + PYTHON_LIVE_PROCESS_OVERHEAD_MS);
  const clockBoundMs = Math.ceil(Math.max(0, remainingMs) + PYTHON_LIVE_CLOCK_GRACE_MS);
  const watchdogTimeoutMs = Math.max(
    1,
    Math.min(pythonLiveMaxTimeoutMs(), dynamicTimeoutMs, clockBoundMs),
  );
  return {
    computeBudgetMs: Math.max(1, Math.min(Math.ceil(computeBudgetMs), watchdogTimeoutMs)),
    watchdogTimeoutMs,
  };
}

function computePythonPerMoveBudgetMs(clockRemainingMs: number, incrementMs: number): number {
  const usable = Math.max(0, clockRemainingMs - PYTHON_LIVE_BUDGET_SAFETY_MS);
  const bankShare = Math.floor(usable / pythonLiveMovesRemainingEstimate());
  const budget = bankShare + Math.max(0, incrementMs);
  return Math.max(50, Math.min(pythonLiveSoftBudgetCapMs(), budget));
}

function pythonLiveMaxTimeoutMs(): number {
  return positiveIntegerEnv('PYTHON_LIVE_MAX_TIMEOUT_MS', DEFAULT_PYTHON_LIVE_MAX_TIMEOUT_MS);
}

function pythonLiveMovesRemainingEstimate(): number {
  return positiveIntegerEnv(
    'PYTHON_LIVE_MOVES_REMAINING_ESTIMATE',
    DEFAULT_PYTHON_LIVE_MOVES_REMAINING_ESTIMATE,
  );
}

function pythonLiveSoftBudgetCapMs(): number {
  return positiveIntegerEnv(
    'PYTHON_LIVE_SOFT_BUDGET_CAP_MS',
    DEFAULT_PYTHON_LIVE_SOFT_BUDGET_CAP_MS,
  );
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function liveClockRemainingMs(context: EngineMoveContext): number | undefined {
  if (context.clockRemainingMs !== undefined) return Math.max(0, context.clockRemainingMs);
  const clock = context.state.clock;
  if (!clock) return undefined;
  return clockRemainingMs(clock, context.color, Date.now());
}

function liveIncrementMs(context: EngineMoveContext): number {
  return Math.max(0, context.incrementMs ?? context.state.clock?.incrementMs ?? 0);
}

function remoteEngineDecisionReason(response: EngineTurnResponse): string {
  const source = response.diagnostics?.decisionSource;
  return typeof source === 'string' ? `engine-worker:${source}` : 'engine-worker-http';
}

function liveEngineErrorFromInternalEngine(
  err: unknown,
  engineId: string,
  watchdogTimeoutMs: number,
): LiveEngineError {
  if (!(err instanceof InternalEngineClientError)) {
    return new LiveEngineError(
      'internal_error',
      `internal engine service request failed for ${engineId}: ${(err as Error).message}`,
    );
  }

  const diagnostics = {
    transport: 'internal-engine-http',
    reason: err.reason,
    ...(err.status !== undefined ? { status: err.status } : {}),
    ...(err.diagnostics ?? {}),
  };
  if (err.reason === 'timeout') {
    return new LiveEngineError('timeout', err.message, {
      timeoutMs: err.timeoutMs ?? watchdogTimeoutMs,
      diagnostics,
    });
  }
  if (err.reason === 'missing_config') {
    return new LiveEngineError('unsupported_engine', err.message, { diagnostics });
  }
  if (err.reason === 'invalid_response') {
    return new LiveEngineError('invalid_json', err.message, { diagnostics });
  }
  return new LiveEngineError('internal_error', err.message, { diagnostics });
}

function validateDecision(
  engineId: string,
  decision: EngineMoveDecision,
  legalMoves: Move[],
): void {
  if (!legalMoves.some((move) => movesMatch(move, decision.move))) {
    throw new LiveEngineError('illegal_move', `engine ${engineId} returned an illegal move`);
  }
}

function movesMatch(left: Move, right: Move): boolean {
  return (
    left.from === right.from &&
    left.to === right.to &&
    (left.promotion ?? null) === (right.promotion ?? null)
  );
}

function fallbackReason(err: unknown): LiveEngineFallbackReason {
  return err instanceof LiveEngineError ? err.reason : 'internal_error';
}

function fallbackDiagnostics(err: unknown): Record<string, unknown> | undefined {
  return err instanceof LiveEngineError ? err.diagnostics : undefined;
}

class LiveEngineError extends Error {
  readonly diagnostics?: Record<string, unknown>;
  readonly timeoutMs?: number;

  constructor(
    readonly reason: LiveEngineFallbackReason,
    message: string,
    options: { diagnostics?: Record<string, unknown>; timeoutMs?: number } = {},
  ) {
    super(message);
    this.diagnostics = options.diagnostics;
    this.timeoutMs = options.timeoutMs;
  }
}
