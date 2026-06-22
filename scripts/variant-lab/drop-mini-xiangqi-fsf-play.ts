// Fairy-Stockfish pressure test for Drop Mini Xiangqi.
//
// Run:
//   node_modules/.bin/tsx scripts/variant-lab/drop-mini-xiangqi-fsf-play.ts
//   node_modules/.bin/tsx scripts/variant-lab/drop-mini-xiangqi-fsf-play.ts --mode selfplay --games 3
//
// FSF uses orthodox check semantics. Mistboard now uses checkmate semantics for
// Drop Mini Xiangqi, so this is close enough for balance probes while remaining
// lab-only.

import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applyDropMiniXiangqiMove,
  createInitialDropMiniXiangqiState,
  DEFAULT_DROP_MINI_XIANGQI_RULES,
  type DropMiniXiangqiDropRole,
  type DropMiniXiangqiGameState,
  type DropMiniXiangqiHand,
  type DropMiniXiangqiMove,
  type DropMiniXiangqiRules,
  GUARDED_DROP_MINI_XIANGQI_RULES,
  isLegalDropMiniXiangqiMove,
  WILD_DROP_MINI_XIANGQI_RULES,
} from '../../packages/game/src/variants-drop-mini-xiangqi.ts';
import type {
  MiniXiangqiBoard,
  MiniXiangqiColor,
  MiniXiangqiPieceRole,
  MiniXiangqiSquare,
} from '../../packages/game/src/variants-mini-xiangqi.ts';

type FsfPolicy = 'wild' | 'no-enemy-palace' | 'no-threat' | 'home';

type CliOptions = {
  fsfPath: string;
  games: number;
  iniPath: string;
  htmlPath: string | null;
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

type ReplaySnapshot = {
  board: MiniXiangqiBoard;
  cooldownHands: Record<MiniXiangqiColor, DropMiniXiangqiHand>;
  hands: Record<MiniXiangqiColor, DropMiniXiangqiHand>;
  lastMove: DropMiniXiangqiMove | null;
  moveNumber: number;
  ply: number;
  status: string;
  token: string;
  turn: MiniXiangqiColor | null;
  warning: string | null;
};

type ReplayGame = {
  dropChecks: number;
  drops: number;
  finalFen: string;
  firstDropPly: number | null;
  label: string;
  moves: string[];
  policy: FsfPolicy;
  reason: string;
  snapshots: ReplaySnapshot[];
};

const FSF_VARIANT_BY_POLICY: Record<FsfPolicy, string> = {
  wild: 'dropminixiangqi-wild',
  'no-enemy-palace': 'dropminixiangqi-no-enemy-palace',
  'no-threat': 'dropminixiangqi-no-threat',
  home: 'dropminixiangqi-home',
};

const START_FEN = 'rcnkncr/p1ppp1p/7/7/7/P1PPP1P/RCNKNCR[] w - - 0 1';
const CANNON_IN_HAND_FEN = 'rcnkncr/p1ppp1p/7/7/7/P1PPP1P/RCNKNCR[C] w - - 0 1';
const ALL_PIECES_IN_HAND_FEN = 'rcnkncr/p1ppp1p/7/7/7/P1PPP1P/RCNKNCR[RCNP] w - - 0 1';

const DEFAULT_POLICIES: readonly FsfPolicy[] = ['wild', 'no-enemy-palace', 'no-threat', 'home'];
const UCI_DROP = /^[A-Z]@[a-g][1-7]$/;
const PERFT_LINE = /^([A-Z]@[a-g][1-7]|[a-g][1-7][a-g][1-7][a-z]?):\s+(\d+)$/;
const FSF_DROP_ROLE: Record<string, DropMiniXiangqiDropRole> = {
  C: 'cannon',
  N: 'horse',
  P: 'soldier',
  R: 'chariot',
};
const ROLE_LABEL: Record<MiniXiangqiPieceRole, string> = {
  cannon: 'C',
  chariot: 'R',
  general: 'G',
  horse: 'H',
  soldier: 'S',
};
const PIECE_GLYPH: Record<MiniXiangqiColor, Record<MiniXiangqiPieceRole, string>> = {
  black: {
    cannon: '砲',
    chariot: '車',
    general: '將',
    horse: '馬',
    soldier: '卒',
  },
  red: {
    cannon: '炮',
    chariot: '俥',
    general: '帥',
    horse: '傌',
    soldier: '兵',
  },
};

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
        `${policy.padEnd(17)} legal=${result.perft.nodes.toString().padStart(3)} drops=${result.perft.drops.length
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

async function runSelfPlay(opts: CliOptions): Promise<SelfPlayResult[]> {
  console.log('\n== FSF Drop Mini Xiangqi self-play ==');
  const allResults: SelfPlayResult[] = [];
  for (const policy of opts.policies) {
    const results: SelfPlayResult[] = [];
    for (let game = 1; game <= opts.games; game += 1) {
      const result = await withFsf(opts, policy, (fsf) => selfPlayOne(fsf, opts, policy));
      results.push(result);
      allResults.push(result);
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
  return allResults;
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

function writeHtmlReport(opts: CliOptions, results: SelfPlayResult[]): void {
  if (!opts.htmlPath) return;
  if (results.length === 0) {
    throw new Error('--html requires self-play results; use --mode selfplay or --mode both');
  }
  const games = results.map((result, index) => buildReplayGame(result, index + 1));
  writeFileSync(opts.htmlPath, replayHtml(opts, games), 'utf8');
  console.log(`\nHTML replay: ${opts.htmlPath}`);
}

function buildReplayGame(result: SelfPlayResult, gameNumber: number): ReplayGame {
  return {
    dropChecks: result.dropChecks,
    drops: result.drops,
    finalFen: result.finalFen,
    firstDropPly: result.firstDropPly,
    label: `${result.policy} #${gameNumber}`,
    moves: result.moves,
    policy: result.policy,
    reason: result.reason,
    snapshots: snapshotsFor(result),
  };
}

function snapshotsFor(result: SelfPlayResult): ReplaySnapshot[] {
  let state = createInitialDropMiniXiangqiState(
    `fsf-${result.policy}`,
    rulesForFsfPolicy(result.policy),
  );
  const snapshots: ReplaySnapshot[] = [snapshotOf(state, 0, 'start', null)];

  for (let i = 0; i < result.moves.length; i += 1) {
    const token = result.moves[i];
    const move = parseFsfMove(token);
    if (!move) {
      snapshots.push(snapshotOf(state, i + 1, token, `could not parse FSF move: ${token}`));
      break;
    }
    if (!isLegalDropMiniXiangqiMove(state, move)) {
      snapshots.push(snapshotOf(state, i + 1, token, `illegal under Mistboard kernel: ${token}`));
      break;
    }
    state = applyDropMiniXiangqiMove(state, move);
    snapshots.push(snapshotOf(state, i + 1, token, null));
  }

  return snapshots;
}

function parseFsfMove(token: string): DropMiniXiangqiMove | null {
  const drop = token.match(/^([CNPR])@([a-g][1-7])$/);
  if (drop) {
    const role = FSF_DROP_ROLE[drop[1]];
    if (!role) return null;
    return { drop: role, to: drop[2] as MiniXiangqiSquare };
  }
  const boardMove = token.match(/^([a-g][1-7])([a-g][1-7])(?:[a-z])?$/);
  if (boardMove) {
    return {
      from: boardMove[1] as MiniXiangqiSquare,
      to: boardMove[2] as MiniXiangqiSquare,
    };
  }
  return null;
}

function rulesForFsfPolicy(policy: FsfPolicy): DropMiniXiangqiRules {
  if (policy === 'home') return GUARDED_DROP_MINI_XIANGQI_RULES;
  if (policy === 'no-enemy-palace') return DEFAULT_DROP_MINI_XIANGQI_RULES;
  if (policy === 'no-threat') {
    return {
      ...WILD_DROP_MINI_XIANGQI_RULES,
      dropAttack: 'forbid-immediate-general-threat',
    };
  }
  return WILD_DROP_MINI_XIANGQI_RULES;
}

function snapshotOf(
  state: DropMiniXiangqiGameState,
  ply: number,
  token: string,
  warning: string | null,
): ReplaySnapshot {
  return {
    board: cloneBoard(state.board),
    cooldownHands: cloneHands(state.cooldownHands),
    hands: cloneHands(state.hands),
    lastMove: state.lastMove ? { ...state.lastMove } : null,
    moveNumber: state.moveNumber,
    ply,
    status: statusText(state),
    token,
    turn: state.status.type === 'playing' ? state.status.turn : null,
    warning,
  };
}

function cloneBoard(board: MiniXiangqiBoard): MiniXiangqiBoard {
  const clone: MiniXiangqiBoard = {};
  for (const [square, piece] of Object.entries(board)) {
    if (piece) clone[square as MiniXiangqiSquare] = { ...piece };
  }
  return clone;
}

function cloneHands(
  hands: Record<MiniXiangqiColor, DropMiniXiangqiHand>,
): Record<MiniXiangqiColor, DropMiniXiangqiHand> {
  return {
    black: { ...hands.black },
    red: { ...hands.red },
  };
}

function statusText(state: DropMiniXiangqiGameState): string {
  if (state.status.type === 'playing') return `turn: ${state.status.turn}`;
  if (state.status.type === 'finished') {
    return `finished: ${state.status.reason}, winner=${state.status.winner ?? 'draw'}`;
  }
  return `aborted: ${state.status.reason}`;
}

function replayHtml(opts: CliOptions, games: ReplayGame[]): string {
  const payload = {
    generatedAt: new Date().toISOString(),
    games,
    options: {
      maxPlies: opts.maxPlies,
      movetimeMs: opts.movetimeMs,
      policies: opts.policies,
      skill: opts.skill,
    },
  };
  const data = JSON.stringify(payload).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Drop Mini Xiangqi Wild FSF Replay</title>
  <style>
    :root {
      color-scheme: dark;
      --page: #171a1e;
      --shell: #22262b;
      --shell-2: #2c3137;
      --board: #ecd7aa;
      --ink: #191713;
      --cream: #fff8e6;
      --muted: #aeb7be;
      --muted-dark: #5f5141;
      --red: #bc3038;
      --black: #121417;
      --accent: #1f9a7a;
      --accent-2: #78d2bf;
      --warning: #ffb27c;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--cream);
      background: linear-gradient(180deg, #101316 0%, var(--page) 48%, #1d2024 100%);
    }
    main {
      width: min(1420px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 20px 0 32px;
    }
    header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-end;
      margin-bottom: 14px;
    }
    .eyebrow {
      margin: 0 0 6px;
      color: var(--accent-2);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    h1 {
      font-size: 28px;
      line-height: 1.15;
      margin: 0;
    }
    .subtle {
      color: var(--muted);
      font-size: 13px;
    }
    .run-card {
      min-width: 290px;
      padding: 10px 12px;
      border: 1px solid rgba(255, 248, 230, 0.11);
      border-radius: 8px;
      background: rgba(255, 248, 230, 0.04);
      color: #d7dde1;
      font-size: 13px;
      line-height: 1.45;
      text-align: right;
    }
    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      margin: 0 0 14px;
      padding: 10px;
      background: var(--shell);
      border: 1px solid rgba(255, 248, 230, 0.1);
      border-radius: 8px;
    }
    .select-wrap {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 36px;
      padding: 0 8px;
      border-radius: 6px;
      background: rgba(255, 248, 230, 0.05);
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    button,
    select {
      height: 36px;
      border: 1px solid rgba(255, 248, 230, 0.16);
      border-radius: 6px;
      background: #30363d;
      color: var(--cream);
      padding: 0 12px;
      font: inherit;
    }
    select {
      min-width: 210px;
      background: #1d2227;
      color: var(--cream);
    }
    button {
      cursor: pointer;
    }
    button:hover {
      border-color: var(--accent);
      color: #ffffff;
    }
    .icon-button {
      width: 40px;
      padding: 0;
      font-weight: 800;
      line-height: 1;
    }
    input[type="range"] {
      flex: 1 1 260px;
      min-width: 160px;
      accent-color: var(--accent);
    }
    .frame-label {
      min-width: 100px;
      color: #d8e0e5;
      font-size: 13px;
      text-align: right;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(360px, 760px) minmax(320px, 1fr);
      gap: 18px;
      align-items: start;
    }
    .board-panel,
    .side-panel {
      border-radius: 8px;
      border: 1px solid rgba(255, 248, 230, 0.11);
    }
    .board-panel {
      padding: 14px;
      background: #f3e6c8;
      color: var(--ink);
      box-shadow: 0 18px 52px rgba(0, 0, 0, 0.32);
    }
    .board-stage {
      position: relative;
      aspect-ratio: 1;
      border-radius: 8px;
      overflow: hidden;
      background: var(--board);
      border: 1px solid rgba(25, 23, 19, 0.35);
    }
    .board-stage svg {
      display: block;
      width: 100%;
      height: 100%;
    }
    .svg-board-bg {
      fill: url(#boardWash);
    }
    .svg-board-frame {
      fill: none;
      stroke: rgba(60, 38, 13, 0.64);
      stroke-width: 4;
    }
    .grid-line {
      stroke: rgba(91, 62, 28, 0.72);
      stroke-width: 2.2;
      stroke-linecap: round;
    }
    .palace-line {
      stroke: rgba(91, 62, 28, 0.5);
      stroke-width: 2;
      stroke-linecap: round;
    }
    .coord-label {
      fill: rgba(45, 35, 22, 0.55);
      font-size: 16px;
      font-weight: 700;
      text-anchor: middle;
      dominant-baseline: middle;
    }
    .move-vector {
      stroke: rgba(31, 154, 122, 0.7);
      stroke-width: 7;
      stroke-linecap: round;
    }
    .last-ring {
      fill: none;
      stroke-width: 7;
    }
    .last-from {
      stroke: rgba(31, 154, 122, 0.82);
    }
    .last-to {
      stroke: rgba(188, 48, 56, 0.86);
    }
    .piece-shadow {
      filter: url(#pieceShadow);
    }
    .piece-disc {
      fill: #f8ead0;
      stroke-width: 3.2;
    }
    .piece-disc.red {
      stroke: #9e2428;
    }
    .piece-disc.black {
      stroke: #141a1f;
    }
    .piece-inner-ring {
      fill: none;
      opacity: 0.72;
      stroke-width: 1.8;
    }
    .piece-inner-ring.red {
      stroke: #9e2428;
    }
    .piece-inner-ring.black {
      stroke: #141a1f;
    }
    .piece-text {
      font-family: "Noto Serif CJK SC", "Songti SC", "STSong", serif;
      font-size: 39px;
      font-weight: 700;
      text-anchor: middle;
      dominant-baseline: central;
      line-height: 1;
    }
    .piece-text.red {
      fill: #9e2428;
    }
    .piece-text.black {
      fill: #141a1f;
    }
    .meta {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px 12px;
      margin-top: 12px;
      align-items: center;
      font-size: 13px;
      color: var(--muted-dark);
    }
    .ply-title {
      color: var(--ink);
      font-size: 16px;
      font-weight: 800;
    }
    .status-pill {
      justify-self: end;
      max-width: 100%;
      border-radius: 999px;
      padding: 5px 9px;
      background: rgba(31, 154, 122, 0.12);
      color: #205c4d;
      font-size: 12px;
      font-weight: 800;
      white-space: nowrap;
    }
    .side-panel {
      display: grid;
      gap: 14px;
      padding: 14px;
      background: var(--shell);
      box-shadow: 0 18px 52px rgba(0, 0, 0, 0.22);
    }
    .section-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 8px;
      color: #f6efe1;
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }
    .stat {
      min-width: 0;
      padding: 9px 10px;
      border-radius: 8px;
      background: var(--shell-2);
      border: 1px solid rgba(255, 248, 230, 0.08);
    }
    .stat span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .stat strong {
      display: block;
      overflow: hidden;
      margin-top: 3px;
      color: #fff7e8;
      font-size: 18px;
      line-height: 1.15;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .hands {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .hand {
      min-width: 0;
      padding: 10px;
      border-radius: 8px;
      background: #f6ecd7;
      color: var(--ink);
    }
    .hand-title {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .hand-title strong {
      color: var(--muted-dark);
    }
    .hand-chips {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }
    .hand-chip {
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 5px;
      min-height: 30px;
      padding: 4px 6px;
      border-radius: 6px;
      border: 1px solid rgba(25, 23, 19, 0.16);
      background: rgba(255, 255, 255, 0.45);
      font-size: 12px;
      font-weight: 800;
    }
    .hand-chip.dim {
      color: rgba(25, 23, 19, 0.4);
    }
    .hand-chip small {
      color: #8d4c1e;
      font-size: 10px;
      font-weight: 800;
    }
    .timeline {
      min-height: 0;
    }
    .timeline-head {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
      color: #f6efe1;
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .move-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
      gap: 6px;
      max-height: min(570px, calc(100vh - 250px));
      overflow: auto;
      padding-right: 2px;
    }
    .move-list button {
      min-width: 0;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 6px;
      font-size: 12px;
      padding: 0 9px;
      background: #30363d;
      border-color: rgba(255, 248, 230, 0.12);
      text-align: left;
    }
    .move-list button.current {
      color: #fff;
      background: var(--accent);
      border-color: var(--accent);
    }
    .move-list button.drop {
      border-color: rgba(188, 48, 56, 0.72);
      box-shadow: inset 3px 0 0 var(--red);
    }
    .move-index {
      flex: 0 0 auto;
      color: rgba(255, 248, 230, 0.58);
      font-weight: 800;
    }
    .move-token {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .warning {
      display: none;
      padding: 9px 10px;
      border-radius: 8px;
      color: #3b1605;
      background: var(--warning);
      font-size: 13px;
      font-weight: 700;
    }
    .warning.visible {
      display: block;
    }
    @media (max-width: 980px) {
      header {
        display: block;
      }
      .run-card {
        margin-top: 12px;
        text-align: left;
      }
      .layout {
        grid-template-columns: 1fr;
      }
      .move-list {
        max-height: 360px;
      }
    }
    @media (max-width: 620px) {
      main {
        width: min(100vw - 20px, 1420px);
        padding-top: 12px;
      }
      h1 {
        font-size: 22px;
      }
      .controls {
        gap: 8px;
      }
      .select-wrap,
      select {
        width: 100%;
      }
      .frame-label {
        flex: 1 1 100%;
        text-align: left;
      }
      .stats,
      .hands {
        grid-template-columns: 1fr;
      }
    }

    /* Mistboard app-shell skin for the standalone lab export. */
    :root {
      color-scheme: light;
      --site-radius: 7px;
      --site-radius-sm: 5px;
      --site-bg: hsl(168, 10%, 93%);
      --site-bg-soft: hsl(168, 10%, 89%);
      --site-text: hsl(168, 3%, 30%);
      --site-heading: hsl(168, 8%, 19%);
      --site-muted: hsl(168, 2%, 47%);
      --site-panel: #ffffff;
      --site-panel-soft: hsl(168, 12%, 96.5%);
      --site-border: hsl(168, 5%, 84%);
      --site-border-soft: hsl(168, 5%, 89%);
      --site-accent: #1f6f5b;
      --site-accent-strong: #185947;
      --site-accent-soft: #eef8f2;
      --site-on-accent: #ffffff;
      --site-hover: hsl(168, 6%, 88%);
      --site-shadow: rgba(29, 37, 34, 0.15);
      --site-warning-bg: #fff4d6;
      --site-warning-border: #e6c870;
      --site-warning-text: #5a3d05;
      --xq-board-bg: #f5dca8;
      --xq-line: #5a3a14;
      --xq-edge: #8b5a24;
      --xq-red: #b8322c;
      --xq-black: #1f2521;
      --accent: var(--site-accent);
      --red: var(--xq-red);
      --black: var(--xq-black);
    }
    body {
      color: var(--site-text);
      background: var(--site-bg);
      font-family:
        "Noto Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
        sans-serif;
    }
    .site-nav {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 16px;
      min-height: 58px;
      padding: 12px clamp(16px, 3vw, 34px);
      background: var(--site-bg);
      border-bottom: 1px solid transparent;
    }
    .site-nav-brand {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      color: var(--site-text);
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-decoration: none;
    }
    .site-nav-logo {
      position: relative;
      width: 28px;
      height: 28px;
      flex: 0 0 auto;
      border-radius: var(--site-radius-sm);
      background:
        linear-gradient(90deg, rgba(31, 111, 91, 0.88) 0 50%, rgba(31, 37, 33, 0.92) 50% 100%),
        #ffffff;
      box-shadow: inset 0 0 0 1px rgba(29, 37, 34, 0.18);
    }
    .site-nav-logo::before,
    .site-nav-logo::after {
      content: "";
      position: absolute;
      inset: 6px;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.9);
    }
    .site-nav-logo::after {
      inset: 11px;
      background: rgba(255, 255, 255, 0.92);
      border: 0;
    }
    .site-nav-links,
    .site-nav-utilities {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .site-nav-utilities {
      margin-left: auto;
    }
    .site-nav-link {
      border: 0;
      border-radius: var(--site-radius-sm);
      background: transparent;
      color: var(--site-muted);
      font-size: 14px;
      font-weight: 600;
      padding: 7px 10px;
      text-decoration: none;
    }
    .site-nav-link.active {
      color: var(--site-text);
      background: var(--site-hover);
      box-shadow: inset 0 -2px 0 var(--site-accent);
    }
    main.game-shell {
      width: 100%;
      max-width: 1600px;
      margin: 0 auto;
      padding: 18px 16px 28px;
    }
    header.game-header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 16px;
      padding-bottom: 14px;
      border-bottom: 1px solid #e1ddd2;
    }
    .game-header-text {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .game-source {
      margin: 0;
      color: #5a6960;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .game-title {
      margin: 0;
      color: #1f2521;
      font-size: clamp(22px, 3vw, 34px);
      line-height: 1.1;
      overflow-wrap: anywhere;
    }
    .game-summary-line {
      margin: 0;
      color: #5a6960;
      font-size: 14px;
    }
    .run-card {
      min-width: 260px;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: var(--site-muted);
      font-size: 12px;
      line-height: 1.45;
      text-align: right;
    }
    .layout {
      display: grid;
      grid-template-columns: clamp(200px, 14vw, 240px) minmax(0, 1fr) clamp(200px, 14vw, 240px);
      gap: 10px;
      align-items: start;
    }
    .board-panel {
      display: grid;
      gap: 10px;
      justify-items: center;
      min-width: 0;
      padding: 14px;
      border: 1px solid var(--site-border-soft);
      border-radius: var(--site-radius);
      background: var(--site-panel-soft);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
    }
    .board-stage {
      width: min(100%, 72vh, 720px);
      aspect-ratio: 1;
      border: 1px solid rgba(79, 52, 22, 0.28);
      border-radius: 16px;
      background: var(--xq-board-bg);
      box-shadow: 0 18px 50px rgba(37, 31, 24, 0.16);
    }
    .svg-board-bg {
      fill: var(--xq-board-bg);
    }
    .svg-board-frame {
      stroke: var(--xq-edge);
      stroke-width: 2;
    }
    .grid-line,
    .palace-line {
      stroke: var(--xq-line);
      stroke-width: 1.8;
    }
    .coord-label {
      fill: rgba(90, 58, 20, 0.62);
      font-size: 14px;
      font-weight: 700;
    }
    .move-vector {
      stroke: rgba(31, 111, 91, 0.58);
      stroke-width: 6;
    }
    .last-ring {
      stroke-width: 6;
    }
    .last-from {
      stroke: rgba(31, 111, 91, 0.72);
    }
    .last-to {
      stroke: rgba(184, 50, 44, 0.72);
    }
    .piece-shadow {
      filter: drop-shadow(0 3px 4px rgba(35, 27, 18, 0.24));
    }
    .piece-disc.red,
    .piece-disc.black {
      fill: #f8ead0;
      stroke-width: 3;
    }
    .piece-disc.red {
      stroke: var(--xq-red);
    }
    .piece-disc.black {
      stroke: var(--xq-black);
    }
    .piece-inner-ring {
      fill: none;
      opacity: 0.74;
      stroke-width: 1.6;
    }
    .piece-inner-ring.red {
      stroke: var(--xq-red);
    }
    .piece-inner-ring.black {
      stroke: var(--xq-black);
    }
    .piece-text {
      font-family: "Noto Serif CJK SC", "Songti SC", "STSong", serif;
      font-size: 39px;
      font-weight: 700;
    }
    .piece-text.red {
      fill: var(--xq-red);
    }
    .piece-text.black {
      fill: var(--xq-black);
    }
    .meta {
      width: 100%;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 5px 10px;
      margin-top: 0;
      color: var(--site-muted);
    }
    .ply-title {
      color: var(--site-heading);
      font-size: 15px;
      font-weight: 700;
    }
    .status-pill {
      border-radius: 999px;
      padding: 4px 9px;
      background: var(--site-accent-soft);
      color: var(--site-accent-strong);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .side-panel {
      display: grid;
      gap: 10px;
      min-width: 0;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }
    .panel-section {
      display: grid;
      gap: 8px;
      padding: 10px;
      border: 1px solid #d3d9d2;
      border-radius: var(--site-radius);
      background: #f7f5ef;
    }
    .section-title,
    .timeline-head {
      color: var(--site-heading);
      font-size: 13px;
      font-weight: 700;
      text-transform: none;
    }
    .section-title {
      margin: 0;
    }
    .stats {
      grid-template-columns: 1fr;
      gap: 3px;
    }
    .stat {
      display: grid;
      grid-template-columns: minmax(48px, 0.72fr) minmax(0, 1fr);
      align-items: center;
      gap: 6px;
      min-height: 22px;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
    }
    .stat span {
      color: var(--site-muted);
      font-size: 11px;
      font-weight: 600;
      text-transform: none;
    }
    .stat strong {
      margin-top: 0;
      color: var(--site-heading);
      font-size: 12px;
      font-weight: 700;
    }
    .hands {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .hand {
      padding: 0;
      border-radius: 0;
      background: transparent;
      color: var(--site-text);
    }
    .hand-title {
      margin-bottom: 6px;
      color: var(--site-heading);
      font-size: 12px;
      font-weight: 700;
      text-transform: none;
    }
    .hand-title strong {
      color: var(--site-muted);
    }
    .hand-chips {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 4px;
    }
    .hand-chip {
      min-height: 28px;
      padding: 4px 5px;
      border: 1px solid var(--site-border-soft);
      border-radius: var(--site-radius-sm);
      background: var(--site-panel);
      color: var(--site-heading);
      font-size: 12px;
      font-weight: 700;
    }
    .hand-chip.dim {
      color: var(--site-muted);
      opacity: 0.58;
    }
    .hand-chip small {
      color: var(--site-accent-strong);
    }
    .controls {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 10px;
      border: 1px solid #d3d9d2;
      border-radius: var(--site-radius);
      background: #f7f5ef;
    }
    .select-wrap {
      display: grid;
      gap: 5px;
      height: auto;
      padding: 0;
      border-radius: 0;
      background: transparent;
      color: var(--site-muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: none;
    }
    .transport-row {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
    }
    button,
    select {
      min-height: 30px;
      height: auto;
      border: 1px solid var(--site-border);
      border-radius: var(--site-radius-sm);
      background: linear-gradient(to bottom, #f5f5f5, #ededed);
      color: var(--site-text);
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      padding: 5px 8px;
    }
    select {
      width: 100%;
      min-width: 0;
      background: var(--site-panel);
      font-weight: 600;
    }
    button:hover {
      border-color: var(--site-accent);
      color: var(--site-accent-strong);
    }
    .icon-button {
      width: auto;
    }
    input[type="range"] {
      width: 100%;
      min-width: 0;
      accent-color: var(--site-accent);
    }
    .frame-label {
      min-width: 0;
      color: var(--site-muted);
      font-size: 12px;
      text-align: left;
    }
    .move-list {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0;
      max-height: min(520px, calc(100vh - 270px));
      overflow: auto;
      padding: 0;
      border: 1px solid var(--site-border-soft);
      border-radius: var(--site-radius-sm);
      background: var(--site-panel);
    }
    .move-list button {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr);
      gap: 8px;
      align-items: center;
      justify-content: stretch;
      min-height: 28px;
      height: 28px;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: var(--site-text);
      font-size: 12px;
      font-weight: 600;
      text-align: left;
    }
    .move-list button:nth-child(odd) {
      background: var(--site-panel-soft);
    }
    .move-list button.current {
      background: var(--site-accent-soft);
      box-shadow: inset 3px 0 0 var(--site-accent);
      color: var(--site-heading);
    }
    .move-list button.drop {
      border: 0;
      box-shadow: inset 3px 0 0 rgba(184, 50, 44, 0.55);
    }
    .move-list button.current.drop {
      box-shadow: inset 3px 0 0 var(--site-accent);
    }
    .move-index {
      color: var(--site-muted);
      font-size: 12px;
      font-weight: 700;
    }
    .warning {
      border: 1px solid var(--site-warning-border);
      border-radius: var(--site-radius-sm);
      background: var(--site-warning-bg);
      color: var(--site-warning-text);
      font-size: 12px;
    }
    @media (max-width: 1100px) {
      header.game-header {
        align-items: flex-start;
        flex-direction: column;
      }
      .run-card {
        text-align: left;
      }
      .layout {
        grid-template-columns: minmax(0, 1fr);
      }
      .meta-rail {
        order: 2;
      }
      .board-panel {
        order: 1;
      }
      .move-rail {
        order: 3;
      }
      .move-list {
        max-height: 360px;
      }
    }
    @media (max-width: 700px) {
      .site-nav {
        min-height: 50px;
        padding: 10px 16px;
      }
      .site-nav-brand span:last-child {
        display: none;
      }
      .site-nav-links {
        gap: 2px;
      }
      .site-nav-link {
        padding: 6px 8px;
      }
      main.game-shell {
        padding: 12px 10px 22px;
      }
      .hand-chips {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  </style>
</head>
<body>
  <nav class="site-nav" aria-label="Mistboard">
    <a class="site-nav-brand" href="#">
      <span class="site-nav-logo" aria-hidden="true"></span>
      <span>MISTBOARD</span>
    </a>
    <div class="site-nav-links" aria-label="Primary">
      <span class="site-nav-link active">Watch</span>
      <span class="site-nav-link">Lab</span>
    </div>
    <div class="site-nav-utilities">
      <span class="site-nav-link">Drop Mini Xiangqi</span>
    </div>
  </nav>
  <main class="game-shell">
    <header class="game-header">
      <div class="game-header-text">
        <p class="game-source">Variant lab replay</p>
        <h1 class="game-title">Drop Mini Xiangqi FSF Replay</h1>
        <p class="game-summary-line">Generated <span id="generatedAt"></span>. FSF orthodox check semantics, Mistboard kernel validation.</p>
      </div>
      <div class="run-card" id="runMeta"></div>
    </header>
    <section class="layout game-replay replay-page replay-meta-header">
      <aside class="side-panel meta-rail">
        <section class="panel-section">
          <div class="section-title">
            <span id="gameSummary"></span>
            <span id="gameResult"></span>
          </div>
          <div class="stats" id="statGrid"></div>
        </section>
        <section class="panel-section">
          <div class="section-title">
            <span>Reserves</span>
          </div>
          <div class="hands">
            <div class="hand" id="redHand"></div>
            <div class="hand" id="blackHand"></div>
          </div>
        </section>
        <div class="warning" id="warning"></div>
      </aside>
      <section class="board-panel">
        <div class="board-stage" id="board"></div>
        <div class="meta">
          <div class="ply-title" id="plyLabel"></div>
          <div class="status-pill" id="statusLine"></div>
          <div class="subtle" id="positionMeta"></div>
        </div>
      </section>
      <aside class="side-panel move-rail">
        <section class="controls panel-section" aria-label="Replay controls">
          <label class="select-wrap">Game <select id="gameSelect" aria-label="Game"></select></label>
          <div class="transport-row">
            <button class="icon-button" type="button" id="firstBtn" title="First ply">|&lt;</button>
            <button class="icon-button" type="button" id="prevBtn" title="Previous ply">&lt;</button>
            <button class="icon-button" type="button" id="nextBtn" title="Next ply">&gt;</button>
            <button class="icon-button" type="button" id="lastBtn" title="Last ply">&gt;|</button>
          </div>
          <input id="plyRange" type="range" min="0" value="0" aria-label="Ply">
          <div class="frame-label" id="frameLabel"></div>
        </section>
        <section class="panel-section timeline">
          <div class="timeline-head">
            <span>Moves</span>
            <span id="timelineMeta"></span>
          </div>
          <div class="move-list" id="moveList"></div>
        </section>
      </aside>
    </section>
  </main>
  <script>
    const DATA = ${data};
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const ranks = [7, 6, 5, 4, 3, 2, 1];
    const roleLabel = ${JSON.stringify(ROLE_LABEL)};
    const pieceGlyph = ${JSON.stringify(PIECE_GLYPH)};
    const roleOrder = ['chariot', 'cannon', 'horse', 'soldier'];
    const boardSize = 720;
    const margin = 58;
    const step = (boardSize - margin * 2) / 6;
    let gameIndex = 0;
    let plyIndex = 0;

    const boardEl = document.getElementById('board');
    const frameLabel = document.getElementById('frameLabel');
    const gameSelect = document.getElementById('gameSelect');
    const gameResult = document.getElementById('gameResult');
    const gameSummary = document.getElementById('gameSummary');
    const generatedAt = document.getElementById('generatedAt');
    const positionMeta = document.getElementById('positionMeta');
    const runMeta = document.getElementById('runMeta');
    const moveList = document.getElementById('moveList');
    const plyLabel = document.getElementById('plyLabel');
    const plyRange = document.getElementById('plyRange');
    const redHand = document.getElementById('redHand');
    const blackHand = document.getElementById('blackHand');
    const statGrid = document.getElementById('statGrid');
    const statusLine = document.getElementById('statusLine');
    const timelineMeta = document.getElementById('timelineMeta');
    const warning = document.getElementById('warning');

    generatedAt.textContent = new Date(DATA.generatedAt).toLocaleString();
    runMeta.innerHTML =
      '<strong>' + DATA.games.length + ' games</strong><br>' +
      'policies: ' + escapeHtml(DATA.options.policies.join(', ')) + '<br>' +
      'skill ' + DATA.options.skill +
      ' | movetime ' + DATA.options.movetimeMs + 'ms' +
      ' | max ' + DATA.options.maxPlies + ' plies';

    DATA.games.forEach((game, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent =
        game.label +
        ' | ' +
        game.moves.length +
        ' plies | ' +
        game.drops +
        ' drops';
      gameSelect.append(option);
    });

    gameSelect.addEventListener('change', () => {
      gameIndex = Number(gameSelect.value);
      plyIndex = 0;
      render();
    });
    document.getElementById('firstBtn').addEventListener('click', () => {
      plyIndex = 0;
      render();
    });
    document.getElementById('prevBtn').addEventListener('click', () => {
      plyIndex = Math.max(0, plyIndex - 1);
      render();
    });
    document.getElementById('nextBtn').addEventListener('click', () => {
      const game = DATA.games[gameIndex];
      plyIndex = Math.min(game.snapshots.length - 1, plyIndex + 1);
      render();
    });
    document.getElementById('lastBtn').addEventListener('click', () => {
      const game = DATA.games[gameIndex];
      plyIndex = game.snapshots.length - 1;
      render();
    });
    plyRange.addEventListener('input', () => {
      plyIndex = Number(plyRange.value);
      render();
    });
    document.addEventListener('keydown', (event) => {
      const tag = event.target && event.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON') return;
      const game = DATA.games[gameIndex];
      if (event.key === 'ArrowLeft') {
        plyIndex = Math.max(0, plyIndex - 1);
        render();
      } else if (event.key === 'ArrowRight') {
        plyIndex = Math.min(game.snapshots.length - 1, plyIndex + 1);
        render();
      } else if (event.key === 'Home') {
        plyIndex = 0;
        render();
      } else if (event.key === 'End') {
        plyIndex = game.snapshots.length - 1;
        render();
      }
    });

    function render() {
      const game = DATA.games[gameIndex];
      const snap = game.snapshots[plyIndex];
      const lastPly = game.snapshots.length - 1;
      gameSelect.value = String(gameIndex);
      plyRange.max = String(lastPly);
      plyRange.value = String(plyIndex);
      boardEl.innerHTML = boardSvg(snap);

      frameLabel.textContent = 'Ply ' + snap.ply + ' / ' + lastPly;
      plyLabel.textContent = snap.token === 'start' ? 'Start position' : 'Ply ' + snap.ply + ': ' + snap.token;
      statusLine.textContent = snap.status;
      positionMeta.textContent = 'Move ' + snap.moveNumber + ' | turn ' + (snap.turn || 'none');
      gameSummary.textContent = game.label;
      gameResult.textContent = game.reason;
      timelineMeta.textContent = game.moves.length + ' plies';
      renderStats(game, snap, lastPly);
      redHand.innerHTML = handMarkup('red', snap.hands.red, snap.cooldownHands.red);
      blackHand.innerHTML = handMarkup('black', snap.hands.black, snap.cooldownHands.black);
      warning.textContent = snap.warning || '';
      warning.classList.toggle('visible', Boolean(snap.warning));
      renderMoveList(game);
    }

    function boardSvg(snap) {
      const parts = [];
      parts.push('<svg viewBox="0 0 720 720" role="img" aria-label="Drop Mini Xiangqi board">');
      parts.push('<defs>');
      parts.push('<linearGradient id="boardWash" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f5e7c7"/><stop offset="0.52" stop-color="#e4c88f"/><stop offset="1" stop-color="#d4ad68"/></linearGradient>');
      parts.push('<radialGradient id="redDisc" cx="38%" cy="30%" r="72%"><stop offset="0" stop-color="#da4a52"/><stop offset="1" stop-color="#862027"/></radialGradient>');
      parts.push('<radialGradient id="blackDisc" cx="38%" cy="30%" r="72%"><stop offset="0" stop-color="#333941"/><stop offset="1" stop-color="#070809"/></radialGradient>');
      parts.push('<filter id="pieceShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#2b1a07" flood-opacity="0.34"/></filter>');
      parts.push('<marker id="arrowHead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(31,154,122,0.72)"/></marker>');
      parts.push('</defs>');
      parts.push('<rect class="svg-board-bg" x="18" y="18" width="684" height="684" rx="10"/>');
      parts.push('<rect class="svg-board-frame" x="' + margin + '" y="' + margin + '" width="' + step * 6 + '" height="' + step * 6 + '" rx="6"/>');
      for (let i = 0; i < 7; i += 1) {
        const offset = margin + step * i;
        parts.push('<line class="grid-line" x1="' + margin + '" y1="' + offset + '" x2="' + (margin + step * 6) + '" y2="' + offset + '"/>');
        parts.push('<line class="grid-line" x1="' + offset + '" y1="' + margin + '" x2="' + offset + '" y2="' + (margin + step * 6) + '"/>');
      }
      addPalace(parts, ['c7', 'e5'], ['e7', 'c5']);
      addPalace(parts, ['c3', 'e1'], ['e3', 'c1']);
      files.forEach((file, index) => {
        const x = margin + step * index;
        parts.push('<text class="coord-label" x="' + x + '" y="32">' + file + '</text>');
        parts.push('<text class="coord-label" x="' + x + '" y="688">' + file + '</text>');
      });
      ranks.forEach((rank) => {
        const y = pointForSquare('a' + rank).y;
        parts.push('<text class="coord-label" x="32" y="' + y + '">' + rank + '</text>');
        parts.push('<text class="coord-label" x="688" y="' + y + '">' + rank + '</text>');
      });

      const last = snap.lastMove;
      if (last && 'from' in last) {
        const from = pointForSquare(last.from);
        const to = pointForSquare(last.to);
        parts.push('<line class="move-vector" x1="' + from.x + '" y1="' + from.y + '" x2="' + to.x + '" y2="' + to.y + '" marker-end="url(#arrowHead)"/>');
        parts.push('<circle class="last-ring last-from" cx="' + from.x + '" cy="' + from.y + '" r="38"/>');
        parts.push('<circle class="last-ring last-to" cx="' + to.x + '" cy="' + to.y + '" r="42"/>');
      } else if (last) {
        const to = pointForSquare(last.to);
        parts.push('<circle class="last-ring last-to" cx="' + to.x + '" cy="' + to.y + '" r="42"/>');
      }

      for (const rank of ranks) {
        for (const file of files) {
          const square = file + rank;
          const piece = snap.board[square];
          if (!piece) continue;
          const point = pointForSquare(square);
          const label = pieceGlyph[piece.color][piece.role] || roleLabel[piece.role];
          parts.push('<g class="piece-shadow">');
          parts.push('<title>' + escapeHtml(piece.color + ' ' + piece.role + ' on ' + square) + '</title>');
          parts.push('<circle class="piece-disc ' + piece.color + '" cx="' + point.x + '" cy="' + point.y + '" r="33"/>');
          parts.push('<circle class="piece-inner-ring ' + piece.color + '" cx="' + point.x + '" cy="' + point.y + '" r="24"/>');
          parts.push('<text class="piece-text ' + piece.color + '" x="' + point.x + '" y="' + (point.y + 1) + '">' + label + '</text>');
          parts.push('</g>');
        }
      }
      parts.push('</svg>');
      return parts.join('');
    }

    function addPalace(parts, first, second) {
      const a = pointForSquare(first[0]);
      const b = pointForSquare(first[1]);
      const c = pointForSquare(second[0]);
      const d = pointForSquare(second[1]);
      parts.push('<line class="palace-line" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>');
      parts.push('<line class="palace-line" x1="' + c.x + '" y1="' + c.y + '" x2="' + d.x + '" y2="' + d.y + '"/>');
    }

    function pointForSquare(square) {
      const fileIndex = files.indexOf(square[0]);
      const rank = Number(square[1]);
      return {
        x: margin + step * fileIndex,
        y: margin + step * (7 - rank),
      };
    }

    function renderStats(game, snap, lastPly) {
      const firstDrop = game.firstDropPly === null || game.firstDropPly === undefined ? 'none' : String(game.firstDropPly);
      const stats = [
        ['Ply', snap.ply + '/' + lastPly],
        ['Drops', String(game.drops)],
        ['Drop checks', String(game.dropChecks)],
        ['First drop', firstDrop],
        ['Policy', game.policy],
        ['Move', String(snap.moveNumber)],
      ];
      statGrid.innerHTML = stats
        .map((item) => '<div class="stat"><span>' + escapeHtml(item[0]) + '</span><strong>' + escapeHtml(item[1]) + '</strong></div>')
        .join('');
    }

    function handMarkup(color, hand, cooldown) {
      const activeTotal = roleOrder.reduce((sum, role) => sum + (hand[role] || 0), 0);
      const chips = roleOrder
        .map((role) => {
          const count = hand[role] || 0;
          const cooling = cooldown[role] || 0;
          const classes = 'hand-chip' + (count || cooling ? '' : ' dim');
          const cooldownText = cooling ? '<small>cd ' + cooling + '</small>' : '';
          return '<div class="' + classes + '"><span>' + pieceGlyph[color][role] + '</span><strong>' + count + '</strong>' + cooldownText + '</div>';
        })
        .join('');
      return '<div class="hand-title"><span>' + color + ' reserve</span><strong>' + activeTotal + '</strong></div><div class="hand-chips">' + chips + '</div>';
    }

    function renderMoveList(game) {
      moveList.innerHTML = '';
      const start = document.createElement('button');
      start.type = 'button';
      start.innerHTML = '<span class="move-index">0</span><span class="move-token">start</span>';
      start.className = plyIndex === 0 ? 'current' : '';
      start.addEventListener('click', () => {
        plyIndex = 0;
        render();
      });
      moveList.append(start);

      game.moves.forEach((move, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.innerHTML =
          '<span class="move-index">' +
          String(index + 1) +
          '</span><span class="move-token">' +
          escapeHtml(move) +
          '</span>';
        if (move.includes('@')) button.classList.add('drop');
        if (plyIndex === index + 1) button.classList.add('current');
        button.addEventListener('click', () => {
          plyIndex = index + 1;
          render();
        });
        moveList.append(button);
      });
    }

    function escapeHtml(value) {
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return String(value).replace(/[&<>"']/g, (char) => map[char]);
    }

    render();
  </script>
</body>
</html>`;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    fsfPath: defaultFsfPath(),
    games: 1,
    htmlPath: null,
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
    else if (arg === '--html') opts.htmlPath = resolve(next());
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
  --policies wild,no-enemy-palace,no-threat,home
                                  default: all four
  --games N                      default: 1
  --plies N                      default: 120
  --movetime MS                  default: 100
  --skill N                      default: 8
  --fsf PATH                     default: MISTBOARD_FSF_PATH or local dev FSF
  --html PATH                    write a local replay HTML for self-play games
  --ini PATH                     default: scripts/variant-lab/drop-mini-xiangqi-fsf.ini`);
  process.exit(0);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  let selfPlayResults: SelfPlayResult[] = [];
  if (opts.mode === 'probe' || opts.mode === 'both') await runProbe(opts);
  if (opts.mode === 'selfplay' || opts.mode === 'both') selfPlayResults = await runSelfPlay(opts);
  writeHtmlReport(opts, selfPlayResults);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
