import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  attemptFortressXiangqiPuzzleLine,
  attemptMiniXiangqiPuzzleLine,
  DROP_MINI_XIANGQI_SPEC_ID,
  FORTRESS_XIANGQI_PUZZLES,
  FORTRESS_XIANGQI_SPEC_ID,
  type FortressXiangqiMove,
  type FortressXiangqiPuzzle,
  fortressXiangqiPuzzleById,
  fortressXiangqiPuzzleSideToMove,
  MINI_XIANGQI_PUZZLES,
  MINI_XIANGQI_SPEC_ID,
  type MiniXiangqiPuzzle,
  type MiniXiangqiPuzzleMove,
  type MiniXiangqiPuzzleVariant,
  miniXiangqiPuzzleById,
  miniXiangqiPuzzleSideToMove,
} from '@mistboard/game';
import {
  currentDailyPuzzleDay,
  getOrCreateDailyPuzzleSelection,
  parseDailyPuzzleSlot,
} from '../persistence-puzzles.js';
import { type HttpApiContext, readJsonBody, requireMethod, writeJson } from './lib.js';

// The public puzzle surface spans the Mini/Drop-Mini registry and the Fortress
// Xiangqi registry. Ids are prefix-disjoint across the two, so resolution can
// try both, but every behavioural branch dispatches on `variant` (fail-closed:
// a new registry would need an explicit branch, not a fallthrough).
type PublicPuzzle = MiniXiangqiPuzzle | FortressXiangqiPuzzle;
type PublicPuzzleVariant = MiniXiangqiPuzzleVariant | typeof FORTRESS_XIANGQI_SPEC_ID;
type PublicPuzzleMove = MiniXiangqiPuzzleMove | FortressXiangqiMove;

const ALL_PUZZLES: readonly PublicPuzzle[] = [...MINI_XIANGQI_PUZZLES, ...FORTRESS_XIANGQI_PUZZLES];

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
    writeJson(response, 200, { attempt: attemptPuzzle(puzzle, moves) });
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
  return miniXiangqiPuzzleById(id) ?? fortressXiangqiPuzzleById(id);
}

function puzzleSideToMove(puzzle: PublicPuzzle): ReturnType<typeof miniXiangqiPuzzleSideToMove> {
  return puzzle.variant === FORTRESS_XIANGQI_SPEC_ID
    ? fortressXiangqiPuzzleSideToMove(puzzle)
    : miniXiangqiPuzzleSideToMove(puzzle);
}

function attemptPuzzle(puzzle: PublicPuzzle, moves: PublicPuzzleMove[]) {
  return puzzle.variant === FORTRESS_XIANGQI_SPEC_ID
    ? attemptFortressXiangqiPuzzleLine(puzzle, moves as FortressXiangqiMove[])
    : attemptMiniXiangqiPuzzleLine(puzzle, moves as MiniXiangqiPuzzleMove[]);
}

function parsePuzzleVariant(value: string | null): PublicPuzzleVariant | null | 'invalid' {
  if (value === null || value === '') return null;
  if (
    value === MINI_XIANGQI_SPEC_ID ||
    value === DROP_MINI_XIANGQI_SPEC_ID ||
    value === FORTRESS_XIANGQI_SPEC_ID
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
