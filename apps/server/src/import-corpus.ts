// Import a corpus of FOW games (JSONL event logs) into Postgres.
//
// Usage:
//   tsx import-corpus.ts \
//     --dir <path-to-jsonl-dir> \
//     --corpus <corpus-id> \
//     --white-name "<engine name>" \
//     --black-name "<engine name>" \
//     [--mode <imported|eve|pve|pvp|manual>]   # default: imported
//
// Reads every *.jsonl in --dir, replays its events to derive a game summary,
// inserts events + a games row per file. Idempotent: ON CONFLICT DO NOTHING
// at both the events PK (room_id, seq) and games PK (room_id).
//
// --mode controls how the imported games surface. The default 'imported' keeps
// them out of the watch feed (which filters mode IN pvp/pve/eve); pass
// '--mode eve' to seed a scrubable local /watch feed from committed samples.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type GameEvent, isGameEndReason, replayGameEvents } from '@mistboard/game';
import pg from 'pg';
import { runMigrations } from './migrate.js';
import { appendEvent, close, type GameSummary, init, recordGameEnd } from './persistence.js';
import type { GameMode } from './persistence-game-lifecycle.js';

const IMPORT_MODES: readonly GameMode[] = ['imported', 'eve', 'pve', 'pvp', 'manual'];

type Args = {
  dir: string;
  corpus: string;
  whiteName: string;
  blackName: string;
  mode: GameMode;
};

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--dir' && next) {
      args.dir = next;
      i++;
    } else if (arg === '--corpus' && next) {
      args.corpus = next;
      i++;
    } else if (arg === '--white-name' && next) {
      args.whiteName = next;
      i++;
    } else if (arg === '--black-name' && next) {
      args.blackName = next;
      i++;
    } else if (arg === '--mode' && next) {
      if (!IMPORT_MODES.includes(next as GameMode)) {
        console.error(`invalid --mode "${next}"; expected one of ${IMPORT_MODES.join(', ')}`);
        process.exit(1);
      }
      args.mode = next as GameMode;
      i++;
    }
  }
  if (!args.dir || !args.corpus || !args.whiteName || !args.blackName) {
    console.error(
      'usage: import-corpus --dir <path> --corpus <id> --white-name <name> --black-name <name> [--mode <imported|eve|pve|pvp|manual>]',
    );
    process.exit(1);
  }
  args.mode ??= 'imported';
  return args as Args;
}

async function importFile(
  filePath: string,
  corpusId: string,
  whiteName: string,
  blackName: string,
  mode: GameMode,
): Promise<{ roomId: string; plyCount: number; status: string }> {
  const raw = await readFile(filePath, 'utf-8');
  const events: GameEvent[] = raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as GameEvent);

  if (events.length === 0) throw new Error(`empty file: ${filePath}`);
  const first = events[0]!;
  if (first.type !== 'room-created')
    throw new Error(`expected room-created as first event in ${filePath}`);
  const roomId = first.roomId;

  for (let seq = 0; seq < events.length; seq++) {
    try {
      await appendEvent(roomId, seq, events[seq]!);
    } catch (err) {
      // Idempotent re-runs: skip duplicate (room_id, seq).
      if (!/duplicate key|unique constraint/i.test((err as Error).message)) throw err;
    }
  }

  const projection = replayGameEvents(events);
  const status = projection.state.status;
  if (status.type !== 'finished') {
    return {
      roomId,
      plyCount: events.filter((e) => e.type === 'move-played').length,
      status: 'not-finished (skipped games row)',
    };
  }

  const moveEvents = events.filter((e) => e.type === 'move-played');
  const result: GameSummary['result'] =
    status.winner === 'white' ? 'white-wins' : status.winner === 'black' ? 'black-wins' : 'draw';
  if (!isGameEndReason(status.reason)) {
    throw new Error(`unknown finished-game reason: ${String(status.reason)}`);
  }
  const termination: GameSummary['termination'] = status.reason;
  const now = new Date();

  const summary: GameSummary = {
    variant: projection.variant,
    mode,
    result,
    termination,
    plyCount: moveEvents.length,
    startedAt: now,
    endedAt: now,
    whiteClient: null,
    blackClient: null,
    whiteName,
    blackName,
    corpusId,
  };
  await recordGameEnd(roomId, summary);
  return { roomId, plyCount: moveEvents.length, status: `${result} / ${termination}` };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const migrationClient = new pg.Client({ connectionString: databaseUrl });
  await migrationClient.connect();
  try {
    const applied = await runMigrations(migrationClient);
    if (applied.length > 0) console.log(`migrations applied: ${applied.join(', ')}`);
  } finally {
    await migrationClient.end();
  }
  init(databaseUrl);

  const files = (await readdir(args.dir)).filter((f) => f.endsWith('.jsonl')).sort();
  if (files.length === 0) {
    console.error(`no .jsonl files in ${args.dir}`);
    process.exit(1);
  }

  console.log(
    `importing ${files.length} file(s) from ${args.dir} as corpus="${args.corpus}", mode="${args.mode}", names=("${args.whiteName}" / "${args.blackName}")`,
  );
  for (const file of files) {
    const result = await importFile(
      join(args.dir, file),
      args.corpus,
      args.whiteName,
      args.blackName,
      args.mode,
    );
    console.log(`  ${file} → room=${result.roomId} plies=${result.plyCount} ${result.status}`);
  }

  await close();
  console.log('done');
}

await main();
