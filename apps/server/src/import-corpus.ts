// Import a corpus of FOW games (JSONL event logs) into Postgres.
//
// Usage:
//   tsx import-corpus.ts \
//     --dir <path-to-jsonl-dir> \
//     --corpus <corpus-id> \
//     --white-name "<engine name>" \
//     --black-name "<engine name>"
//
// Reads every *.jsonl in --dir, replays its events to derive a game summary,
// inserts events + a games row per file. Idempotent: ON CONFLICT DO NOTHING
// at both the events PK (room_id, seq) and games PK (room_id).

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { replayGameEvents, type GameEvent } from '@mistboard/game';
import { runMigrations } from './migrate.js';
import {
  appendEvent,
  close,
  init,
  recordGameEnd,
  type GameSummary,
} from './persistence.js';

type Args = {
  dir: string;
  corpus: string;
  whiteName: string;
  blackName: string;
};

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--dir' && next) { args.dir = next; i++; }
    else if (arg === '--corpus' && next) { args.corpus = next; i++; }
    else if (arg === '--white-name' && next) { args.whiteName = next; i++; }
    else if (arg === '--black-name' && next) { args.blackName = next; i++; }
  }
  if (!args.dir || !args.corpus || !args.whiteName || !args.blackName) {
    console.error('usage: import-corpus --dir <path> --corpus <id> --white-name <name> --black-name <name>');
    process.exit(1);
  }
  return args as Args;
}

async function importFile(filePath: string, corpusId: string, whiteName: string, blackName: string): Promise<{ roomId: string; plyCount: number; status: string }> {
  const raw = await readFile(filePath, 'utf-8');
  const events: GameEvent[] = raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as GameEvent);

  if (events.length === 0) throw new Error(`empty file: ${filePath}`);
  const first = events[0]!;
  if (first.type !== 'room-created') throw new Error(`expected room-created as first event in ${filePath}`);
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
    return { roomId, plyCount: events.filter((e) => e.type === 'move-played').length, status: 'not-finished (skipped games row)' };
  }

  const moveEvents = events.filter((e) => e.type === 'move-played');
  const result: GameSummary['result'] = status.winner === 'white' ? 'white-wins'
    : status.winner === 'black' ? 'black-wins'
    : 'draw';
  const termination = status.reason as GameSummary['termination'];
  const now = new Date();

  const summary: GameSummary = {
    variant: projection.variant,
    mode: 'imported',
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

  console.log(`importing ${files.length} file(s) from ${args.dir} as corpus="${args.corpus}", names=("${args.whiteName}" / "${args.blackName}")`);
  for (const file of files) {
    const result = await importFile(join(args.dir, file), args.corpus, args.whiteName, args.blackName);
    console.log(`  ${file} → room=${result.roomId} plies=${result.plyCount} ${result.status}`);
  }

  await close();
  console.log('done');
}

await main();
