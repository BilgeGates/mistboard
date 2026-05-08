import type { Color, GameState, Move, PieceRole } from '@bichess/game';
import type pg from 'pg';

type Queryable = Pick<pg.Client | pg.Pool | pg.PoolClient, 'query'>;

export type EngineMoveContext = {
  state: GameState;
  color: Color;
  legalMoves: Move[];
  seed: bigint;
  ply: number;
};

export type EngineMoveScore = {
  move: Move;
  score: number;
  reason: string;
};

export type EngineMoveDecision = {
  move: Move;
  scores: EngineMoveScore[];
};

export type EngineDefinition = {
  id: string;
  name: string;
  configHash: string;
  playSignature: string;
  config: Record<string, unknown>;
  chooseMove(context: EngineMoveContext): EngineMoveDecision;
};

const PIECE_VALUES: Record<PieceRole, number> = {
  king: 1000,
  queen: 9,
  rook: 5,
  bishop: 3,
  knight: 3,
  pawn: 1,
};

const BUILTIN_ENGINES: Record<string, EngineDefinition> = {
  'builtin-random-legal': {
    id: 'builtin-random-legal',
    name: 'Built-in Random Legal',
    configHash: 'builtin-random-legal-v1',
    playSignature: 'builtin-random-legal-v1',
    config: { kind: 'builtin', strategy: 'random-legal', version: 1 },
    chooseMove(context) {
      const move = context.legalMoves[Number(context.seed % BigInt(context.legalMoves.length))]!;
      return {
        move,
        scores: context.legalMoves.map((candidate) => ({
          move: candidate,
          score: 0,
          reason: 'uniform',
        })),
      };
    },
  },
  'builtin-capture-seeker': {
    id: 'builtin-capture-seeker',
    name: 'Built-in Capture Seeker',
    configHash: 'builtin-capture-seeker-v1',
    playSignature: 'builtin-capture-seeker-v1',
    config: { kind: 'builtin', strategy: 'capture-seeker', version: 1 },
    chooseMove(context) {
      const scores = context.legalMoves.map((move, index) => scoreCaptureSeekingMove(context, move, index));
      const best = scores.reduce((winner, candidate) => (
        candidate.score > winner.score ? candidate : winner
      ));
      return { move: best.move, scores };
    },
  },
};

export function defaultEngineId(): string {
  return 'builtin-random-legal';
}

export function builtinEngineIds(): string[] {
  return Object.keys(BUILTIN_ENGINES);
}

export function loadEngine(engineId: string | null | undefined): EngineDefinition {
  const resolvedId = engineId ?? defaultEngineId();
  const engine = BUILTIN_ENGINES[resolvedId];
  if (!engine) throw new Error(`engine ${resolvedId} is not loadable by this worker`);
  return engine;
}

export async function upsertBuiltinEngineVersions(db: Queryable, engineIds: string[]): Promise<void> {
  for (const engineId of new Set(engineIds)) {
    const engine = loadEngine(engineId);
    await db.query(
      `INSERT INTO engine_versions
         (id, name, config_hash, play_signature, engine_version_pin, config, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         config_hash = EXCLUDED.config_hash,
         play_signature = EXCLUDED.play_signature,
         engine_version_pin = EXCLUDED.engine_version_pin,
         config = EXCLUDED.config`,
      [
        engine.id,
        engine.name,
        engine.configHash,
        engine.playSignature,
        engine.id,
        engine.config,
        'Built-in TypeScript worker engine for EvE data collection MVP.',
      ],
    );
  }
}

function scoreCaptureSeekingMove(context: EngineMoveContext, move: Move, index: number): EngineMoveScore {
  const target = context.state.board[move.to];
  const captureScore = target && target.color !== context.color ? PIECE_VALUES[target.role] * 100 : 0;
  const promotionScore = move.promotion ? PIECE_VALUES[move.promotion] * 10 : 0;
  const centerScore = 8 - manhattanFromCenter(move.to);
  const tieBreak = Number((context.seed + BigInt(index)) % 97n) / 1000;
  const score = captureScore + promotionScore + centerScore + tieBreak;
  return {
    move,
    score,
    reason: captureScore > 0 ? `capture-${target?.role}` : 'centralize',
  };
}

function manhattanFromCenter(square: string): number {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number.parseInt(square[1]!, 10) - 1;
  const fileDistance = Math.min(Math.abs(file - 3), Math.abs(file - 4));
  const rankDistance = Math.min(Math.abs(rank - 3), Math.abs(rank - 4));
  return fileDistance + rankDistance;
}
