// LOCAL DEV TOOL. Import famous human Xiangqi games (DhtmlXQ format, e.g. the
// chasoft/community-xiangqi-games-database Hu Ronghua set) into the local DB as
// finished public games, so the /xiangqi/game/:id analysis viewer can render
// them and the Pikafish request-analysis can run over real master play.
//
//   dry run (categorize, no DB):  tsx src/import-famous-xiangqi.ts --dir <dir>
//   seed:  env DATABASE_URL=... tsx src/import-famous-xiangqi.ts --dir <dir> --seed
//
// DhtmlXQ coords: (col 0-8, row 0-9), origin top-left, Red at the bottom (row 9 =
// Red back rank). Our XiangqiSquare is file a-i + rank 1-10 with Red back = rank 1,
// so: file = 'abcdefghi'[col], rank = 10 - row. Every converted move is matched
// against the rules engine's legal moves on replay, so a bad conversion fails loudly.

import { readdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { getStandardXiangqiLegalMoves } from '@mistboard/game';
import pg from 'pg';
import { runMigrations } from './migrate.js';
import { appendRoomEvent, close, init, recordGameEnd } from './persistence.js';
import { buildTenantGameSummary } from './variant-tenant/events.js';
import { createTenantRuntimeRoomFromEvents } from './variant-tenant/runtime.js';
import { xiangqiTenant } from './xiangqi-tenant.js';

const FILES = 'abcdefghi';
const BASE_AT = Date.UTC(2026, 0, 1, 0, 0, 0);
const MOVE_INTERVAL_MS = 3000;

function tagValue(raw: string, name: string): string {
  // Close tags in this corpus are inconsistent, so capture up to the next '['.
  const m = raw.match(new RegExp(`\\[DhtmlXQ_${name}\\]([^\\[]*)`));
  return m ? m[1]!.trim() : '';
}

function dhtmlxqSquare(col: number, row: number): string {
  return `${FILES[col]}${10 - row}`;
}

type ParsedGame = {
  file: string;
  title: string;
  event: string;
  date: string;
  red: string;
  black: string;
  result: string;
  winner: 'red' | 'black' | null; // null = draw / unknown
  moves: Array<{ from: string; to: string }>;
};

function parseGame(file: string, raw: string): ParsedGame {
  const result = tagValue(raw, 'result');
  const winner =
    /[红紅]/.test(result) && /[胜勝先]/.test(result)
      ? 'red'
      : /黑/.test(result) && /[胜勝先]/.test(result)
        ? 'black'
        : /[红紅]先|红方胜|[红紅]胜/.test(result)
          ? 'red'
          : null;
  // Simpler, robust winner read (the above regex is belt-and-suspenders):
  const w: 'red' | 'black' | null = /[红紅]胜|[红紅]勝|黑负|黑負/.test(result)
    ? 'red'
    : /黑胜|黑勝|[红紅]负|[红紅]負/.test(result)
      ? 'black'
      : winner;

  const movelistRaw = tagValue(raw, 'movelist');
  const digits = movelistRaw.replace(/\D/g, '');
  const moves: Array<{ from: string; to: string }> = [];
  for (let i = 0; i + 4 <= digits.length; i += 4) {
    const c1 = +digits[i]!;
    const r1 = +digits[i + 1]!;
    const c2 = +digits[i + 2]!;
    const r2 = +digits[i + 3]!;
    moves.push({ from: dhtmlxqSquare(c1, r1), to: dhtmlxqSquare(c2, r2) });
  }
  return {
    file,
    title: tagValue(raw, 'title'),
    event: tagValue(raw, 'event'),
    date: tagValue(raw, 'date'),
    red: tagValue(raw, 'red'),
    black: tagValue(raw, 'black'),
    result,
    winner: w,
    moves,
  };
}

type ConvertResult =
  | { ok: true; events: unknown[]; plies: number; termination: string }
  | { ok: false; reason: string };

function convert(game: ParsedGame): ConvertResult {
  const roomId = famousRoomId(game.file);
  // biome-ignore lint/suspicious/noExplicitAny: opaque tenant state in a local harness.
  let state: any = xiangqiTenant.rules.createInitialState(roomId);
  const events: unknown[] = [
    { type: 'room-created', at: BASE_AT, roomId, gameSpecId: xiangqiTenant.gameSpecId },
  ];

  let plies = 0;
  for (const mv of game.moves) {
    if (state.status.type !== 'playing') break; // record ran past a natural finish
    const legals = getStandardXiangqiLegalMoves(state);
    const match = legals.find((l) => l.from === mv.from && l.to === mv.to);
    if (!match)
      return { ok: false, reason: `illegal move at ply ${plies + 1}: ${mv.from}${mv.to}` };
    const color = state.status.turn;
    state = xiangqiTenant.rules.applyMove(state, match);
    plies += 1;
    events.push({
      type: 'move-played',
      at: BASE_AT + plies * MOVE_INTERVAL_MS,
      roomId,
      color,
      move: match,
    });
  }

  // A genuine on-board decisive finish (checkmate / king capture): keep as-is.
  if (state.status.type === 'finished' && state.status.winner != null) {
    return { ok: true, events, plies, termination: state.status.reason ?? 'checkmate' };
  }
  // Mistboard scored a natural draw (repetition/stalemate). Real Xiangqi resolves
  // most of these by the 长将/长捉 perpetual rule (repeating side loses), which we
  // don't implement — so we can't faithfully assign the winner. Skip rather than
  // guess and mislabel (e.g. show the materially-ahead side "resigning").
  if (state.status.type === 'finished') {
    return {
      ok: false,
      reason: `Mistboard-drawn (${state.status.reason}); perpetual rule not modeled`,
    };
  }
  // Still in play after the whole record = the loser resigned. Append their
  // resignation so the log replays to the recorded decisive result.
  if (game.winner === null) return { ok: false, reason: 'draw/unknown result (no resignation)' };
  const loser = game.winner === 'red' ? 'black' : 'red';
  events.push({
    type: 'seat-resigned',
    at: BASE_AT + (plies + 1) * MOVE_INTERVAL_MS,
    roomId,
    color: loser,
  });
  return { ok: true, events, plies, termination: 'resignation' };
}

function famousRoomId(file: string): string {
  const n = basename(file).replace(/\D/g, '').slice(0, 3) || '000';
  return `${xiangqiTenant.roomIdPrefix}famous_${n}`;
}

async function seedGame(game: ParsedGame, events: unknown[]): Promise<string> {
  const roomId = famousRoomId(game.file);
  // biome-ignore lint/suspicious/noExplicitAny: opaque tenant type in a local harness.
  const hydration = createTenantRuntimeRoomFromEvents(xiangqiTenant as any, events as never[]);
  if (!hydration.ok) throw new Error(`replay failed: ${hydration.error}`);
  const room = hydration.room;
  if (room.projection.state.status.type !== 'finished')
    throw new Error('not finished after replay');

  for (let seq = 0; seq < events.length; seq++) {
    try {
      await appendRoomEvent(roomId, seq, events[seq] as never);
    } catch (err) {
      if (!/duplicate key|unique constraint/i.test((err as Error).message)) throw err;
    }
  }
  const base =
    // biome-ignore lint/suspicious/noExplicitAny: opaque tenant type.
    (xiangqiTenant as any).persistence.buildGameSummary?.(room) ??
    buildTenantGameSummary(xiangqiTenant as never, room);
  const now = new Date();
  const summary = {
    ...base,
    mode: 'eve' as const,
    visibility: 'public' as const,
    rated: false,
    startedAt: now,
    endedAt: now,
    whiteName: game.red || 'Red',
    blackName: game.black || 'Black',
    corpusId: 'famous-xiangqi',
  };
  await recordGameEnd(roomId, summary);
  return roomId;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      dir: { type: 'string' },
      seed: { type: 'boolean', default: false },
      limit: { type: 'string', default: '10' },
    },
  });
  if (!values.dir) {
    console.error('--dir <folder of .dhtmlxq files> is required');
    process.exit(1);
  }
  const dir = resolve(values.dir);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.dhtmlxq')).sort();
  const limit = Number.parseInt(values.limit, 10);

  const converted: Array<{ game: ParsedGame; events: unknown[]; plies: number; term: string }> = [];
  for (const file of files) {
    const raw = await readFile(join(dir, file), 'utf-8');
    const game = parseGame(file, raw);
    const c = convert(game);
    if (!c.ok) {
      console.log(`  SKIP ${file.padEnd(16)} ${game.result.padEnd(6)} ${c.reason}`);
      continue;
    }
    converted.push({ game, events: c.events, plies: c.plies, term: c.termination });
    console.log(
      `  ok   ${file.padEnd(16)} ${game.red} vs ${game.black} · ${game.result} · ${c.plies} plies · ${c.termination}`,
    );
    if (converted.length >= limit) break;
  }

  console.log(`\n${converted.length} game(s) convert cleanly (of ${files.length} scanned).`);
  if (!values.seed) {
    console.log('dry run (pass --seed with DATABASE_URL to persist).');
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required to --seed');
    process.exit(1);
  }
  const mc = new pg.Client({ connectionString: databaseUrl });
  await mc.connect();
  try {
    await runMigrations(mc);
  } finally {
    await mc.end();
  }
  init(databaseUrl);
  console.log('\nseeding:');
  const urls: string[] = [];
  for (const { game, events } of converted) {
    const roomId = await seedGame(game, events);
    urls.push(`/xiangqi/game/${roomId}`);
    console.log(`  seeded ${roomId}  (${game.red} vs ${game.black})`);
  }
  await close();
  console.log('\nURLs:');
  for (const u of urls) console.log(`  ${u}`);
}

void main();
