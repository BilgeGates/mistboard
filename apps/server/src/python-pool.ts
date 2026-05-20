// Persistent Python worker pool for live engine moves.
//
// Each PoolWorker holds one long-lived Python interpreter open with
// research/python-fow-lab/scripts/live_move_worker.py. The expensive part of
// engine play (importing torch, loading Tier-1 weights, building the
// evaluator) happens once per worker at boot, not once per move. Subsequent
// requests pay only `strategy.reset() + observe(events) + pick_move()`.
//
// Activation: env var MISTBOARD_PYTHON_POOL_SIZE = N (per engine_id).
// With the var unset or <=0, this module returns null from getPythonPool()
// and live-engine.ts falls back to its existing subprocess-per-move path.
// That's the rollout knob — flip it on after the loadtest baseline confirms
// the win.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './obs.js';

export interface PythonPoolOptions {
  engineId: string;
  size: number;
  pythonBin: string;
  scriptPath: string;
  cwd: string;
  workerSeed: number;
  stockfishPath?: string;
  /** Seconds to wait for a worker's `ready` line. */
  readyTimeoutMs: number;
}

export interface PythonPoolResponse {
  decisionSource?: string;
  move: { from: string; to: string; promotion?: string };
  engine: { id: string };
  roomId: string;
}

interface PendingRequest {
  requestId: string;
  payload: Record<string, unknown>;
  timeoutMs: number;
  resolve: (response: PythonPoolResponse) => void;
  reject: (err: Error) => void;
  timeoutHandle: NodeJS.Timeout | null;
}

class PoolWorker {
  private process: ChildProcessWithoutNullStreams | null = null;
  private ready = false;
  private current: PendingRequest | null = null;
  private buf = '';
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((err: Error) => void) | null = null;

  constructor(
    public readonly index: number,
    private readonly opts: PythonPoolOptions,
    private readonly onIdle: () => void,
  ) {}

  isReady(): boolean {
    return this.ready && this.current === null && this.process !== null && !this.process.killed;
  }

  async start(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = new Promise<void>((resolveReady, rejectReady) => {
      this.readyResolve = resolveReady;
      this.readyReject = rejectReady;
    });

    const args = [
      this.opts.scriptPath,
      '--engine-id',
      this.opts.engineId,
      '--seed',
      String((this.opts.workerSeed + this.index) >>> 0),
    ];
    if (this.opts.stockfishPath) args.push('--stockfish', this.opts.stockfishPath);

    const child = spawn(this.opts.pythonBin, args, {
      cwd: this.opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.process = child;

    child.stdout.on('data', (chunk: Buffer) => this.handleChunk(chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8').trim();
      if (!text) return;
      // Worker emits structured debug lines on stderr; surface only if not JSON debug noise.
      if (text.startsWith('{') && text.includes('python_live_engine_debug')) return;
      logger.warn({ kind: 'python_pool_stderr', worker_idx: this.index, engine_id: this.opts.engineId, text }, 'worker stderr');
    });
    child.on('error', (err) => {
      logger.error({ kind: 'python_pool_error', worker_idx: this.index, error: err.message }, 'worker error');
      this.fail(err);
    });
    child.on('close', (code) => {
      this.ready = false;
      const err = new Error(`worker ${this.index} exited code=${code ?? 'null'}`);
      this.fail(err);
    });

    const readyDeadline = setTimeout(() => {
      this.fail(new Error(`worker ${this.index} ready timeout ${this.opts.readyTimeoutMs}ms`));
    }, this.opts.readyTimeoutMs);
    try {
      await this.readyPromise;
    } finally {
      clearTimeout(readyDeadline);
    }
  }

  private handleChunk(chunk: string): void {
    this.buf += chunk;
    while (true) {
      const newlineIdx = this.buf.indexOf('\n');
      if (newlineIdx < 0) break;
      const line = this.buf.slice(0, newlineIdx).trim();
      this.buf = this.buf.slice(newlineIdx + 1);
      if (line) this.handleLine(line);
    }
  }

  private handleLine(line: string): void {
    let msg: { kind?: string; requestId?: string; ok?: boolean; response?: PythonPoolResponse; error?: string; engineId?: string };
    try {
      msg = JSON.parse(line);
    } catch {
      logger.warn({ kind: 'python_pool_parse_error', worker_idx: this.index, line: line.slice(0, 200) }, 'unparseable line');
      return;
    }

    if (msg.kind === 'ready') {
      this.ready = true;
      this.readyResolve?.();
      this.readyResolve = null;
      this.readyReject = null;
      return;
    }
    if (msg.kind === 'ready_error') {
      this.fail(new Error(`worker ${this.index} init failed: ${msg.error ?? 'unknown'}`));
      return;
    }

    if (!this.current) {
      logger.warn({ kind: 'python_pool_orphan_response', worker_idx: this.index, request_id: msg.requestId }, 'orphan response');
      return;
    }
    if (msg.requestId !== this.current.requestId) {
      logger.warn(
        { kind: 'python_pool_mismatched_response', worker_idx: this.index, expected: this.current.requestId, got: msg.requestId },
        'mismatched response',
      );
      return;
    }

    if (msg.ok && msg.response) {
      this.current.resolve(msg.response);
    } else {
      this.current.reject(new Error(msg.error ?? 'worker returned !ok'));
    }
    this.completeRequest();
  }

  private completeRequest(): void {
    if (this.current?.timeoutHandle) clearTimeout(this.current.timeoutHandle);
    this.current = null;
    this.onIdle();
  }

  private fail(err: Error): void {
    if (this.readyReject) {
      this.readyReject(err);
      this.readyResolve = null;
      this.readyReject = null;
    }
    if (this.current) {
      const req = this.current;
      this.current = null;
      req.reject(err);
      if (req.timeoutHandle) clearTimeout(req.timeoutHandle);
    }
    this.ready = false;
    if (this.process && !this.process.killed) {
      try {
        this.process.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }
  }

  dispatch(req: PendingRequest): void {
    this.current = req;
    req.timeoutHandle = setTimeout(() => {
      if (this.current !== req) return;
      this.fail(new Error(`pool request timeout ${req.timeoutMs}ms`));
    }, req.timeoutMs);
    const line = JSON.stringify({ ...req.payload, requestId: req.requestId }) + '\n';
    this.process!.stdin.write(line, (err) => {
      if (err) this.fail(err);
    });
  }

  dispose(): void {
    if (!this.process) return;
    try {
      this.process.stdin.end();
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      if (this.process && !this.process.killed) this.process.kill('SIGKILL');
    }, 1_000).unref();
  }
}

export class PythonPool {
  private workers: PoolWorker[] = [];
  private queue: PendingRequest[] = [];

  constructor(private readonly opts: PythonPoolOptions) {}

  async start(): Promise<void> {
    const workers = Array.from({ length: this.opts.size }, (_, i) => new PoolWorker(i, this.opts, () => this.tryDispatch()));
    this.workers = workers;
    const results = await Promise.allSettled(workers.map((w) => w.start()));
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length === workers.length) {
      throw new Error(`all ${workers.length} python pool workers failed to start: ${(failures[0] as PromiseRejectedResult).reason}`);
    }
    logger.info(
      {
        kind: 'python_pool_ready',
        engine_id: this.opts.engineId,
        size: this.opts.size,
        failed: failures.length,
      },
      'python pool ready',
    );
  }

  chooseMove(payload: Record<string, unknown>, timeoutMs: number): Promise<PythonPoolResponse> {
    return new Promise<PythonPoolResponse>((resolvePromise, rejectPromise) => {
      const req: PendingRequest = {
        requestId: randomUUID(),
        payload,
        timeoutMs,
        resolve: resolvePromise,
        reject: rejectPromise,
        timeoutHandle: null,
      };
      this.queue.push(req);
      this.tryDispatch();
    });
  }

  private tryDispatch(): void {
    while (this.queue.length > 0) {
      const worker = this.workers.find((w) => w.isReady());
      if (!worker) break;
      const req = this.queue.shift()!;
      worker.dispatch(req);
    }
  }

  dispose(): void {
    for (const req of this.queue) req.reject(new Error('pool disposed'));
    this.queue = [];
    for (const w of this.workers) w.dispose();
  }
}

// Lazy-initialized singleton per engine_id. First chooseMove blocks on pool
// boot; subsequent ones reuse warm workers.
const POOLS: Map<string, Promise<PythonPool>> = new Map();

/**
 * Returns a PythonPool for `engineId`, or null if pooling is disabled.
 * Pooling activates when MISTBOARD_PYTHON_POOL_SIZE is set to a positive
 * integer. The same size is applied per engine_id (so two engines = 2N
 * total workers).
 */
export async function getPythonPool(engineId: string): Promise<PythonPool | null> {
  const sizeRaw = process.env.MISTBOARD_PYTHON_POOL_SIZE;
  if (!sizeRaw) return null;
  const size = Number.parseInt(sizeRaw, 10);
  if (!Number.isFinite(size) || size <= 0) return null;

  const existing = POOLS.get(engineId);
  if (existing) return existing;

  const promise = (async () => {
    const repoRoot = defaultRepoRoot();
    const opts: PythonPoolOptions = {
      engineId,
      size,
      pythonBin: process.env.PYTHON_ENGINE_PYTHON ?? defaultPythonBin(repoRoot),
      scriptPath:
        process.env.PYTHON_ENGINE_LIVE_WORKER
        ?? resolve(repoRoot, 'research', 'python-fow-lab', 'scripts', 'live_move_worker.py'),
      cwd: repoRoot,
      workerSeed: Date.now(),
      stockfishPath: process.env.PYTHON_ENGINE_STOCKFISH_PATH ?? process.env.STOCKFISH_PATH ?? defaultStockfishPath(),
      readyTimeoutMs: Number.parseInt(process.env.MISTBOARD_PYTHON_POOL_READY_TIMEOUT_MS ?? '30000', 10) || 30_000,
    };
    const pool = new PythonPool(opts);
    try {
      await pool.start();
    } catch (err) {
      POOLS.delete(engineId);
      throw err;
    }
    return pool;
  })();
  POOLS.set(engineId, promise);
  return promise;
}

export function disposeAllPythonPools(): void {
  for (const promise of POOLS.values()) {
    promise.then((p) => p.dispose()).catch(() => undefined);
  }
  POOLS.clear();
}

function defaultRepoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

function defaultPythonBin(repoRoot: string): string {
  const venvPython = resolve(repoRoot, 'research', 'python-fow-lab', '.venv', 'bin', 'python');
  return existsSync(venvPython) ? venvPython : 'python3';
}

function defaultStockfishPath(): string | undefined {
  for (const candidate of ['/usr/games/stockfish', '/usr/bin/stockfish', '/opt/homebrew/bin/stockfish']) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}
