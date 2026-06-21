// Fairy-Stockfish pressure test for Drop Mini Xiangqi.
//
// Run:
//   node_modules/.bin/tsx scripts/variant-lab/drop-mini-xiangqi-fsf-play.ts
//   node_modules/.bin/tsx scripts/variant-lab/drop-mini-xiangqi-fsf-play.ts --mode selfplay --games 3
//
// FSF uses orthodox check semantics. Mistboard's S0 kernel is general-capture,
// so this is an engine balance probe, not the product referee.

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
} from '../../packages/game/src/variants-drop-mini-xiangqi.ts';
import type {
  MiniXiangqiBoard,
  MiniXiangqiColor,
  MiniXiangqiPieceRole,
  MiniXiangqiSquare,
} from '../../packages/game/src/variants-mini-xiangqi.ts';

type FsfPolicy = 'wild' | 'no-threat' | 'home';

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
  'no-threat': 'dropminixiangqi-no-threat',
  home: 'dropminixiangqi-home',
};

const START_FEN = 'rcnkncr/p1ppp1p/7/7/7/P1PPP1P/RCNKNCR[] w - - 0 1';
const CANNON_IN_HAND_FEN = 'rcnkncr/p1ppp1p/7/7/7/P1PPP1P/RCNKNCR[C] w - - 0 1';
const ALL_PIECES_IN_HAND_FEN = 'rcnkncr/p1ppp1p/7/7/7/P1PPP1P/RCNKNCR[RCNP] w - - 0 1';

const DEFAULT_POLICIES: readonly FsfPolicy[] = ['wild', 'no-threat', 'home'];
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
  if (policy === 'no-threat') {
    return {
      ...DEFAULT_DROP_MINI_XIANGQI_RULES,
      dropAttack: 'forbid-immediate-general-threat',
    };
  }
  return DEFAULT_DROP_MINI_XIANGQI_RULES;
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
      color-scheme: light;
      --bg: #f5f1e8;
      --ink: #241b14;
      --muted: #6f6257;
      --line: #9a6a35;
      --panel: #fffaf0;
      --red: #b4232d;
      --black: #202020;
      --accent: #286d5a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background: var(--bg);
    }
    main {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 24px 0 36px;
    }
    header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: end;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 24px;
      line-height: 1.15;
      margin: 0 0 4px;
    }
    .subtle {
      color: var(--muted);
      font-size: 13px;
    }
    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin: 0 0 16px;
      padding: 12px;
      background: var(--panel);
      border: 1px solid rgba(36, 27, 20, 0.12);
      border-radius: 8px;
    }
    button,
    select {
      height: 34px;
      border: 1px solid rgba(36, 27, 20, 0.18);
      border-radius: 6px;
      background: #fff;
      color: var(--ink);
      padding: 0 10px;
      font: inherit;
    }
    button {
      cursor: pointer;
    }
    button:hover {
      border-color: var(--accent);
    }
    input[type="range"] {
      flex: 1 1 260px;
      min-width: 160px;
      accent-color: var(--accent);
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(320px, 480px) minmax(260px, 1fr);
      gap: 16px;
      align-items: start;
    }
    .panel {
      background: var(--panel);
      border: 1px solid rgba(36, 27, 20, 0.12);
      border-radius: 8px;
      padding: 14px;
    }
    .board {
      display: grid;
      grid-template-columns: repeat(7, minmax(38px, 1fr));
      aspect-ratio: 1;
      border: 2px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      background:
        linear-gradient(rgba(154, 106, 53, 0.55) 1px, transparent 1px),
        linear-gradient(90deg, rgba(154, 106, 53, 0.55) 1px, transparent 1px),
        #f8e6bd;
      background-size: calc(100% / 6) calc(100% / 6);
      background-position: 0 0;
    }
    .cell {
      position: relative;
      display: grid;
      place-items: center;
      min-width: 0;
      min-height: 0;
    }
    .cell::after {
      content: attr(data-square);
      position: absolute;
      left: 4px;
      bottom: 3px;
      font-size: 10px;
      color: rgba(36, 27, 20, 0.42);
    }
    .cell.last-from {
      background: rgba(40, 109, 90, 0.16);
    }
    .cell.last-to {
      background: rgba(180, 35, 45, 0.16);
    }
    .piece {
      width: min(82%, 54px);
      aspect-ratio: 1;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: #fff9e8;
      border: 2px solid currentColor;
      box-shadow: 0 2px 4px rgba(36, 27, 20, 0.18);
      font-family: ui-serif, Georgia, serif;
      font-size: clamp(18px, 5vw, 32px);
      font-weight: 700;
      line-height: 1;
    }
    .piece.red {
      color: var(--red);
    }
    .piece.black {
      color: var(--black);
    }
    .meta {
      display: grid;
      gap: 8px;
      margin-top: 12px;
      font-size: 14px;
    }
    .hands {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .hand {
      padding: 8px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.55);
    }
    .move-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      max-height: 520px;
      overflow: auto;
      padding-right: 2px;
    }
    .move-list button {
      height: 28px;
      font-size: 12px;
      padding: 0 8px;
    }
    .move-list button.current {
      color: #fff;
      background: var(--accent);
      border-color: var(--accent);
    }
    .move-list button.drop {
      border-color: rgba(180, 35, 45, 0.45);
    }
    .warning {
      display: none;
      margin-top: 10px;
      padding: 8px;
      border-radius: 6px;
      color: #7a240d;
      background: #ffe6d8;
    }
    .warning.visible {
      display: block;
    }
    @media (max-width: 820px) {
      header {
        display: block;
      }
      .layout {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Drop Mini Xiangqi FSF Replay</h1>
        <div class="subtle">Generated <span id="generatedAt"></span>. FSF uses orthodox check semantics; replay validation uses the Mistboard lab kernel.</div>
      </div>
      <div class="subtle" id="runMeta"></div>
    </header>
    <section class="controls" aria-label="Replay controls">
      <select id="gameSelect" aria-label="Game"></select>
      <button type="button" id="firstBtn">First</button>
      <button type="button" id="prevBtn">Prev</button>
      <input id="plyRange" type="range" min="0" value="0" aria-label="Ply">
      <button type="button" id="nextBtn">Next</button>
      <button type="button" id="lastBtn">Last</button>
    </section>
    <section class="layout">
      <div class="panel">
        <div class="board" id="board"></div>
        <div class="meta">
          <div><strong id="plyLabel"></strong></div>
          <div id="statusLine"></div>
          <div class="hands">
            <div class="hand" id="redHand"></div>
            <div class="hand" id="blackHand"></div>
          </div>
          <div class="warning" id="warning"></div>
        </div>
      </div>
      <div class="panel">
        <div class="subtle" id="gameSummary"></div>
        <div class="move-list" id="moveList"></div>
      </div>
    </section>
  </main>
  <script>
    const DATA = ${data};
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const ranks = [7, 6, 5, 4, 3, 2, 1];
    const roleLabel = ${JSON.stringify(ROLE_LABEL)};
    let gameIndex = 0;
    let plyIndex = 0;

    const boardEl = document.getElementById('board');
    const gameSelect = document.getElementById('gameSelect');
    const gameSummary = document.getElementById('gameSummary');
    const generatedAt = document.getElementById('generatedAt');
    const runMeta = document.getElementById('runMeta');
    const moveList = document.getElementById('moveList');
    const plyLabel = document.getElementById('plyLabel');
    const plyRange = document.getElementById('plyRange');
    const redHand = document.getElementById('redHand');
    const blackHand = document.getElementById('blackHand');
    const statusLine = document.getElementById('statusLine');
    const warning = document.getElementById('warning');

    generatedAt.textContent = new Date(DATA.generatedAt).toLocaleString();
    runMeta.textContent =
      'policies=' + DATA.options.policies.join(',') +
      ' | skill=' + DATA.options.skill +
      ' | movetime=' + DATA.options.movetimeMs + 'ms' +
      ' | max plies=' + DATA.options.maxPlies;

    DATA.games.forEach((game, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = game.label + ' (' + game.moves.length + ' plies)';
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

    function render() {
      const game = DATA.games[gameIndex];
      const snap = game.snapshots[plyIndex];
      gameSelect.value = String(gameIndex);
      plyRange.max = String(game.snapshots.length - 1);
      plyRange.value = String(plyIndex);
      boardEl.innerHTML = '';

      const last = snap.lastMove;
      for (const rank of ranks) {
        for (const file of files) {
          const square = file + rank;
          const cell = document.createElement('div');
          cell.className = 'cell';
          cell.dataset.square = square;
          if (last && 'from' in last && last.from === square) cell.classList.add('last-from');
          if (last && last.to === square) cell.classList.add('last-to');
          const piece = snap.board[square];
          if (piece) {
            const pieceEl = document.createElement('div');
            pieceEl.className = 'piece ' + piece.color;
            pieceEl.title = piece.color + ' ' + piece.role;
            const label = roleLabel[piece.role];
            pieceEl.textContent = piece.color === 'red' ? label : label.toLowerCase();
            cell.append(pieceEl);
          }
          boardEl.append(cell);
        }
      }

      plyLabel.textContent = 'Ply ' + snap.ply + ': ' + snap.token;
      statusLine.textContent = snap.status + ' | move ' + snap.moveNumber;
      redHand.textContent = 'Red hand: ' + handText(snap.hands.red) + ' | cooldown: ' + handText(snap.cooldownHands.red);
      blackHand.textContent = 'Black hand: ' + handText(snap.hands.black) + ' | cooldown: ' + handText(snap.cooldownHands.black);
      warning.textContent = snap.warning || '';
      warning.classList.toggle('visible', Boolean(snap.warning));
      gameSummary.textContent =
        game.label +
        ' | reason=' + game.reason +
        ' | drops=' + game.drops +
        ' | drop-checks=' + game.dropChecks +
        ' | first drop=' + (game.firstDropPly || 'none');
      renderMoveList(game);
    }

    function handText(hand) {
      const parts = ['chariot', 'cannon', 'horse', 'soldier']
        .filter((role) => hand[role])
        .map((role) => roleLabel[role] + ':' + hand[role]);
      return parts.length ? parts.join(' ') : '-';
    }

    function renderMoveList(game) {
      moveList.innerHTML = '';
      const start = document.createElement('button');
      start.type = 'button';
      start.textContent = '0 start';
      start.className = plyIndex === 0 ? 'current' : '';
      start.addEventListener('click', () => {
        plyIndex = 0;
        render();
      });
      moveList.append(start);

      game.moves.forEach((move, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = String(index + 1) + ' ' + move;
        if (move.includes('@')) button.classList.add('drop');
        if (plyIndex === index + 1) button.classList.add('current');
        button.addEventListener('click', () => {
          plyIndex = index + 1;
          render();
        });
        moveList.append(button);
      });
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
  --policies wild,no-threat,home  default: all three
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
