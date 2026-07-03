import { createHash } from 'node:crypto';
import {
  FORTRESS_XIANGQI_PUZZLES,
  FORTRESS_XIANGQI_SPEC_ID,
  type FortressXiangqiPuzzle,
  fortressXiangqiPuzzleById,
  type MiniXiangqiPuzzle,
  miniXiangqiPuzzleById,
} from '@mistboard/game';
import type pg from 'pg';
import { getPool, isInitialized } from './persistence-db.js';

export const DAILY_PUZZLE_HOMEPAGE_SLOT = 'homepage';

// A daily puzzle can be drawn from any surfaced variant; only Fortress Xiangqi is
// surfaced right now (see DAILY_PUZZLE_PROVIDERS). Ids are prefix-disjoint across
// the registries, so resolution dispatches on the stored variant.
type DailyPuzzle = MiniXiangqiPuzzle | FortressXiangqiPuzzle;

export type DailyPuzzleSlot = typeof DAILY_PUZZLE_HOMEPAGE_SLOT;

export type DailyPuzzleSelection = {
  day: string;
  persisted: boolean;
  puzzleId: string;
  selectedAt: string | null;
  slot: DailyPuzzleSlot;
  source: string;
  variant: string;
};

export type DailyPuzzleResult = DailyPuzzleSelection & {
  puzzle: DailyPuzzle;
};

type DailyPuzzleProvider = {
  candidates: () => readonly DailyPuzzle[];
  variant: string;
};

type DailyPuzzleSelectionRow = {
  day: string;
  puzzle_id: string;
  selected_at: string;
  slot: string;
  source: string;
  variant: string;
};

type Queryable = {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<pg.QueryResult<T>>;
};

// Only Fortress Xiangqi is featured as the daily puzzle for now, matching the
// puzzle page. Add more providers here to broaden the rotation.
const DAILY_PUZZLE_PROVIDERS: readonly DailyPuzzleProvider[] = [
  {
    variant: FORTRESS_XIANGQI_SPEC_ID,
    candidates: () => FORTRESS_XIANGQI_PUZZLES,
  },
];

function isCurrentDailyVariant(variant: string): boolean {
  return DAILY_PUZZLE_PROVIDERS.some((provider) => provider.variant === variant);
}

// Ids are prefix-disjoint across the Mini/Drop-Mini and Fortress registries, so
// try Fortress first, then Mini/Drop (the latter keeps older persisted daily
// rows resolvable even though they are no longer offered).
function dailyPuzzleById(id: string): DailyPuzzle | null {
  return fortressXiangqiPuzzleById(id) ?? miniXiangqiPuzzleById(id);
}

export function currentDailyPuzzleDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function parseDailyPuzzleSlot(value: string | null): DailyPuzzleSlot | null {
  if (value === null || value === '' || value === DAILY_PUZZLE_HOMEPAGE_SLOT) {
    return DAILY_PUZZLE_HOMEPAGE_SLOT;
  }
  return null;
}

export async function getOrCreateDailyPuzzleSelection(
  day: string,
  slot: DailyPuzzleSlot,
): Promise<DailyPuzzleResult> {
  if (!isInitialized()) return ephemeralDailyPuzzleSelection(day, slot);

  const pool = getPool();
  const existing = await readDailyPuzzleSelection(pool, day, slot);
  // Keep a persisted selection only if it is still a currently-offered variant;
  // a stale (now-hidden) daily is re-selected to the featured variant.
  const existingPuzzle =
    existing && isCurrentDailyVariant(existing.variant)
      ? dailyPuzzleById(existing.puzzle_id)
      : null;
  if (existing && existingPuzzle) return selectionResult(existing, existingPuzzle, true);

  const candidate = selectDailyPuzzleCandidate(day, slot);
  const source = existing ? 'auto-recovered' : 'auto';
  const row = existing
    ? await updateDailyPuzzleSelection(pool, day, slot, candidate, source)
    : await insertDailyPuzzleSelection(pool, day, slot, candidate, source);
  const puzzle = dailyPuzzleById(row.puzzle_id);
  if (!puzzle) {
    throw new Error(`daily puzzle selection points at missing puzzle ${row.puzzle_id}`);
  }
  return selectionResult(row, puzzle, true);
}

function ephemeralDailyPuzzleSelection(day: string, slot: DailyPuzzleSlot): DailyPuzzleResult {
  const candidate = selectDailyPuzzleCandidate(day, slot);
  return {
    day,
    persisted: false,
    puzzle: candidate,
    puzzleId: candidate.id,
    selectedAt: null,
    slot,
    source: 'ephemeral',
    variant: candidate.variant,
  };
}

function selectDailyPuzzleCandidate(day: string, slot: DailyPuzzleSlot): DailyPuzzle {
  const candidates = DAILY_PUZZLE_PROVIDERS.flatMap((provider) =>
    provider.candidates().map((puzzle) => ({ provider, puzzle })),
  )
    .filter(({ puzzle, provider }) => puzzle.variant === provider.variant)
    .sort((left, right) => left.puzzle.id.localeCompare(right.puzzle.id));
  if (candidates.length === 0) throw new Error('no daily puzzle candidates available');
  const seed = createHash('sha256').update(`${day}|${slot}|daily-puzzle-v1`).digest();
  const index = seed.readUInt32BE(0) % candidates.length;
  return candidates[index]!.puzzle;
}

async function readDailyPuzzleSelection(
  db: Queryable,
  day: string,
  slot: DailyPuzzleSlot,
): Promise<DailyPuzzleSelectionRow | null> {
  const { rows } = await db.query<DailyPuzzleSelectionRow>(
    `SELECT day::text, slot, variant, puzzle_id, source, selected_at::text
       FROM puzzle_daily_selections
      WHERE day = $1::date AND slot = $2`,
    [day, slot],
  );
  return rows[0] ?? null;
}

async function insertDailyPuzzleSelection(
  db: Queryable,
  day: string,
  slot: DailyPuzzleSlot,
  puzzle: DailyPuzzle,
  source: string,
): Promise<DailyPuzzleSelectionRow> {
  const inserted = await db.query<DailyPuzzleSelectionRow>(
    `INSERT INTO puzzle_daily_selections (day, slot, variant, puzzle_id, source)
     VALUES ($1::date, $2, $3, $4, $5)
     ON CONFLICT (day, slot) DO NOTHING
     RETURNING day::text, slot, variant, puzzle_id, source, selected_at::text`,
    [day, slot, puzzle.variant, puzzle.id, source],
  );
  if (inserted.rows[0]) return inserted.rows[0];

  const existing = await readDailyPuzzleSelection(db, day, slot);
  if (existing && dailyPuzzleById(existing.puzzle_id)) return existing;
  return updateDailyPuzzleSelection(db, day, slot, puzzle, 'auto-recovered');
}

async function updateDailyPuzzleSelection(
  db: Queryable,
  day: string,
  slot: DailyPuzzleSlot,
  puzzle: DailyPuzzle,
  source: string,
): Promise<DailyPuzzleSelectionRow> {
  const { rows } = await db.query<DailyPuzzleSelectionRow>(
    `INSERT INTO puzzle_daily_selections (day, slot, variant, puzzle_id, source)
     VALUES ($1::date, $2, $3, $4, $5)
     ON CONFLICT (day, slot) DO UPDATE SET
       variant = EXCLUDED.variant,
       puzzle_id = EXCLUDED.puzzle_id,
       source = EXCLUDED.source,
       selected_at = now()
     RETURNING day::text, slot, variant, puzzle_id, source, selected_at::text`,
    [day, slot, puzzle.variant, puzzle.id, source],
  );
  return rows[0]!;
}

function selectionResult(
  row: DailyPuzzleSelectionRow,
  puzzle: DailyPuzzle,
  persisted: boolean,
): DailyPuzzleResult {
  return {
    day: row.day,
    persisted,
    puzzle,
    puzzleId: row.puzzle_id,
    selectedAt: row.selected_at,
    slot: row.slot === DAILY_PUZZLE_HOMEPAGE_SLOT ? row.slot : DAILY_PUZZLE_HOMEPAGE_SLOT,
    source: row.source,
    variant: row.variant,
  };
}
