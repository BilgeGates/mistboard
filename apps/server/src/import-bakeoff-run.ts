// Import a bakeoff run directory (engine-bakeoff's /data/runs/<ticket>/) into
// Postgres with correct per-game engine attribution.
//
// Reads every shard-*.jsonl for the per-game record — which color the tier1/v2
// engine played, the relative game-log path, and wall_seconds — then replays
// each games/*.jsonl event log. Unlike import-corpus's blanket --white-name /
// --black-name, engine identity is assigned per game from the shard's color
// field, so v2-vs-baseline games are attributed correctly even though the
// tier1 engine alternates colors across the run.
//
// Only platform-format artifacts are touched: the belief-free games/*.jsonl
// event logs and the belief-free shard metadata. perply_path (engine
// internals) is never read. Run this on a box that holds DATABASE_URL — never
// from the engine batch box (keep the prod DB secret off it).
//
// Usage:
//   DATABASE_URL=... tsx import-bakeoff-run.ts \
//     --run <path to run dir> \
//     --tier1-id engine-v2-2026-05-24 --tier1-name "Mistboard Engine v2.0" \
//     --opponent-id python-tier1-v0.9.5 --opponent-name "Mistboard Engine v0.9.5" \
//     [--corpus <corpus-id>]        # default: run-dir basename
//     [--mode eve]                  # default: eve
//     [--visibility public]         # default: public
//     [--skip-migrations]           # don't run migrations (use against an already-migrated DB, e.g. prod)

import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import {
  type BakeoffGameRecord,
  type EngineIdentity,
  namespaceRoomId,
  parseEventLog,
  parseShardRecord,
  participantsForBakeoffGame,
  reconstructRunTimestamps,
  roomIdFromEvents,
  summarizeReplay,
} from './corpus-ingest.js';
import { runMigrations } from './migrate.js';
import { appendEvent, close, type GameSummary, init, recordGameEnd } from './persistence.js';
import type { GameMode, GameVisibility } from './persistence-game-lifecycle.js';

const IMPORT_MODES: readonly GameMode[] = ['eve', 'imported', 'pve', 'pvp', 'manual'];
const VISIBILITIES: readonly GameVisibility[] = ['public', 'unlisted', 'link', 'private'];

type Args = {
  run: string;
  corpus: string;
  tier1: EngineIdentity;
  opponent: EngineIdentity;
  mode: GameMode;
  visibility: GameVisibility;
  skipMigrations: boolean;
};

const BOOLEAN_FLAGS = new Set(['skip-migrations']);

function parseArgs(argv: string[]): Args {
  const raw = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (BOOLEAN_FLAGS.has(key)) {
      flags.add(key);
    } else if (argv[i + 1] !== undefined) {
      raw.set(key, argv[i + 1]!);
      i += 1;
    }
  }
  const run = raw.get('run');
  const tier1Id = raw.get('tier1-id');
  const tier1Name = raw.get('tier1-name');
  const opponentId = raw.get('opponent-id');
  const opponentName = raw.get('opponent-name');
  if (!run || !tier1Id || !tier1Name || !opponentId || !opponentName) {
    console.error(
      'usage: import-bakeoff-run --run <dir> --tier1-id <id> --tier1-name <name> ' +
        '--opponent-id <id> --opponent-name <name> [--corpus <id>] [--mode eve] [--visibility public]',
    );
    process.exit(1);
  }
  const mode = (raw.get('mode') ?? 'eve') as GameMode;
  if (!IMPORT_MODES.includes(mode)) {
    console.error(`invalid --mode "${mode}"; expected one of ${IMPORT_MODES.join(', ')}`);
    process.exit(1);
  }
  const visibility = (raw.get('visibility') ?? 'public') as GameVisibility;
  if (!VISIBILITIES.includes(visibility)) {
    console.error(
      `invalid --visibility "${visibility}"; expected one of ${VISIBILITIES.join(', ')}`,
    );
    process.exit(1);
  }
  return {
    run,
    corpus: raw.get('corpus') ?? basename(run.replace(/\/+$/, '')),
    tier1: { subjectId: tier1Id, displayName: tier1Name },
    opponent: { subjectId: opponentId, displayName: opponentName },
    mode,
    visibility,
    skipMigrations: flags.has('skip-migrations'),
  };
}

// A shard line that has no usable game record — a crashed/incomplete game
// (e.g. {"error":"exit -9"} with no game_path) or an otherwise malformed entry.
type SkippedShardLine = { gameId: string | undefined; error: string | undefined };

// Read every shard-*.jsonl in the run dir into a de-duplicated map of per-game
// records, plus the lines that couldn't be parsed into a game (crashed games
// have no game_path). The shard log is append-per-game and may repeat a game
// across crash recoveries, so last-write-wins keyed by game_id.
async function readShardRecords(
  runDir: string,
): Promise<{ records: Map<string, BakeoffGameRecord>; skipped: SkippedShardLine[] }> {
  const shardFiles = (await readdir(runDir))
    .filter((f) => f.startsWith('shard-') && f.endsWith('.jsonl'))
    .sort();
  const records = new Map<string, BakeoffGameRecord>();
  const skipped: SkippedShardLine[] = [];
  for (const file of shardFiles) {
    const raw = await readFile(join(runDir, file), 'utf-8');
    for (const line of raw.split('\n')) {
      if (line.trim().length === 0) continue;
      const obj = JSON.parse(line) as Record<string, unknown>;
      const record = parseShardRecord(obj);
      if (record) {
        records.set(record.gameId, record);
      } else {
        skipped.push({
          gameId: typeof obj.game_id === 'string' ? obj.game_id : undefined,
          error: typeof obj.error === 'string' ? obj.error : undefined,
        });
      }
    }
  }
  // A game that crashed once but later completed has both a skipped and a valid
  // record; report it only as imported, not crashed.
  const crashed = skipped.filter((s) => !s.gameId || !records.has(s.gameId));
  return { records, skipped: crashed };
}

type Tally = { imported: number; skippedMissing: number; skippedUnfinished: number };

async function importGame(
  runDir: string,
  record: BakeoffGameRecord,
  args: Args,
  tally: Tally,
): Promise<void> {
  const gameFile = join(runDir, record.gamePath);
  let raw: string;
  try {
    raw = await readFile(gameFile, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn(`  ${record.gameId}: game log missing (${record.gamePath}) — stranded, skipped`);
      tally.skippedMissing += 1;
      return;
    }
    throw err;
  }

  const events = parseEventLog(raw);
  // Namespace the room id by corpus so games from different runs (which reuse
  // v2bakeoff-gNNNN ids) don't collide. Rewrite each event's roomId to match the
  // stored column so the persisted events stay internally consistent.
  const roomId = namespaceRoomId(args.corpus, roomIdFromEvents(events, record.gamePath));
  const summary = summarizeReplay(events);
  if (!summary.finished) {
    console.warn(`  ${record.gameId}: not finished (${summary.plyCount} plies) — skipped`);
    tally.skippedUnfinished += 1;
    return;
  }

  for (let seq = 0; seq < events.length; seq += 1) {
    (events[seq] as { roomId?: string }).roomId = roomId;
    try {
      await appendEvent(roomId, seq, events[seq]!);
    } catch (err) {
      if (!/duplicate key|unique constraint/i.test((err as Error).message)) throw err;
    }
  }

  const participants = participantsForBakeoffGame(
    record.tier1Color,
    args.tier1,
    args.opponent,
    args.visibility,
  );
  const whiteName = participants.find((p) => p.color === 'white')?.displayName ?? null;
  const blackName = participants.find((p) => p.color === 'black')?.displayName ?? null;
  const { mtimeMs } = await stat(gameFile);
  const { startedAt, endedAt } = reconstructRunTimestamps(mtimeMs, record.wallSeconds);

  const gameSummary: GameSummary = {
    variant: summary.variant,
    mode: args.mode,
    result: summary.result,
    termination: summary.termination,
    plyCount: summary.plyCount,
    startedAt,
    endedAt,
    whiteClient: null,
    blackClient: null,
    whiteName,
    blackName,
    corpusId: args.corpus,
    rated: false,
    visibility: args.visibility,
    participants,
    initialMs: null,
    incrementMs: null,
  };
  await recordGameEnd(roomId, gameSummary);
  console.log(
    `  ${record.gameId} → room=${roomId} plies=${summary.plyCount} ` +
      `${summary.result}/${summary.termination} (white=${whiteName}, black=${blackName})`,
  );
  tally.imported += 1;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  // Skip when pointed at an already-migrated DB (e.g. prod via the backup
  // wrapper) so an ad-hoc ingest never applies schema changes as a side effect.
  if (!args.skipMigrations) {
    const migrationClient = new pg.Client({ connectionString: databaseUrl });
    await migrationClient.connect();
    try {
      const applied = await runMigrations(migrationClient);
      if (applied.length > 0) console.log(`migrations applied: ${applied.join(', ')}`);
    } finally {
      await migrationClient.end();
    }
  }
  init(databaseUrl);

  const { records, skipped } = await readShardRecords(args.run);
  if (records.size === 0 && skipped.length === 0) {
    console.error(`no shard-*.jsonl game records found in ${args.run}`);
    process.exit(1);
  }

  console.log(
    `importing ${records.size} game(s) from ${args.run} as corpus="${args.corpus}", ` +
      `mode="${args.mode}", tier1="${args.tier1.displayName}" vs opponent="${args.opponent.displayName}"`,
  );
  const tally: Tally = { imported: 0, skippedMissing: 0, skippedUnfinished: 0 };
  for (const record of [...records.values()].sort((a, b) => a.gameId.localeCompare(b.gameId))) {
    await importGame(args.run, record, args, tally);
  }
  for (const s of skipped) {
    console.warn(
      `  ${s.gameId ?? '?'}: crashed/incomplete (${s.error ?? 'no game log'}) — skipped`,
    );
  }

  await close();
  // imported + stranded + unfinished + crashed should equal the shard's game
  // count: every game is accounted for, none silently dropped.
  const total = tally.imported + tally.skippedMissing + tally.skippedUnfinished + skipped.length;
  console.log(
    `done: ${tally.imported} imported, ${tally.skippedMissing} stranded (missing log), ` +
      `${tally.skippedUnfinished} unfinished, ${skipped.length} crashed/incomplete ` +
      `(${total} shard records total)`,
  );
}

// Only run when invoked directly (so the pure helpers stay importable in tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
