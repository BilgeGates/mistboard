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
 * Usage:
 *   npx tsx apps/server/src/verify-xiangqi-endgames.ts [--depth 30] [--json out.json]
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
};

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
    rows.push(row);
    const flag = row.agrees ? '  ' : row.expected ? '~~' : row.unresolved ? '..' : '!!';
    console.log(
      `${flag} ${row.id.padEnd(42)} book=${row.verdict.padEnd(5)} engine=${row.read.padEnd(14)} ${scoreText(row).padStart(9)}  d${row.depth}`,
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
