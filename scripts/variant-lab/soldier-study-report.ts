// Build the Fortress soldier-rule study report: reads the study outputs, computes
// distributions, picks representative games to showcase, and (if the HTML template
// exists) injects the data to produce a self-contained report.html.
//
// Usage: npx tsx scripts/variant-lab/soldier-study-report.ts --in <studyDir> [--template <file>] [--out <file>]

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : dflt;
}

type PerPly = {
  ply: number;
  mover: 'red' | 'black';
  uci: string;
  evalRed: number;
  isDrop: boolean;
  role: string;
  captureRole: string | null;
  soldierOwnHalfSideways: boolean;
};
type Game = {
  condition: 'base' | 'vet';
  seed: number;
  opening: string[];
  moves: string[];
  plies: number;
  winner: 'red' | 'black' | null;
  reason: string;
  decisive: boolean;
  evalRedSeries: number[];
  perPly: PerPly[];
};

function readGames(file: string): Game[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Game);
}

function volatility(g: Game): number {
  const e = g.evalRedSeries;
  if (e.length < 2) return 0;
  let s = 0;
  for (let i = 1; i < e.length; i += 1) s += Math.abs(e[i]! - e[i - 1]!);
  return s / (e.length - 1);
}
function winnerMinEval(g: Game): number {
  if (!g.decisive || !g.winner) return 0;
  const pov = g.winner === 'red' ? g.evalRedSeries : g.evalRedSeries.map((v) => -v);
  return Math.min(...pov);
}
function lateralCount(g: Game): number {
  return g.perPly.filter((p) => p.soldierOwnHalfSideways).length;
}

// A showcased game, flattened for the viewer: opening + main moves in one list,
// evals aligned (null through the random opening).
function pack(g: Game, label: string, blurb: string) {
  const fullMoves = [...g.opening, ...g.moves];
  const evalByMove: (number | null)[] = [...g.opening.map(() => null), ...g.evalRedSeries];
  const lateral = g.perPly.flatMap((p, i) =>
    p.soldierOwnHalfSideways ? [g.opening.length + i] : [],
  );
  const captures = g.perPly.flatMap((p, i) => (p.captureRole ? [g.opening.length + i] : []));
  return {
    condition: g.condition,
    label,
    blurb,
    seed: g.seed,
    winner: g.winner,
    reason: g.reason,
    plies: g.plies,
    openingLen: g.opening.length,
    volatility: Math.round(volatility(g)),
    lateralMoves: lateral.length,
    deepestDeficit: Math.round(winnerMinEval(g)),
    fullMoves,
    evalByMove,
    lateral,
    captures,
  };
}

function histogram(vals: number[], edges: number[]): number[] {
  const bins = new Array(edges.length + 1).fill(0) as number[];
  for (const v of vals) {
    let placed = false;
    for (let i = 0; i < edges.length; i += 1) {
      if (v < edges[i]!) {
        bins[i] += 1;
        placed = true;
        break;
      }
    }
    if (!placed) bins[edges.length] += 1;
  }
  return bins.map((c) => c / (vals.length || 1));
}

function main(): void {
  const studyDir = resolve(arg('in', '.'));
  const base = readGames(resolve(studyDir, 'base.jsonl'));
  const vet = readGames(resolve(studyDir, 'vet.jsonl'));
  const summary = JSON.parse(readFileSync(resolve(studyDir, 'summary.json'), 'utf8'));

  // ── Curate the best VETERAN-soldier games by archetype ──
  // The point is to judge the FEEL before committing, so pick decisive games that
  // actually use the new mechanic (home-half soldier defense), spanning comeback /
  // wall / calm / still-sharp / long-hold. One BASE game trails for contrast.
  const decisive = (gs: Game[]) => gs.filter((g) => g.decisive && g.winner);
  const dv = decisive(vet);
  const defPawns = (g: Game) => Math.trunc(Math.abs(Math.round(winnerMinEval(g))) / 100);

  const picked = new Set<string>();
  const key = (g: Game) => `${g.condition}:${g.seed}`;
  const take = (
    candidates: Game[],
    label: string,
    blurb: (g: Game) => string,
  ): ReturnType<typeof pack> | null => {
    const g = candidates.find((c) => !picked.has(key(c)));
    if (!g) return null;
    picked.add(key(g));
    return pack(g, label, blurb(g));
  };

  const games = [
    take(
      dv.filter((g) => lateralCount(g) >= 6).sort((a, b) => winnerMinEval(a) - winnerMinEval(b)),
      'VET · comeback',
      (g) =>
        `Down ${defPawns(g)} pawns, then wins. Veteran soldiers hold long enough to turn it around.`,
    ),
    take(
      [...dv].sort((a, b) => lateralCount(b) - lateralCount(a)),
      'VET · soldier wall',
      (g) =>
        `${lateralCount(g)} home-half soldier-defense moves: soldiers slide sideways to wall off the palace.`,
    ),
    take(
      dv
        .filter((g) => g.plies >= 80 && g.plies <= 175 && lateralCount(g) >= 8)
        .sort((a, b) => volatility(a) - volatility(b)),
      'VET · calm win',
      (g) => `A low-swing, ${g.plies}-ply decisive game: the everyday veteran-soldier feel.`,
    ),
    take(
      dv.filter((g) => g.plies <= 95).sort((a, b) => volatility(b) - volatility(a)),
      'VET · still sharp',
      (g) => `Not all slow. A pointed ${g.plies}-ply veteran-soldier win.`,
    ),
    take(
      dv
        .filter((g) => g.plies >= 150 && g.plies <= 260)
        .sort((a, b) => lateralCount(b) - lateralCount(a)),
      'VET · long hold',
      (g) => `A patient ${g.plies}-ply defensive hold that finally breaks through.`,
    ),
    take(
      decisive(base)
        .filter((g) => g.plies >= 28 && g.plies <= 70)
        .sort((a, b) => volatility(b) - volatility(a)),
      'BASE · sharp (contrast)',
      () =>
        'River-gated soldiers: a short, swingy game decided by one attacking wave. The status quo.',
    ),
  ].filter((g): g is ReturnType<typeof pack> => g !== null);

  console.log('picked games:');
  for (const g of games)
    console.log(
      `  ${g.label}: seed=${g.seed} plies=${g.plies} winner=${g.winner} reason=${g.reason} vol=${g.volatility} lateral=${g.lateralMoves} deepestDeficit=${g.deepestDeficit}`,
    );

  const lengthEdges = [20, 40, 60, 80, 100, 120, 140, 160, 200];
  const volEdges = [50, 100, 150, 200, 250, 300, 400];
  const data = {
    generated: arg('date', '2026-07-03'),
    config: summary.config,
    summaries: summary.summaries,
    hist: {
      lengthEdges,
      volEdges,
      length: {
        base: histogram(
          base.map((g) => g.plies),
          lengthEdges,
        ),
        vet: histogram(
          vet.map((g) => g.plies),
          lengthEdges,
        ),
      },
      volatility: {
        base: histogram(base.map(volatility), volEdges),
        vet: histogram(vet.map(volatility), volEdges),
      },
    },
    games,
  };

  writeFileSync(resolve(studyDir, 'report-data.json'), JSON.stringify(data, null, 2));
  console.log(`\nwrote ${resolve(studyDir, 'report-data.json')}`);

  const templatePath = resolve(
    arg('template', resolve(HERE, 'soldier-study-report.template.html')),
  );
  if (existsSync(templatePath)) {
    const tpl = readFileSync(templatePath, 'utf8');
    const html = tpl.replace('__DATA__', JSON.stringify(data));
    const outPath = resolve(arg('out', resolve(studyDir, 'report.html')));
    writeFileSync(outPath, html);
    console.log(`wrote ${outPath}`);
  } else {
    console.log(`(no template at ${templatePath}; wrote data only)`);
  }
}

main();
