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
    const decision = engine.chooseMove({
      state: projection.state,
      color,
      legalMoves: moves,
      seed,
      ply: events.length - 3,
    });
    const move = decision.move;
    seed = nextSeed(seed);
    const event: GameEvent = {
      type: 'move-played',
      at: Date.now(),
      roomId: gameId,
      color,
      move,
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
