import type { Move, PieceRole } from '@mistboard/game';
import type { EngineDefinition, EngineMoveContext, EngineMoveScore } from '../types.js';
import { engineThinkTimeMs } from '../think-time.js';

const PIECE_VALUES: Record<PieceRole, number> = {
  king: 1000,
  queen: 9,
  rook: 5,
  bishop: 3,
  knight: 3,
  pawn: 1,
};

export const captureSeekerEngine: EngineDefinition = {
  id: 'builtin-capture-seeker',
  engineId: 'capture-seeker',
  engineName: 'Capture Seeker',
  name: 'Capture Seeker v1',
  kind: 'builtin',
  configHash: 'builtin-capture-seeker-v1',
  playSignature: 'builtin-capture-seeker-v1',
  config: { kind: 'builtin', strategy: 'capture-seeker', version: 1 },
  notes: 'Deterministic capture- and center-seeking baseline for EvE data collection.',
  chooseMove(context) {
    const scores = context.legalMoves.map((move, index) => scoreCaptureSeekingMove(context, move, index));
    const best = scores.reduce((winner, candidate) => (
      candidate.score > winner.score ? candidate : winner
    ));
    const captureMoveCount = scores.filter((score) => score.reason.startsWith('capture-')).length;
    return {
      move: best.move,
      scores,
      thinkTimeMs: engineThinkTimeMs({ captureMoveCount, context, runtime: 'in-process' }),
    };
  },
};

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
