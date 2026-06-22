import pg from 'pg';
import type { BotRatingSource } from './persistence-bots.js';
import type { RatingTimeClass } from './rating-buckets.js';

export type BotRatingSnapshotVisibility = 'all' | 'published' | 'drafts';

export type BotRatingSnapshotListOptions = {
  botId?: string | null;
  history?: boolean;
  limit?: number;
  visibility?: BotRatingSnapshotVisibility;
};

export type BotRatingSnapshotAuditRow = {
  snapshotId: number;
  botId: string;
  displayName: string;
  activeEngineId: string;
  gameSpecId: string;
  timeClass: RatingTimeClass;
  rating: number;
  ratingDeviation: number | null;
  games: number;
  source: BotRatingSource;
  sourceRef: string | null;
  published: boolean;
  publishedAt: Date | null;
  createdAt: Date;
};

export type BotRatingSnapshotPromotionOptions = {
  at?: Date;
  botId?: string | null;
  gameSpecId?: string | null;
  snapshotId?: number | null;
  sourceRef?: string | null;
  timeClass?: RatingTimeClass | null;
};

type Queryable = {
  query<T extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
};

type BotRatingSnapshotAuditSqlRow = {
  active_engine_id: string;
  bot_id: string;
  created_at: Date;
  display_name: string;
  game_spec_id: string;
  games: number;
  published: boolean;
  rating: number;
  rating_deviation: number | null;
  snapshot_id: string;
  source: BotRatingSource;
  source_ref: string | null;
  time_class: RatingTimeClass;
  published_at: Date | null;
};

export async function listBotRatingSnapshots(
  db: Queryable,
  options: BotRatingSnapshotListOptions = {},
): Promise<BotRatingSnapshotAuditRow[]> {
  const values: unknown[] = [];
  const predicates = ['1 = 1'];
  if (options.botId) {
    values.push(options.botId);
    predicates.push(`b.id = $${values.length}`);
  }
  const visibility = options.visibility ?? 'all';
  if (visibility === 'published' || visibility === 'drafts') {
    values.push(visibility === 'published');
    predicates.push(`s.published = $${values.length}`);
  }
  const limit = boundedLimit(options.limit, options.history ? 100 : 200);
  values.push(limit);
  const limitParam = `$${values.length}`;
  const whereSql = predicates.join(' AND ');

  const rowOrderSql =
    visibility === 'published'
      ? 's.published_at DESC NULLS LAST, s.created_at DESC, s.id DESC'
      : 's.created_at DESC, s.id DESC';

  const sql = options.history
    ? `SELECT ${auditColumns()}
         FROM bot_rating_snapshots s
         JOIN bot_profiles b ON b.id = s.bot_id
        WHERE ${whereSql}
        ORDER BY ${rowOrderSql}
        LIMIT ${limitParam}`
    : `SELECT *
         FROM (
           SELECT ${auditColumns()},
                  ROW_NUMBER() OVER (
                    PARTITION BY s.bot_id, s.game_spec_id, s.time_class
                    ORDER BY ${rowOrderSql}
                  ) AS snapshot_rank
             FROM bot_rating_snapshots s
             JOIN bot_profiles b ON b.id = s.bot_id
            WHERE ${whereSql}
         ) ranked
        WHERE ranked.snapshot_rank = 1
        ORDER BY ranked.display_name, ranked.game_spec_id, ranked.time_class
        LIMIT ${limitParam}`;

  const { rows } = await db.query<BotRatingSnapshotAuditSqlRow>(sql, values);
  return rows.map(snapshotFromRow);
}

export async function promoteBotRatingSnapshots(
  db: pg.Pool,
  options: BotRatingSnapshotPromotionOptions,
): Promise<BotRatingSnapshotAuditRow[]> {
  if ((options.snapshotId == null) === (options.sourceRef == null || options.sourceRef === '')) {
    throw new Error('provide exactly one of snapshotId or sourceRef');
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const values: unknown[] = [];
    const predicates = ['s.published = false'];
    if (options.snapshotId != null) {
      values.push(options.snapshotId);
      predicates.push(`s.id = $${values.length}`);
    }
    if (options.sourceRef) {
      values.push(options.sourceRef);
      predicates.push(`s.source_ref = $${values.length}`);
    }
    if (options.botId) {
      values.push(options.botId);
      predicates.push(`s.bot_id = $${values.length}`);
    }
    if (options.gameSpecId) {
      values.push(options.gameSpecId);
      predicates.push(`s.game_spec_id = $${values.length}`);
    }
    if (options.timeClass) {
      values.push(options.timeClass);
      predicates.push(`s.time_class = $${values.length}`);
    }
    const { rows: selected } = await client.query<{ id: string }>(
      `SELECT s.id::text AS id
         FROM bot_rating_snapshots s
        WHERE ${predicates.join(' AND ')}
        ORDER BY s.created_at DESC, s.id DESC
        FOR UPDATE`,
      values,
    );
    const ids = selected.map((row) => Number(row.id));
    if (ids.length === 0) throw new Error('no draft bot rating snapshots matched promotion');

    const publishedAt = options.at ?? new Date();
    await client.query(
      `UPDATE bot_rating_snapshots
          SET published = true,
              published_at = $2
        WHERE id = ANY($1::bigint[])`,
      [ids, publishedAt],
    );

    const promoted = await queryBotRatingSnapshotsById(client, ids);
    await client.query('COMMIT');
    return promoted;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export function renderBotRatingSnapshotsMarkdown(
  rows: readonly BotRatingSnapshotAuditRow[],
): string {
  if (rows.length === 0) return 'No bot rating snapshots.\n';
  const lines = [
    '| Bot | Engine | Spec | TC | Rating | RD/CI | Games | Status | Source | Created | Published |',
    '|---|---|---|---|---:|---:|---:|---|---|---|---|',
  ];
  for (const row of rows) {
    lines.push(
      `| ${escapeCell(row.displayName)} (\`${escapeCell(row.botId)}\`) ` +
        `| \`${escapeCell(row.activeEngineId)}\` ` +
        `| ${escapeCell(row.gameSpecId)} ` +
        `| ${escapeCell(row.timeClass)} ` +
        `| ${row.rating} ` +
        `| ${row.ratingDeviation == null ? '-' : Math.round(row.ratingDeviation)} ` +
        `| ${row.games} ` +
        `| ${row.published ? 'published' : 'draft'} ` +
        `| ${escapeCell(sourceLabel(row))} ` +
        `| ${row.createdAt.toISOString()} ` +
        `| ${row.publishedAt ? row.publishedAt.toISOString() : '-'} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function auditColumns(): string {
  return `s.id::text AS snapshot_id,
          s.bot_id,
          b.display_name,
          b.active_engine_id,
          s.game_spec_id,
          s.time_class,
          s.rating,
          s.rating_deviation,
          s.games,
          s.source,
          s.source_ref,
          s.published,
          s.published_at,
          s.created_at`;
}

async function queryBotRatingSnapshotsById(
  db: Queryable,
  ids: readonly number[],
): Promise<BotRatingSnapshotAuditRow[]> {
  const { rows } = await db.query<BotRatingSnapshotAuditSqlRow>(
    `SELECT ${auditColumns()}
       FROM bot_rating_snapshots s
       JOIN bot_profiles b ON b.id = s.bot_id
      WHERE s.id = ANY($1::bigint[])
      ORDER BY s.published_at DESC NULLS LAST, s.created_at DESC, s.id DESC`,
    [ids],
  );
  return rows.map(snapshotFromRow);
}

function snapshotFromRow(row: BotRatingSnapshotAuditSqlRow): BotRatingSnapshotAuditRow {
  return {
    snapshotId: Number(row.snapshot_id),
    botId: row.bot_id,
    displayName: row.display_name,
    activeEngineId: row.active_engine_id,
    gameSpecId: row.game_spec_id,
    timeClass: row.time_class,
    rating: row.rating,
    ratingDeviation: row.rating_deviation,
    games: row.games,
    source: row.source,
    sourceRef: row.source_ref,
    published: row.published,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

function sourceLabel(row: BotRatingSnapshotAuditRow): string {
  return row.sourceRef ? `${row.source} ${row.sourceRef}` : row.source;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function boundedLimit(value: number | undefined, fallback: number): number {
  if (!Number.isInteger(value) || value == null) return fallback;
  return Math.max(1, Math.min(value, 500));
}

type CliArgs = BotRatingSnapshotListOptions & {
  format?: 'json' | 'markdown';
};

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required to list bot rating snapshots');
  const args = parseArgs(process.argv.slice(2));
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const snapshots = await listBotRatingSnapshots(pool, args);
    if ((args.format ?? 'markdown') === 'json') {
      console.log(
        JSON.stringify(
          {
            level: 'info',
            kind: 'bot_rating_snapshots',
            botId: args.botId ?? null,
            history: args.history ?? false,
            visibility: args.visibility ?? 'all',
            snapshots,
          },
          null,
          2,
        ),
      );
    } else {
      process.stdout.write(renderBotRatingSnapshotsMarkdown(snapshots));
    }
  } finally {
    await pool.end();
  }
}

function parseArgs(values: string[]): CliArgs {
  const parsed: CliArgs = {};
  for (let index = 0; index < values.length; index++) {
    const arg = values[index]!;
    if (!arg.startsWith('--')) continue;
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    if (rawKey === 'history' && inlineValue === undefined) {
      parsed.history = true;
      continue;
    }
    if (rawKey === 'published' && inlineValue === undefined) {
      parsed.visibility = 'published';
      continue;
    }
    if (rawKey === 'drafts' && inlineValue === undefined) {
      parsed.visibility = 'drafts';
      continue;
    }
    const value = inlineValue ?? values[++index];
    if (!value) throw new Error(`missing value for --${rawKey}`);
    switch (rawKey) {
      case 'bot':
      case 'bot-id':
        parsed.botId = value;
        break;
      case 'drafts':
        if (parseBooleanFlag(value)) parsed.visibility = 'drafts';
        break;
      case 'format':
        if (value !== 'json' && value !== 'markdown')
          throw new Error('--format must be json or markdown');
        parsed.format = value;
        break;
      case 'history':
        parsed.history = parseBooleanFlag(value);
        break;
      case 'limit':
        parsed.limit = positiveInteger(value, 100);
        break;
      case 'published':
        if (parseBooleanFlag(value)) parsed.visibility = 'published';
        break;
      default:
        throw new Error(`unknown argument --${rawKey}`);
    }
  }
  return parsed;
}

function parseBooleanFlag(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  throw new Error(`invalid boolean flag ${value}`);
}

function positiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
