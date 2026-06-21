// Fairy-Stockfish pressure test for Drop Mini Xiangqi.
//
// Run:
//   node_modules/.bin/tsx scripts/variant-lab/drop-mini-xiangqi-fsf-play.ts
//   node_modules/.bin/tsx scripts/variant-lab/drop-mini-xiangqi-fsf-play.ts --mode selfplay --games 3
//
// FSF uses orthodox check semantics. Mistboard's S0 kernel is general-capture,
// so this is an engine balance probe, not the product referee.

import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

type FsfPolicy = 'wild' | 'no-threat' | 'home';

type CliOptions = {
  fsfPath: string;
  games: number;
  iniPath: string;
  maxPlies: number;
  mode: 'probe' | 'selfplay' | 'both';
  movetimeMs: number;
  policies: FsfPolicy[];
  skill: number;
};

type Waiter = {
  label: string;
  onLine(line: string): boolean;
  reject(err: Error): void;
  resolve(line: string): void;
  timer: ReturnType<typeof setTimeout>;
};

type PerftResult = {
  drops: string[];
  moves: string[];
  nodes: number;
};

type PositionInfo = {
  checkers: string;
  fen: string;
};

type BestMoveResult = {
  bestMove: string | null;
  score: string | null;
};

type SelfPlayResult = {
  dropChecks: number;
  drops: number;
  finalFen: string;
  firstDropPly: number | null;
  moves: string[];
  policy: FsfPolicy;
  reason: string;
};

const FSF_VARIANT_BY_POLICY: Record<FsfPolicy, string> = {
  wild: 'dropminixiangqi-wild',
  'no-threat': 'dropminixiangqi-no-threat',
  home: 'dropminixiangqi-home',
};

const START_FEN = 'rcnkncr/p1ppp1p/7/7/7/P1PPP1P/RCNKNCR[] w - - 0 1';
const CANNON_IN_HAND_FEN = 'rcnkncr/p1ppp1p/7/7/7/P1PPP1P/RCNKNCR[C] w - - 0 1';
const ALL_PIECES_IN_HAND_FEN = 'rcnkncr/p1ppp1p/7/7/7/P1PPP1P/RCNKNCR[RCNP] w - - 0 1';

const DEFAULT_POLICIES: readonly FsfPolicy[] = ['wild', 'no-threat', 'home'];
const UCI_DROP = /^[A-Z]@[a-g][1-7]$/;
const PERFT_LINE = /^([A-Z]@[a-g][1-7]|[a-g][1-7][a-g][1-7][a-z]?):\s+(\d+)$/;

class FsfSession {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly lineSinks = new Set<(line: string) => void>();
  private readonly waiters: Waiter[] = [];
  private buffer = '';
  private stderr = '';

  constructor(fsfPath: string) {
    this.child = spawn(fsfPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout.on('data', (chunk: Buffer) => this.onStdout(chunk.toString('utf8')));
    this.child.stderr.on('data', (chunk: Buffer) => {
      this.stderr += chunk.toString('utf8');
    });
  }

  async init(args: { iniPath: string; skill: number; variant: string }): Promise<void> {
    this.send('uci');
    await this.waitFor((line) => line === 'uciok', 'uciok');
    this.send(`setoption name VariantPath value ${args.iniPath}`);
    this.send(`setoption name UCI_Variant value ${args.variant}`);
    this.send(`setoption name Skill Level value ${args.skill}`);
    this.send('isready');
    await this.waitFor((line) => line === 'readyok', 'readyok');
    this.send('ucinewgame');
  }

  async bestMove(args: {
    fen?: string;
    moves?: string[];
    movetimeMs: number;
  }): Promise<BestMoveResult> {
    const lines: string[] = [];
    const sink = (line: string): void => {
      lines.push(line);
    };
    this.lineSinks.add(sink);
    try {
      this.setPosition(args);
      this.send(`go movetime ${args.movetimeMs}`);
      const line = await this.waitFor((candidate) => candidate.startsWith('bestmove '), 'bestmove');
      const parts = line.split(/\s+/);
      const bestMove = parts[1] && parts[1] !== '(none)' ? parts[1] : null;
      return {
        bestMove,
        score: lastScore(lines),
      };
    } finally {
      this.lineSinks.delete(sink);
    }
  }

  async perft(args: { fen?: string; moves?: string[]; depth: number }): Promise<PerftResult> {
    const lines: string[] = [];
    const sink = (line: string): void => {
      lines.push(line);
    };
    this.lineSinks.add(sink);
    try {
      this.setPosition(args);
      this.send(`go perft ${args.depth}`);
      await this.waitFor((line) => line.startsWith('Nodes searched:'), 'perft');
    } finally {
      this.lineSinks.delete(sink);
    }

    const moves: string[] = [];
    const drops: string[] = [];
    let nodes = 0;
    for (const line of lines) {
      const perft = PERFT_LINE.exec(line);
      if (perft) {
        const move = perft[1];
        moves.push(move);
        if (UCI_DROP.test(move)) drops.push(move);
        continue;
      }
      if (line.startsWith('Nodes searched:'))
        nodes = Number.parseInt(line.split(':')[1].trim(), 10);
    }
    return { drops, moves, nodes };
  }

  async positionInfo(args: { fen?: string; moves?: string[] }): Promise<PositionInfo> {
    const lines: string[] = [];
    const sink = (line: string): void => {
      lines.push(line);
    };
    this.lineSinks.add(sink);
    try {
      this.setPosition(args);
      this.send('d');
      await this.waitFor((line) => line.startsWith('Chased:'), 'position display');
    } finally {
      this.lineSinks.delete(sink);
    }

    return {
      fen: lines.find((line) => line.startsWith('Fen: '))?.slice('Fen: '.length) ?? '',
      checkers:
        lines
          .find((line) => line.startsWith('Checkers:'))
          ?.slice('Checkers:'.length)
          .trim() ?? '',
    };
  }

  close(): void {
    this.send('quit');
    this.rejectWaiters(new Error('FSF session closed'));
    this.child.kill('SIGKILL');
  }

  private setPosition(args: { fen?: string; moves?: string[] }): void {
    if (args.fen) {
      this.send(`position fen ${args.fen}`);
      return;
    }
    const moves = args.moves ?? [];
    this.send(
      moves.length > 0 ? `position startpos moves ${moves.join(' ')}` : 'position startpos',
    );
  }

  private send(command: string): void {
    this.child.stdin.write(`${command}\n`);
  }

  private waitFor(
    predicate: (line: string) => boolean,
    label: string,
    timeoutMs = 10_000,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        label,
        onLine: predicate,
        reject,
        resolve,
        timer: setTimeout(() => {
          this.removeWaiter(waiter);
          reject(
            new Error(
              `timed out waiting for ${label}${this.stderr ? `\nstderr: ${this.stderr}` : ''}`,
            ),
          );
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf('\n');
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trimEnd();
      this.buffer = this.buffer.slice(newline + 1);
      this.handleLine(line.trim());
      newline = this.buffer.indexOf('\n');
    }
  }

  private handleLine(line: string): void {
    for (const sink of this.lineSinks) sink(line);
    for (const waiter of [...this.waiters]) {
      if (!waiter.onLine(line)) continue;
      clearTimeout(waiter.timer);
      this.removeWaiter(waiter);
      waiter.resolve(line);
      return;
    }
  }

  private removeWaiter(waiter: Waiter): void {
    const index = this.waiters.indexOf(waiter);
    if (index >= 0) this.waiters.splice(index, 1);
  }

  private rejectWaiters(err: Error): void {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(err);
    }
  }
}

function lastScore(lines: string[]): string | null {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    const score = /\bscore (cp -?\d+|mate -?\d+)/.exec(line);
    if (score) return score[1];
  }
  return null;
}

async function withFsf<T>(
  opts: CliOptions,
  policy: FsfPolicy,
  run: (fsf: FsfSession) => Promise<T>,
): Promise<T> {
  const session = new FsfSession(opts.fsfPath);
  try {
    await session.init({
      iniPath: opts.iniPath,
      skill: opts.skill,
      variant: FSF_VARIANT_BY_POLICY[policy],
    });
    return await run(session);
  } finally {
    session.close();
  }
}

async function runProbe(opts: CliOptions): Promise<void> {
  const probes = [
    { label: 'start', fen: START_FEN },
    { label: 'white cannon in hand', fen: CANNON_IN_HAND_FEN },
    { label: 'white one of each drop role', fen: ALL_PIECES_IN_HAND_FEN },
  ] as const;

  console.log('== FSF Drop Mini Xiangqi probe ==');
  console.log(`fsf: ${opts.fsfPath}`);
  console.log(`ini: ${opts.iniPath}`);
  console.log(`skill=${opts.skill} movetime=${opts.movetimeMs}ms`);

  for (const probe of probes) {
    console.log(`\n-- ${probe.label} --`);
    const wildMoves = new Set<string>();
    for (const policy of opts.policies) {
      const result = await withFsf(opts, policy, async (fsf) => {
        const perft = await fsf.perft({ depth: 1, fen: probe.fen });
        const best = await fsf.bestMove({ fen: probe.fen, movetimeMs: opts.movetimeMs });
        return { best, perft };
      });
      if (policy === 'wild') {
        for (const move of result.perft.moves) wildMoves.add(move);
      }
      const blockedFromWild =
        policy === 'wild'
          ? []
          : [...wildMoves].filter((move) => !result.perft.moves.includes(move));
      console.log(
        `${policy.padEnd(9)} legal=${result.perft.nodes.toString().padStart(3)} drops=${result.perft.drops.length
          .toString()
          .padStart(
            3,
          )} best=${result.best.bestMove ?? '(none)'} score=${result.best.score ?? 'n/a'}`,
      );
      if (blockedFromWild.length > 0) {
        console.log(`  blocked vs wild: ${blockedFromWild.slice(0, 16).join(' ')}`);
      }
      if (result.perft.drops.length > 0) {
        console.log(`  sample drops: ${result.perft.drops.slice(0, 16).join(' ')}`);
      }
    }
  }
}

async function runSelfPlay(opts: CliOptions): Promise<void> {
  console.log('\n== FSF Drop Mini Xiangqi self-play ==');
  for (const policy of opts.policies) {
    const results: SelfPlayResult[] = [];
    for (let game = 1; game <= opts.games; game += 1) {
      const result = await withFsf(opts, policy, (fsf) => selfPlayOne(fsf, opts, policy));
      results.push(result);
      console.log(
        `${policy} #${game}: plies=${result.moves.length} drops=${result.drops} firstDrop=${
          result.firstDropPly ?? 'none'
        } dropChecks=${result.dropChecks} reason=${result.reason}`,
      );
      console.log(`  moves: ${result.moves.join(' ')}`);
    }
    const finished = results.filter((result) => result.reason !== 'max-plies').length;
    const avgPlies = average(results.map((result) => result.moves.length));
    const avgDrops = average(results.map((result) => result.drops));
    console.log(
      `${policy} summary: games=${results.length} finished=${finished} avgPlies=${avgPlies.toFixed(
        1,
      )} avgDrops=${avgDrops.toFixed(1)}`,
    );
  }
}

async function selfPlayOne(
  fsf: FsfSession,
  opts: CliOptions,
  policy: FsfPolicy,
): Promise<SelfPlayResult> {
  const moves: string[] = [];
  let drops = 0;
  let dropChecks = 0;
  let firstDropPly: number | null = null;
  let finalFen = START_FEN;
  let reason = 'max-plies';

  for (let ply = 1; ply <= opts.maxPlies; ply += 1) {
    const best = await fsf.bestMove({ moves, movetimeMs: opts.movetimeMs });
    if (!best.bestMove) {
      const info = await fsf.positionInfo({ moves });
      finalFen = info.fen;
      reason = info.checkers ? 'checkmate-or-terminal' : 'stalemate-or-terminal';
      break;
    }

    moves.push(best.bestMove);
    const info = await fsf.positionInfo({ moves });
    finalFen = info.fen;
    if (UCI_DROP.test(best.bestMove)) {
      drops += 1;
      firstDropPly ??= ply;
      if (info.checkers) dropChecks += 1;
    }
  }

  return {
    dropChecks,
    drops,
    finalFen,
    firstDropPly,
    moves,
    policy,
    reason,
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    fsfPath: defaultFsfPath(),
    games: 1,
    iniPath: resolve('scripts/variant-lab/drop-mini-xiangqi-fsf.ini'),
    maxPlies: 120,
    mode: 'both',
    movetimeMs: 100,
    policies: [...DEFAULT_POLICIES],
    skill: 8,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string => {
      i += 1;
      if (i >= argv.length) throw new Error(`missing value for ${arg}`);
      return argv[i];
    };

    if (arg === '--fsf') opts.fsfPath = resolve(next());
    else if (arg === '--games') opts.games = parsePositiveInt(next(), arg);
    else if (arg === '--help' || arg === '-h') usageAndExit();
    else if (arg === '--ini') opts.iniPath = resolve(next());
    else if (arg === '--mode') opts.mode = parseMode(next());
    else if (arg === '--movetime') opts.movetimeMs = parsePositiveInt(next(), arg);
    else if (arg === '--plies') opts.maxPlies = parsePositiveInt(next(), arg);
    else if (arg === '--policies') opts.policies = parsePolicies(next());
    else if (arg === '--skill') opts.skill = parseSkill(next());
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (!existsSync(opts.fsfPath)) throw new Error(`FSF binary not found: ${opts.fsfPath}`);
  if (!existsSync(opts.iniPath)) throw new Error(`variant INI not found: ${opts.iniPath}`);
  return opts;
}

function parseMode(value: string): CliOptions['mode'] {
  if (value === 'probe' || value === 'selfplay' || value === 'both') return value;
  throw new Error(`invalid --mode ${value}`);
}

function parsePolicies(value: string): FsfPolicy[] {
  const policies = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  for (const policy of policies) {
    if (!(policy in FSF_VARIANT_BY_POLICY)) throw new Error(`invalid policy: ${policy}`);
  }
  return policies as FsfPolicy[];
}

function parsePositiveInt(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function parseSkill(value: string): number {
  const skill = Number.parseInt(value, 10);
  if (!Number.isFinite(skill) || skill < -20 || skill > 20) {
    throw new Error('--skill must be between -20 and 20');
  }
  return skill;
}

function defaultFsfPath(): string {
  if (process.env.MISTBOARD_FSF_PATH) return resolve(process.env.MISTBOARD_FSF_PATH);
  if (process.env.HOME) {
    const dev = resolve(process.env.HOME, 'projects/tools/fairy-stockfish/src/stockfish');
    if (existsSync(dev)) return dev;
  }
  return 'fairy-stockfish';
}

function usageAndExit(): never {
  console.log(`Usage:
  tsx scripts/variant-lab/drop-mini-xiangqi-fsf-play.ts [options]

Options:
  --mode probe|selfplay|both      default: both
  --policies wild,no-threat,home  default: all three
  --games N                      default: 1
  --plies N                      default: 120
  --movetime MS                  default: 100
  --skill N                      default: 8
  --fsf PATH                     default: MISTBOARD_FSF_PATH or local dev FSF
  --ini PATH                     default: scripts/variant-lab/drop-mini-xiangqi-fsf.ini`);
  process.exit(0);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.mode === 'probe' || opts.mode === 'both') await runProbe(opts);
  if (opts.mode === 'selfplay' || opts.mode === 'both') await runSelfPlay(opts);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
