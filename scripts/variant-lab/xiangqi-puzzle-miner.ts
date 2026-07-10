// Standard-xiangqi (9x10) puzzle miner: lichess-style, mined from REAL games.
//
// Two-phase pipeline over a corpus of historical games (the historical_xiangqi
// DB tables filled by the dpxq importer, or a directory of game files):
//
//   1. SCAN (cheap): walk each game's positions in order, keeping kernel state;
//      MultiPV(2) Pikafish eval at --scan-nodes per position. A candidate
//      moment is a game move that loses >= --swing-cp vs the engine best (mover
//      POV) and leaves the opponent (the solver) winning (>= --win-cp or mate),
//      skipping the opening (--min-ply) and already-decided positions
//      (--decided-cp).
//   2. VERIFY (expensive, candidates only): re-search the post-blunder position
//      at --verify-nodes MultiPV(2); require the best line still winning AND
//      unique (>= --unique-gap-cp over the second line, or the only mate). The
//      solution line comes from the PV (solver moves + scripted replies),
//      truncated to an odd length (mates run to the terminal state), then the
//      whole line is kernel-replayed and the puzzle re-validated with
//      validateStandardXiangqiPuzzle before it is accepted.
//
// All decision logic lives in packages/game/src/puzzles-xiangqi-mining.ts
// (engine-free, unit-tested); this driver owns the Pikafish subprocesses, the
// corpus loading, concurrency, and output.
//
// UCI `score cp` / `score mate` are SIDE-TO-MOVE POV. The scan pass exploits
// that: the value of the move played from position i is minus the best eval of
// position i+1, so one MultiPV scan per position covers both sides of the
// swing (see detectXiangqiBlunderCandidates).
//
// Output: --emit-module rewrites packages/game/src/puzzles-xiangqi-mined.ts
// in the existing mined-module style, a JSONL sidecar records per-puzzle
// mining metadata, and the LAST stdout line is always a machine-parseable
// metrics JSON object (the calibration deliverable).
//
// Run (fixture smoke, no DB):
//   node_modules/.bin/tsx scripts/variant-lab/xiangqi-puzzle-miner.ts \
//     --source dir --dir apps/server/fixtures/dpxq --scan-nodes 4000 --verify-nodes 20000
//
// Run (1k-game calibration from the historical DB; the lead runs this):
//   node_modules/.bin/tsx scripts/variant-lab/xiangqi-puzzle-miner.ts \
//     --source db --limit 1000 --concurrency 4 \
//     --emit-module packages/game/src/puzzles-xiangqi-mined.ts
//
// DB mode connects to DATABASE_URL (default: the shared local dev Postgres,
// postgres://mistboard:mistboard@localhost:5435/mistboard) and filters to
// ply_count >= --ply-min (default 20).

import { type ChildProcessWithoutNullStreams, execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  pikafishXiangqiNetPath,
  pikafishXiangqiPath,
} from '../../apps/server/src/xiangqi-pikafish-engine.ts';
import {
  applyStandardXiangqiMove,
  assembleMinedXiangqiPuzzle,
  createInitialXiangqiState,
  detectXiangqiBlunderCandidates,
  importXiangqiGame,
  isStandardXiangqiLegalMove,
  isXiangqiUniquelyWinning,
  pikafishUciToXiangqiSquares,
  positionRepetitionKey,
  standardXiangqiPuzzleMoveLabel,
  type XiangqiGameState,
  type XiangqiMove,
  type XiangqiPuzzle,
  type XiangqiUciScore,
  type XiangqiVerifyLine,
  xiangqiMoveToPikafishUci,
  xiangqiUciScoreToCp,
} from '../../packages/game/src/index.ts';

type CliOptions = {
  source: 'db' | 'dir';
  dir: string | null;
  dbUrl: string;
  plyMin: number;
  limit: number;
  offset: number;
  seed: number;
  concurrency: number;
  scanNodes: number;
  verifyNodes: number;
  swingCp: number;
  winCp: number;
  decidedCp: number;
  uniqueGapCp: number;
  minPly: number;
  maxSolutionPlies: number;
  minSolutionPlies: number;
  perGame: number;
  emitModule: string | null;
  jsonl: string;
  binary: string | null;
  net: string | null;
};

type MinerGame = { id: string; moves: XiangqiMove[] };

type MinedPuzzleRecord = {
  puzzle: XiangqiPuzzle;
  gameId: string;
  blunderPly: number;
  swingCp: number;
  verifyBestCp: number;
  verifySecondCp: number | null;
};

type Metrics = {
  gamesRequested: number;
  gamesLoaded: number;
  gamesScanned: number;
  gamesFailed: number;
  gamesIllegalReplay: number;
  positionsEvaluated: number;
  verifyEvals: number;
  candidates: number;
  verified: number;
  rejects: Record<string, number>;
  themes: Record<string, number>;
};

const DEFAULT_DB_URL = 'postgres://mistboard:mistboard@localhost:5435/mistboard';

const { values } = parseArgs({
  allowPositionals: false,
  options: {
    source: { type: 'string', default: 'db' },
    dir: { type: 'string' },
    'db-url': { type: 'string' },
    'ply-min': { type: 'string', default: '20' },
    limit: { type: 'string', default: '50' },
    offset: { type: 'string', default: '0' },
    seed: { type: 'string', default: '0' },
    concurrency: { type: 'string', default: '4' },
    'scan-nodes': { type: 'string', default: '60000' },
    'verify-nodes': { type: 'string', default: '600000' },
    'swing-cp': { type: 'string', default: '250' },
    'win-cp': { type: 'string', default: '250' },
    'decided-cp': { type: 'string', default: '800' },
    'unique-gap-cp': { type: 'string', default: '150' },
    'min-ply': { type: 'string', default: '8' },
    'max-solution-plies': { type: 'string', default: '7' },
    'min-solution-plies': { type: 'string', default: '3' },
    'per-game': { type: 'string', default: '3' },
    'emit-module': { type: 'string' },
    jsonl: { type: 'string' },
    binary: { type: 'string' },
    net: { type: 'string' },
    help: { type: 'boolean', default: false, short: 'h' },
  },
});

if (values.help) {
  printUsage();
  process.exit(0);
}

const options: CliOptions = {
  source: values.source === 'dir' ? 'dir' : 'db',
  dir: values.dir ?? null,
  dbUrl: values['db-url'] ?? process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  plyMin: parseNonNegativeInt(values['ply-min'], 20),
  limit: parseNonNegativeInt(values.limit, 50),
  offset: parseNonNegativeInt(values.offset, 0),
  seed: parseNonNegativeInt(values.seed, 0),
  concurrency: parsePositiveInt(values.concurrency, 4),
  scanNodes: parsePositiveInt(values['scan-nodes'], 60_000),
  verifyNodes: parsePositiveInt(values['verify-nodes'], 600_000),
  swingCp: parsePositiveInt(values['swing-cp'], 250),
  winCp: parsePositiveInt(values['win-cp'], 250),
  decidedCp: parsePositiveInt(values['decided-cp'], 800),
  uniqueGapCp: parsePositiveInt(values['unique-gap-cp'], 150),
  minPly: parseNonNegativeInt(values['min-ply'], 8),
  maxSolutionPlies: parsePositiveInt(values['max-solution-plies'], 7),
  minSolutionPlies: parsePositiveInt(values['min-solution-plies'], 3),
  perGame: parsePositiveInt(values['per-game'], 3),
  emitModule: values['emit-module'] ?? null,
  jsonl: values.jsonl ?? resolve('scripts/variant-lab/out/xiangqi-puzzle-mine.jsonl'),
  binary: values.binary ?? null,
  net: values.net ?? null,
};

if (options.source === 'dir' && !options.dir) {
  console.error('--source dir requires --dir <path>');
  process.exit(1);
}

// ── UCI engine driver (mainline Pikafish) ────────────────────────────────────

type ScoredLine = { rank: number; score: XiangqiUciScore; pvUci: string[] };

const ANALYZE_TIMEOUT_MS = 240_000;

class PikafishEngine {
  #proc: ChildProcessWithoutNullStreams;
  #buf = '';
  #waiter: {
    pred: (line: string) => boolean;
    resolve: (lines: string[]) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
    lines: string[];
  } | null = null;
  #multipv = 1;

  constructor(binary: string, net: string) {
    this.#proc = spawn(binary, [], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.#proc.stdout.setEncoding('utf8');
    this.#proc.stdout.on('data', (chunk: string) => this.#onData(chunk));
    this.net = net;
  }

  net: string;

  #onData(chunk: string): void {
    this.#buf += chunk;
    let nl = this.#buf.indexOf('\n');
    while (nl >= 0) {
      const line = this.#buf.slice(0, nl).trim();
      this.#buf = this.#buf.slice(nl + 1);
      const w = this.#waiter;
      if (w) {
        w.lines.push(line);
        if (w.pred(line)) {
          clearTimeout(w.timer);
          this.#waiter = null;
          w.resolve(w.lines);
        }
      }
      nl = this.#buf.indexOf('\n');
    }
  }

  #request(cmds: string[], pred: (line: string) => boolean): Promise<string[]> {
    return new Promise((res, rej) => {
      const timer = setTimeout(() => {
        this.#waiter = null;
        rej(new Error(`pikafish request timed out: ${cmds[cmds.length - 1]}`));
      }, ANALYZE_TIMEOUT_MS);
      timer.unref();
      this.#waiter = { pred, resolve: res, reject: rej, timer, lines: [] };
      for (const cmd of cmds) this.#proc.stdin.write(`${cmd}\n`);
    });
  }

  async init(): Promise<void> {
    await this.#request(['uci'], (l) => l === 'uciok');
    // Mainline Pikafish requires an absolute NNUE EvalFile (same setoption the
    // server engine path sends in xiangqi-pikafish-engine.ts).
    await this.#request([`setoption name EvalFile value ${this.net}`, 'isready'], (l) =>
      l.startsWith('readyok'),
    );
  }

  async newGame(): Promise<void> {
    await this.#request(['ucinewgame', 'isready'], (l) => l.startsWith('readyok'));
  }

  async analyze(movesUci: string[], nodes: number, multipv: number): Promise<ScoredLine[]> {
    const cmds: string[] = [];
    if (multipv !== this.#multipv) {
      cmds.push(`setoption name MultiPV value ${multipv}`);
      this.#multipv = multipv;
    }
    const position =
      movesUci.length > 0 ? `position startpos moves ${movesUci.join(' ')}` : 'position startpos';
    cmds.push(position, `go nodes ${nodes}`);
    const lines = await this.#request(cmds, (l) => l.startsWith('bestmove'));
    return parseScoredLines(lines);
  }

  kill(): void {
    if (this.#waiter) {
      clearTimeout(this.#waiter.timer);
      this.#waiter = null;
    }
    this.#proc.kill();
  }

  quit(): void {
    if (this.#waiter) {
      clearTimeout(this.#waiter.timer);
      this.#waiter = null;
    }
    this.#proc.stdin.write('quit\n');
    this.#proc.stdin.end();
  }
}

const MULTIPV_RE = /\bmultipv (\d+)\b/;
const SCORE_RE = /\bscore (cp|mate) (-?\d+)\b/;
const PV_RE = /\bpv (.+)$/;

function parseScoredLines(lines: string[]): ScoredLine[] {
  const byRank = new Map<number, ScoredLine>();
  for (const line of lines) {
    if (!line.startsWith('info ')) continue;
    const score = SCORE_RE.exec(line);
    const pv = PV_RE.exec(line);
    if (!score || !pv) continue;
    const rank = Number(MULTIPV_RE.exec(line)?.[1] ?? '1');
    const kind = score[1];
    const value = Number(score[2]);
    byRank.set(rank, {
      rank,
      score: kind === 'mate' ? { cp: null, mate: value } : { cp: value, mate: null },
      pvUci: pv[1]!.trim().split(/\s+/),
    });
  }
  return [...byRank.values()].sort((a, b) => a.rank - b.rank);
}

// ── Corpus loading ───────────────────────────────────────────────────────────

async function loadDbGames(opts: CliOptions): Promise<MinerGame[]> {
  const { init, close } = await import('../../apps/server/src/persistence-db.ts');
  const { getHistoricalXiangqiGame, queryHistoricalXiangqiGames } = await import(
    '../../apps/server/src/persistence-historical-xiangqi.ts'
  );
  init(opts.dbUrl);
  try {
    const ids: string[] = [];
    let offset = 0;
    let total = Number.POSITIVE_INFINITY;
    while (offset < total) {
      const page = await queryHistoricalXiangqiGames({ plyMin: opts.plyMin, limit: 200, offset });
      total = page.total;
      if (page.games.length === 0) break;
      ids.push(...page.games.map((game) => game.id));
      offset += page.games.length;
    }
    // The query orders by played_on, which shifts as the importer adds games;
    // sort by id for a stable base order, then optionally seed-shuffle.
    ids.sort();
    const ordered = opts.seed > 0 ? seededShuffle(ids, opts.seed) : ids;
    const window = ordered.slice(
      opts.offset,
      opts.limit > 0 ? opts.offset + opts.limit : undefined,
    );
    const games: MinerGame[] = [];
    for (const id of window) {
      const row = await getHistoricalXiangqiGame(id);
      if (row && row.moves.length >= opts.plyMin) games.push({ id: row.id, moves: row.moves });
    }
    return games;
  } finally {
    await close();
  }
}

function loadDirGames(opts: CliOptions): MinerGame[] {
  const dir = resolve(opts.dir as string);
  const entries = readdirSync(dir)
    .filter((name) => {
      try {
        return statSync(resolve(dir, name)).isFile();
      } catch {
        return false;
      }
    })
    .sort();
  const games: MinerGame[] = [];
  for (const name of entries) {
    const raw = readFileSync(resolve(dir, name), 'utf8');
    const imported = importXiangqiGame(extractGameText(raw));
    if (imported.error || imported.moves.length < opts.plyMin) {
      console.error(`skip ${name}: ${imported.error ?? `only ${imported.moves.length} plies`}`);
      continue;
    }
    games.push({ id: gameIdForFile(name), moves: imported.moves });
  }
  const ordered = opts.seed > 0 ? seededShuffle(games, opts.seed) : games;
  return ordered.slice(opts.offset, opts.limit > 0 ? opts.offset + opts.limit : undefined);
}

// dpxq HTML pages carry the record as `[DhtmlXQ_movelist]<digits>` inside a JS
// var (often preceded by an EMPTY [DhtmlXQ_movelist][/...] template tag that
// would win a naive first-match). Prefer the longest digit run; fall back to
// the raw text (plain movelist files import as-is via the codec sniffer).
function extractGameText(raw: string): string {
  const runs = [...raw.matchAll(/\[DhtmlXQ_movelist\](\d+)/gi)].map((match) => match[1] as string);
  if (runs.length === 0) return raw;
  return runs.reduce((longest, run) => (run.length > longest.length ? run : longest), '');
}

function gameIdForFile(name: string): string {
  return basename(name)
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-');
}

function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const rng = createRng(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

// ── Mining ───────────────────────────────────────────────────────────────────

async function mineGame(
  engine: PikafishEngine,
  game: MinerGame,
  opts: CliOptions,
  metrics: Metrics,
  seenPositions: Set<string>,
): Promise<MinedPuzzleRecord[]> {
  await engine.newGame();

  // Kernel-replay the recorded game; an illegal recorded move truncates the
  // walk (the legal prefix still mines).
  let state = createInitialXiangqiState(game.id);
  const states: XiangqiGameState[] = [state];
  const uciMoves: string[] = [];
  for (const move of game.moves) {
    if (state.status.type !== 'playing') break;
    if (!isStandardXiangqiLegalMove(state, move)) {
      metrics.gamesIllegalReplay += 1;
      break;
    }
    uciMoves.push(xiangqiMoveToPikafishUci(move));
    state = applyStandardXiangqiMove(state, move);
    states.push(state);
  }
  const moveCount = states.length - 1;

  // Phase 1: one cheap MultiPV(2) scan per position from --min-ply on.
  const scans: (number | null)[] = [];
  for (let i = 0; i <= moveCount; i += 1) {
    const positionState = states[i] as XiangqiGameState;
    if (i < opts.minPly || positionState.status.type !== 'playing') {
      scans.push(null);
      continue;
    }
    const lines = await engine.analyze(uciMoves.slice(0, i), opts.scanNodes, 2);
    metrics.positionsEvaluated += 1;
    const best = lines[0] ? xiangqiUciScoreToCp(lines[0].score) : null;
    scans.push(best);
  }

  const candidates = detectXiangqiBlunderCandidates(scans, moveCount, opts);
  metrics.candidates += candidates.length;

  // Phase 2: deep verify on candidates only.
  const records: MinedPuzzleRecord[] = [];
  for (const candidate of candidates) {
    if (records.length >= opts.perGame) break;
    const postBlunderState = states[candidate.ply + 1] as XiangqiGameState;
    const lines = await engine.analyze(uciMoves.slice(0, candidate.ply + 1), opts.verifyNodes, 2);
    metrics.verifyEvals += 1;
    const verifyLines: XiangqiVerifyLine[] = [];
    for (const line of lines) {
      const cp = xiangqiUciScoreToCp(line.score);
      if (cp !== null) verifyLines.push({ scoreCp: cp, mate: line.score.mate });
    }
    if (!isXiangqiUniquelyWinning(verifyLines, opts)) {
      bumpReject(metrics, 'not-unique-or-not-winning');
      continue;
    }
    const pvUci = lines[0]?.pvUci ?? [];
    const pv: XiangqiMove[] = [];
    let pvParsed = true;
    for (const token of pvUci) {
      const squares = pikafishUciToXiangqiSquares(token);
      if (!squares) {
        pvParsed = false;
        break;
      }
      pv.push({ from: squares.from, to: squares.to });
    }
    if (!pvParsed) {
      bumpReject(metrics, 'pv-parse');
      continue;
    }
    const result = assembleMinedXiangqiPuzzle(
      {
        gameId: game.id,
        blunderPly: candidate.ply,
        postBlunderState,
        pv,
        verifyScore: verifyLines[0] as XiangqiVerifyLine,
        swingCp: candidate.swingCp,
      },
      { maxSolutionPlies: opts.maxSolutionPlies, minSolutionPlies: opts.minSolutionPlies },
    );
    if (!result.ok) {
      bumpReject(metrics, result.reason);
      continue;
    }
    const positionKey = positionRepetitionKey(result.puzzle.initial);
    if (seenPositions.has(positionKey)) {
      bumpReject(metrics, 'duplicate-position');
      continue;
    }
    seenPositions.add(positionKey);
    metrics.verified += 1;
    for (const theme of result.puzzle.themes) {
      metrics.themes[theme] = (metrics.themes[theme] ?? 0) + 1;
    }
    records.push({
      puzzle: result.puzzle,
      gameId: game.id,
      blunderPly: candidate.ply,
      swingCp: candidate.swingCp,
      verifyBestCp: (verifyLines[0] as XiangqiVerifyLine).scoreCp,
      verifySecondCp: verifyLines[1]?.scoreCp ?? null,
    });
  }
  return records;
}

function bumpReject(metrics: Metrics, reason: string): void {
  metrics.rejects[reason] = (metrics.rejects[reason] ?? 0) + 1;
}

// ── Output ───────────────────────────────────────────────────────────────────

function renderMinedModule(puzzles: readonly XiangqiPuzzle[]): string {
  const header = `// Generated by the standard-xiangqi puzzle miner
// (scripts/variant-lab/xiangqi-puzzle-miner.ts, \`--emit-module\`). Do not
// hand-edit; re-run the miner and let it overwrite this file.
//
// Lichess-style puzzles mined from REAL historical games (not engine
// self-play): a MultiPV Pikafish scan finds moments where the game move lost
// decisively, a deeper verify pass confirms the refutation is winning AND
// unique, and the whole solution line is kernel-replayed for legality. Each
// puzzle links back to its game via sourceGame:{gameId, ply}: gameId is the
// historical_xiangqi_games row id (db mode) or the input file name (dir mode),
// and replaying that game's first \`ply\` moves reproduces \`initial\`.
//
// The local structural type mirrors \`XiangqiPuzzle\` in puzzles-xiangqi.ts so
// the array is assignable when spread there, while keeping this file free of a
// circular import.

import type { XIANGQI_SPEC_ID } from './game-specs.js';
import type { XiangqiColor, XiangqiGameState, XiangqiMove } from './variants-xiangqi.js';

type MinedXiangqiPuzzleTheme =
  | 'checkmate'
  | 'matein1'
  | 'matein2'
  | 'matein3'
  | 'winning'
  | 'winning-material'
  | 'crushing'
  | 'endgame'
  | 'middlegame';

type MinedXiangqiPuzzle = {
  id: string;
  variant: typeof XIANGQI_SPEC_ID;
  title: string;
  initial: XiangqiGameState;
  solution: XiangqiMove[];
  goal:
    | { type: 'checkmate'; winner?: XiangqiColor }
    | { type: 'winning-advantage'; winner?: XiangqiColor; centipawns?: number };
  themes: MinedXiangqiPuzzleTheme[];
  sourceGame?: { gameId: string; ply: number };
};

export const MINED_XIANGQI_PUZZLES: readonly MinedXiangqiPuzzle[] = `;
  return `${header}${JSON.stringify(puzzles, null, 2)};\n`;
}

function jsonlLine(record: MinedPuzzleRecord): string {
  const { puzzle } = record;
  return JSON.stringify({
    id: puzzle.id,
    gameId: record.gameId,
    ply: record.blunderPly + 1,
    solver: puzzle.goal.winner ?? null,
    goal: puzzle.goal.type,
    centipawns: puzzle.goal.type === 'winning-advantage' ? (puzzle.goal.centipawns ?? null) : null,
    swingCp: record.swingCp,
    verifyBestCp: record.verifyBestCp,
    verifySecondCp: record.verifySecondCp,
    themes: puzzle.themes,
    solutionPlyCount: puzzle.solution.length,
    solution: puzzle.solution.map(standardXiangqiPuzzleMoveLabel),
    title: puzzle.title,
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startedAt = Date.now();
  const binary = options.binary ? resolve(options.binary) : pikafishXiangqiPath();
  const net = options.net ? resolve(options.net) : pikafishXiangqiNetPath(binary);

  const games = options.source === 'db' ? await loadDbGames(options) : loadDirGames(options);
  const metrics: Metrics = {
    gamesRequested: options.limit,
    gamesLoaded: games.length,
    gamesScanned: 0,
    gamesFailed: 0,
    gamesIllegalReplay: 0,
    positionsEvaluated: 0,
    verifyEvals: 0,
    candidates: 0,
    verified: 0,
    rejects: {},
    themes: {},
  };
  const seenPositions = new Set<string>();
  const records: MinedPuzzleRecord[] = [];

  let cursor = 0;
  const workerCount = Math.max(1, Math.min(options.concurrency, Math.max(games.length, 1)));
  const workers = Array.from({ length: workerCount }, async () => {
    let engine = new PikafishEngine(binary, net);
    await engine.init();
    try {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= games.length) break;
        const game = games[index] as MinerGame;
        try {
          const mined = await mineGame(engine, game, options, metrics, seenPositions);
          records.push(...mined);
          metrics.gamesScanned += 1;
        } catch (err) {
          metrics.gamesFailed += 1;
          console.error(`game ${game.id} failed: ${(err as Error).message}`);
          engine.kill();
          engine = new PikafishEngine(binary, net);
          await engine.init();
        }
        if ((index + 1) % 10 === 0 || index + 1 === games.length) {
          console.error(
            `progress: ${index + 1}/${games.length} games, ${metrics.verified} puzzles`,
          );
        }
      }
    } finally {
      engine.quit();
    }
  });
  await Promise.all(workers);

  // Deterministic output order regardless of worker interleaving.
  records.sort((a, b) => a.puzzle.id.localeCompare(b.puzzle.id));

  if (options.emitModule) {
    const target = resolve(options.emitModule);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, renderMinedModule(records.map((record) => record.puzzle)));
    // The module is rendered as JSON (quoted keys); bring it to repo style so
    // the emitted file is commit-ready. Non-fatal: worst case the lead runs
    // `npx biome check --write` on it.
    try {
      execFileSync(resolve('node_modules', '.bin', 'biome'), ['check', '--write', target], {
        stdio: 'ignore',
      });
    } catch {
      console.error(`biome format of ${target} failed; run: npx biome check --write ${target}`);
    }
    console.error(`wrote ${records.length} puzzles to ${target}`);
  }
  mkdirSync(dirname(resolve(options.jsonl)), { recursive: true });
  writeFileSync(resolve(options.jsonl), records.map((r) => `${jsonlLine(r)}\n`).join(''));
  console.error(`wrote sidecar ${resolve(options.jsonl)} (${records.length} lines)`);

  const wallClockMs = Date.now() - startedAt;
  const summary = {
    kind: 'xiangqi-puzzle-mine-metrics',
    source: options.source,
    games: {
      requested: metrics.gamesRequested,
      loaded: metrics.gamesLoaded,
      scanned: metrics.gamesScanned,
      failed: metrics.gamesFailed,
      illegalReplayTruncated: metrics.gamesIllegalReplay,
    },
    positionsEvaluated: metrics.positionsEvaluated,
    verifyEvals: metrics.verifyEvals,
    candidates: metrics.candidates,
    verified: metrics.verified,
    yieldPuzzlesPerGamePct:
      metrics.gamesScanned > 0
        ? Math.round((metrics.verified / metrics.gamesScanned) * 10000) / 100
        : 0,
    yieldVerifiedPerCandidatePct:
      metrics.candidates > 0
        ? Math.round((metrics.verified / metrics.candidates) * 10000) / 100
        : 0,
    rejects: metrics.rejects,
    themes: metrics.themes,
    wallClockMs,
    secPerGame:
      metrics.gamesScanned > 0 ? Math.round(wallClockMs / metrics.gamesScanned / 10) / 100 : null,
    budgets: { scanNodes: options.scanNodes, verifyNodes: options.verifyNodes },
    thresholds: {
      swingCp: options.swingCp,
      winCp: options.winCp,
      decidedCp: options.decidedCp,
      uniqueGapCp: options.uniqueGapCp,
      minPly: options.minPly,
      maxSolutionPlies: options.maxSolutionPlies,
      minSolutionPlies: options.minSolutionPlies,
      perGame: options.perGame,
    },
    concurrency: workerCount,
    seed: options.seed,
    offset: options.offset,
  };
  // The LAST stdout line is the machine-parseable metrics object.
  console.log(JSON.stringify(summary));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function printUsage(): void {
  console.log(`usage: node_modules/.bin/tsx scripts/variant-lab/xiangqi-puzzle-miner.ts [options]

Mines lichess-style standard-xiangqi puzzles from real games with Pikafish.

Corpus:
  --source db|dir         db = historical_xiangqi_games via DATABASE_URL; dir = game files. Default: db.
  --dir PATH              Directory of game files (dir mode). dpxq HTML or any importXiangqiGame notation.
  --db-url URL            Postgres URL. Default: $DATABASE_URL or the local dev database.
  --ply-min N             Minimum game plies. Default: 20.
  --limit N               Games to mine (0 = all). Default: 50.
  --offset N              Skip the first N games of the ordered corpus. Default: 0.
  --seed N                Deterministic corpus shuffle before offset/limit (0 = no shuffle). Default: 0.

Engine:
  --concurrency N         Parallel engine workers (per-game granularity). Default: 4.
  --scan-nodes N          Phase-1 node budget per position (MultiPV 2). Default: 60000.
  --verify-nodes N        Phase-2 node budget per candidate (MultiPV 2). Default: 600000.
  --binary PATH           Pikafish binary override (default: pikafishXiangqiPath()).
  --net PATH              NNUE net override (default: pikafish.nnue beside the binary).

Detection:
  --swing-cp N            Min eval the game move lost vs the engine best. Default: 250.
  --win-cp N              Min post-blunder eval for the solver (or mate). Default: 250.
  --decided-cp N          Skip positions already at |eval| >= N pre-blunder. Default: 800.
  --unique-gap-cp N       Min best-vs-second gap in the verify pass. Default: 150.
  --min-ply N             Skip game plies before N (opening filter). Default: 8.
  --max-solution-plies N  Solution-line cap (normalized to odd). Default: 7.
  --min-solution-plies N  Minimum solution plies. Default: 3.
  --per-game N            Max puzzles mined per game. Default: 3.

Output:
  --emit-module PATH      Rewrite the mined module (packages/game/src/puzzles-xiangqi-mined.ts).
  --jsonl PATH            Sidecar path. Default: scripts/variant-lab/out/xiangqi-puzzle-mine.jsonl.

The last stdout line is always a metrics JSON object (kind=xiangqi-puzzle-mine-metrics).`);
}

await main();
