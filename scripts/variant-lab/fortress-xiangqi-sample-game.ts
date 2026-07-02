// Fortress Xiangqi sample-game generator for the rules article.
//
// Plays Fairy-Stockfish against itself with the production variant config
// (apps/server/src/fortress-xiangqi.ini), validating every move against the
// kernel, and prints the game in the article replay notation (board moves as
// from+to, drops as R/N/C/P/T/A/E @ square). Run a few games and pick a
// decisive finish for the article's replay block.
//
// Usage: npx tsx scripts/variant-lab/fortress-xiangqi-sample-game.ts [--games N] [--movetime MS]
// FSF binary: $MISTBOARD_FSF_PATH or ~/projects/tools/fairy-stockfish/src/stockfish.

import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyFortressXiangqiMove,
  createInitialFortressXiangqiState,
  type FortressXiangqiDropRole,
  type FortressXiangqiMove,
  type FortressXiangqiSquare,
  isFortressXiangqiDropMove,
  isFortressXiangqiLegalMove,
} from '@mistboard/game';

const HERE = dirname(fileURLToPath(import.meta.url));
const INI_PATH = resolve(HERE, '..', '..', 'apps', 'server', 'src', 'fortress-xiangqi.ini');
const VARIANT = 'fortressxiangqi';

// FSF UCI drop letters follow the .ini FEN letters (treasure = q). The article
// replay notation uses T for the treasure so readers see the piece name.
const FSF_LETTER_TO_ROLE: Record<string, FortressXiangqiDropRole> = {
  R: 'chariot',
  N: 'horse',
  C: 'cannon',
  P: 'soldier',
  Q: 'treasure',
  A: 'advisor',
  E: 'elephant',
};
const ROLE_TO_ARTICLE_LETTER: Record<FortressXiangqiDropRole, string> = {
  chariot: 'R',
  horse: 'N',
  cannon: 'C',
  soldier: 'P',
  treasure: 'T',
  advisor: 'A',
  elephant: 'E',
};

function uciToMove(uci: string): FortressXiangqiMove {
  const drop = /^([RNCPQAE])@([a-g][1-8])$/.exec(uci);
  if (drop) {
    return { drop: FSF_LETTER_TO_ROLE[drop[1]!]!, to: drop[2] as FortressXiangqiSquare };
  }
  const board = /^([a-g][1-8])([a-g][1-8])$/.exec(uci);
  if (board) {
    return { from: board[1] as FortressXiangqiSquare, to: board[2] as FortressXiangqiSquare };
  }
  throw new Error(`Unparseable FSF bestmove: ${uci}`);
}

function articleToken(move: FortressXiangqiMove): string {
  return isFortressXiangqiDropMove(move)
    ? `${ROLE_TO_ARTICLE_LETTER[move.drop]}@${move.to}`
    : `${move.from}${move.to}`;
}

function fsfBinaryPath(): string {
  const explicit = process.env.MISTBOARD_FSF_PATH;
  if (explicit) return resolve(explicit);
  const dev = resolve(process.env.HOME ?? '', 'projects/tools/fairy-stockfish/src/stockfish');
  if (existsSync(dev)) return dev;
  throw new Error('FSF binary not found; set MISTBOARD_FSF_PATH');
}

class FsfSession {
  private readonly child: ChildProcessWithoutNullStreams;
  private buf = '';
  private readonly sinks = new Set<(line: string) => void>();

  constructor(binary: string) {
    this.child = spawn(binary, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout.on('data', (chunk: Buffer) => {
      this.buf += chunk.toString('utf8');
      let nl = this.buf.indexOf('\n');
      while (nl >= 0) {
        const line = this.buf.slice(0, nl).trim();
        this.buf = this.buf.slice(nl + 1);
        for (const sink of [...this.sinks]) sink(line);
        nl = this.buf.indexOf('\n');
      }
    });
  }

  private send(command: string): void {
    this.child.stdin.write(`${command}\n`);
  }

  private waitFor(done: (line: string) => boolean): Promise<void> {
    return new Promise((res) => {
      const sink = (line: string): void => {
        if (done(line)) {
          this.sinks.delete(sink);
          res();
        }
      };
      this.sinks.add(sink);
    });
  }

  async init(): Promise<void> {
    this.send('uci');
    await this.waitFor((l) => l === 'uciok');
    this.send(`setoption name VariantPath value ${INI_PATH}`);
    this.send(`setoption name UCI_Variant value ${VARIANT}`);
    this.send('isready');
    await this.waitFor((l) => l === 'readyok');
  }

  async newGame(): Promise<void> {
    this.send('ucinewgame');
    this.send('isready');
    await this.waitFor((l) => l === 'readyok');
  }

  async bestMove(history: readonly string[], movetimeMs: number): Promise<string> {
    let best = '';
    const done = this.waitFor((line) => {
      const m = /^bestmove\s+(\S+)/.exec(line);
      if (m) best = m[1]!;
      return m !== null;
    });
    this.send(
      history.length > 0 ? `position startpos moves ${history.join(' ')}` : 'position startpos',
    );
    this.send(`go movetime ${movetimeMs}`);
    await done;
    return best;
  }

  close(): void {
    this.send('quit');
    this.child.kill('SIGKILL');
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const games = Number(args[args.indexOf('--games') + 1]) || 3;
  const movetime = Number(args[args.indexOf('--movetime') + 1]) || 400;
  const maxPlies = 300;

  const session = new FsfSession(fsfBinaryPath());
  await session.init();

  for (let g = 0; g < games; g += 1) {
    await session.newGame();
    let state = createInitialFortressXiangqiState(`sample-${g}`);
    const uciHistory: string[] = [];
    const tokens: string[] = [];
    // Vary the clock a little per game so runs are not carbon copies.
    const gameMovetime = movetime + g * 150;

    while (state.status.type === 'playing' && tokens.length < maxPlies) {
      const uci = await session.bestMove(uciHistory, gameMovetime);
      if (uci === '(none)' || uci === '') break;
      const move = uciToMove(uci);
      if (!isFortressXiangqiLegalMove(state, move)) {
        throw new Error(`FSF played kernel-illegal move ${uci} at ply ${tokens.length + 1}`);
      }
      const captured = !isFortressXiangqiDropMove(move) ? state.board[move.to] : undefined;
      const next = applyFortressXiangqiMove(state, move);
      if (next === state) throw new Error(`Move ${uci} did not apply at ply ${tokens.length + 1}`);
      state = next;
      uciHistory.push(uci);
      tokens.push(articleToken(move));
      if (captured?.role === 'general') break; // defensive; kernel ends by mate first
    }

    const plies = tokens.length;
    console.log(`\n=== game ${g + 1} · movetime ${gameMovetime}ms · ${plies} plies ===`);
    console.log(
      state.status.type === 'finished'
        ? `finished: winner=${state.status.winner ?? 'none'} reason=${state.status.reason} moveNumber=${state.moveNumber}`
        : `NOT finished (status=${state.status.type}) — discard`,
    );
    console.log(`drops played: ${tokens.filter((t) => t.includes('@')).length}`);
    console.log(`last moves: ${tokens.slice(-6).join(' ')}`);
    console.log(tokens.join(' '));
  }

  session.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
