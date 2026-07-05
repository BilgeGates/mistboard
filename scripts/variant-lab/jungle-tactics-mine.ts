// Jungle (Dou Shou Qi) winning-advantage tactics miner.
//
// The forced-win miner (jungle-puzzle-miner.ts) covers puzzles the kernel can
// self-verify (den entry / capture / stalemate). NON-terminal tactics — "one move
// wins decisive material/position, the game continues" — need an evaluator, which
// the kernel lacks. So this driver uses our own MistyJungle engine (the jungle-fen
// bridge + the UCI binary), the Jungle analogue of the Fortress FSF pipeline:
//
//   1. Generate engine self-play games (random opening for variety, then the engine
//      plays out) and record them.
//   2. Walk each game; at every position, ask the engine for the top-2 root moves
//      with exact scores (MultiPV=2, added to the engine for this purpose).
//   3. A position is a tactic when the best move is clearly winning AND uniquely so
//      (best - second >= gap) AND it does NOT immediately end the game (that would be
//      a forced win, already covered) — i.e. exactly one move keeps the decisive edge.
//   4. Emit kernel-native winning-advantage puzzles + their source games, each
//      re-validated with validateJunglePuzzle and linked by sourceGame:{gameId, ply}.
//
// The engine score is in engine units (eval_hand scale), not real centipawns; it is
// recorded as `centipawns` for reference/seeding only. Thresholds are tuned to that
// scale (see --win-advantage / --unique-gap).
//
// Run (writes both modules into a temp dir for review, never in-place):
//   node_modules/.bin/tsx scripts/variant-lab/jungle-tactics-mine.ts --games 120 --emit-dir scratchpad/jungle-tactics
//   node_modules/.bin/tsx scripts/variant-lab/jungle-tactics-mine.ts --games 40 --json

import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { engineUciToJungleMove, jungleStateToEngineFen } from '../../apps/server/src/jungle-fen.ts';
import {
  applyJungleMove,
  createInitialJungleState,
  findJungleForcedWinLine,
  findJungleWinInOneCandidates,
  getJungleLegalMoves,
  isJungleLegalMove,
  JUNGLE_DENS,
  JUNGLE_SPEC_ID,
  type JungleColor,
  type JungleGameState,
  type JungleMove,
  type JunglePieceRole,
  type JunglePuzzle,
  type JunglePuzzleTheme,
  type JungleSourceGame,
  jungleCoordOf,
  junglePositionRepetitionKey,
  jungleTrapOwner,
  validateJunglePuzzle,
} from '../../packages/game/src/index.ts';

// Mirrors jungle_rust::engine constants (WIN = 1e6, MAX_DEPTH = 24). A best score at
// or above WIN - MAX_DEPTH is a forced mate the search proved, not a winning-advantage.
const ENGINE_WIN = 1_000_000;
const ENGINE_MAX_DEPTH = 24;
const FORCED_WIN_FLOOR = ENGINE_WIN - ENGINE_MAX_DEPTH;

type CliOptions = {
  games: number;
  selfplayNodes: number;
  analysisNodes: number;
  maxPlies: number;
  minPly: number;
  randomOpen: number;
  perGame: number;
  maxSolverPlies: number;
  minSolverPlies: number;
  forcedWinNodes: number;
  winAdvantage: number;
  uniqueGap: number;
  limit: number;
  seed: number;
  gamesOnly: boolean;
  json: boolean;
  emitDir: string | null;
  binary: string;
};

type ScoredMove = { rank: number; score: number; move: string };

const { values } = parseArgs({
  allowPositionals: false,
  options: {
    games: { type: 'string', default: '80' },
    'selfplay-nodes': { type: 'string', default: '60000' },
    'analysis-nodes': { type: 'string', default: '400000' },
    'max-plies': { type: 'string', default: '150' },
    'min-ply': { type: 'string', default: '12' },
    'random-open': { type: 'string', default: '10' },
    'per-game': { type: 'string', default: '2' },
    'max-solver-plies': { type: 'string', default: '4' },
    'min-solver-plies': { type: 'string', default: '2' },
    'forced-win-nodes': { type: 'string', default: '400000' },
    'win-advantage': { type: 'string', default: '1200' },
    'unique-gap': { type: 'string', default: '500' },
    limit: { type: 'string', default: '40' },
    seed: { type: 'string', default: '20260704' },
    'games-only': { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
    'emit-dir': { type: 'string' },
    binary: { type: 'string' },
    help: { type: 'boolean', default: false, short: 'h' },
  },
});

if (values.help) {
  printUsage();
  process.exit(0);
}

const options: CliOptions = {
  games: parsePositiveInt(values.games, 80),
  selfplayNodes: parsePositiveInt(values['selfplay-nodes'], 60_000),
  analysisNodes: parsePositiveInt(values['analysis-nodes'], 400_000),
  maxPlies: parsePositiveInt(values['max-plies'], 150),
  minPly: parseNonNegativeInt(values['min-ply'], 12),
  randomOpen: parseNonNegativeInt(values['random-open'], 10),
  perGame: parsePositiveInt(values['per-game'], 2),
  maxSolverPlies: parsePositiveInt(values['max-solver-plies'], 4),
  minSolverPlies: parsePositiveInt(values['min-solver-plies'], 2),
  forcedWinNodes: parsePositiveInt(values['forced-win-nodes'], 400_000),
  winAdvantage: parsePositiveInt(values['win-advantage'], 1200),
  uniqueGap: parsePositiveInt(values['unique-gap'], 500),
  limit: parsePositiveInt(values.limit, 40),
  seed: parsePositiveInt(values.seed, 20_260_704),
  gamesOnly: values['games-only'] === true,
  json: values.json === true,
  emitDir: values['emit-dir'] ?? null,
  binary: values.binary ?? defaultBinaryPath(),
};

if (!existsSync(options.binary)) {
  console.error(`jungle engine binary not found: ${options.binary}
Build it: (cd ~/projects/mistboard-engine/jungle-engine && cargo build --release)
or pass --binary <path>.`);
  process.exit(1);
}

type MinedGame = { id: string; moves: JungleMove[] };
type MinedTactic = {
  puzzle: JunglePuzzle;
  gameId: string;
  ply: number;
  score: number;
  gap: number;
  kind: 'win' | 'winning-advantage';
};

const rng = createRng(options.seed);

async function main(): Promise<void> {
  const engine = new UciEngine(options.binary);
  await engine.init();

  const games: MinedGame[] = [];
  for (let g = 1; g <= options.games; g += 1) {
    games.push(await playGame(engine, `jungle-sp-${String(g).padStart(4, '0')}`, options));
  }

  const tactics: MinedTactic[] = [];
  const usedGames = new Set<string>();
  const seenPositions = new Set<string>();

  if (!options.gamesOnly) {
    for (const game of games) {
      if (tactics.length >= options.limit) break;
      await extractTactics(engine, game, options, tactics, usedGames, seenPositions);
    }
  }

  engine.quit();

  const sourceGames: JungleSourceGame[] = games
    .filter((game) => usedGames.has(game.id))
    .map((game) => ({ id: game.id, variant: JUNGLE_SPEC_ID, moves: game.moves }));

  if (options.emitDir) {
    const dir = resolve(options.emitDir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'puzzles-jungle-tactics.ts'), renderTacticsModule(tactics));
    writeFileSync(
      resolve(dir, 'puzzles-jungle-source-games.ts'),
      renderSourceGamesModule(sourceGames),
    );
    console.error(
      `wrote ${tactics.length} tactics + ${sourceGames.length} source games to ${dir}\n` +
        `review, then copy into packages/game/src/ and re-run the game tests.`,
    );
  } else if (options.json) {
    console.log(
      JSON.stringify(
        {
          games: games.length,
          tactics: tactics.map((t) => ({
            id: t.puzzle.id,
            side: t.puzzle.goal.winner,
            solution: t.puzzle.solution,
            score: t.score,
            gap: t.gap,
            themes: t.puzzle.themes,
            sourceGame: t.puzzle.sourceGame,
          })),
          sourceGames: sourceGames.length,
        },
        null,
        2,
      ),
    );
  } else {
    for (const t of tactics) {
      console.log(
        `${t.puzzle.id}  ${t.puzzle.goal.winner} to move  ${t.puzzle.solution
          .map((m) => `${m.from}-${m.to}`)
          .join(' ')}  score=${t.score} gap=${t.gap}  [${t.puzzle.themes.join(',')}]`,
      );
    }
    console.log(
      `\nplayed ${games.length} games, emitted ${tactics.length} tactics from ${sourceGames.length} games`,
    );
  }
}

// ── Self-play + tactic extraction ────────────────────────────────────────────

async function playGame(engine: UciEngine, id: string, options: CliOptions): Promise<MinedGame> {
  let state = createInitialJungleState(id);
  const moves: JungleMove[] = [];
  for (let ply = 0; ply < options.maxPlies && state.status.type === 'playing'; ply += 1) {
    let move: JungleMove | null;
    if (ply < options.randomOpen) {
      const legal = getJungleLegalMoves(state);
      if (legal.length === 0) break;
      move = legal[Math.floor(rng() * legal.length)]!;
    } else {
      const scored = await engine.analyze(jungleStateToEngineFen(state), options.selfplayNodes, 1);
      move = engineUciToJungleMove(scored[0]?.move);
      if (!move || !isJungleLegalMove(state, move)) break;
    }
    moves.push(move);
    state = applyJungleMove(state, move);
  }
  return { id, moves };
}

async function extractTactics(
  engine: UciEngine,
  game: MinedGame,
  options: CliOptions,
  out: MinedTactic[],
  usedGames: Set<string>,
  seenPositions: Set<string>,
): Promise<void> {
  let state = createInitialJungleState(game.id);
  let fromGame = 0;
  for (let ply = 0; ply < game.moves.length; ply += 1) {
    const state0 = state;
    const move = game.moves[ply]!;
    if (
      ply >= options.minPly &&
      fromGame < options.perGame &&
      out.length < options.limit &&
      state0.status.type === 'playing' &&
      // Skip positions with an immediate forced win — those are the forced-win miner's job.
      findJungleWinInOneCandidates(state0).length === 0
    ) {
      const tactic = await evaluatePosition(engine, state0, game.id, ply, options, seenPositions);
      if (tactic) {
        out.push(tactic);
        usedGames.add(game.id);
        fromGame += 1;
      }
    }
    if (state.status.type !== 'playing' || !isJungleLegalMove(state, move)) break;
    state = applyJungleMove(state, move);
  }
}

async function evaluatePosition(
  engine: UciEngine,
  state: JungleGameState,
  gameId: string,
  ply: number,
  options: CliOptions,
  seenPositions: Set<string>,
): Promise<MinedTactic | null> {
  if (state.status.type !== 'playing') return null;
  const posKey = junglePositionRepetitionKey(state);
  if (seenPositions.has(posKey)) return null;

  const scored = await engine.analyze(jungleStateToEngineFen(state), options.analysisNodes, 2);
  if (scored.length === 0) return null;
  const best = scored[0] as ScoredMove;
  const side = state.status.turn;

  // Forced-win path: the engine flags a proven win (score >= floor) fast; hand the
  // exact position to the kernel solver to extract the unique win-in-k line. This is
  // how we reach the deeper (k>=2) source-linked wins random self-play can't.
  if (best.score >= FORCED_WIN_FLOOR) {
    const line = findJungleForcedWinLine(state, options.maxSolverPlies, {
      nodeLimit: options.forcedWinNodes,
    });
    if (!line) return null;
    const solverPlies = Math.ceil(line.length / 2);
    if (solverPlies < options.minSolverPlies) return null; // shallow wins: the random miner's job
    const puzzle = buildWinPuzzle(state, line, side, gameId, ply);
    if (!validateJunglePuzzle(puzzle).ok) return null;
    seenPositions.add(posKey);
    return { puzzle, gameId, ply, score: best.score, gap: 0, kind: 'win' };
  }

  // Winning-advantage path (rare in Dou Shou Qi — decisive edges are forced wins).
  if (scored.length < 2) return null;
  const second = scored[1] as ScoredMove;
  if (best.score < options.winAdvantage) return null;
  const gap = best.score - second.score;
  if (gap < options.uniqueGap) return null;

  const bestMove = engineUciToJungleMove(best.move);
  if (!bestMove || !isJungleLegalMove(state, bestMove)) return null;
  const after = applyJungleMove(state, bestMove);
  // The payoff move must NOT end the game (a terminal would be a forced win).
  if (after.status.type !== 'playing') return null;

  const puzzle = buildAdvantagePuzzle(state, bestMove, side, best.score, gameId, ply);
  if (!validateJunglePuzzle(puzzle).ok) return null;
  seenPositions.add(posKey);
  return { puzzle, gameId, ply, score: best.score, gap, kind: 'winning-advantage' };
}

function puzzleInitial(state: JungleGameState, id: string): JungleGameState {
  return {
    ...state,
    id,
    lastMove: undefined,
    positionCounts: { [junglePositionRepetitionKey({ ...state, lastMove: undefined })]: 1 },
  };
}

function buildWinPuzzle(
  state: JungleGameState,
  line: JungleMove[],
  side: JungleColor,
  gameId: string,
  ply: number,
): JunglePuzzle {
  const id = 'jungle-tactic-pending';
  return {
    id,
    variant: JUNGLE_SPEC_ID,
    title: `${side === 'red' ? 'Red' : 'Black'} ${moverName(state, line[0]!)} win in ${Math.ceil(
      line.length / 2,
    )}`,
    initial: puzzleInitial(state, id),
    solution: line,
    goal: { type: 'win', winner: side },
    themes: winThemes(state, line),
    sourceGame: { gameId, ply },
  };
}

function buildAdvantagePuzzle(
  state: JungleGameState,
  move: JungleMove,
  side: JungleColor,
  score: number,
  gameId: string,
  ply: number,
): JunglePuzzle {
  const id = 'jungle-tactic-pending';
  return {
    id,
    variant: JUNGLE_SPEC_ID,
    title: `${side === 'red' ? 'Red' : 'Black'} ${moverName(state, move)} wins`,
    initial: puzzleInitial(state, id),
    solution: [move],
    goal: { type: 'winning-advantage', winner: side, centipawns: score },
    themes: tacticThemes(state, move),
    sourceGame: { gameId, ply },
  };
}

function moverName(state: JungleGameState, move: JungleMove): string {
  const role = state.board[move.from]?.role;
  return role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Piece';
}

function winThemes(state: JungleGameState, line: JungleMove[]): JunglePuzzleTheme[] {
  const themes = new Set<JunglePuzzleTheme>();
  let cursor: JungleGameState = state;
  for (const move of line) {
    if (cursor.status.type !== 'playing') break;
    if (cursor.status.turn === state.status.turn) {
      const piece = cursor.board[move.from];
      if (piece) {
        addRoleTheme(themes, piece.role);
        if ((piece.role === 'lion' || piece.role === 'tiger') && isRiverJump(move)) {
          themes.add('water-leap');
        }
        const target = cursor.board[move.to];
        if (target && jungleTrapOwner(move.to) === piece.color) themes.add('trap');
        else if (target) themes.add('rank-up');
      }
    }
    cursor = applyJungleMove(cursor, move);
  }
  if (cursor.status.type === 'finished') {
    if (cursor.status.reason === 'den-entered') themes.add('den-race');
    else if (cursor.status.reason === 'pieces-captured') themes.add('capture-all');
    else if (cursor.status.reason === 'stalemate') themes.add('stalemate');
  }
  return [...themes];
}

// ── Titles + themes ──────────────────────────────────────────────────────────

function tacticThemes(state: JungleGameState, move: JungleMove): JunglePuzzleTheme[] {
  const themes = new Set<JunglePuzzleTheme>(['winning']);
  const piece = state.board[move.from];
  if (piece) {
    addRoleTheme(themes, piece.role);
    if ((piece.role === 'lion' || piece.role === 'tiger') && isRiverJump(move)) {
      themes.add('water-leap');
    }
    const target = state.board[move.to];
    if (target && jungleTrapOwner(move.to) === piece.color) themes.add('trap');
    else if (target) themes.add('rank-up');
    if (move.to === JUNGLE_DENS[oppositeColor(piece.color)]) themes.add('den-race');
  }
  return [...themes];
}

function addRoleTheme(themes: Set<JunglePuzzleTheme>, role: JunglePieceRole | undefined): void {
  if (role === 'rat' || role === 'elephant' || role === 'lion' || role === 'tiger') {
    themes.add(role);
  }
}

function isRiverJump(move: JungleMove): boolean {
  const from = jungleCoordOf(move.from);
  const to = jungleCoordOf(move.to);
  return Math.abs(from.file - to.file) + Math.abs(from.rank - to.rank) > 1;
}

function oppositeColor(color: JungleColor): JungleColor {
  return color === 'red' ? 'black' : 'red';
}

// ── Module rendering ─────────────────────────────────────────────────────────

function renderTacticsModule(tactics: MinedTactic[]): string {
  const puzzles = tactics.map((t, i) => {
    const id = `jungle-tactic-${String(i + 1).padStart(3, '0')}`;
    return { ...t.puzzle, id, initial: { ...t.puzzle.initial, id } };
  });
  const header = `// Generated by the Jungle engine-source miner
// (scripts/variant-lab/jungle-tactics-mine.ts). Do not hand-edit; re-run the
// miner and copy its \`--emit-dir\` output here.
//
// Source-linked puzzles mined from MistyJungle self-play games. Two kinds:
//   - \`win\`: a forced win the engine flagged (score >= WIN floor) that the kernel
//     solver then extracted as a unique win-in-k line — the DEEPER (k>=2) forced
//     wins random self-play can't reach cheaply. The kernel re-verifies these.
//   - \`winning-advantage\`: a non-terminal decisive edge with a unique best move.
//     Rare in Dou Shou Qi (decisive edges are forced den-races), so this set is
//     tiny by design; \`centipawns\` records the engine score (engine units).
// Each links to its game via sourceGame:{gameId, ply} (see JUNGLE_SOURCE_GAMES).
//
// The local structural type mirrors \`JunglePuzzle\` in puzzles-jungle.ts so the
// array is assignable when spread there, while keeping this file free of a
// circular import.

import { JUNGLE_SPEC_ID } from './game-specs.js';
import type { JungleColor, JungleGameState, JungleMove } from './variants-jungle.js';

type TacticJunglePuzzleTheme =
  | 'den-race'
  | 'capture-all'
  | 'stalemate'
  | 'trap'
  | 'water-leap'
  | 'rank-up'
  | 'rat'
  | 'elephant'
  | 'lion'
  | 'tiger'
  | 'winning';

type TacticJunglePuzzle = {
  id: string;
  variant: typeof JUNGLE_SPEC_ID;
  title: string;
  initial: JungleGameState;
  solution: JungleMove[];
  goal:
    | { type: 'win'; winner?: JungleColor }
    | { type: 'winning-advantage'; winner?: JungleColor; centipawns?: number };
  themes: TacticJunglePuzzleTheme[];
  sourceGame?: { gameId: string; ply: number };
};

export const TACTIC_JUNGLE_PUZZLES: readonly TacticJunglePuzzle[] = `;
  return `${header}${JSON.stringify(puzzles, null, 2)};\n`;
}

function renderSourceGamesModule(sourceGames: JungleSourceGame[]): string {
  const header = `// Generated by the Jungle tactics miner
// (scripts/variant-lab/jungle-tactics-mine.ts, \`--emit-dir\`). Do not hand-edit;
// re-run the miner and copy its output here.
//
// Full recorded MistyJungle self-play games that the winning-advantage tactics
// were mined from. Kept so a puzzle can link back to its source game in a future
// "from game" analysis surface; not yet persisted to prod.
//
// The local structural type mirrors \`JungleSourceGame\` in puzzles-jungle.ts so
// the array is assignable when re-exported there, while keeping this file free of
// a circular import.

import { JUNGLE_SPEC_ID } from './game-specs.js';
import type { JungleMove } from './variants-jungle.js';

type SourceJungleGame = {
  id: string;
  variant: typeof JUNGLE_SPEC_ID;
  moves: JungleMove[];
};

export const TACTIC_SOURCE_GAMES: readonly SourceJungleGame[] = `;
  return `${header}${JSON.stringify(sourceGames, null, 2)};\n`;
}

// ── UCI engine driver ────────────────────────────────────────────────────────

class UciEngine {
  #proc: ChildProcessWithoutNullStreams;
  #buf = '';
  #waiter: {
    pred: (line: string) => boolean;
    resolve: (lines: string[]) => void;
    lines: string[];
  } | null = null;
  #multipv = 1;

  constructor(binary: string) {
    this.#proc = spawn(binary, [], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.#proc.stdout.setEncoding('utf8');
    this.#proc.stdout.on('data', (chunk: string) => this.#onData(chunk));
  }

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
          this.#waiter = null;
          w.resolve(w.lines);
        }
      }
      nl = this.#buf.indexOf('\n');
    }
  }

  #request(cmds: string[], pred: (line: string) => boolean): Promise<string[]> {
    return new Promise((res) => {
      this.#waiter = { pred, resolve: res, lines: [] };
      for (const cmd of cmds) this.#proc.stdin.write(`${cmd}\n`);
    });
  }

  async init(): Promise<void> {
    await this.#request(['uci'], (l) => l === 'uciok');
  }

  async analyze(fen: string, nodes: number, multipv: number): Promise<ScoredMove[]> {
    const cmds: string[] = [];
    if (multipv !== this.#multipv) {
      cmds.push(`setoption name MultiPV value ${multipv}`);
      this.#multipv = multipv;
    }
    cmds.push(`position fen ${fen}`, `go nodes ${nodes}`);
    const lines = await this.#request(cmds, (l) => l.startsWith('bestmove'));
    return parseScoredMoves(lines);
  }

  quit(): void {
    this.#proc.stdin.write('quit\n');
    this.#proc.stdin.end();
  }
}

const MULTIPV_RE = /^info multipv (\d+) score cp (-?\d+) pv (\S+)/;
const SINGLE_RE = /^info depth \d+ score cp (-?\d+) pv (\S+)/;

function parseScoredMoves(lines: string[]): ScoredMove[] {
  const byRank = new Map<number, ScoredMove>();
  for (const line of lines) {
    const mv = MULTIPV_RE.exec(line);
    if (mv) {
      const rank = Number(mv[1]);
      byRank.set(rank, { rank, score: Number(mv[2]), move: mv[3]! });
      continue;
    }
    const single = SINGLE_RE.exec(line);
    if (single) byRank.set(1, { rank: 1, score: Number(single[1]), move: single[2]! });
  }
  return [...byRank.values()].sort((a, b) => a.rank - b.rank);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function defaultBinaryPath(): string {
  const env = process.env.MISTBOARD_JUNGLE_ENGINE_PATH;
  if (env) return resolve(env);
  return resolve(
    homedir(),
    'projects',
    'mistboard-engine',
    'jungle-engine',
    'target',
    'release',
    'jungle-engine',
  );
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function printUsage(): void {
  console.log(`usage: node_modules/.bin/tsx scripts/variant-lab/jungle-tactics-mine.ts [options]

Drives the MistyJungle engine to mine non-terminal "winning-advantage" tactics.

Options:
  --games N               Self-play games to generate + analyze. Default: 80.
  --selfplay-nodes N      Node budget per self-play move. Default: 60000.
  --analysis-nodes N      Node budget per analyzed position (MultiPV=2). Default: 400000.
  --max-plies N           Max plies per self-play game. Default: 150.
  --min-ply N             Do not mine tactics before this ply. Default: 12.
  --random-open N         Random (non-engine) opening plies for variety. Default: 10.
  --per-game N            Max tactics mined per game. Default: 2.
  --win-advantage N       Min engine score for the best move to count as winning. Default: 1200.
  --unique-gap N          Min (best - second) engine-score gap for uniqueness. Default: 500.
  --limit N               Max tactics to emit. Default: 40.
  --seed N                Self-play RNG seed. Default: 20260704.
  --games-only            Only generate games (skip analysis); useful for warming a corpus.
  --emit-dir DIR          Write puzzles-jungle-tactics.ts + -source-games.ts into DIR (review, then copy).
  --json                  Print structured JSON instead of compact text.
  --binary PATH           Path to the jungle-engine binary. Default: ~/projects/mistboard-engine/...`);
}

await main();
