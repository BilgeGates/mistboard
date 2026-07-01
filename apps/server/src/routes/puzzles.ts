import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  attemptMiniXiangqiPuzzleLine,
  DROP_MINI_XIANGQI_SPEC_ID,
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

type PuzzleSummary = {
  id: string;
  variant: MiniXiangqiPuzzleVariant;
  title: string;
  sideToMove: ReturnType<typeof miniXiangqiPuzzleSideToMove>;
  goal: MiniXiangqiPuzzle['goal'];
  themes: MiniXiangqiPuzzle['themes'];
  solutionPlyCount: number;
};

type PuzzleDetail = PuzzleSummary & {
  initial: MiniXiangqiPuzzle['initial'];
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
      ? MINI_XIANGQI_PUZZLES.filter((puzzle) => puzzle.variant === variant)
      : MINI_XIANGQI_PUZZLES;
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
    const puzzle = miniXiangqiPuzzleById(decodeURIComponent(attemptMatch[1]!));
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
    writeJson(response, 200, { attempt: attemptMiniXiangqiPuzzleLine(puzzle, moves) });
    return true;
  }

  const detailMatch = pathname.match(/^\/api\/puzzles\/([^/]+)$/);
  if (!detailMatch) return false;
  if (!requireMethod(request, response, 'GET')) return true;

  const puzzle = miniXiangqiPuzzleById(decodeURIComponent(detailMatch[1]!));
  if (!puzzle) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  writeJson(response, 200, { puzzle: puzzleDetail(puzzle) });
  return true;
}

function parsePuzzleVariant(value: string | null): MiniXiangqiPuzzleVariant | null | 'invalid' {
  if (value === null || value === '') return null;
  if (value === MINI_XIANGQI_SPEC_ID || value === DROP_MINI_XIANGQI_SPEC_ID) return value;
  return 'invalid';
}

function puzzleSummary(puzzle: MiniXiangqiPuzzle): PuzzleSummary {
  return {
    id: puzzle.id,
    variant: puzzle.variant,
    title: puzzle.title,
    sideToMove: miniXiangqiPuzzleSideToMove(puzzle),
    goal: puzzle.goal,
    themes: puzzle.themes,
    solutionPlyCount: puzzle.solution.length,
  };
}

function puzzleDetail(puzzle: MiniXiangqiPuzzle): PuzzleDetail {
  return {
    ...puzzleSummary(puzzle),
    initial: puzzle.initial,
  };
}

function parsePuzzleMoves(value: unknown): MiniXiangqiPuzzleMove[] | null {
  if (!Array.isArray(value) || value.length > 64) return null;
  const moves: MiniXiangqiPuzzleMove[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) return null;
    const move = raw as Record<string, unknown>;
    if (typeof move.drop === 'string' && typeof move.to === 'string') {
      moves.push({ drop: move.drop, to: move.to } as MiniXiangqiPuzzleMove);
      continue;
    }
    if (typeof move.from === 'string' && typeof move.to === 'string') {
      moves.push({ from: move.from, to: move.to } as MiniXiangqiPuzzleMove);
      continue;
    }
    return null;
  }
  return moves;
}
