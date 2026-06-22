import { type TimeClass, timeClassFromTimeControl } from '@mistboard/game';
import pg from 'pg';
import {
  buildEngineEloReport,
  type EngineEloReport,
  type EngineEloRow,
  loadRatedEngineEloRows,
} from './engine-elo-report.js';
import { DEFAULT_RATING } from './glicko.js';

const DEFAULT_ANCHOR_ENGINE_ID = 'python-random-legal';
const DEFAULT_MIN_ANCHOR_GAMES = 8;

export type BotRatingImportBot = {
  id: string;
  activeEngineId: string;
  defaultGameSpecId: string;
};

export type BotRatingSnapshotDraft = {
  botId: string;
  engineId: string;
  gameSpecId: string;
  timeClass: TimeClass;
  rating: number;
  ratingDeviation: number | null;
  games: number;
  sourceRef: string;
  published: boolean;
};

export type BotRatingImportPlan = {
  sourceRef: string;
  drafts: BotRatingSnapshotDraft[];
  skippedEngineIds: string[];
  unmatchedEngineIds: string[];
};

export type BotRatingImportOptions = {
  anchorRating?: number;
  published?: boolean;
  sourceRef?: string | null;
};

export function buildBotRatingSnapshotPlan(
  report: EngineEloReport,
  bots: readonly BotRatingImportBot[],
  options: BotRatingImportOptions = {},
): BotRatingImportPlan {
  if (!report.variant) throw new Error('bot rating import requires a single report variant');
  const timeClass = timeClassFromEngineTimeControlBucket(report.timeControlBucket);
  if (!timeClass) {
    throw new Error(
      `bot rating import requires an official time-control bucket, got ${report.timeControlBucket ?? '-'}`,
    );
  }

  const anchorRating = options.anchorRating ?? DEFAULT_RATING;
  const sourceRef = options.sourceRef ?? defaultSourceRef(report, anchorRating);
  const botByEngine = new Map(
    bots
      .filter((bot) => bot.defaultGameSpecId === report.variant)
      .map((bot) => [bot.activeEngineId, bot]),
  );
  const drafts: BotRatingSnapshotDraft[] = [];
  const skippedEngineIds: string[] = [];
  const unmatchedEngineIds: string[] = [];

  for (const row of report.rows) {
    if (row.status !== 'rated' || row.elo == null) {
      if (!row.isAnchor) skippedEngineIds.push(row.engineId);
      continue;
    }
    const bot = botByEngine.get(row.engineId);
    if (!bot) {
      unmatchedEngineIds.push(row.engineId);
      continue;
    }
    drafts.push({
      botId: bot.id,
      engineId: row.engineId,
      gameSpecId: report.variant,
      timeClass,
      rating: Math.round(anchorRating + row.elo),
      ratingDeviation: ratingDeviationFromEngineRow(row),
      games: row.games,
      sourceRef,
      published: options.published ?? false,
    });
  }

  return {
    sourceRef,
    drafts,
    skippedEngineIds: [...new Set(skippedEngineIds)].sort(),
    unmatchedEngineIds: [...new Set(unmatchedEngineIds)].sort(),
  };
}

export function timeClassFromEngineTimeControlBucket(bucket: string | null): TimeClass | null {
  const match = bucket?.match(/^tc-(\d+(?:p\d+)?)\+(\d+(?:p\d+)?)$/);
  if (!match) return null;
  const initialSeconds = Number(match[1]!.replace('p', '.'));
  const incrementSeconds = Number(match[2]!.replace('p', '.'));
  if (!Number.isFinite(initialSeconds) || !Number.isFinite(incrementSeconds)) return null;
  return timeClassFromTimeControl(initialSeconds * 1000, incrementSeconds * 1000);
}

export async function insertBotRatingSnapshotDrafts(
  db: pg.Pool,
  drafts: readonly BotRatingSnapshotDraft[],
): Promise<number> {
  if (drafts.length === 0) return 0;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const draft of drafts) {
      await client.query(
        `INSERT INTO bot_rating_snapshots
           (bot_id, game_spec_id, time_class, rating, rating_deviation, games,
            source, source_ref, published, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'eve-anchor', $7, $8,
                 CASE WHEN $8::boolean THEN now() ELSE NULL::timestamptz END)`,
        [
          draft.botId,
          draft.gameSpecId,
          draft.timeClass,
          draft.rating,
          draft.ratingDeviation,
          draft.games,
          draft.sourceRef,
          draft.published,
        ],
      );
    }
    await client.query('COMMIT');
    return drafts.length;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function loadBotRatingImportBots(db: pg.Pool): Promise<BotRatingImportBot[]> {
  const { rows } = await db.query<{
    active_engine_id: string;
    default_game_spec_id: string;
    id: string;
  }>(
    `SELECT id, active_engine_id, default_game_spec_id
       FROM bot_profiles
      WHERE owner_type = 'system'`,
  );
  return rows.map((row) => ({
    id: row.id,
    activeEngineId: row.active_engine_id,
    defaultGameSpecId: row.default_game_spec_id,
  }));
}

type CliArgs = {
  anchorEngineId?: string;
  anchorRating?: number;
  jobId?: string;
  minAnchorGames?: number;
  publish?: boolean;
  sourceRef?: string;
  timeControlBucket?: string;
  tournamentId?: string;
};

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required to import bot ratings');
  const args = parseArgs(process.argv.slice(2));
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const rows = await loadRatedEngineEloRows(pool, {
      jobId: args.jobId ?? process.env.ENGINE_QUEUE_JOB_ID ?? null,
      tournamentId: args.tournamentId ?? process.env.ENGINE_TOURNAMENT_ID ?? null,
      timeControlBucket:
        args.timeControlBucket ?? process.env.ENGINE_RATING_TIME_CONTROL_BUCKET ?? null,
    });
    const report = buildEngineEloReport(rows, {
      anchorEngineId:
        args.anchorEngineId ?? process.env.ENGINE_RATING_ANCHOR ?? DEFAULT_ANCHOR_ENGINE_ID,
      minAnchorGames:
        args.minAnchorGames ??
        positiveInteger(process.env.ENGINE_RATING_MIN_ANCHOR_GAMES, DEFAULT_MIN_ANCHOR_GAMES),
    });
    const bots = await loadBotRatingImportBots(pool);
    const plan = buildBotRatingSnapshotPlan(report, bots, {
      anchorRating: args.anchorRating,
      published: args.publish ?? false,
      sourceRef: args.sourceRef ?? null,
    });
    const inserted = await insertBotRatingSnapshotDrafts(pool, plan.drafts);
    console.log(
      JSON.stringify({
        level: 'info',
        kind: 'bot_rating_snapshot_import',
        inserted,
        published: args.publish ?? false,
        sourceRef: plan.sourceRef,
        variant: report.variant,
        timeControlBucket: report.timeControlBucket,
        anchorEngineId: report.anchorEngineId,
        anchorRating: args.anchorRating ?? DEFAULT_RATING,
        matchedBots: plan.drafts.map((draft) => draft.botId).sort(),
        unmatchedEngineIds: plan.unmatchedEngineIds,
        skippedEngineIds: plan.skippedEngineIds,
      }),
    );
  } finally {
    await pool.end();
  }
}

function ratingDeviationFromEngineRow(row: EngineEloRow): number | null {
  const value = Number.isFinite(row.ciWilson)
    ? row.ciWilson
    : Number.isFinite(row.ciSimple)
      ? row.ciSimple
      : null;
  return value == null ? null : Math.round(value);
}

function defaultSourceRef(report: EngineEloReport, anchorRating: number): string {
  return [
    'engine-elo',
    `variant=${report.variant ?? '-'}`,
    `time=${report.timeControlBucket ?? '-'}`,
    `anchor=${report.anchorEngineId}`,
    `anchorRating=${anchorRating}`,
    `floor=${report.minAnchorGames}`,
  ].join(';');
}

function parseArgs(values: string[]): CliArgs {
  const parsed: CliArgs = {};
  for (let index = 0; index < values.length; index++) {
    const arg = values[index]!;
    if (!arg.startsWith('--')) continue;
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    if (
      rawKey === 'publish' &&
      inlineValue === undefined &&
      (values[index + 1] === undefined || values[index + 1]!.startsWith('--'))
    ) {
      parsed.publish = true;
      continue;
    }
    const value = inlineValue ?? values[++index];
    if (!value) throw new Error(`missing value for --${rawKey}`);
    switch (rawKey) {
      case 'anchor':
      case 'anchor-engine':
        parsed.anchorEngineId = value;
        break;
      case 'anchor-rating':
        parsed.anchorRating = positiveInteger(value, DEFAULT_RATING);
        break;
      case 'job':
      case 'job-id':
        parsed.jobId = value;
        break;
      case 'min-anchor-games':
        parsed.minAnchorGames = positiveInteger(value, DEFAULT_MIN_ANCHOR_GAMES);
        break;
      case 'publish':
        parsed.publish = booleanFlag(value);
        break;
      case 'source-ref':
        parsed.sourceRef = value;
        break;
      case 'time-control-bucket':
        parsed.timeControlBucket = value;
        break;
      case 'tournament':
      case 'tournament-id':
        parsed.tournamentId = value;
        break;
      default:
        throw new Error(`unknown argument --${rawKey}`);
    }
  }
  return parsed;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function booleanFlag(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  throw new Error(`invalid boolean flag ${value}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
