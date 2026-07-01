// Fortress Xiangqi ⟷ Fairy-Stockfish parity harness.
//
// Validates that apps/server/src/fortress-xiangqi.ini encodes the SAME game as
// the kernel (packages/game/src/variants-fortress-xiangqi.ts). At every position
// of a random self-play walk it compares FSF's exact legal-move set (`go perft
// 1`) against the kernel's. Any square where the two disagree is a parity bug in
// the .ini or the kernel — the thing that would make PvE fail closed or the FSF
// chase-adjudicator disagree with canonical PvP.
//
// Usage: npx tsx scripts/variant-lab/fortress-xiangqi-fsf-play.ts [--games N] [--max-plies P]
// FSF binary: $MISTBOARD_FSF_PATH or ~/projects/tools/fairy-stockfish/src/stockfish.

import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyFortressXiangqiMove,
  createInitialFortressXiangqiState,
  type FortressXiangqiDropRole,
  type FortressXiangqiGameState,
  type FortressXiangqiMove,
  type FortressXiangqiSquare,
  getFortressXiangqiLegalMoves,
  isFortressXiangqiDropMove,
} from '@mistboard/game';

const HERE = dirname(fileURLToPath(import.meta.url));
const INI_PATH = resolve(HERE, '..', '..', 'apps', 'server', 'src', 'fortress-xiangqi.ini');
const VARIANT = 'fortressxiangqi';

const ROLE_TO_LETTER: Record<FortressXiangqiDropRole, string> = {
  chariot: 'R',
  horse: 'N',
  cannon: 'C',
  soldier: 'P',
  treasure: 'Q',
  advisor: 'A',
  elephant: 'E',
};
const LETTER_TO_ROLE: Record<string, FortressXiangqiDropRole> = Object.fromEntries(
  Object.entries(ROLE_TO_LETTER).map(([role, letter]) => [letter, role as FortressXiangqiDropRole]),
);

function moveToUci(move: FortressXiangqiMove): string {
  return isFortressXiangqiDropMove(move)
    ? `${ROLE_TO_LETTER[move.drop]}@${move.to}`
    : `${move.from}${move.to}`;
}

function kernelUciSet(state: FortressXiangqiGameState): Set<string> {
  return new Set(getFortressXiangqiLegalMoves(state).map(moveToUci));
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

  // FSF's exact legal-move set at the given history, via `go perft 1`.
  async legalUciSet(history: readonly string[]): Promise<Set<string>> {
    const moves = new Set<string>();
    const collect = this.waitFor((line) => {
      const m = line.match(/^(\S+):\s*\d+$/);
      if (m && !line.startsWith('Nodes searched')) moves.add(m[1]!);
      return line.startsWith('Nodes searched');
    });
    this.send(
      history.length > 0
        ? `position startpos moves ${history.join(' ')}`
        : 'position startpos',
    );
    this.send('go perft 1');
    await collect;
    return moves;
  }

  close(): void {
    this.send('quit');
    this.child.kill('SIGKILL');
  }
}

type Mismatch = {
  ply: number;
  history: string[];
  onlyFsf: string[];
  onlyKernel: string[];
};

function pickRandom<T>(items: readonly T[], seed: number): T {
  // Deterministic-ish pseudo-random from a rolling seed (no Math.random needed).
  return items[seed % items.length]!;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const games = Number(args[args.indexOf('--games') + 1]) || 25;
  const maxPlies = Number(args[args.indexOf('--max-plies') + 1]) || 160;

  const session = new FsfSession(fsfBinaryPath());
  await session.init();

  const mismatches: Mismatch[] = [];
  let positionsChecked = 0;
  let totalPlies = 0;
  let seed = 1;

  for (let g = 0; g < games; g += 1) {
    await session.newGame();
    let state = createInitialFortressXiangqiState(`parity-${g}`);
    const history: string[] = [];

    for (let ply = 0; ply < maxPlies; ply += 1) {
      if (state.status.type !== 'playing') break;

      const kernel = kernelUciSet(state);
      const fsf = await session.legalUciSet(history);
      positionsChecked += 1;

      const onlyFsf = [...fsf].filter((u) => !kernel.has(u)).sort();
      const onlyKernel = [...kernel].filter((u) => !fsf.has(u)).sort();
      if (onlyFsf.length > 0 || onlyKernel.length > 0) {
        mismatches.push({ ply, history: [...history], onlyFsf, onlyKernel });
        if (mismatches.length >= 20) break;
      }

      const legal = getFortressXiangqiLegalMoves(state);
      if (legal.length === 0) break;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const move = pickRandom(legal, seed);
      state = applyFortressXiangqiMove(state, move);
      history.push(moveToUci(move));
      totalPlies += 1;
    }
    if (mismatches.length >= 20) break;
  }

  session.close();

  console.log(
    `games=${games} positions_checked=${positionsChecked} plies=${totalPlies} mismatches=${mismatches.length}`,
  );
  if (mismatches.length > 0) {
    for (const m of mismatches.slice(0, 8)) {
      console.log(
        `  MISMATCH ply=${m.ply} onlyFSF=[${m.onlyFsf.join(',')}] onlyKernel=[${m.onlyKernel.join(',')}]`,
      );
      console.log(`    history: ${m.history.join(' ')}`);
    }
    process.exitCode = 1;
  } else {
    console.log('PARITY OK — FSF and the kernel agree on every legal-move set.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
