// Opening-explorer aggregation: fold games into per-position move statistics.
//
// The unit of input is deliberately minimal — a move list plus a result — and
// carries NO notion of where the game came from. That is the whole design
// constraint: today the corpus is one license-cleared platform export, and the
// next sources (broadcast boards as first-class games, a licensed historical
// import) must join by calling `accumulateGame` with their own move lists, not
// by teaching this module about them. Anything source-specific belongs in the
// caller (see build-xiangqi-explorer.ts, which owns the license gate).
//
// Replay runs through the real standard-xiangqi kernel rather than a coordinate
// walk, so an illegal or corrupt move list is dropped instead of poisoning the
// statistics with positions that cannot occur.

import {
  applyStandardXiangqiMove,
  createInitialXiangqiState,
  isStandardXiangqiLegalMove,
  standardXiangqiPositionKey,
  type XiangqiGameState,
  type XiangqiMove,
} from '@mistboard/game';
import type { XiangqiOpeningMoveAccumulator } from './persistence-xiangqi-explorer.js';

/** '1-0' = red wins; '*' = no recorded result (counted, never guessed). */
export type AggregateResult = '1-0' | '0-1' | '1/2-1/2' | '*';

export type AggregateGameInput = {
  id: string;
  result: AggregateResult;
  moves: readonly XiangqiMove[];
};

export type AggregateOptions = {
  /**
   * How deep to fold each game. Past the opening the position tree is almost
   * entirely unique positions with a single game each, which costs rows and
   * tells a reader nothing; 24 plies (12 moves a side) is where xiangqi opening
   * theory still has shared ground.
   */
  maxPly: number;
  /** Example game ids retained per (position, move). */
  sampleLimit: number;
};

export const DEFAULT_AGGREGATE_OPTIONS: AggregateOptions = { maxPly: 24, sampleLimit: 8 };

export type AggregateStats = {
  gamesFolded: number;
  gamesRejected: number;
  positions: number;
};

export function createAccumulator(): XiangqiOpeningMoveAccumulator {
  return new Map();
}

/**
 * Fold one game in. Returns false when the move list failed replay, in which
 * case NOTHING from that game is recorded: a game that goes illegal at ply 30
 * still contributed valid opening positions, but accepting a partially-replayed
 * game silently biases every count toward corrupt records, and we would rather
 * see the reject number.
 */
export function accumulateGame(
  accumulator: XiangqiOpeningMoveAccumulator,
  game: AggregateGameInput,
  options: AggregateOptions = DEFAULT_AGGREGATE_OPTIONS,
): boolean {
  const folded = replayOpening(game.moves, options.maxPly);
  if (!folded) return false;
  // Count each game ONCE per (position, move). A game can revisit a position it
  // already played from — a horse out and back, or any repetition, and xiangqi
  // middlegames shuffle constantly — and counting both visits would inflate the
  // popular line rather than the game count the column claims to report.
  const counted = new Set<string>();
  for (const { positionKey, move } of folded) {
    const moveKey = `${move.from}${move.to}`;
    if (counted.has(`${positionKey}|${moveKey}`)) continue;
    counted.add(`${positionKey}|${moveKey}`);
    let moves = accumulator.get(positionKey);
    if (!moves) {
      moves = new Map();
      accumulator.set(positionKey, moves);
    }
    let stats = moves.get(moveKey);
    if (!stats) {
      stats = { games: 0, redWins: 0, blackWins: 0, draws: 0, unknowns: 0, sampleGameIds: [] };
      moves.set(moveKey, stats);
    }
    stats.games += 1;
    if (game.result === '1-0') stats.redWins += 1;
    else if (game.result === '0-1') stats.blackWins += 1;
    else if (game.result === '1/2-1/2') stats.draws += 1;
    else stats.unknowns += 1;
    if (stats.sampleGameIds.length < options.sampleLimit) stats.sampleGameIds.push(game.id);
  }
  return true;
}

/**
 * The (position before the move, move) pairs a game contributes, or null if the
 * move list is not legal standard xiangqi.
 *
 * Historical sources apply their own federation repetition and no-progress
 * rules, so a source game may legitimately continue through a position where
 * the Mistboard kernel would auto-adjudicate a draw. Same allowance the
 * ElephantChess importer makes: keep check-aware move legality, but do not
 * reject a game because our adjudicator would have stopped it early.
 */
function replayOpening(
  moves: readonly XiangqiMove[],
  maxPly: number,
): Array<{ positionKey: string; move: XiangqiMove }> | null {
  let state: XiangqiGameState = createInitialXiangqiState('opening-explorer');
  const folded: Array<{ positionKey: string; move: XiangqiMove }> = [];
  const limit = Math.min(moves.length, maxPly);
  for (let ply = 0; ply < limit; ply += 1) {
    const move = moves[ply];
    if (!move) return null;
    if (state.status.type !== 'playing') return null;
    if (!isStandardXiangqiLegalMove(state, move)) return null;
    folded.push({ positionKey: standardXiangqiPositionKey(state), move });
    const mover = state.status.turn;
    state = applyStandardXiangqiMove(state, move);
    if (
      state.status.type === 'finished' &&
      (state.status.reason === 'repetition' || state.status.reason === 'progress-clock')
    ) {
      state = {
        ...state,
        status: { type: 'playing', turn: mover === 'red' ? 'black' : 'red' },
      };
    }
  }
  return folded;
}

export function accumulatorPositionCount(accumulator: XiangqiOpeningMoveAccumulator): number {
  return accumulator.size;
}
