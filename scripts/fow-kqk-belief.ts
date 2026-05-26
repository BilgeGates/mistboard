import { writeFileSync } from 'node:fs';

type FileName = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h';
type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type Square = `${FileName}${Rank}`;

type Move = {
  from: Square;
  to: Square;
};

type WhitePieces = {
  king: Square;
  queen?: Square;
};

type World = {
  white: WhitePieces;
  black: Square;
  path: string[];
};

type Scenario = {
  id: string;
  description: string;
  initialWhite: WhitePieces;
  initialBlack: Square[];
  whiteMoves: Move[];
  target?: (square: Square) => boolean;
};

type StepSummary = {
  move: Move;
  before: number;
  illegalWhiteMove: number;
  whiteCapturedKing: number;
  visibleAfterWhite: number;
  blackCapturedKing: number;
  blackCapturedProtectedQueen: number;
  blackCapturedLooseQueen: number;
  visibleAtNextWhiteTurn: number;
  rawAfterBlack: World[];
  unseenAfterBlack: World[];
};

const files: FileName[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const ranks: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8];
const queenDirections: Array<readonly [number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

const scenarios: Scenario[] = [
  {
    id: 'learn-known-start',
    description:
      'The learn chapter seed: White starts Ka1/Qb1, Black starts at known h8, and White plays Qb1-b6.',
    initialWhite: { king: 'a1', queen: 'b1' },
    initialBlack: ['h8'],
    whiteMoves: [{ from: 'b1', to: 'b6' }],
  },
  {
    id: 'paper-lemma7-sweep',
    description:
      'Lemma 7 corner sweep as written: Ka1/Qa2, then queen and king walk right until the queen reaches h2. Initial Black set is all non-White squares.',
    initialWhite: { king: 'a1', queen: 'a2' },
    initialBlack: allSquares().filter((square) => square !== 'a1' && square !== 'a2'),
    whiteMoves: [
      { from: 'a2', to: 'b2' },
      { from: 'a1', to: 'b1' },
      { from: 'b2', to: 'c2' },
      { from: 'b1', to: 'c1' },
      { from: 'c2', to: 'd2' },
      { from: 'c1', to: 'd1' },
      { from: 'd2', to: 'e2' },
      { from: 'd1', to: 'e1' },
      { from: 'e2', to: 'f2' },
      { from: 'e1', to: 'f1' },
      { from: 'f2', to: 'g2' },
      { from: 'f1', to: 'g1' },
      { from: 'g2', to: 'h2' },
    ],
    target: (square) => rankOf(square) >= 3,
  },
  {
    id: 'paper-lemma8-figure7-prefix',
    description:
      'A direct transcription attempt of the Figure 7 right-walk prefix: Kb3/Qa4, Black in ranks 5-8, then Qb4, Kc3, Qc4, Kd3, Qd4, Qe4. Treat this as a parser check, not a proof of Lemma 8.',
    initialWhite: { king: 'b3', queen: 'a4' },
    initialBlack: rectangle('a', 'h', 5, 8),
    whiteMoves: [
      { from: 'a4', to: 'b4' },
      { from: 'b3', to: 'c3' },
      { from: 'b4', to: 'c4' },
      { from: 'c3', to: 'd3' },
      { from: 'c4', to: 'd4' },
      { from: 'd4', to: 'e4' },
    ],
    target: (square) => rankOf(square) >= 6,
  },
];

function main(): void {
  const requested = argValue('--scenario');
  const htmlPath = argValue('--html');
  const selected = requested
    ? scenarios.filter((scenario) => scenario.id === requested)
    : scenarios;

  if (selected.length === 0) {
    throw new Error(`unknown scenario: ${requested}`);
  }

  const reports = selected.map(runScenario);
  for (const report of reports) printReport(report);

  if (htmlPath) {
    writeFileSync(htmlPath, renderHtml(reports), 'utf8');
    console.log(`\nWrote ${htmlPath}`);
  }
}

function runScenario(scenario: Scenario): {
  scenario: Scenario;
  initial: World[];
  steps: StepSummary[];
} {
  let worlds = dedupeWorlds(
    scenario.initialBlack.map((black) => ({
      white: scenario.initialWhite,
      black,
      path: [`start:${black}`],
    })),
  );
  const initial = worlds;
  const steps: StepSummary[] = [];

  for (const move of scenario.whiteMoves) {
    const summary = applyWhiteMoveThenBlackReplies(worlds, move);
    steps.push(summary);
    worlds = summary.unseenAfterBlack;
  }

  return { scenario, initial, steps };
}

function applyWhiteMoveThenBlackReplies(worlds: World[], move: Move): StepSummary {
  const afterWhite: World[] = [];
  let illegalWhiteMove = 0;
  let whiteCapturedKing = 0;
  let visibleAfterWhite = 0;

  for (const world of worlds) {
    const legal = legalMovesForWhite(world.white, world.black).some(
      (candidate) => candidate.from === move.from && candidate.to === move.to,
    );
    if (!legal) {
      illegalWhiteMove += 1;
      continue;
    }

    if (move.to === world.black) {
      whiteCapturedKing += 1;
      continue;
    }

    const white = applyWhiteMove(world.white, move);
    if (isVisibleToWhite(white, world.black)) visibleAfterWhite += 1;
    afterWhite.push({
      white,
      black: world.black,
      path: [...world.path, `W:${move.from}-${move.to}`],
    });
  }

  const rawAfterBlack: World[] = [];
  let blackCapturedKing = 0;
  let blackCapturedProtectedQueen = 0;
  let blackCapturedLooseQueen = 0;
  let visibleAtNextWhiteTurn = 0;

  for (const world of afterWhite) {
    for (const blackTo of legalBlackKingMoves(world.black)) {
      const moveLabel = `B:${world.black}-${blackTo}`;
      if (blackTo === world.white.king) {
        blackCapturedKing += 1;
        continue;
      }
      if (world.white.queen && blackTo === world.white.queen) {
        if (areAdjacent(blackTo, world.white.king)) {
          blackCapturedProtectedQueen += 1;
        } else {
          blackCapturedLooseQueen += 1;
        }
        continue;
      }

      const next: World = {
        white: world.white,
        black: blackTo,
        path: [...world.path, moveLabel],
      };
      if (isVisibleToWhite(next.white, next.black)) visibleAtNextWhiteTurn += 1;
      rawAfterBlack.push(next);
    }
  }

  const dedupedRaw = dedupeWorlds(rawAfterBlack);
  const unseenAfterBlack = dedupedRaw.filter(
    (world) => !isVisibleToWhite(world.white, world.black),
  );

  return {
    move,
    before: worlds.length,
    illegalWhiteMove,
    whiteCapturedKing,
    visibleAfterWhite,
    blackCapturedKing,
    blackCapturedProtectedQueen,
    blackCapturedLooseQueen,
    visibleAtNextWhiteTurn,
    rawAfterBlack: dedupedRaw,
    unseenAfterBlack,
  };
}

function legalMovesForWhite(white: WhitePieces, black: Square): Move[] {
  const moves = stepMoves(white, black, white.king).map((to) => ({ from: white.king, to }));
  if (white.queen) {
    moves.push(...slideMoves(white, black, white.queen).map((to) => ({ from: white.queen!, to })));
  }
  return moves;
}

function legalBlackKingMoves(black: Square): Square[] {
  return neighbors(black);
}

function stepMoves(white: WhitePieces, black: Square, from: Square): Square[] {
  return neighbors(from).filter((to) => {
    if (to === white.king && from !== white.king) return false;
    if (white.queen && to === white.queen && from !== white.queen) return false;
    return to === black || !isWhiteOccupied(white, to);
  });
}

function slideMoves(white: WhitePieces, black: Square, from: Square): Square[] {
  const moves: Square[] = [];
  for (const [fileDelta, rankDelta] of queenDirections) {
    let next = offset(from, fileDelta, rankDelta);
    while (next) {
      if (isWhiteOccupied(white, next)) break;
      moves.push(next);
      if (next === black) break;
      next = offset(next, fileDelta, rankDelta);
    }
  }
  return moves;
}

function isVisibleToWhite(white: WhitePieces, black: Square): boolean {
  if (black === white.king || black === white.queen) return true;
  if (neighbors(white.king).includes(black)) return true;
  if (!white.queen) return false;
  return slideMoves(white, black, white.queen).includes(black);
}

function applyWhiteMove(white: WhitePieces, move: Move): WhitePieces {
  if (move.from === white.king) return { ...white, king: move.to };
  if (move.from === white.queen) return { ...white, queen: move.to };
  throw new Error(`white has no piece on ${move.from}`);
}

function isWhiteOccupied(white: WhitePieces, square: Square): boolean {
  return square === white.king || square === white.queen;
}

function dedupeWorlds(worlds: World[]): World[] {
  const byKey = new Map<string, World>();
  for (const world of worlds) {
    const key = `${world.white.king}|${world.white.queen ?? '-'}|${world.black}`;
    if (!byKey.has(key)) byKey.set(key, world);
  }
  return [...byKey.values()].sort((left, right) => compareSquares(left.black, right.black));
}

function printReport(report: ReturnType<typeof runScenario>): void {
  const { scenario, initial, steps } = report;
  console.log(`\n## ${scenario.id}`);
  console.log(scenario.description);
  console.log(`initial candidates: ${initial.length}`);
  console.log(renderBoard(scenario.initialWhite, initial, scenario.target));

  for (const [index, step] of steps.entries()) {
    const leakCount = scenario.target
      ? step.unseenAfterBlack.filter((world) => !scenario.target!(world.black)).length
      : 0;
    const suffix = scenario.target ? `, target leaks=${leakCount}` : '';
    console.log(
      [
        `${index + 1}. W ${step.move.from}-${step.move.to}: before=${step.before}`,
        `illegal=${step.illegalWhiteMove}`,
        `captured=${step.whiteCapturedKing}`,
        `visible-after-W=${step.visibleAfterWhite}`,
        `black-K-captures=${step.blackCapturedKing}`,
        `protected-Q-captures=${step.blackCapturedProtectedQueen}`,
        `loose-Q-captures=${step.blackCapturedLooseQueen}`,
        `raw=${step.rawAfterBlack.length}`,
        `unseen=${step.unseenAfterBlack.length}${suffix}`,
      ].join(' | '),
    );
    console.log(renderBoard(currentWhiteForStep(step), step.unseenAfterBlack, scenario.target));
    if (leakCount > 0) {
      const leak = step.unseenAfterBlack.find((world) => !scenario.target!(world.black));
      if (leak) console.log(`sample leak path: ${leak.path.join(' ')}`);
    }
  }
}

function currentWhiteForStep(step: StepSummary): WhitePieces {
  return step.unseenAfterBlack[0]?.white ?? step.rawAfterBlack[0]?.white ?? { king: 'a1' };
}

function renderBoard(white: WhitePieces, worlds: World[], target?: (square: Square) => boolean) {
  const candidates = new Set(worlds.map((world) => world.black));
  const lines: string[] = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    const cells: string[] = [];
    for (const file of files) {
      const square = `${file}${rank as Rank}` as Square;
      if (square === white.king) cells.push('K');
      else if (square === white.queen) cells.push('Q');
      else if (candidates.has(square)) cells.push(target && !target(square) ? '!' : 'x');
      else cells.push(target?.(square) ? '.' : '_');
    }
    lines.push(`${rank} ${cells.join(' ')}`);
  }
  lines.push('  a b c d e f g h');
  return lines.join('\n');
}

function renderHtml(reports: Array<ReturnType<typeof runScenario>>): string {
  const sections = reports
    .map((report) => {
      const stepBlocks = report.steps
        .map((step, index) => {
          const leakCount = report.scenario.target
            ? step.unseenAfterBlack.filter((world) => !report.scenario.target!(world.black)).length
            : 0;
          return `<section><h3>${index + 1}. W ${step.move.from}-${step.move.to}</h3><p>before=${step.before}; illegal=${step.illegalWhiteMove}; captured=${step.whiteCapturedKing}; visible-after-W=${step.visibleAfterWhite}; raw=${step.rawAfterBlack.length}; unseen=${step.unseenAfterBlack.length}; target leaks=${leakCount}</p><pre>${escapeHtml(renderBoard(currentWhiteForStep(step), step.unseenAfterBlack, report.scenario.target))}</pre></section>`;
        })
        .join('\n');
      return `<article><h2>${report.scenario.id}</h2><p>${escapeHtml(report.scenario.description)}</p><pre>${escapeHtml(renderBoard(report.scenario.initialWhite, report.initial, report.scenario.target))}</pre>${stepBlocks}</article>`;
    })
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><title>KQK belief verifier</title><style>body{font:14px system-ui,sans-serif;max-width:1100px;margin:24px auto;padding:0 16px;color:#17202a;background:#f8fafc}article{border-top:1px solid #ccd6e0;padding:18px 0}pre{font:16px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;background:#fff;border:1px solid #d7dee8;border-radius:6px;padding:12px;overflow:auto}h1,h2,h3{margin-bottom:8px}p{max-width:80ch}</style><h1>KQK belief verifier</h1><p>x = unseen candidate inside target, ! = unseen candidate outside target, _ = outside target empty, . = target empty.</p>${sections}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function allSquares(): Square[] {
  return files.flatMap((file) => ranks.map((rank) => `${file}${rank}` as Square));
}

function rectangle(minFile: FileName, maxFile: FileName, minRank: Rank, maxRank: Rank): Square[] {
  const minFileIndex = files.indexOf(minFile);
  const maxFileIndex = files.indexOf(maxFile);
  return allSquares().filter((square) => {
    const file = fileIndex(square);
    const rank = rankOf(square);
    return file >= minFileIndex && file <= maxFileIndex && rank >= minRank && rank <= maxRank;
  });
}

function neighbors(square: Square): Square[] {
  const result: Square[] = [];
  for (let fileDelta = -1; fileDelta <= 1; fileDelta += 1) {
    for (let rankDelta = -1; rankDelta <= 1; rankDelta += 1) {
      if (fileDelta === 0 && rankDelta === 0) continue;
      const next = offset(square, fileDelta, rankDelta);
      if (next) result.push(next);
    }
  }
  return result;
}

function offset(square: Square, fileDelta: number, rankDelta: number): Square | undefined {
  const nextFile = fileIndex(square) + fileDelta;
  const nextRank = rankOf(square) + rankDelta;
  if (nextFile < 0 || nextFile >= files.length) return undefined;
  if (nextRank < 1 || nextRank > 8) return undefined;
  return `${files[nextFile]}${nextRank as Rank}` as Square;
}

function areAdjacent(left: Square, right: Square): boolean {
  return (
    Math.max(
      Math.abs(fileIndex(left) - fileIndex(right)),
      Math.abs(rankOf(left) - rankOf(right)),
    ) === 1
  );
}

function fileIndex(square: Square): number {
  return files.indexOf(square[0] as FileName);
}

function rankOf(square: Square): Rank {
  return Number(square[1]) as Rank;
}

function compareSquares(left: Square, right: Square): number {
  const byRank = rankOf(left) - rankOf(right);
  if (byRank !== 0) return byRank;
  return fileIndex(left) - fileIndex(right);
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

main();
