import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  attemptFortressXiangqiPuzzleLine,
  attemptJunglePuzzleLine,
  attemptMiniXiangqiPuzzleLine,
  attemptStandardXiangqiPuzzleLine,
  DROP_MINI_XIANGQI_SPEC_ID,
  FORTRESS_XIANGQI_PUZZLES,
  FORTRESS_XIANGQI_SPEC_ID,
  type FortressXiangqiMove,
  type FortressXiangqiPuzzle,
  fortressXiangqiPuzzleById,
  fortressXiangqiPuzzleSideToMove,
  JUNGLE_PUZZLES,
  JUNGLE_SPEC_ID,
  type JungleMove,
  type JunglePuzzle,
  junglePuzzleById,
  junglePuzzleSideToMove,
  MINI_XIANGQI_PUZZLES,
  MINI_XIANGQI_SPEC_ID,
  type MiniXiangqiPuzzle,
  type MiniXiangqiPuzzleMove,
  type MiniXiangqiPuzzleVariant,
  miniXiangqiPuzzleById,
  miniXiangqiPuzzleSideToMove,
  standardXiangqiPuzzleById,
  standardXiangqiPuzzleSideToMove,
  XIANGQI_PUZZLES,
  XIANGQI_SPEC_ID,
  type XiangqiMove,
  type XiangqiPuzzle,
} from '@mistboard/game';
import { currentAccountUser } from '../account-session.js';
import { getUserPuzzleRating, recordPuzzleAttempt } from '../persistence-puzzle-ratings.js';
import {
  currentDailyPuzzleDay,
  getOrCreateDailyPuzzleSelection,
  parseDailyPuzzleSlot,
} from '../persistence-puzzles.js';
import { seedPuzzleRating } from '../puzzle-rating.js';
import { type HttpApiContext, readJsonBody, requireMethod, writeJson } from './lib.js';

// The public puzzle surface spans the Mini/Drop-Mini registry, the Fortress
// Xiangqi registry, the Jungle registry, and the standard-xiangqi registry.
// Ids are prefix-disjoint across them, so resolution can try each, but every
// behavioural branch dispatches on `variant` (fail-closed: a new registry
// needs an explicit branch, not a fallthrough).
type PublicPuzzle = MiniXiangqiPuzzle | FortressXiangqiPuzzle | JunglePuzzle | XiangqiPuzzle;
type PublicPuzzleVariant =
  | MiniXiangqiPuzzleVariant
  | typeof FORTRESS_XIANGQI_SPEC_ID
  | typeof JUNGLE_SPEC_ID
  | typeof XIANGQI_SPEC_ID;
type PublicPuzzleMove = MiniXiangqiPuzzleMove | FortressXiangqiMove | JungleMove | XiangqiMove;

const ALL_PUZZLES: readonly PublicPuzzle[] = [
  ...MINI_XIANGQI_PUZZLES,
  ...FORTRESS_XIANGQI_PUZZLES,
  ...JUNGLE_PUZZLES,
  ...XIANGQI_PUZZLES,
];

type PuzzleSummary = {
  id: string;
  variant: PublicPuzzleVariant;
  title: string;
  sideToMove: ReturnType<typeof miniXiangqiPuzzleSideToMove>;
  goal: PublicPuzzle['goal'];
  themes: readonly string[];
  solutionPlyCount: number;
};

type PuzzleDetail = PuzzleSummary & {
  initial: PublicPuzzle['initial'];
  // Denormalized attribution for the "From game" card (standard-xiangqi mined
  // puzzles only). The source game itself is not hosted until license-cleared,
  // so this is display metadata, not a link target.
  sourceGame?: XiangqiPuzzle['sourceGame'];
};

export async function tryHandle(
  _ctx: HttpApiContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  parsedUrl: URL,
): Promise<boolean> {
  if (pathname === '/api/puzzles') {
    if (!requireMethod(request, response, 'GET')) return true;
    const variant = parsePuzzleVariant(parsedUrl.searchParams.get('variant'));
    if (variant === 'invalid') {
      writeJson(response, 400, { error: 'invalid_variant' });
      return true;
    }
    const puzzles = variant
      ? ALL_PUZZLES.filter((puzzle) => puzzle.variant === variant)
      : ALL_PUZZLES;
    writeJson(response, 200, { puzzles: puzzles.map(puzzleSummary) });
    return true;
  }

  if (pathname === '/api/puzzles/daily') {
    if (!requireMethod(request, response, 'GET')) return true;
    const slot = parseDailyPuzzleSlot(parsedUrl.searchParams.get('slot'));
    if (!slot) {
      writeJson(response, 400, { error: 'invalid_slot' });
      return true;
    }
    const daily = await getOrCreateDailyPuzzleSelection(currentDailyPuzzleDay(), slot);
    writeJson(response, 200, {
      daily: {
        day: daily.day,
        persisted: daily.persisted,
        selectedAt: daily.selectedAt,
        slot: daily.slot,
        source: daily.source,
      },
      puzzle: puzzleDetail(daily.puzzle),
    });
    return true;
  }

  // The signed-in user's puzzle rating for a variant (null when unrated / anon).
  // Checked before the `:id` detail route so "rating" is not read as a puzzle id.
  if (pathname === '/api/puzzles/rating') {
    if (!requireMethod(request, response, 'GET')) return true;
    const variant = parsePuzzleVariant(parsedUrl.searchParams.get('variant'));
    if (variant === 'invalid' || variant === null) {
      writeJson(response, 400, { error: 'invalid_variant' });
      return true;
    }
    const user = await currentAccountUser(request);
    const rating = user ? await getUserPuzzleRating(user.id, variant) : null;
    writeJson(response, 200, {
      rating: rating
        ? {
            rating: rating.rating,
            provisional: rating.provisional,
            solved: rating.solved,
            attempts: rating.attempts,
          }
        : null,
    });
    return true;
  }

  const attemptMatch = pathname.match(/^\/api\/puzzles\/([^/]+)\/attempt$/);
  if (attemptMatch) {
    if (!requireMethod(request, response, 'POST')) return true;
    const puzzle = puzzleById(decodeURIComponent(attemptMatch[1]!));
    if (!puzzle) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    const body = await readJsonBody(request);
    const moves = parsePuzzleMoves(body.moves);
    if (!moves) {
      writeJson(response, 400, { error: 'invalid_moves' });
      return true;
    }
    const attempt = attemptPuzzle(puzzle, moves);
    const rating = await recordAttemptRating(request, puzzle, attempt, body.rated !== false);
    writeJson(response, 200, { attempt, ...(rating ? { rating } : {}) });
    return true;
  }

  const detailMatch = pathname.match(/^\/api\/puzzles\/([^/]+)$/);
  if (!detailMatch) return false;
  if (!requireMethod(request, response, 'GET')) return true;

  const puzzle = puzzleById(decodeURIComponent(detailMatch[1]!));
  if (!puzzle) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, { puzzle: puzzleDetail(puzzle) });
  return true;
}

function puzzleById(id: string): PublicPuzzle | null {
  return (
    miniXiangqiPuzzleById(id) ??
    fortressXiangqiPuzzleById(id) ??
    junglePuzzleById(id) ??
    standardXiangqiPuzzleById(id)
  );
}

function puzzleSideToMove(puzzle: PublicPuzzle): ReturnType<typeof miniXiangqiPuzzleSideToMove> {
  if (puzzle.variant === FORTRESS_XIANGQI_SPEC_ID) return fortressXiangqiPuzzleSideToMove(puzzle);
  if (puzzle.variant === JUNGLE_SPEC_ID) return junglePuzzleSideToMove(puzzle);
  if (puzzle.variant === XIANGQI_SPEC_ID) return standardXiangqiPuzzleSideToMove(puzzle);
  return miniXiangqiPuzzleSideToMove(puzzle);
}

function attemptPuzzle(puzzle: PublicPuzzle, moves: PublicPuzzleMove[]) {
  if (puzzle.variant === FORTRESS_XIANGQI_SPEC_ID) {
    return attemptFortressXiangqiPuzzleLine(puzzle, moves as FortressXiangqiMove[]);
  }
  if (puzzle.variant === JUNGLE_SPEC_ID) {
    return attemptJunglePuzzleLine(puzzle, moves as JungleMove[]);
  }
  if (puzzle.variant === XIANGQI_SPEC_ID) {
    return attemptStandardXiangqiPuzzleLine(puzzle, moves as XiangqiMove[]);
  }
  return attemptMiniXiangqiPuzzleLine(puzzle, moves as MiniXiangqiPuzzleMove[]);
}

type PuzzleAttempt = ReturnType<typeof attemptPuzzle>;

type PuzzleAttemptRating = {
  userRating: number;
  delta: number;
  provisional: boolean;
  ratingChanged: boolean;
  firstAttempt: boolean;
};

// true = solved, false = a genuine wrong answer, null = not a terminal outcome
// (a correct-but-incomplete move on a multi-move puzzle, or a malformed submit).
function attemptOutcome(attempt: PuzzleAttempt): boolean | null {
  if (attempt.ok) return attempt.complete ? true : null;
  return attempt.code === 'incorrect-move' ? false : null;
}

// Record + rate the outcome for a signed-in user, once per (user, puzzle). Anon
// users, non-terminal moves, and persistence-off all return null (no rating).
async function recordAttemptRating(
  request: IncomingMessage,
  puzzle: PublicPuzzle,
  attempt: PuzzleAttempt,
  rated: boolean,
): Promise<PuzzleAttemptRating | null> {
  const outcome = attemptOutcome(attempt);
  if (outcome === null) return null;
  const user = await currentAccountUser(request);
  if (!user) return null;
  const result = await recordPuzzleAttempt({
    userId: user.id,
    puzzleId: puzzle.id,
    variant: puzzle.variant,
    solved: outcome,
    rated,
    seedRating: seedPuzzleRating(puzzle.solution.length),
  });
  if (!result) return null;
  return {
    userRating: result.userRating,
    delta: result.userRatingDelta,
    provisional: result.provisional,
    ratingChanged: result.ratingChanged,
    firstAttempt: result.firstAttempt,
  };
}

function parsePuzzleVariant(value: string | null): PublicPuzzleVariant | null | 'invalid' {
  if (value === null || value === '') return null;
  if (
    value === MINI_XIANGQI_SPEC_ID ||
    value === DROP_MINI_XIANGQI_SPEC_ID ||
    value === FORTRESS_XIANGQI_SPEC_ID ||
    value === JUNGLE_SPEC_ID ||
    value === XIANGQI_SPEC_ID
  ) {
    return value;
  }
  return 'invalid';
}

function puzzleSummary(puzzle: PublicPuzzle): PuzzleSummary {
  return {
    id: puzzle.id,
    variant: puzzle.variant,
    title: puzzle.title,
    sideToMove: puzzleSideToMove(puzzle),
    goal: puzzle.goal,
    themes: puzzle.themes,
    solutionPlyCount: puzzle.solution.length,
  };
}

function puzzleDetail(puzzle: PublicPuzzle): PuzzleDetail {
  return {
    ...puzzleSummary(puzzle),
    initial: puzzle.initial,
    ...(puzzle.variant === XIANGQI_SPEC_ID && puzzle.sourceGame
      ? { sourceGame: puzzle.sourceGame }
      : {}),
  };
}

function parsePuzzleMoves(value: unknown): PublicPuzzleMove[] | null {
  if (!Array.isArray(value) || value.length > 64) return null;
  const moves: PublicPuzzleMove[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) return null;
    const move = raw as Record<string, unknown>;
    if (typeof move.drop === 'string' && typeof move.to === 'string') {
      moves.push({ drop: move.drop, to: move.to } as PublicPuzzleMove);
      continue;
    }
    if (typeof move.from === 'string' && typeof move.to === 'string') {
      moves.push({ from: move.from, to: move.to } as PublicPuzzleMove);
      continue;
    }
    return null;
  }
  return moves;
}
