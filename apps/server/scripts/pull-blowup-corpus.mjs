/**
 * Pull "blow-up corpus" candidates from the dev Postgres into a target dir.
 *
 * A blow-up game is one where the engine forfeited mid-game (termination =
 * 'abandonment' + last event = seat-forfeited on the engine seat). These are
 * the seed cases for the bounded-belief workstream — see
 * mistboard-engine/lab/corpora/blowup/README.md.
 *
 * Usage (from ~/projects/mistboard, with DATABASE_URL in env via .env.pve):
 *   source .env.pve && node apps/server/scripts/pull-blowup-corpus.mjs \
 *     --engine python-v2-current \
 *     --since 2026-05-20 \
 *     --out ~/projects/mistboard-engine/lab/corpora/blowup \
 *     [--limit 50]
 *
 * Writes per game:
 *   <out>/<room_id>.jsonl       — raw events, one JSON object per line
 *   <out>/<room_id>.meta.json   — game metadata (engine seats, ply count,
 *                                 termination, time control, forfeit ply)
 *
 * Idempotent: overwrites existing files with the same room_id.
 */
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

function parseArgs(argv) {
  const args = {
    engine: 'python-v2-current',
    since: '2026-05-01',
    out: join(homedir(), 'projects/mistboard-engine/lab/corpora/blowup'),
    limit: 50,
    allResults: false,
    minPlies: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--engine' && next) {
      args.engine = next;
      i++;
    } else if (a === '--since' && next) {
      args.since = next;
      i++;
    } else if (a === '--out' && next) {
      args.out = next;
      i++;
    } else if (a === '--limit' && next) {
      args.limit = Number(next);
      i++;
    } else if (a === '--all-results') {
      args.allResults = true;
    } else if (a === '--min-plies' && next) {
      args.minPlies = Number(next);
      i++;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set. Source .env.pve before running.');
  process.exit(2);
}

const isLocal =
  /(?:@|\/\/)(localhost|127\.0\.0\.1|host\.docker\.internal)/.test(
    process.env.DATABASE_URL ?? '',
  ) || /sslmode=disable/.test(process.env.DATABASE_URL ?? '');
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});
const q = (sql, params = []) => pool.query(sql, params).then((r) => r.rows);

try {
  // The engine ID lives in games.{white,black}_client for PvE games and in
  // eve_games.{white,black}_engine_id for engine-vs-engine games. Cover both.
  const candidates = await q(
    `SELECT
       g.room_id,
       g.variant,
       g.mode,
       g.result,
       g.termination,
       g.ply_count,
       g.started_at,
       g.ended_at,
       g.white_name,
       g.black_name,
       g.white_client,
       g.black_client,
       e.white_engine_id,
       e.black_engine_id,
       e.time_control
     FROM games g
     LEFT JOIN eve_games e ON e.game_id = g.room_id
     WHERE g.status = 'completed'
       ${args.allResults ? '' : "AND g.termination = 'abandonment'"}
       AND (
         g.white_client = $1
         OR g.black_client = $1
         OR e.white_engine_id = $1
         OR e.black_engine_id = $1
       )
       AND g.ended_at >= $2::timestamptz
       AND g.ply_count >= $3
     ORDER BY g.ended_at DESC
     LIMIT $4`,
    [args.engine, args.since, args.minPlies, args.limit],
  );

  console.log(
    `found ${candidates.length} forfeited games involving ${args.engine} since ${args.since}`,
  );

  let written = 0;
  for (const g of candidates) {
    const events = await q(`SELECT payload FROM events WHERE room_id = $1 ORDER BY seq ASC`, [
      g.room_id,
    ]);
    if (events.length === 0) {
      console.log(`  skip ${g.room_id}: no events in DB`);
      continue;
    }

    // Find forfeit ply: which seat forfeited and at what ply count.
    const forfeitEvt = events.map((r) => r.payload).find((p) => p.type === 'seat-forfeited');
    const forfeitedSeat = forfeitEvt?.color ?? null;
    const engineSeat =
      g.white_engine_id === args.engine || g.white_client === args.engine
        ? 'white'
        : g.black_engine_id === args.engine || g.black_client === args.engine
          ? 'black'
          : null;
    const engineWasForfeiter = forfeitedSeat === engineSeat;

    // Count plies up to forfeit.
    let pliesBeforeForfeit = 0;
    for (const r of events) {
      if (r.payload.type === 'seat-forfeited') break;
      if (r.payload.type === 'move-played') pliesBeforeForfeit++;
    }

    const eventsPath = join(args.out, `${g.room_id}.jsonl`);
    const metaPath = join(args.out, `${g.room_id}.meta.json`);

    await writeFile(eventsPath, events.map((r) => JSON.stringify(r.payload)).join('\n') + '\n');
    await writeFile(
      metaPath,
      JSON.stringify(
        {
          roomId: g.room_id,
          variant: g.variant,
          mode: g.mode,
          result: g.result,
          termination: g.termination,
          plyCount: g.ply_count,
          startedAt: g.started_at,
          endedAt: g.ended_at,
          whiteName: g.white_name,
          blackName: g.black_name,
          whiteClient: g.white_client,
          blackClient: g.black_client,
          whiteEngineId: g.white_engine_id,
          blackEngineId: g.black_engine_id,
          timeControl: g.time_control,
          engineSeat,
          engineWasForfeiter,
          forfeitedSeat,
          pliesBeforeForfeit,
        },
        null,
        2,
      ) + '\n',
    );
    written++;
    const tag = engineWasForfeiter ? 'ENGINE-FORFEIT' : 'opp-forfeit';
    console.log(
      `  ${tag}  ${g.room_id}  plies=${pliesBeforeForfeit}  ${g.white_engine_id ?? '?'} vs ${g.black_engine_id ?? '?'}  ended=${g.ended_at.toISOString?.() ?? g.ended_at}`,
    );
  }

  console.log(`\nwrote ${written} games to ${args.out}`);
} finally {
  await pool.end();
}
