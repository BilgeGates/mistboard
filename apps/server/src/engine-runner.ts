import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  replayGameEvents,
  variantForId,
  type Color,
  type GameEvent,
  type VariantId,
} from '@bichess/game';
import {
  finishEngineGameTask,
  heartbeatEngineGameTask,
  reconcileExperimentJob,
  type EngineGameTask,
} from './engine-experiments.js';
import {
  loadEngine,
  type EngineDefinition,
  type EngineMoveDecision,
  upsertBuiltinEngineVersions,
} from './engine-registry.js';

const HEARTBEAT_EVERY_PLIES = 8;
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export async function runRandomLegalEngineGame(
  pool: pg.Pool,
  task: EngineGameTask,
): Promise<{ gameId: string; plyCount: number; status: 'completed' | 'aborted' }> {
  if (!task.claimToken) throw new Error(`task ${task.id} has no claim token`);

  const variant = variantFromTask(task);
  const gameId = task.gameId ?? `eve_${task.id}`;
  const startedAt = new Date();
  const whiteEngine = loadEngine(task.whiteEngineId ?? engineIdFromConfig(task.config, 'white_engine_id'));
  const blackEngine = loadEngine(task.blackEngineId ?? engineIdFromConfig(task.config, 'black_engine_id'));
  await upsertBuiltinEngineVersions(pool, [whiteEngine.id, blackEngine.id]);

  if (requiresPythonGameRunner(whiteEngine, blackEngine)) {
    return runPythonSubprocessEngineGame(pool, task, gameId, variant, startedAt, whiteEngine, blackEngine);
  }

  await createRunningGame(pool, task, gameId, variant, startedAt, whiteEngine, blackEngine);

  const events: GameEvent[] = [
    { type: 'room-created', at: startedAt.getTime(), roomId: gameId, variant, offer: [] },
    { type: 'seat-assigned', at: startedAt.getTime(), roomId: gameId, clientId: 'engine:white', seat: 'white' },
    { type: 'seat-assigned', at: startedAt.getTime(), roomId: gameId, clientId: 'engine:black', seat: 'black' },
  ];

  for (let seq = 0; seq < events.length; seq++) {
    await appendEvent(pool, gameId, seq, events[seq]!);
  }

  let projection = replayGameEvents(events);
  let seed = seedFromTask(task);
  const maxPlies = maxPliesFromTask(task);

  while (projection.state.status.type === 'playing') {
    const color = projection.state.status.turn;
    const moves = variantForId(variant).getLegalMoves(projection.state, color);
    if (moves.length === 0) {
      await abortGame(pool, task, gameId, events.length - 3, 'no-legal-moves');
      return { gameId, plyCount: events.length - 3, status: 'aborted' };
    }

    if (events.length - 3 >= maxPlies) {
      await completeTruncatedGame(pool, task, gameId, events.length - 3);
      return { gameId, plyCount: events.length - 3, status: 'completed' };
    }

    const engine = color === 'white' ? whiteEngine : blackEngine;
    if (!engine.chooseMove) throw new Error(`engine ${engine.id} does not support in-process move selection`);
    const decision = engine.chooseMove({
      baseThinkTimeMs: 650,
      state: projection.state,
      color,
      legalMoves: moves,
      seed,
      ply: events.length - 3,
    });
    const move = decision.move;
    seed = nextSeed(seed);
    const previousEventAt = events[events.length - 1]?.at ?? startedAt.getTime();
    const eventAt = previousEventAt + Math.max(1, Math.round(decision.thinkTimeMs ?? 0));
    const event: GameEvent = {
      type: 'move-played',
      at: eventAt,
      roomId: gameId,
      color,
      move,
      ...(decision.thinkTimeMs !== undefined ? { thinkTimeMs: decision.thinkTimeMs } : {}),
    };
    await appendEvent(pool, gameId, events.length, event);
    await recordMoveDecision(pool, task, gameId, events.length - 3, color, engine, decision);
    events.push(event);
    if ((events.length - 3) % HEARTBEAT_EVERY_PLIES === 0) {
      await heartbeatEngineGameTask(pool, task.id, task.claimToken);
    }
    projection = replayGameEvents(events);
  }

  const status = projection.state.status;
  if (status.type !== 'finished') {
    await completeTruncatedGame(pool, task, gameId, events.length - 3);
    return { gameId, plyCount: events.length - 3, status: 'completed' };
  }

  const result = status.winner === 'white' ? 'white-wins'
    : status.winner === 'black' ? 'black-wins'
    : 'draw';
  const termination = status.reason;
  const plyCount = events.filter((event) => event.type === 'move-played').length;

  await pool.query(
    `UPDATE games
     SET status = 'completed',
         result = $2,
         termination = $3,
         ply_count = $4,
         ended_at = $5,
         aborted_reason = NULL
     WHERE room_id = $1`,
    [gameId, result, termination, plyCount, new Date()],
  );
  await finishEngineGameTask(pool, task.id, task.claimToken, 'completed');
  await reconcileExperimentJob(pool, task.jobId);

  return { gameId, plyCount, status: 'completed' };
}

async function runPythonSubprocessEngineGame(
  pool: pg.Pool,
  task: EngineGameTask,
  gameId: string,
  variant: VariantId,
  startedAt: Date,
  whiteEngine: EngineDefinition,
  blackEngine: EngineDefinition,
): Promise<{ gameId: string; plyCount: number; status: 'completed' | 'aborted' }> {
  await createRunningGame(pool, task, gameId, variant, startedAt, whiteEngine, blackEngine);

  const baseEvents: GameEvent[] = [
    { type: 'room-created', at: startedAt.getTime(), roomId: gameId, variant, offer: [] },
    { type: 'seat-assigned', at: startedAt.getTime(), roomId: gameId, clientId: 'engine:white', seat: 'white' },
    { type: 'seat-assigned', at: startedAt.getTime(), roomId: gameId, clientId: 'engine:black', seat: 'black' },
  ];
  for (let seq = 0; seq < baseEvents.length; seq++) {
    await appendEvent(pool, gameId, seq, baseEvents[seq]!);
  }

  const result = await runPythonGameProcess({
    roomId: gameId,
    seed: task.seed,
    maxPlies: maxPliesFromTask(task),
    timeControl: task.timeControl,
    openingPolicy: task.openingPolicy,
    white: { id: whiteEngine.id },
    black: { id: blackEngine.id },
  });

  const moveEvents = sanitizePythonMoveEvents(result.events, gameId, startedAt.getTime());
  for (let index = 0; index < moveEvents.length; index++) {
    await appendEvent(pool, gameId, baseEvents.length + index, moveEvents[index]!);
    if ((index + 1) % HEARTBEAT_EVERY_PLIES === 0) {
      await heartbeatEngineGameTask(pool, task.id, task.claimToken!);
    }
  }

  const projection = replayGameEvents([...baseEvents, ...moveEvents]);
  const plyCount = moveEvents.length;

  const status = projection.state.status;
  const resultLabel = status.type === 'finished'
    ? status.winner === 'white' ? 'white-wins'
      : status.winner === 'black' ? 'black-wins'
        : 'draw'
    : result.winner === 'white' ? 'white-wins'
      : result.winner === 'black' ? 'black-wins'
        : 'draw';
  const termination = result.endReason === 'clock-expired'
    ? 'timeout'
    : result.endReason === 'truncated'
      ? 'truncated'
      : result.endReason === 'no-legal-moves'
        ? 'draw'
      : status.type === 'finished'
        ? status.reason
        : result.endReason;

  await pool.query(
    `UPDATE games
     SET status = 'completed',
         result = $2,
         termination = $3,
         ply_count = $4,
         ended_at = $5,
         aborted_reason = NULL
     WHERE room_id = $1`,
    [gameId, resultLabel, termination, plyCount, new Date()],
  );
  await finishEngineGameTask(pool, task.id, task.claimToken!, 'completed');
  await reconcileExperimentJob(pool, task.jobId);
  await recordPythonGameSummary(pool, task, gameId, result);

  return { gameId, plyCount, status: 'completed' };
}

async function createRunningGame(
  pool: pg.Pool,
  task: EngineGameTask,
  gameId: string,
  variant: VariantId,
  startedAt: Date,
  whiteEngine: EngineDefinition,
  blackEngine: EngineDefinition,
): Promise<void> {
  await pool.query(
    `INSERT INTO games
       (room_id, variant, result, termination, ply_count, started_at, ended_at,
        white_client, black_client, white_name, black_name, corpus_id,
        mode, status, review_status)
     VALUES ($1, $2, NULL, NULL, 0, $3, NULL,
        'engine:white', 'engine:black', $4, $5, NULL,
        'eve', 'running', 'unreviewed')
     ON CONFLICT (room_id) DO NOTHING`,
    [
      gameId,
      variant,
      startedAt,
      whiteEngine.id,
      blackEngine.id,
    ],
  );

  await pool.query(
    `UPDATE engine_game_tasks
     SET game_id = $2
     WHERE id = $1
       AND game_id IS NULL`,
    [task.id, gameId],
  );

  await pool.query(
    `INSERT INTO eve_games
       (game_id, job_id, task_id, game_index, worker_id,
        white_engine_id, black_engine_id,
        white_config_hash, black_config_hash,
        white_play_signature, black_play_signature,
        time_control, opening_policy, seed)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (game_id) DO NOTHING`,
    [
      gameId,
      task.jobId,
      task.id,
      task.gameIndex,
      task.workerId,
      whiteEngine.id,
      blackEngine.id,
      whiteEngine.configHash,
      blackEngine.configHash,
      whiteEngine.playSignature,
      blackEngine.playSignature,
      task.timeControl,
      task.openingPolicy,
      task.seed,
    ],
  );

  await pool.query(
    `UPDATE eve_jobs
     SET status = 'running',
         started_at = COALESCE(started_at, now())
     WHERE id = $1
       AND status = 'queued'`,
    [task.jobId],
  );
}

async function appendEvent(pool: pg.Pool, gameId: string, seq: number, event: GameEvent): Promise<void> {
  await pool.query(
    `INSERT INTO events (room_id, seq, type, payload)
     VALUES ($1, $2, $3, $4)`,
    [gameId, seq, event.type, event],
  );
}

async function completeTruncatedGame(
  pool: pg.Pool,
  task: EngineGameTask,
  gameId: string,
  plyCount: number,
): Promise<void> {
  await pool.query(
    `UPDATE games
     SET status = 'completed',
         result = 'draw',
         termination = 'truncated',
         ply_count = $2,
         ended_at = $3,
         aborted_reason = NULL
     WHERE room_id = $1`,
    [gameId, plyCount, new Date()],
  );
  await finishEngineGameTask(pool, task.id, task.claimToken!, 'completed');
  await reconcileExperimentJob(pool, task.jobId);
}

async function abortGame(
  pool: pg.Pool,
  task: EngineGameTask,
  gameId: string,
  plyCount: number,
  termination: 'no-legal-moves' | 'truncated' | 'worker-aborted',
): Promise<void> {
  await pool.query(
    `UPDATE games
     SET status = 'aborted',
         result = NULL,
         termination = $2,
         ply_count = $3,
         ended_at = $4,
         aborted_reason = $2
     WHERE room_id = $1`,
    [gameId, termination, plyCount, new Date()],
  );
  await finishEngineGameTask(pool, task.id, task.claimToken!, 'aborted', termination);
  await reconcileExperimentJob(pool, task.jobId);
}

function variantFromTask(task: EngineGameTask): VariantId {
  return task.config.variant === 'fog-of-war' ? 'fog-of-war' : 'fog-of-war';
}

function maxPliesFromTask(task: EngineGameTask): number {
  const value = task.config.max_plies;
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 160;
}

function engineIdFromConfig(config: Record<string, unknown>, key: string): string | null {
  const value = config[key];
  return typeof value === 'string' ? value : null;
}

function requiresPythonGameRunner(whiteEngine: EngineDefinition, blackEngine: EngineDefinition): boolean {
  return isPythonEngine(whiteEngine) || isPythonEngine(blackEngine);
}

function isPythonEngine(engine: EngineDefinition): boolean {
  return engine.config.kind === 'python-subprocess';
}

type PythonGameRequest = {
  roomId: string;
  seed: string;
  maxPlies: number;
  timeControl: Record<string, unknown>;
  openingPolicy: Record<string, unknown>;
  white: { id: string };
  black: { id: string };
};

type PythonGameResult = {
  roomId: string;
  plies: number;
  winner: 'white' | 'black' | null;
  endReason: 'king-captured' | 'truncated' | 'draw' | 'no-legal-moves' | 'clock-expired';
  truncated: boolean;
  events: unknown[];
  engines?: unknown;
};

async function runPythonGameProcess(request: PythonGameRequest): Promise<PythonGameResult> {
  const python = process.env.PYTHON_ENGINE_PYTHON ?? defaultPythonEngineBinary();
  const script = process.env.PYTHON_ENGINE_RUNNER
    ?? resolve(REPO_ROOT, 'research', 'python-fow-lab', 'scripts', 'eve_game_runner.py');
  const stockfishPath = process.env.PYTHON_ENGINE_STOCKFISH_PATH ?? process.env.STOCKFISH_PATH ?? defaultStockfishPath();
  const payload = stockfishPath ? { ...request, stockfishPath } : request;

  return new Promise((resolvePromise, reject) => {
    const child = spawn(python, [script], {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      const stderrText = Buffer.concat(stderr).toString('utf8').trim();
      const stdoutText = Buffer.concat(stdout).toString('utf8').trim();
      if (code !== 0) {
        reject(new Error(`python engine runner exited ${code}: ${stderrText || stdoutText}`));
        return;
      }
      try {
        resolvePromise(parsePythonGameResult(JSON.parse(stdoutText)));
      } catch (err) {
        reject(new Error(`invalid python engine runner output: ${(err as Error).message}`));
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

function parsePythonGameResult(value: unknown): PythonGameResult {
  if (!isObject(value)) throw new Error('top-level response is not an object');
  if (typeof value.roomId !== 'string') throw new Error('missing roomId');
  if (!Array.isArray(value.events)) throw new Error('missing events');
  if (!['king-captured', 'truncated', 'draw', 'no-legal-moves', 'clock-expired'].includes(String(value.endReason))) {
    throw new Error(`unsupported endReason ${String(value.endReason)}`);
  }
  return value as PythonGameResult;
}

function sanitizePythonMoveEvents(events: unknown[], gameId: string, startedAt: number): GameEvent[] {
  const result: GameEvent[] = [];
  let previousEventAt = startedAt;
  for (const event of events) {
    if (!isObject(event) || event.type !== 'move-played') continue;
    const move = event.move;
    if (!isObject(move)) throw new Error('python move-played event is missing move');
    if (event.color !== 'white' && event.color !== 'black') throw new Error('python move-played event has invalid color');
    if (typeof move.from !== 'string' || typeof move.to !== 'string') {
      throw new Error('python move-played event has invalid move squares');
    }
    const thinkTimeMs = typeof event.thinkTimeMs === 'number' && Number.isFinite(event.thinkTimeMs)
      ? Math.max(0, Math.round(event.thinkTimeMs))
      : typeof event.compute_ms === 'number' && Number.isFinite(event.compute_ms)
        ? Math.max(0, Math.round(event.compute_ms))
        : 1;
    previousEventAt += Math.max(1, thinkTimeMs);
    result.push({
      type: 'move-played',
      at: previousEventAt,
      roomId: gameId,
      color: event.color,
      move: {
        from: move.from,
        to: move.to,
        ...(typeof move.promotion === 'string' ? { promotion: move.promotion } : {}),
      },
      thinkTimeMs,
    } as GameEvent);
  }
  return result;
}

async function recordPythonGameSummary(
  pool: pg.Pool,
  task: EngineGameTask,
  gameId: string,
  result: PythonGameResult,
): Promise<void> {
  if (!shouldRecordMoveChoices(task)) return;
  await pool.query(
    `INSERT INTO game_debug_artifacts
       (game_id, ply, engine_color, artifact_type, storage, payload)
     VALUES ($1, 0, NULL, 'python-engine-game-summary', 'jsonb', $2)`,
    [
      gameId,
      {
        end_reason: result.endReason,
        winner: result.winner,
        plies: result.plies,
        engines: result.engines ?? null,
      },
    ],
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function recordMoveDecision(
  pool: pg.Pool,
  task: EngineGameTask,
  gameId: string,
  ply: number,
  color: Color,
  engine: EngineDefinition,
  decision: EngineMoveDecision,
): Promise<void> {
  if (!shouldRecordMoveChoices(task)) return;
  await pool.query(
    `INSERT INTO game_debug_artifacts
       (game_id, ply, engine_color, artifact_type, storage, payload)
     VALUES ($1, $2, $3, 'engine-move-choice', 'jsonb', $4)`,
    [
      gameId,
      ply,
      color,
      {
        engine_id: engine.id,
        play_signature: engine.playSignature,
        selected_move: decision.move,
        scored_moves: decision.scores,
        think_time_ms: decision.thinkTimeMs,
      },
    ],
  );
}

function shouldRecordMoveChoices(task: EngineGameTask): boolean {
  return task.artifactPolicy.move_choices === 'all'
    || task.artifactPolicy.engine_move_choices === 'all';
}

function seedFromTask(task: EngineGameTask): bigint {
  try {
    return BigInt(task.seed);
  } catch {
    return 1n;
  }
}

function nextSeed(seed: bigint): bigint {
  return (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 63n) - 1n);
}
