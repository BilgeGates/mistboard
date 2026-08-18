/**
 * Check the basic-endgame corpus against Pikafish.
 *
 * The corpus states book verdicts ("chariot versus four defensive pieces is a
 * draw") that are folk knowledge in Chinese endgame manuals and almost absent
 * from English sources. This script asks a strong engine what it thinks of each
 * representative position and prints the two side by side.
 *
 * What this does and does not establish:
 *   - It does NOT prove a book result. A fixed search cannot settle a 60-move
 *     fortress, and a drawish score is evidence, not proof.
 *   - It DOES catch a wrong position. If the engine finds mate in 6 in a
 *     position we labelled a book draw, the position is bad — our authoring
 *     error, not a refutation of the manuals. That is the main job here.
 *   - It DOES show where raw material misleads, which is the interesting half:
 *     a chariot against four defensive pieces is +900 of material and a draw.
 *
 * --tablebase adds the one thing a search cannot give: for the small-material
 * end of the corpus, chessdb.cn answers exactly (win / draw / loss plus a mate
 * distance that falls by one every ply, which is what tells you it is a lookup
 * and not a search wearing a mate score). Roughly 27 of the 32 rows fit. It is a
 * network call, so it stays opt-in.
 *
 * Usage:
 *   npx tsx apps/server/src/verify-xiangqi-endgames.ts [--depth 30] [--json out.json]
 *   npx tsx apps/server/src/verify-xiangqi-endgames.ts --tablebase
 */
import { writeFileSync } from 'node:fs';
import {
  type EndgameEntry,
  endgameEntryEngineFen,
  pikafishUciToXiangqiSquares,
  XIANGQI_ENDGAME_CORPUS,
} from '@mistboard/game';
import { runUciEval } from './uci-engine-harness.js';
import { pikafishXiangqiNetPath, pikafishXiangqiPath } from './xiangqi-pikafish-engine.js';

// Coarse buckets for the engine's read, in centipawns from RED's point of view.
// A horse is worth about 400, so 300 is "at least a clear piece"; under 100 is
// the band where a strong engine is saying it sees no way through.
const DECISIVE_CP = 300;
const DRAWISH_CP = 100;

type EngineRead = 'decisive-red' | 'decisive-black' | 'unclear' | 'drawish';

type Row = {
  id: string;
  category: string;
  attacker: string;
  defender: string;
  verdict: string;
  provenance: string;
  fen: string;
  cp: number | null;
  mate: number | null;
  depth: number;
  best: string | null;
  /** Principal variation in OUR square notation, ready for a study mainline. */
  pv: string[];
  read: EngineRead;
  agrees: boolean;
  /** True when the corpus already records this disagreement. */
  expected: boolean;
  /**
   * A claimed win the engine leans toward but cannot finish inside the search.
   * Long technical wins do this; it is not evidence against the verdict, so it
   * is reported apart from real disagreements rather than counted as one.
   */
  unresolved: boolean;
  /** Exact verdict from Red's point of view, when the position fits the database. */
  tablebase?: 'win' | 'draw' | 'loss' | 'not-in-db';
  /** Plies to mate, as the database reports them. */
  tablebasePlies?: number | null;
};

const TABLEBASE_ENDPOINT = 'http://www.chessdb.cn/chessdb.php';

/**
 * Ask the cloud database for one position. Returns the verdict from the SIDE TO
 * MOVE, which the caller normalises, plus the plies-to-mate it reports.
 */
async function queryTablebase(
  fen: string,
): Promise<{ verdict: 'win' | 'draw' | 'loss' | 'not-in-db'; plies: number | null }> {
  const url = `${TABLEBASE_ENDPOINT}?action=queryall&board=${encodeURIComponent(fen)}`;
  let text: string;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    text = (await response.text()).trim();
  } catch {
    return { verdict: 'not-in-db', plies: null };
  }
  // "move:e0f0,score:29975,rank:2,note:! (W-M-0025)|move:…"
  const best = text.split('|')[0] ?? '';
  const note = /note:[^(]*\((W|D|L)-M-(\d+)\)/.exec(best);
  if (note) {
    const verdict = note[1] === 'W' ? 'win' : note[1] === 'L' ? 'loss' : 'draw';
    return { verdict, plies: Number(note[2]) };
  }
  const score = Number(/score:(-?\d+)/.exec(best)?.[1] ?? 'NaN');
  if (Number.isFinite(score)) {
    return { verdict: score > 0 ? 'win' : score < 0 ? 'loss' : 'draw', plies: null };
  }
  return { verdict: 'not-in-db', plies: null };
}

function flipVerdict(verdict: 'win' | 'draw' | 'loss' | 'not-in-db') {
  if (verdict === 'win') return 'loss' as const;
  if (verdict === 'loss') return 'win' as const;
  return verdict;
}

function classify(cp: number | null, mate: number | null): EngineRead {
  if (mate != null && mate !== 0) return mate > 0 ? 'decisive-red' : 'decisive-black';
  if (cp == null) return 'unclear';
  if (cp >= DECISIVE_CP) return 'decisive-red';
  if (cp <= -DECISIVE_CP) return 'decisive-black';
  if (Math.abs(cp) < DRAWISH_CP) return 'drawish';
  return 'unclear';
}

// The engine reports from the side to move; the corpus states verdicts from
// Red's (the attacker's) point of view. Normalise before comparing.
function toRedPov(value: number | null, turn: 'red' | 'black'): number | null {
  if (value == null) return null;
  return turn === 'red' ? value : -value;
}

async function evaluateEntry(entry: EndgameEntry, depth: number): Promise<Row> {
  const bin = pikafishXiangqiPath();
  const net = pikafishXiangqiNetPath(bin);
  const fen = endgameEntryEngineFen(entry);
  const evaluation = await runUciEval({
    bin,
    commands: [
      'uci',
      `setoption name EvalFile value ${net}`,
      'setoption name Threads value 4',
      'setoption name Hash value 256',
      'ucinewgame',
      'isready',
      `position fen ${fen}`,
      `go depth ${depth}`,
    ],
    timeoutMs: 300_000,
    timeoutMessage: `endgame eval timed out: ${entry.id}`,
  });

  // Pikafish speaks a rank-shifted UCI; the tree and the study API speak our
  // square notation. Convert here so nothing downstream has to know the dialect.
  const pv = (evaluation.pv ?? []).flatMap((uci) => {
    const squares = pikafishUciToXiangqiSquares(uci);
    return squares ? [`${squares.from}${squares.to}`] : [];
  });
  const cp = toRedPov(evaluation.cp, entry.turn);
  const mate = toRedPov(evaluation.mate, entry.turn);
  const read = classify(cp, mate);
  const agrees =
    entry.verdict === 'win' ? read === 'decisive-red' : read === 'drawish' || read === 'unclear';
  // A recorded dispute is an expected disagreement, not a new one: the point of
  // the run is to catch NEW breakage, so these should not keep firing as alarms.
  const expected = entry.engineDispute != null;
  const unresolved = entry.verdict === 'win' && read === 'unclear' && (cp ?? 0) > 0;

  return {
    id: entry.id,
    category: entry.category,
    attacker: entry.attacker,
    defender: entry.defender,
    verdict: entry.verdict,
    provenance: entry.provenance,
    fen,
    cp,
    mate,
    depth: evaluation.depth,
    best: evaluation.best,
    pv,
    read,
    agrees,
    expected,
    unresolved,
  };
}

function scoreText(row: Row): string {
  if (row.mate != null && row.mate !== 0) return `mate ${row.mate}`;
  return row.cp == null ? '—' : `${row.cp > 0 ? '+' : ''}${row.cp}`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const depthArg = args.indexOf('--depth');
  const depth = depthArg >= 0 ? Number(args[depthArg + 1]) : 30;
  const jsonArg = args.indexOf('--json');
  const jsonPath = jsonArg >= 0 ? args[jsonArg + 1] : null;
  const onlyArg = args.indexOf('--only');
  const only = onlyArg >= 0 ? args[onlyArg + 1] : null;
  const withTablebase = args.includes('--tablebase');

  const corpus = only
    ? XIANGQI_ENDGAME_CORPUS.filter((entry) => entry.id.includes(only))
    : XIANGQI_ENDGAME_CORPUS;

  console.log(`Pikafish check of ${corpus.length} endgame verdicts, depth ${depth}`);
  console.log('');

  const rows: Row[] = [];
  for (const entry of corpus) {
    let row: Row;
    try {
      row = await evaluateEntry(entry, depth);
    } catch (error) {
      // One position that wedges must not throw away the whole sweep.
      console.log(`?? ${entry.id.padEnd(42)} eval failed: ${(error as Error).message}`);
      continue;
    }
    if (withTablebase) {
      const exact = await queryTablebase(row.fen);
      row.tablebase = entry.turn === 'red' ? exact.verdict : flipVerdict(exact.verdict);
      row.tablebasePlies = exact.plies;
    }
    rows.push(row);
    const flag = row.agrees ? '  ' : row.expected ? '~~' : row.unresolved ? '..' : '!!';
    const tb = row.tablebase
      ? `  tb=${row.tablebase}${row.tablebasePlies == null ? '' : `/${row.tablebasePlies}ply`}`
      : '';
    console.log(
      `${flag} ${row.id.padEnd(42)} book=${row.verdict.padEnd(5)} engine=${row.read.padEnd(14)} ${scoreText(row).padStart(9)}  d${row.depth}${tb}`,
    );
  }

  const known = rows.filter((row) => !row.agrees && row.expected);
  const unresolved = rows.filter((row) => !row.agrees && !row.expected && row.unresolved);
  const disagreements = rows.filter((row) => !row.agrees && !row.expected && !row.unresolved);
  console.log('');
  console.log(
    `${rows.filter((row) => row.agrees).length}/${rows.length} agree with the book verdict` +
      (known.length > 0 ? `, ${known.length} recorded as disputed (~~)` : '') +
      (unresolved.length > 0 ? `, ${unresolved.length} leaning-but-unresolved (..)` : '') +
      '.',
  );
  if (withTablebase) {
    const covered = rows.filter((row) => row.tablebase && row.tablebase !== 'not-in-db');
    const exactAgree = covered.filter(
      (row) => (row.verdict === 'win') === (row.tablebase === 'win'),
    );
    console.log(
      `${covered.length}/${rows.length} fit the cloud database; ${exactAgree.length}/${covered.length} of those match the book verdict exactly.`,
    );
    for (const row of covered) {
      if ((row.verdict === 'win') !== (row.tablebase === 'win')) {
        console.log(`  EXACT MISMATCH ${row.id}: book ${row.verdict}, database ${row.tablebase}`);
        console.log(`    ${row.fen}`);
      }
    }
  }
  if (disagreements.length > 0) {
    console.log('');
    console.log('NEW disagreements (check the POSITION first — a bad representative is the');
    console.log('likeliest cause, not a wrong manual):');
    for (const row of disagreements) {
      console.log(`  ${row.id}`);
      console.log(`    ${row.attacker} vs ${row.defender}`);
      console.log(
        `    book ${row.verdict}, engine ${row.read} (${scoreText(row)}) at depth ${row.depth}`,
      );
      console.log(`    ${row.fen}`);
      console.log(`    best: ${row.best ?? '—'}`);
    }
  }

  if (jsonPath) {
    writeFileSync(jsonPath, `${JSON.stringify(rows, null, 2)}\n`);
    console.log('');
    console.log(`wrote ${jsonPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
