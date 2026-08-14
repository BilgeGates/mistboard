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
import type {
  XiangqiOpeningMoveAccumulator,
  XiangqiOpeningSample,
} from './persistence-xiangqi-explorer.js';
import { canonicalPositionMove } from './xiangqi-opening-mirror.js';

/** '1-0' = red wins; '*' = no recorded result (counted, never guessed). */
export type AggregateResult = '1-0' | '0-1' | '1/2-1/2' | '*';

export type AggregateGameInput = {
  id: string;
  /**
   * Which store this id belongs to. Still not a notion of *where the game came
   * from* in the licensing sense — it is the id space, which the reader needs
   * because the two stores resolve at different review routes and their ids can
   * collide. Defaults to 'historical'.
   */
  kind?: 'historical' | 'broadcast';
  result: AggregateResult;
  moves: readonly XiangqiMove[];
  /** Average player rating, when the source records one. Drives "Top games";
   *  a source without ratings simply never appears at the head of that list. */
  rating?: number | null;
  /** Per-side ratings for the "Top games" row ("1008 vs 992"). */
  redRating?: number | null;
  blackRating?: number | null;
  /** Player names and event, for sources that are not anonymized. */
  redName?: string | null;
  blackName?: string | null;
  event?: string | null;
  /** ISO date (YYYY-MM-DD) for display beside a top game. */
  playedOn?: string | null;
};

export type AggregateOptions = {
  /**
   * How deep to fold each game. Past the opening the position tree is almost
   * entirely unique positions with a single game each, which costs rows and
   * tells a reader nothing; 24 plies (12 moves a side) is where xiangqi opening
   * theory still has shared ground.
   */
  maxPly: number;
  /** Example games retained per (position, move), highest-rated first. */
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
  for (const entry of folded) {
    // Store under the mirror-canonical (position, move), so an opening and its
    // mirror image are one row rather than two half-strength ones.
    const canonical = canonicalPositionMove(entry.positionKey, entry.move);
    const positionKey = canonical.key;
    const moveKey = `${canonical.move.from}${canonical.move.to}`;
    if (counted.has(`${positionKey}|${moveKey}`)) continue;
    counted.add(`${positionKey}|${moveKey}`);
    let moves = accumulator.get(positionKey);
    if (!moves) {
      moves = new Map();
      accumulator.set(positionKey, moves);
    }
    let stats = moves.get(moveKey);
    if (!stats) {
      stats = { games: 0, redWins: 0, blackWins: 0, draws: 0, unknowns: 0, sampleGames: [] };
      moves.set(moveKey, stats);
    }
    stats.games += 1;
    if (game.result === '1-0') stats.redWins += 1;
    else if (game.result === '0-1') stats.blackWins += 1;
    else if (game.result === '1/2-1/2') stats.draws += 1;
    else stats.unknowns += 1;
    retainSample(stats.sampleGames, game, options.sampleLimit);
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

/**
 * Keep the highest-rated examples. Insertion-sorted into a list capped at the
 * sample limit: the union of these per-move lists is what the API turns into
 * "Top games", so keeping the best few per move is what makes the position-level
 * list exact rather than a sample of a sample.
 */
function retainSample(
  samples: XiangqiOpeningSample[],
  game: AggregateGameInput,
  limit: number,
): void {
  const rating = typeof game.rating === 'number' ? game.rating : null;
  const entry: XiangqiOpeningSample = {
    id: game.id,
    kind: game.kind ?? 'historical',
    rating,
    redRating: game.redRating ?? null,
    blackRating: game.blackRating ?? null,
    redName: game.redName ?? null,
    blackName: game.blackName ?? null,
    event: game.event ?? null,
    result: game.result,
    playedOn: game.playedOn ?? null,
  };
  // Named games first, then by rating, then the unrated anonymous tail.
  //
  // Ranking purely by rating looked right and was wrong in practice: the corpus
  // is anonymous amateur play (ratings around 1000-1250) and broadcast games are
  // professional tournament games carrying no rating at all, so every sample
  // slot filled with club games and the best games on the site never appeared.
  // A game between two people we can name is the better example at any rating,
  // and a future named master corpus inherits the same ordering for free.
  const rank = (sample: {
    rating: number | null;
    redName?: string | null;
    blackName?: string | null;
  }): [number, number] => [
    sample.redName || sample.blackName ? 1 : 0,
    sample.rating ?? Number.NEGATIVE_INFINITY,
  ];
  const incoming = rank(entry);
  const below = (sample: Parameters<typeof rank>[0]): boolean => {
    const [named, rating] = rank(sample);
    if (named !== incoming[0]) return named < incoming[0];
    return rating < incoming[1];
  };
  let index = samples.findIndex(below);
  if (index < 0) index = samples.length;
  if (index >= limit) return;
  samples.splice(index, 0, entry);
  if (samples.length > limit) samples.length = limit;
}
