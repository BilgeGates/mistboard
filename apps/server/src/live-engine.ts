import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clockRemainingMs, type Move } from '@mistboard/game';
import { buildEngineTurnRequest } from './engine-protocol/build.js';
import {
  defaultEngineId,
  type EngineDefinition,
  type EngineMoveContext,
  type EngineMoveDecision,
  loadEngine,
} from './engine-registry.js';
import { getPythonPool } from './python-pool.js';

/**
 * Per-engine secret used to derive deterministic per-turn engineSeed.
 * In production set MISTBOARD_ENGINE_SECRET so the same game produces
 * the same engine play across restarts. In dev a fixed fallback keeps
 * play deterministic across local sessions.
 *
 * This secret never leaves the server — engines receive only the
 * derived engineSeed.
 */
const ENGINE_SECRET =
  process.env.MISTBOARD_ENGINE_SECRET ?? 'mistboard-dev-engine-secret';

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
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIAGNOSTIC_TAIL_BYTES = 4_000;
const PYTHON_LIVE_PROCESS_OVERHEAD_MS = 2_500;
const PYTHON_LIVE_CLOCK_GRACE_MS = 1_000;
const PYTHON_LIVE_BUDGET_SAFETY_MS = 200;
const DEFAULT_PYTHON_LIVE_MAX_TIMEOUT_MS = 15_000;
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
        ? defaultEngineId()
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
  const watchdogTimeoutMs = pythonLiveWatchdogTimeoutMs(context, timeoutMs);

  // Build the redacted EngineTurnRequest alongside the legacy `events`
  // payload. Phase 3a: both shipped to the Python worker; worker still
  // consumes `events`. Phase 3b: worker consumes `engineTurnRequest`;
  // `events` dropped from this payload. The transition lets us observe
  // real-world protocol payloads without a flag-day swap of the worker.
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

  const payload = {
    ...liveClockFields(context),
    color: context.color,
    engine: { id: engine.id },
    events: context.events,
    engineTurnRequest,
    roomId: context.roomId,
    seed: context.seed.toString(),
    watchdogTimeoutMs,
  };

  // Try the persistent pool first; if it's disabled (env-gated) or fails
  // to initialize, fall through to the original subprocess-per-move path.
  // That fallback preserves correctness while we roll out the pool.
  const pool = await getPythonPool(engine.id).catch(() => null);
  if (pool) {
    const response = await pool.chooseMove(payload, watchdogTimeoutMs);
    return {
      move: response.move as PythonLiveMoveResult['move'],
      scores: [
        {
          move: response.move as PythonLiveMoveResult['move'],
          score: 0,
          reason: response.decisionSource
            ? `python-pool:${response.decisionSource}`
            : 'python-pool',
        },
      ],
    };
  }

  const result = await runPythonLiveMoveProcess(payload, watchdogTimeoutMs);
  return {
    move: result.move,
    scores: [
      {
        move: result.move,
        score: 0,
        reason: result.decisionSource
          ? `python-subprocess:${result.decisionSource}`
          : 'python-subprocess',
      },
    ],
  };
}

export function pythonLiveWatchdogTimeoutMs(
  context: EngineMoveContext,
  configuredTimeoutMs: number,
): number {
  const remainingMs = liveClockRemainingMs(context);
  if (remainingMs === undefined) return configuredTimeoutMs;

  const usableClockMs = Math.max(0, remainingMs - PYTHON_LIVE_BUDGET_SAFETY_MS);
  const budgetMs = Math.min(
    usableClockMs > 0 ? usableClockMs : 50,
    computePythonPerMoveBudgetMs(usableClockMs, liveIncrementMs(context)),
  );
  const dynamicTimeoutMs = Math.ceil(budgetMs + PYTHON_LIVE_PROCESS_OVERHEAD_MS);
  const clockBoundMs = Math.ceil(Math.max(0, remainingMs) + PYTHON_LIVE_CLOCK_GRACE_MS);
  return Math.max(1, Math.min(pythonLiveMaxTimeoutMs(), dynamicTimeoutMs, clockBoundMs));
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

type PythonLiveMoveRequest = {
  clockRemainingMs?: number;
  color: string;
  engine: { id: string };
  events: unknown[];
  incrementMs?: number;
  roomId: string;
  seed: string;
  watchdogTimeoutMs: number;
};

type PythonLiveMoveResult = {
  decisionSource?: string;
  move: Move;
};

async function runPythonLiveMoveProcess(
  request: PythonLiveMoveRequest,
  timeoutMs: number,
): Promise<PythonLiveMoveResult> {
  const python = process.env.PYTHON_ENGINE_PYTHON ?? defaultPythonEngineBinary();
  const script =
    process.env.PYTHON_ENGINE_LIVE_RUNNER ??
    resolve(REPO_ROOT, 'research', 'python-fow-lab', 'scripts', 'live_move_runner.py');
  const stockfishPath =
    process.env.PYTHON_ENGINE_STOCKFISH_PATH ??
    process.env.STOCKFISH_PATH ??
    defaultStockfishPath();
  const payload = stockfishPath ? { ...request, stockfishPath } : request;

  return new Promise((resolvePromise, reject) => {
    const child = spawn(python, [script], {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(
        new LiveEngineError(
          'timeout',
          `python engine ${request.engine.id} timed out after ${timeoutMs}ms`,
          {
            timeoutMs,
            diagnostics: pythonProcessDiagnostics(stdout, stderr, codeLabel(child.pid)),
          },
        ),
      );
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const stderrText = Buffer.concat(stderr).toString('utf8').trim();
      const stdoutText = Buffer.concat(stdout).toString('utf8').trim();
      if (code !== 0) {
        reject(
          new LiveEngineError(
            'internal_error',
            `python engine runner exited ${code}: ${stderrText || stdoutText}`,
            { diagnostics: pythonProcessDiagnostics(stdout, stderr, codeLabel(child.pid)) },
          ),
        );
        return;
      }
      try {
        resolvePromise(parsePythonLiveMoveResult(JSON.parse(stdoutText)));
      } catch (err) {
        reject(
          new LiveEngineError(
            'invalid_json',
            `invalid python engine runner output: ${(err as Error).message}`,
            { diagnostics: pythonProcessDiagnostics(stdout, stderr, codeLabel(child.pid)) },
          ),
        );
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

function defaultPythonEngineBinary(): string {
  const venvPython = resolve(REPO_ROOT, 'research', 'python-fow-lab', '.venv', 'bin', 'python');
  return existsSync(venvPython) ? venvPython : 'python3';
}

function defaultStockfishPath(): string | undefined {
  for (const candidate of [
    '/usr/games/stockfish',
    '/usr/bin/stockfish',
    '/opt/homebrew/bin/stockfish',
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function liveClockFields(
  context: EngineMoveContext,
): Pick<PythonLiveMoveRequest, 'clockRemainingMs' | 'incrementMs'> {
  const clock = context.state.clock;
  if (context.clockRemainingMs !== undefined || context.incrementMs !== undefined) {
    return {
      ...(context.clockRemainingMs !== undefined
        ? { clockRemainingMs: context.clockRemainingMs }
        : {}),
      ...(context.incrementMs !== undefined ? { incrementMs: context.incrementMs } : {}),
    };
  }
  if (!clock) return {};
  return {
    clockRemainingMs: clockRemainingMs(clock, context.color, Date.now()),
    incrementMs: clock.incrementMs,
  };
}

function parsePythonLiveMoveResult(value: unknown): PythonLiveMoveResult {
  if (!isObject(value)) throw new Error('top-level response is not an object');
  const move = value.move;
  if (!isObject(move)) throw new Error('missing move');
  if (typeof move.from !== 'string' || typeof move.to !== 'string')
    throw new Error('invalid move squares');
  return {
    ...(typeof value.decisionSource === 'string' ? { decisionSource: value.decisionSource } : {}),
    move: {
      from: move.from,
      to: move.to,
      ...(typeof move.promotion === 'string' ? { promotion: move.promotion } : {}),
    } as Move,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

function pythonProcessDiagnostics(
  stdout: Buffer[],
  stderr: Buffer[],
  processLabel: string,
): Record<string, unknown> {
  return {
    process: processLabel,
    stderrTail: bufferTail(stderr, DIAGNOSTIC_TAIL_BYTES),
    stdoutTail: bufferTail(stdout, DIAGNOSTIC_TAIL_BYTES),
  };
}

function bufferTail(chunks: Buffer[], maxBytes: number): string {
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (text.length <= maxBytes) return text;
  return text.slice(-maxBytes);
}

function codeLabel(pid: number | undefined): string {
  return pid === undefined ? 'python-live-runner' : `python-live-runner:${pid}`;
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
