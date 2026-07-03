// Fortress Xiangqi NON-MATE tactic ingest.
//
// The mate corpus (puzzles-fortress-xiangqi-mined.ts) comes from the pure-TS
// forced-mate miner. Material/positional ("winning-advantage") tactics can't be
// found without an evaluator, so they come from Fairy-Stockfish via the public
// ianfab/chess-variant-puzzler tool run against our fortressxiangqi.ini (see the
// track memory / the spike). This script curates that tool's EPD output into
// kernel-native puzzles and emits puzzles-fortress-xiangqi-tactics.ts.
//
// Pipeline (Python tooling lives outside the repo; see the track memory):
//   recorder.py  plays high-skill FSF self-play, streams positions tagged
//                ;game <id>;ply <n> AND writes full games to games.jsonl
//   puzzler.py   (chess-variant-puzzler) analyses each position -> puzzles.epd,
//                preserving the game/ply tags
//   then, once (regenerate both modules together, using IDENTICAL filters):
//     tsx ...tactics-ingest.ts --in puzzles.epd --games-in games.jsonl \
//         --min-pv 3 --min-eval 250 --limit N --emit-module        > puzzles-fortress-xiangqi-tactics.ts
//     tsx ...tactics-ingest.ts --in puzzles.epd --games-in games.jsonl \
//         --min-pv 3 --min-eval 250 --limit N --emit-source-games  > puzzles-fortress-xiangqi-source-games.ts
//   EMIT TO TEMP FILES THEN SWAP: this script imports @mistboard/game (built
//   dist), which spreads the very modules it emits — an in-place emit that fails
//   leaves dist broken and every later run fails silently.
//
// Fail-closed gates per candidate: round-trip FEN identity (catches a mis-parse
// that is still "legal"), validateFortressXiangqiPuzzle (kernel replay), and —
// when --games-in is given — a linkage check that the source game replayed to
// `ply` IS the puzzle position. The "winning" claim itself is FSF's; the kernel
// has no evaluator (see the model note on the winning-advantage goal).

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  applyFortressXiangqiMove,
  createInitialFortressXiangqiState,
  FORTRESS_XIANGQI_SPEC_ID,
  type FortressXiangqiColor,
  type FortressXiangqiGameState,
  type FortressXiangqiMove,
  type FortressXiangqiPuzzle,
  type FortressXiangqiPuzzleTheme,
  fortressXiangqiPositionRepetitionKey,
  isFortressXiangqiDropMove,
  isFortressXiangqiLegalMove,
  validateFortressXiangqiPuzzle,
} from '@mistboard/game';
import {
  canonicalizeFsfPlacement,
  fortressXiangqiStateToFsfFen,
  fortressXiangqiUciToMove,
  parseFortressXiangqiFsfFen,
} from './fortress-xiangqi-fsf-fen.ts';

type Options = {
  input: string | null;
  gamesIn: string | null;
  types: Set<string>;
  minPv: number;
  minEval: number;
  limit: number;
  emitModule: boolean;
  emitSourceGames: boolean;
};

const { values } = parseArgs({
  options: {
    in: { type: 'string' },
    'games-in': { type: 'string' },
    types: { type: 'string' },
    'min-pv': { type: 'string' },
    'min-eval': { type: 'string' },
    limit: { type: 'string' },
    'emit-module': { type: 'boolean' },
    'emit-source-games': { type: 'boolean' },
  },
});

const options: Options = {
  input: values.in ?? null,
  gamesIn: values['games-in'] ?? null,
  types: new Set((values.types ?? 'winning,turnaround').split(',')),
  minPv: Number.parseInt(values['min-pv'] ?? '3', 10),
  minEval: Number.parseInt(values['min-eval'] ?? '200', 10),
  limit: Number.parseInt(values.limit ?? '40', 10),
  emitModule: values['emit-module'] === true,
  emitSourceGames: values['emit-source-games'] === true,
};

// gameId -> kernel-native move list (from the start), lazily converted + validated
// from the recorder's JSONL. referencedGames accumulates only the games that a
// shipped puzzle actually links to (kept small for the emitted module).
type SourceGame = { id: string; moves: FortressXiangqiMove[] };
const rawGamesById = new Map<string, string[]>(); // gameId -> FSF UCI moves
const gameMovesCache = new Map<string, FortressXiangqiMove[] | null>(); // memoized replay
const referencedGames = new Map<string, SourceGame>(); // only games a shipped puzzle links to

function loadGames(path: string): void {
  for (const line of readFileSync(path, 'utf8').trim().split('\n').filter(Boolean)) {
    const record = JSON.parse(line) as { id: string; moves: string[] };
    rawGamesById.set(record.id, record.moves);
  }
}

// Kernel-legal move list for a recorded game (fully replayed), or null if the
// game is unknown or diverges from the kernel. Memoized; does NOT mark the game
// referenced (that happens only when a puzzle actually links to it).
function kernelGameMoves(gameId: string): FortressXiangqiMove[] | null {
  if (gameMovesCache.has(gameId)) return gameMovesCache.get(gameId) ?? null;
  const uci = rawGamesById.get(gameId);
  let result: FortressXiangqiMove[] | null = null;
  if (uci) {
    try {
      const moves = uci.map(fortressXiangqiUciToMove);
      let state = createInitialFortressXiangqiState(gameId);
      let legal = true;
      for (const move of moves) {
        if (state.status.type !== 'playing' || !isFortressXiangqiLegalMove(state, move)) {
          legal = false;
          break;
        }
        state = applyFortressXiangqiMove(state, move);
      }
      result = legal ? moves : null;
    } catch {
      result = null;
    }
  }
  gameMovesCache.set(gameId, result);
  return result;
}

type Epd = { fen: string; annotations: Record<string, string> };

function parseEpd(line: string): Epd {
  const tokens = line.trim().split(';');
  const fen = tokens[0]!.trim();
  const annotations: Record<string, string> = {};
  for (const token of tokens.slice(1)) {
    const sp = token.indexOf(' ');
    if (sp < 0) continue;
    annotations[token.slice(0, sp)] = token.slice(sp + 1);
  }
  return { fen, annotations };
}

const stats = {
  read: 0,
  wrongType: 0,
  hasSetupMove: 0,
  shortPv: 0,
  weakEval: 0,
  duplicate: 0,
  roundTripFail: 0,
  illegalLine: 0,
  validateFail: 0,
  linkageFail: 0,
  withSource: 0,
  emitted: 0,
};

function roleName(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function addRoleTheme(themes: Set<FortressXiangqiPuzzleTheme>, role: string | undefined): void {
  if (role === 'chariot' || role === 'cannon' || role === 'horse' || role === 'treasure') {
    themes.add(role);
  }
}

function tacticTitle(
  state: FortressXiangqiGameState,
  solution: FortressXiangqiMove[],
  side: FortressXiangqiColor,
  type: string,
): string {
  const first = solution[0]!;
  const sideLabel = side === 'red' ? 'Red' : 'Black';
  const piece = isFortressXiangqiDropMove(first)
    ? `${roleName(first.drop)} drop`
    : roleName(state.board[first.from]?.role ?? 'chariot');
  const goal = type === 'winning' ? 'wins material' : 'seizes the advantage';
  return `${sideLabel} ${piece} ${goal}`;
}

function tacticThemes(
  state: FortressXiangqiGameState,
  solution: FortressXiangqiMove[],
): FortressXiangqiPuzzleTheme[] {
  const themes = new Set<FortressXiangqiPuzzleTheme>(['winning']);
  for (const move of solution) {
    if (isFortressXiangqiDropMove(move)) {
      themes.add('drop');
      addRoleTheme(themes, move.drop);
    } else {
      addRoleTheme(themes, state.board[move.from]?.role);
    }
  }
  return [...themes];
}

function buildTacticPuzzle(id: string, epd: Epd): FortressXiangqiPuzzle | null {
  // No setup move: our solver-at-even-index model assumes the puzzle starts on
  // the solver's turn (the generator was run without --add-move).
  if ('sm' in epd.annotations) {
    stats.hasSetupMove += 1;
    return null;
  }
  let solution: FortressXiangqiMove[];
  try {
    solution = epd.annotations.pv!.split(',').map(fortressXiangqiUciToMove);
  } catch {
    stats.illegalLine += 1;
    return null;
  }
  // Trim a trailing defender reply so the line ends on the solver's payoff move
  // (odd length; solver plies are the even indices).
  if (solution.length % 2 === 0) solution = solution.slice(0, -1);
  if (solution.length < options.minPv) {
    stats.shortPv += 1;
    return null;
  }

  const state = parseFortressXiangqiFsfFen(epd.fen, id);
  if (
    canonicalizeFsfPlacement(fortressXiangqiStateToFsfFen(state)) !==
    canonicalizeFsfPlacement(epd.fen)
  ) {
    stats.roundTripFail += 1;
    return null;
  }
  if (state.status.type !== 'playing') return null;
  const sideToMove = state.status.turn;

  // Replay to confirm every move is kernel-legal before trusting the line.
  let cursor: FortressXiangqiGameState = state;
  for (const move of solution) {
    if (cursor.status.type !== 'playing' || !isFortressXiangqiLegalMove(cursor, move)) {
      stats.illegalLine += 1;
      return null;
    }
    cursor = applyFortressXiangqiMove(cursor, move);
  }

  const centipawns = Number.parseInt(epd.annotations.eval ?? '0', 10);
  const puzzle: FortressXiangqiPuzzle = {
    id,
    variant: FORTRESS_XIANGQI_SPEC_ID,
    title: tacticTitle(state, solution, sideToMove, epd.annotations.type ?? 'winning'),
    initial: state,
    solution,
    goal: { type: 'winning-advantage', winner: sideToMove, centipawns },
    themes: tacticThemes(state, solution),
  };

  const validation = validateFortressXiangqiPuzzle(puzzle);
  if (!validation.ok) {
    stats.validateFail += 1;
    if (!options.emitModule && !options.emitSourceGames) {
      console.error(`  reject ${id}: ${validation.issue.code}`);
    }
    return null;
  }

  // Link to the source game (if the recorder tagged it). Fail-closed: the game
  // replayed to `ply` must BE the puzzle position (same repetition key), else
  // the linkage is bogus and we drop the puzzle rather than ship a dead link.
  if (rawGamesById.size > 0 && epd.annotations.game && epd.annotations.ply) {
    const gameId = epd.annotations.game;
    const ply = Number.parseInt(epd.annotations.ply, 10);
    const moves = kernelGameMoves(gameId);
    if (!moves || ply > moves.length) {
      stats.linkageFail += 1;
      return null;
    }
    let replayed = createInitialFortressXiangqiState(gameId);
    for (let i = 0; i < ply; i += 1) {
      replayed = applyFortressXiangqiMove(replayed, moves[i]!);
    }
    if (
      fortressXiangqiPositionRepetitionKey(replayed) !== fortressXiangqiPositionRepetitionKey(state)
    ) {
      stats.linkageFail += 1;
      return null;
    }
    puzzle.sourceGame = { gameId, ply };
    referencedGames.set(gameId, { id: gameId, moves });
    stats.withSource += 1;
  }
  return puzzle;
}

function main(): void {
  if (options.gamesIn) loadGames(options.gamesIn);
  const raw = options.input ? readFileSync(options.input, 'utf8') : readFileSync(0, 'utf8');
  const lines = raw.trim().split('\n').filter(Boolean);

  const seen = new Set<string>();
  const puzzles: FortressXiangqiPuzzle[] = [];
  let counter = 0;

  for (const line of lines) {
    stats.read += 1;
    const epd = parseEpd(line);
    const type = epd.annotations.type ?? '';
    if (!options.types.has(type)) {
      stats.wrongType += 1;
      continue;
    }
    const evalStr = epd.annotations.eval ?? '';
    if (evalStr.startsWith('#')) {
      stats.wrongType += 1; // a mate the tool tagged winning/turnaround; the mate miner owns these
      continue;
    }
    if (Math.abs(Number.parseInt(evalStr || '0', 10)) < options.minEval) {
      stats.weakEval += 1;
      continue;
    }
    const key = canonicalizeFsfPlacement(epd.fen);
    if (seen.has(key)) {
      stats.duplicate += 1;
      continue;
    }
    seen.add(key);

    const id = `fortress-xiangqi-tactic-${String(counter + 1).padStart(3, '0')}`;
    const puzzle = buildTacticPuzzle(id, epd);
    if (!puzzle) continue;
    counter += 1;
    puzzles.push(puzzle);
    stats.emitted += 1;
    if (puzzles.length >= options.limit) break;
  }

  if (options.emitSourceGames) {
    // Only the games shipped puzzles link to, in puzzle order for a stable diff.
    const ordered = puzzles
      .map((p) => (p.sourceGame ? referencedGames.get(p.sourceGame.gameId) : null))
      .filter((g): g is SourceGame => g !== null && g !== undefined);
    const unique = [...new Map(ordered.map((g) => [g.id, g])).values()];
    process.stdout.write(renderSourceGamesModule(unique));
  } else if (options.emitModule) {
    process.stdout.write(renderModule(puzzles));
  } else {
    console.error('ingest stats:', JSON.stringify(stats, null, 2));
    console.error(`  ${referencedGames.size} distinct source games referenced`);
    for (const p of puzzles.slice(0, 8)) {
      const g = p.goal as { centipawns?: number };
      console.error(
        `  ${p.id} [${p.themes.join('/')}] eval=${g.centipawns} pv=${p.solution.length}` +
          ` src=${p.sourceGame ? `${p.sourceGame.gameId}@${p.sourceGame.ply}` : 'none'} "${p.title}"`,
      );
    }
  }
}

function renderModule(puzzles: FortressXiangqiPuzzle[]): string {
  const header = `// Generated by the Fortress Xiangqi tactic ingest
// (scripts/variant-lab/fortress-xiangqi-tactics-ingest.ts). Do not hand-edit;
// re-run the ingest and paste its \`--emit-module\` output here. These are
// Fairy-Stockfish-found NON-MATE (winning-advantage) tactics; the mate corpus
// lives in puzzles-fortress-xiangqi-mined.ts.
//
// The local structural type mirrors \`FortressXiangqiPuzzle\` in
// puzzles-fortress-xiangqi.ts so the array is assignable when spread there,
// while keeping this file free of a circular import.

import { FORTRESS_XIANGQI_SPEC_ID } from './game-specs.js';
import type {
  FortressXiangqiColor,
  FortressXiangqiGameState,
  FortressXiangqiMove,
} from './variants-fortress-xiangqi.js';

type TacticFortressXiangqiPuzzleTheme =
  | 'cannon'
  | 'chariot'
  | 'drop'
  | 'horse'
  | 'treasure'
  | 'winning';

type TacticFortressXiangqiPuzzle = {
  id: string;
  variant: typeof FORTRESS_XIANGQI_SPEC_ID;
  title: string;
  initial: FortressXiangqiGameState;
  solution: FortressXiangqiMove[];
  goal: { type: 'winning-advantage'; winner?: FortressXiangqiColor; centipawns?: number };
  themes: TacticFortressXiangqiPuzzleTheme[];
  sourceGame?: { gameId: string; ply: number };
};

export const TACTIC_FORTRESS_XIANGQI_PUZZLES: readonly TacticFortressXiangqiPuzzle[] = `;
  const body = JSON.stringify(puzzles, null, 2);
  return `${header}${body};\n`;
}

function renderSourceGamesModule(games: SourceGame[]): string {
  const header = `// Generated by the Fortress Xiangqi tactic ingest
// (scripts/variant-lab/fortress-xiangqi-tactics-ingest.ts). Do not hand-edit;
// re-run the ingest and paste its \`--emit-source-games\` output here. These are
// the full FSF self-play games the winning-advantage tactics were mined from,
// kernel-native (from the start position), referenced by FortressXiangqiPuzzle.
// sourceGame. Not yet persisted to prod.
//
// The local structural type mirrors \`FortressXiangqiSourceGame\` in
// puzzles-fortress-xiangqi.ts so the array is assignable when re-exported there,
// while keeping this file free of a circular import.

import { FORTRESS_XIANGQI_SPEC_ID } from './game-specs.js';
import type { FortressXiangqiMove } from './variants-fortress-xiangqi.js';

type TacticFortressXiangqiSourceGame = {
  id: string;
  variant: typeof FORTRESS_XIANGQI_SPEC_ID;
  moves: FortressXiangqiMove[];
};

export const TACTIC_SOURCE_GAMES: readonly TacticFortressXiangqiSourceGame[] = `;
  const body = JSON.stringify(
    games.map((g) => ({ id: g.id, variant: FORTRESS_XIANGQI_SPEC_ID, moves: g.moves })),
    null,
    2,
  );
  return `${header}${body};\n`;
}

main();
