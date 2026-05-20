#!/usr/bin/env node
// Load harness CLI.
//
// Usage:
//   npm run loadtest --workspace @mistboard/server -- \
//     --mode pve-blitz --concurrency 10 [--duration 60s] [--server ws://127.0.0.1:3001] \
//     [--seed 42] [--out results.jsonl]
//
// Reports p50/p95/p99 of per-move latency across all completed games, plus
// completion rate. With --out, also writes one JSONL record per game so you
// can post-hoc analyze.

import { writeFileSync } from 'node:fs';
import { scenarios } from './scenarios.js';
import { runScenario, type GameResult } from './runner.js';
import { formatSummary, summarize } from './stats.js';

interface Args {
  mode: string;
  concurrency: number;
  durationMs?: number;
  serverUrl: string;
  seed?: number;
  outFile?: string;
  quiet: boolean;
  engine?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    const next = () => argv[++i];
    if (a === '--mode') args.mode = next();
    else if (a === '--concurrency') args.concurrency = Number(next());
    else if (a === '--duration') args.durationMs = parseDuration(next() ?? '');
    else if (a === '--server') args.serverUrl = next();
    else if (a === '--seed') args.seed = Number(next());
    else if (a === '--out') args.outFile = next();
    else if (a === '--engine') args.engine = next();
    else if (a === '--quiet') args.quiet = true;
    else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`unknown arg: ${a}`);
    }
  }
  if (!args.mode) throw new Error('missing --mode');
  if (!args.concurrency || Number.isNaN(args.concurrency)) throw new Error('missing --concurrency');
  return {
    mode: args.mode,
    concurrency: args.concurrency,
    durationMs: args.durationMs,
    serverUrl: args.serverUrl ?? 'ws://127.0.0.1:3001',
    seed: args.seed,
    outFile: args.outFile,
    quiet: args.quiet ?? false,
    engine: args.engine,
  };
}

function parseDuration(s: string): number {
  const match = /^(\d+)(ms|s|m)?$/.exec(s);
  if (!match) throw new Error(`bad duration: ${s}`);
  const n = Number(match[1]);
  const unit = match[2] ?? 's';
  return unit === 'ms' ? n : unit === 's' ? n * 1_000 : n * 60_000;
}

// Collapse long diagnostic notes into short bucket labels for summary tallies.
function bucketTag(raw: string): string {
  if (raw === 'FIN' || raw === 'ERR' || raw === 'OK') return raw;
  if (raw.startsWith('move-wait-timeout')) return 'TIMEOUT';
  if (raw.startsWith('reply-wait-timeout')) return 'TIMEOUT';
  if (raw === 'maxMoves-cap') return 'CAP-MOVES';
  if (raw === 'maxGameMs-exceeded') return 'CAP-MS';
  if (raw === 'no-legal-moves') return 'NO-LEGAL';
  return raw.slice(0, 30);
}

function printHelp(): void {
  const modes = Object.keys(scenarios).join(', ');
  console.log(`Mistboard load harness

  --mode <scenario>      Required. One of: ${modes}
  --concurrency <N>      Required. Concurrent games.
  --duration <Ns|Nms|Nm> Optional. Repeat games until this wall-clock elapses.
                         If omitted, each worker runs exactly one game.
  --server <ws://...>    Optional. Default: ws://127.0.0.1:3001
  --seed <int>           Optional. Base PRNG seed for move selection.
  --out <file>           Optional. Write JSONL per-game records.
  --engine <id>          Optional. PvE-only override (e.g. python-random-legal,
                         python-tier1-v0.9.1). Default: server's builtin.
  --quiet                Suppress per-game progress lines.
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const baseScenario = scenarios[args.mode];
  if (!baseScenario) throw new Error(`unknown scenario: ${args.mode}`);
  const scenario = args.engine ? { ...baseScenario, engineId: args.engine } : baseScenario;

  const out: GameResult[] = [];
  const completedByNote = new Map<string, number>();
  const startedAt = Date.now();

  if (!args.quiet) {
    console.log(`[loadtest] scenario=${scenario.name} concurrency=${args.concurrency}${args.durationMs ? ` duration=${args.durationMs}ms` : ' (single-pass)'} server=${args.serverUrl}`);
  }

  await runScenario({
    serverUrl: args.serverUrl,
    scenario,
    concurrency: args.concurrency,
    durationMs: args.durationMs,
    seed: args.seed,
    onGameComplete: (r) => {
      out.push(r);
      const rawTag = r.error ? 'ERR' : r.finishedNaturally ? 'FIN' : (r.note ?? 'OK');
      const tag = bucketTag(rawTag);
      completedByNote.set(tag, (completedByNote.get(tag) ?? 0) + 1);
      if (!args.quiet) {
        const lat = r.moveLatencies.length > 0
          ? `last=${r.moveLatencies[r.moveLatencies.length - 1]!}ms`
          : 'no-moves';
        console.log(`  game ${String(r.gameIdx).padStart(4)} ${tag.padEnd(20)} moves=${r.moveLatencies.length} ${lat}${r.error ? ` err=${r.error}` : ''}`);
      }
    },
  });

  const wallMs = Date.now() - startedAt;
  const allLatencies = out.flatMap((r) => r.moveLatencies);
  const gameSummary = summarize(out.map((r) => r.durationMs));
  const moveSummary = summarize(allLatencies);

  console.log('\n[loadtest] summary');
  console.log(`  scenario=${scenario.name} concurrency=${args.concurrency}`);
  console.log(`  wall=${wallMs}ms  games=${out.length}  total_moves=${allLatencies.length}`);
  console.log(`  outcomes: ${[...completedByNote.entries()].map(([k, v]) => `${k}=${v}`).join('  ')}`);
  console.log('  ' + formatSummary('move-rtt', moveSummary));
  console.log('  ' + formatSummary('game-duration', gameSummary));

  if (args.outFile) {
    const lines = out.map((r) => JSON.stringify(r)).join('\n');
    writeFileSync(args.outFile, lines + '\n');
    console.log(`  wrote ${out.length} records to ${args.outFile}`);
  }
}

main().catch((err) => {
  console.error('[loadtest] fatal:', err);
  process.exit(1);
});
