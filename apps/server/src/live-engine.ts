import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Move } from '@bichess/game';
import {
  defaultEngineId,
  loadEngine,
  type EngineDefinition,
  type EngineMoveContext,
  type EngineMoveDecision,
} from './engine-registry.js';

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

export async function chooseLiveEngineMove({
  context,
  engine,
  onFallback,
  timeoutMs = DEFAULT_LIVE_ENGINE_TIMEOUT_MS,
}: ChooseLiveEngineMoveOptions): Promise<LiveEngineMoveResult> {
  const startedAt = Date.now();
  try {
    const decision = await chooseWithTimeout(engine, context, engine.livePolicy?.timeoutMs ?? timeoutMs);
    validateDecision(engine.id, decision, context.legalMoves);
    return { decision, engineId: engine.id, fallback: false };
  } catch (err) {
    const reason = fallbackReason(err);
    const diagnostics = fallbackDiagnostics(err);
    const fallbackEngineId = engine.livePolicy?.fallbackEngineId === undefined
      ? defaultEngineId()
      : engine.livePolicy.fallbackEngineId;
    if (!fallbackEngineId || fallbackEngineId === engine.id) throw err;

    const fallbackEngine = loadEngine(fallbackEngineId);
    const decision = await chooseWithTimeout(fallbackEngine, context, fallbackEngine.livePolicy?.timeoutMs ?? timeoutMs);
    validateDecision(fallbackEngine.id, decision, context.legalMoves);
    onFallback?.({
      durationMs: Date.now() - startedAt,
      engineId: engine.id,
      fallbackEngineId,
      ply: context.ply,
      reason,
      ...(diagnostics ? { diagnostics } : {}),
      ...(err instanceof LiveEngineError && err.timeoutMs !== undefined ? { timeoutMs: err.timeoutMs } : {}),
    });
    return { decision, engineId: fallbackEngineId, fallback: true };
  }
}

async function chooseWithTimeout(
  engine: EngineDefinition,
  context: EngineMoveContext,
  timeoutMs: number,
): Promise<EngineMoveDecision> {
  if (engine.config.kind === 'python-subprocess') return choosePythonSubprocessMove(engine, context, timeoutMs);
  if (!engine.chooseMove) throw new LiveEngineError('unsupported_engine', `engine ${engine.id} does not support live move selection`);
  if (timeoutMs <= 0) return Promise.resolve().then(() => engine.chooseMove!(context));

  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve().then(() => engine.chooseMove!(context)),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new LiveEngineError('timeout', `engine ${engine.id} timed out after ${timeoutMs}ms`, { timeoutMs }));
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
    throw new LiveEngineError('unsupported_engine', `engine ${engine.id} requires live room events`);
  }
  const result = await runPythonLiveMoveProcess({
    color: context.color,
    engine: { id: engine.id },
    events: context.events,
    roomId: context.roomId,
    seed: context.seed.toString(),
  }, timeoutMs);
  return {
    move: result.move,
    scores: [{
      move: result.move,
      score: 0,
      reason: 'python-subprocess',
    }],
  };
}

type PythonLiveMoveRequest = {
  color: string;
  engine: { id: string };
  events: unknown[];
  roomId: string;
  seed: string;
};

type PythonLiveMoveResult = {
  move: Move;
};

async function runPythonLiveMoveProcess(
  request: PythonLiveMoveRequest,
  timeoutMs: number,
): Promise<PythonLiveMoveResult> {
  const python = process.env.PYTHON_ENGINE_PYTHON ?? defaultPythonEngineBinary();
  const script = process.env.PYTHON_ENGINE_LIVE_RUNNER
    ?? resolve(REPO_ROOT, 'research', 'python-fow-lab', 'scripts', 'live_move_runner.py');
  const stockfishPath = process.env.PYTHON_ENGINE_STOCKFISH_PATH ?? process.env.STOCKFISH_PATH ?? defaultStockfishPath();
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
      reject(new LiveEngineError(
        'timeout',
        `python engine ${request.engine.id} timed out after ${timeoutMs}ms`,
        {
          timeoutMs,
          diagnostics: pythonProcessDiagnostics(stdout, stderr, codeLabel(child.pid)),
        },
      ));
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
        reject(new LiveEngineError(
          'internal_error',
          `python engine runner exited ${code}: ${stderrText || stdoutText}`,
          { diagnostics: pythonProcessDiagnostics(stdout, stderr, codeLabel(child.pid)) },
        ));
        return;
      }
      try {
        resolvePromise(parsePythonLiveMoveResult(JSON.parse(stdoutText)));
      } catch (err) {
        reject(new LiveEngineError(
          'invalid_json',
          `invalid python engine runner output: ${(err as Error).message}`,
          { diagnostics: pythonProcessDiagnostics(stdout, stderr, codeLabel(child.pid)) },
        ));
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
  for (const candidate of ['/usr/games/stockfish', '/usr/bin/stockfish', '/opt/homebrew/bin/stockfish']) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function parsePythonLiveMoveResult(value: unknown): PythonLiveMoveResult {
  if (!isObject(value)) throw new Error('top-level response is not an object');
  const move = value.move;
  if (!isObject(move)) throw new Error('missing move');
  if (typeof move.from !== 'string' || typeof move.to !== 'string') throw new Error('invalid move squares');
  return {
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

function validateDecision(engineId: string, decision: EngineMoveDecision, legalMoves: Move[]): void {
  if (!legalMoves.some((move) => movesMatch(move, decision.move))) {
    throw new LiveEngineError('illegal_move', `engine ${engineId} returned an illegal move`);
  }
}

function movesMatch(left: Move, right: Move): boolean {
  return left.from === right.from
    && left.to === right.to
    && (left.promotion ?? null) === (right.promotion ?? null);
}

function fallbackReason(err: unknown): LiveEngineFallbackReason {
  return err instanceof LiveEngineError ? err.reason : 'internal_error';
}

function fallbackDiagnostics(err: unknown): Record<string, unknown> | undefined {
  return err instanceof LiveEngineError ? err.diagnostics : undefined;
}

function pythonProcessDiagnostics(stdout: Buffer[], stderr: Buffer[], processLabel: string): Record<string, unknown> {
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
