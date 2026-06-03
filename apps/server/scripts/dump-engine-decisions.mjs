// Dump the per-move live-engine-decision telemetry for a game, so engine
// anomalies can be diagnosed from the stored artifact instead of guessing.
//
// Reads the `game_debug_artifacts` rows of type 'live-engine-decision' and
// prints, per engine move: the chosen move, its RANK within the engine's own
// moveRanking, the belief size |P|, downsample/cap counters, iterations, and
// whether a fallback fired. A missing moveRanking means the move did NOT come
// from a v2 search (deadline-guard / tier1 / random path → telemetry empty).
//
// NOTE on ply numbering: the artifact `ply` is `context.ply` — the number of
// plies ALREADY played when the engine was asked to move, i.e. (export_ply - 1).
// So Black's export-ply-20 move is stored at ply 19. This script prints both.
//
// Usage (from ~/projects/mistboard, with DATABASE_URL in env, e.g. `.env.pve`):
//   DATABASE_URL=... node apps/server/scripts/dump-engine-decisions.mjs <gameId> [plyCsv]
//   e.g. ... dump-engine-decisions.mjs 56961913-48aa-4476-bda5-5a4db115ab77 19,21,23
import pg from 'pg';

const gameId = process.argv[2];
const plyFilter = process.argv[3]
  ? new Set(process.argv[3].split(',').map((s) => Number.parseInt(s.trim(), 10)))
  : null;

if (!gameId) {
  console.error('usage: dump-engine-decisions.mjs <gameId> [plyCsv]');
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set. Source .env.pve before running.');
  process.exit(2);
}

const isLocal =
  /(?:@|\/\/)(localhost|127\.0\.0\.1|host\.docker\.internal)/.test(process.env.DATABASE_URL) ||
  /sslmode=disable/.test(process.env.DATABASE_URL);
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

const uci = (m) => (m ? `${m.from ?? '?'}${m.to ?? '?'}${m.promotion ? m.promotion[0] : ''}` : '∅');

try {
  const { rows } = await pool.query(
    `SELECT ply, engine_color, payload, created_at
       FROM game_debug_artifacts
      WHERE game_id = $1 AND artifact_type = 'live-engine-decision'
      ORDER BY ply ASC`,
    [gameId],
  );
  if (rows.length === 0) {
    console.log(`no live-engine-decision artifacts for game ${gameId}`);
  }
  console.log(`game ${gameId} — ${rows.length} engine decisions\n`);
  for (const row of rows) {
    if (plyFilter && !plyFilter.has(row.ply)) continue;
    const p = row.payload ?? {};
    const d = p.engine_diagnostics ?? {};
    const ranking = Array.isArray(d.moveRanking) ? d.moveRanking : null;
    const playedUci = uci(p.move);
    // moveRanking entries are [uci, value]; find the played move's rank.
    let playedRank = null;
    let playedVal = null;
    if (ranking) {
      const idx = ranking.findIndex((e) => Array.isArray(e) && e[0] === playedUci);
      if (idx >= 0) {
        playedRank = idx + 1;
        playedVal = ranking[idx][1];
      }
    }
    const top = ranking
      ? ranking.slice(0, 8).map(([m, v]) => `${m}:${Number(v).toFixed(3)}`).join(' ')
      : '(none — non-v2 path)';
    console.log(
      `ply ${row.ply} (export ply ${row.ply + 1}, ${row.engine_color}) ` +
        `move=${playedUci} fallback=${p.fallback} engine=${p.engine_id ?? '?'} ` +
        `decisionSource=${d.decisionSource ?? p.decision_source ?? '?'}`,
    );
    console.log(
      `   |P|=${d.beliefSize ?? '?'} preCap=${d.beliefPreCap ?? '?'} ` +
        `downsample=${d.downsampleCount ?? '?'} iters=${d.iters ?? '?'} ` +
        `think_ms=${p.think_time_ms ?? p.duration_ms ?? '?'} ` +
        `playedRank=${playedRank ?? 'n/a'}${playedVal != null ? `(${Number(playedVal).toFixed(3)})` : ''}`,
    );
    console.log(`   top: ${top}`);
    // Surface any worker/replay provenance fields if present (post-obs-patch).
    const prov = ['worker_idx', 'workerIdx', 'replayMode', 'mode', 'processed_len', 'transcript_len']
      .filter((k) => d[k] != null || p[k] != null)
      .map((k) => `${k}=${d[k] ?? p[k]}`)
      .join(' ');
    if (prov) console.log(`   provenance: ${prov}`);
  }
} finally {
  await pool.end();
}
