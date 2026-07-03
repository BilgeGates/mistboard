// Seed the local DB with the committed per-variant postgame fixtures
// (fixtures/variant-postgame/<gameSpecId>.jsonl, produced by
// generate-variant-fixtures.ts). Each fixture is replayed through its tenant to
// derive the terminal GameSummary, then persisted as a public eve game so it
// surfaces in the watch feed and the native /<variant>/game/:id postgame page
// (and thus in the dev /postgame-sheet review surface).
//
//   env DATABASE_URL=... tsx src/seed-variant-fixtures.ts [--dir <dir>]
//
// Idempotent: duplicate (room_id, seq) inserts are skipped, so re-runs are safe.

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import pg from 'pg';

import { banqiTenant } from './banqi-tenant.js';
import { crossroadsChessTenant } from './crossroads-chess-tenant.js';
import { darkCrazyhouseTenant } from './dark-crazyhouse-tenant.js';
import { darkCrossroadsChessTenant } from './dark-crossroads-chess-tenant.js';
import { darkMiniXiangqiTenant } from './dark-mini-xiangqi-tenant.js';
import { darkShogiTenant } from './dark-shogi-tenant.js';
import { darkXiangqiTenant } from './dark-xiangqi-tenant.js';
import { dropMiniXiangqiTenant } from './drop-mini-xiangqi-tenant.js';
import { fortressXiangqiTenant } from './fortress-xiangqi-tenant.js';
import { jieqiTenant } from './jieqi-tenant.js';
import { jungleFlipTenant } from './jungle-flip-tenant.js';
import { jungleTenant } from './jungle-tenant.js';
import { kriegspielTenant } from './kriegspiel-tenant.js';
import { runMigrations } from './migrate.js';
import { miniXiangqiTenant } from './mini-xiangqi-tenant.js';
import { appendRoomEvent, close, init, recordGameEnd } from './persistence.js';
import { revealChessTenant } from './reveal-chess-tenant.js';
import { buildTenantGameSummary } from './variant-tenant/events.js';
import { createTenantRuntimeRoomFromEvents } from './variant-tenant/runtime.js';

// biome-ignore lint/suspicious/noExplicitAny: cross-variant harness; tenants carry
// their own concrete Color/Move/State types and are driven through `any` here.
const TENANTS: any[] = [
  jungleTenant,
  jungleFlipTenant,
  jieqiTenant,
  banqiTenant,
  miniXiangqiTenant,
  darkMiniXiangqiTenant,
  dropMiniXiangqiTenant,
  fortressXiangqiTenant,
  revealChessTenant,
  crossroadsChessTenant,
  darkCrossroadsChessTenant,
  darkShogiTenant,
  darkCrazyhouseTenant,
  kriegspielTenant,
  darkXiangqiTenant,
];

// biome-ignore lint/suspicious/noExplicitAny: opaque tenant type, keyed by spec id.
const TENANT_BY_SPEC = new Map<string, any>(TENANTS.map((t) => [t.gameSpecId as string, t]));

function isDuplicateKey(err: unknown): boolean {
  return /duplicate key|unique constraint/i.test((err as Error).message);
}

async function seedFile(dir: string, file: string): Promise<string> {
  const raw = await readFile(join(dir, file), 'utf-8');
  const events = raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as { type: string; roomId: string; gameSpecId?: string });
  if (events.length === 0) throw new Error(`empty fixture: ${file}`);

  const first = events[0]!;
  if (first.type !== 'room-created' || !first.gameSpecId) {
    throw new Error(`${file}: first event must be room-created with a gameSpecId`);
  }
  const tenant = TENANT_BY_SPEC.get(first.gameSpecId);
  if (!tenant) throw new Error(`${file}: no tenant for gameSpecId "${first.gameSpecId}"`);
  const roomId = first.roomId;

  const hydration = createTenantRuntimeRoomFromEvents(tenant, events as never[]);
  if (!hydration.ok) throw new Error(`${file}: replay failed (${hydration.error})`);
  const room = hydration.room;
  if (room.projection.state.status.type !== 'finished') {
    throw new Error(`${file}: fixture is not a finished game (skipped)`);
  }

  for (let seq = 0; seq < events.length; seq++) {
    try {
      await appendRoomEvent(roomId, seq, events[seq] as never);
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
    }
  }

  const base = tenant.persistence.buildGameSummary?.(room) ?? buildTenantGameSummary(tenant, room);
  // Surface these committed samples the same way the dark-chess corpus does: a
  // public engine-vs-engine game visible in the watch feed and postgame review.
  // Stamp fresh start/end at seed time (the fixture's event `at` timestamps are a
  // fixed epoch for deterministic commits; the watch feed only lists recent games,
  // so a stale endedAt would hide them).
  const now = new Date();
  const summary = {
    ...base,
    mode: 'eve' as const,
    visibility: 'public' as const,
    rated: false,
    startedAt: now,
    endedAt: now,
    whiteName: base.whiteName ?? `Random self-play (${tenant.colors[0]})`,
    blackName: base.blackName ?? `Random self-play (${tenant.colors[1]})`,
    corpusId: 'variant-postgame-fixture',
  };
  await recordGameEnd(roomId, summary);

  const status = room.projection.state.status;
  return `${roomId} plies=${summary.plyCount} ${summary.result} / ${status.reason}`;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { dir: { type: 'string', default: 'fixtures/variant-postgame' } },
  });
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const dir = resolve(repoRoot, 'apps/server', values.dir);

  const migrationClient = new pg.Client({ connectionString: databaseUrl });
  await migrationClient.connect();
  try {
    await runMigrations(migrationClient);
  } finally {
    await migrationClient.end();
  }
  init(databaseUrl);

  const files = (await readdir(dir)).filter((f) => f.endsWith('.jsonl')).sort();
  if (files.length === 0) {
    console.error(`no .jsonl fixtures in ${dir}`);
    process.exit(1);
  }
  console.log(`seeding ${files.length} variant fixture(s) from ${values.dir}`);
  let failures = 0;
  for (const file of files) {
    try {
      const result = await seedFile(dir, file);
      console.log(`  ok   ${file.padEnd(28)} ${result}`);
    } catch (err) {
      failures += 1;
      console.error(`  FAIL ${file.padEnd(28)} ${(err as Error).message}`);
    }
  }
  await close();
  if (failures > 0) process.exit(1);
  console.log('\ndone.');
}

void main();
