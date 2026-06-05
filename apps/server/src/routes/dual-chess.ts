import type { IncomingMessage, ServerResponse } from 'node:http';
import { dualChessEngineMove } from '../dual-chess-engine.js';
import { readJsonBody, requireMethod, writeJson } from './lib.js';

// Strict UCI shape for a 6x8 board (files a-f, ranks 1-8, optional Queen promo).
// Anything else is rejected before it can reach the engine's stdin.
const UCI_MOVE = /^[a-f][1-8][a-f][1-8]q?$/;
const MAX_MOVES = 400;

// POST /api/dual-chess/engine-move  { moves: string[], movetime?: number }
//   -> { move: string | null }   (Fairy-Stockfish best move for the open mode)
export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname !== '/api/dual-chess/engine-move') return false;
  if (!requireMethod(request, response, 'POST')) return true;

  const body = await readJsonBody(request);
  const rawMoves = Array.isArray(body.moves) ? body.moves : [];
  if (rawMoves.length > MAX_MOVES) {
    writeJson(response, 400, { error: 'too_many_moves' });
    return true;
  }
  const moves: string[] = [];
  for (const move of rawMoves) {
    if (typeof move !== 'string' || !UCI_MOVE.test(move)) {
      writeJson(response, 400, { error: 'invalid_move' });
      return true;
    }
    moves.push(move);
  }
  const movetime =
    typeof body.movetime === 'number' && body.movetime > 0 && body.movetime <= 5000
      ? Math.floor(body.movetime)
      : 500;
  const skill =
    typeof body.skill === 'number' && body.skill >= 0 && body.skill <= 20
      ? Math.floor(body.skill)
      : undefined;

  try {
    const move = await dualChessEngineMove(moves, { movetimeMs: movetime, skill });
    writeJson(response, 200, { move });
  } catch (err) {
    writeJson(response, 503, { error: 'engine_unavailable', detail: (err as Error).message });
  }
  return true;
}
