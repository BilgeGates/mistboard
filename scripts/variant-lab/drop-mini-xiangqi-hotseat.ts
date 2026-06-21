// Terminal hotseat playtest for Drop Mini Xiangqi.
//
// Run:
//   tsx scripts/variant-lab/drop-mini-xiangqi-hotseat.ts --policy wild
//   tsx scripts/variant-lab/drop-mini-xiangqi-hotseat.ts --policy any-no-threat
//
// Move input:
//   a2-a3
//   horse@c5
//   H@c5
//
// Commands:
//   help, moves, drops, undo, quit

import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import {
  applyDropMiniXiangqiMove,
  COOLDOWN_DROP_MINI_XIANGQI_RULES,
  createInitialDropMiniXiangqiState,
  DEFAULT_DROP_MINI_XIANGQI_RULES,
  type DropMiniXiangqiDropRole,
  type DropMiniXiangqiGameState,
  type DropMiniXiangqiHand,
  type DropMiniXiangqiMove,
  type DropMiniXiangqiRules,
  GUARDED_DROP_MINI_XIANGQI_RULES,
  getLegalDropMiniXiangqiMoves,
  isDropMiniXiangqiDropMove,
  isLegalDropMiniXiangqiMove,
} from '../../packages/game/src/variants-drop-mini-xiangqi.ts';
import type {
  MiniXiangqiBoard,
  MiniXiangqiColor,
  MiniXiangqiPiece,
  MiniXiangqiPieceRole,
  MiniXiangqiSquare,
} from '../../packages/game/src/variants-mini-xiangqi.ts';

const ROLE_LETTER: Record<MiniXiangqiPieceRole, string> = {
  general: 'G',
  horse: 'H',
  cannon: 'C',
  chariot: 'R',
  soldier: 'S',
};

const DROP_ROLE_BY_INPUT: Record<string, DropMiniXiangqiDropRole> = {
  h: 'horse',
  horse: 'horse',
  n: 'horse',
  c: 'cannon',
  cannon: 'cannon',
  r: 'chariot',
  chariot: 'chariot',
  rook: 'chariot',
  s: 'soldier',
  soldier: 'soldier',
  p: 'soldier',
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;
const SQUARE_RE = /^[a-g][1-7]$/;

const ANY_NO_THREAT_RULES: DropMiniXiangqiRules = {
  ...DEFAULT_DROP_MINI_XIANGQI_RULES,
  dropAttack: 'forbid-immediate-general-threat',
};

const POLICIES: Record<string, DropMiniXiangqiRules> = {
  wild: DEFAULT_DROP_MINI_XIANGQI_RULES,
  'any-no-threat': ANY_NO_THREAT_RULES,
  guarded: GUARDED_DROP_MINI_XIANGQI_RULES,
  'guarded-home': GUARDED_DROP_MINI_XIANGQI_RULES,
  cooldown: COOLDOWN_DROP_MINI_XIANGQI_RULES,
};

function glyph(piece: MiniXiangqiPiece | undefined): string {
  if (!piece) return ' .';
  const letter = ROLE_LETTER[piece.role];
  return ` ${piece.color === 'red' ? letter : letter.toLowerCase()}`;
}

function render(board: MiniXiangqiBoard): string {
  const lines: string[] = [];
  for (let rank = 7; rank >= 1; rank -= 1) {
    const cells = FILES.map((f) => glyph(board[`${f}${rank}` as MiniXiangqiSquare])).join('');
    lines.push(`${rank} ${cells}`);
  }
  lines.push(`   ${FILES.map((f) => ` ${f}`).join('')}`);
  return lines.join('\n');
}

function formatHand(hand: DropMiniXiangqiHand): string {
  const parts = (['chariot', 'cannon', 'horse', 'soldier'] as const)
    .map((role) => `${ROLE_LETTER[role]}:${hand[role] ?? 0}`)
    .filter((part) => !part.endsWith(':0'));
  return parts.length === 0 ? '-' : parts.join(' ');
}

function findGeneral(board: MiniXiangqiBoard, color: MiniXiangqiColor): MiniXiangqiSquare | null {
  for (const [square, piece] of Object.entries(board)) {
    if (piece?.color === color && piece.role === 'general') return square as MiniXiangqiSquare;
  }
  return null;
}

function opponentOf(color: MiniXiangqiColor): MiniXiangqiColor {
  return color === 'red' ? 'black' : 'red';
}

function canCaptureGeneralNow(state: DropMiniXiangqiGameState, color: MiniXiangqiColor): boolean {
  const target = findGeneral(state.board, opponentOf(color));
  if (!target) return false;
  const probe = { ...state, status: { type: 'playing', turn: color } as const };
  return getLegalDropMiniXiangqiMoves(probe).some(
    (move) => !isDropMiniXiangqiDropMove(move) && move.to === target,
  );
}

function statusLine(state: DropMiniXiangqiGameState, policyName: string): string {
  if (state.status.type === 'finished') {
    return `finished: ${state.status.reason}, winner=${state.status.winner ?? 'draw'}`;
  }
  if (state.status.type === 'aborted') return `aborted: ${state.status.reason}`;
  const turn = state.status.turn;
  const legal = getLegalDropMiniXiangqiMoves(state);
  const threat = canCaptureGeneralNow(state, opponentOf(turn));
  return [
    `policy=${policyName}`,
    `turn=${turn}`,
    `move=${state.moveNumber}`,
    `legal=${legal.length}`,
    threat ? `${turn} general is under immediate capture threat` : null,
  ]
    .filter(Boolean)
    .join(' | ');
}

function renderState(state: DropMiniXiangqiGameState, policyName: string): string {
  return [
    render(state.board),
    `hands red:   ${formatHand(state.hands.red)}  cooldown: ${formatHand(state.cooldownHands.red)}`,
    `hands black: ${formatHand(state.hands.black)}  cooldown: ${formatHand(state.cooldownHands.black)}`,
    statusLine(state, policyName),
  ].join('\n');
}

function moveText(move: DropMiniXiangqiMove): string {
  return isDropMiniXiangqiDropMove(move) ? `${move.drop}@${move.to}` : `${move.from}-${move.to}`;
}

function parseMove(inputText: string): DropMiniXiangqiMove | null {
  const text = inputText.trim().toLowerCase();
  const board = text.match(/^([a-g][1-7])\s*(?:-|to|\s)\s*([a-g][1-7])$/);
  if (board) {
    return { from: board[1] as MiniXiangqiSquare, to: board[2] as MiniXiangqiSquare };
  }
  const drop =
    text.match(/^([a-z]+)\s*@\s*([a-g][1-7])$/) ?? text.match(/^drop\s+([a-z]+)\s+([a-g][1-7])$/);
  if (drop) {
    const role = DROP_ROLE_BY_INPUT[drop[1]];
    if (!role || !SQUARE_RE.test(drop[2])) return null;
    return { drop: role, to: drop[2] as MiniXiangqiSquare };
  }
  return null;
}

function listMoves(state: DropMiniXiangqiGameState, dropsOnly = false): string {
  const moves = getLegalDropMiniXiangqiMoves(state).filter((move) =>
    dropsOnly ? isDropMiniXiangqiDropMove(move) : true,
  );
  if (moves.length === 0) return '(none)';
  return moves.map(moveText).join(' ');
}

function usage(): string {
  return [
    'usage: tsx scripts/variant-lab/drop-mini-xiangqi-hotseat.ts [--policy wild|any-no-threat|guarded|cooldown] [--moves m1,m2,...]',
    'moves: a2-a3, horse@c5, H@c5',
    'commands: help, moves, drops, undo, quit',
  ].join('\n');
}

function parseArgs(): { policyName: string; moves: string[] } {
  let policyName = 'wild';
  const moves: string[] = [];
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg === '--policy') {
      policyName = process.argv[i + 1] ?? policyName;
      i += 1;
      continue;
    }
    if (arg === '--moves') {
      moves.push(...(process.argv[i + 1] ?? '').split(',').filter(Boolean));
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    moves.push(arg);
  }
  return { policyName, moves };
}

function applyParsedMove(
  state: DropMiniXiangqiGameState,
  raw: string,
): { state: DropMiniXiangqiGameState; ok: boolean; message: string } {
  const move = parseMove(raw);
  if (!move) return { state, ok: false, message: `could not parse move: ${raw}` };
  if (!isLegalDropMiniXiangqiMove(state, move)) {
    return { state, ok: false, message: `illegal move: ${moveText(move)}` };
  }
  return {
    state: applyDropMiniXiangqiMove(state, move),
    ok: true,
    message: `played ${moveText(move)}`,
  };
}

async function main(): Promise<void> {
  const { policyName, moves } = parseArgs();
  const rules = POLICIES[policyName];
  if (!rules) {
    console.error(`unknown policy: ${policyName}`);
    console.error(usage());
    process.exit(1);
  }

  let state = createInitialDropMiniXiangqiState(`hotseat-${Date.now()}`, rules);
  const history: DropMiniXiangqiGameState[] = [];

  if (moves.length > 0) {
    for (const raw of moves) {
      const result = applyParsedMove(state, raw);
      console.log(result.message);
      if (!result.ok) break;
      history.push(state);
      state = result.state;
    }
    console.log(renderState(state, policyName));
    return;
  }

  console.log('Drop Mini Xiangqi hotseat');
  console.log(usage());
  console.log(renderState(state, policyName));

  const rl = createInterface({ input, output });
  try {
    while (true) {
      const prompt =
        state.status.type === 'playing' ? `${state.status.turn}> ` : `${state.status.type}> `;
      const line = (await rl.question(prompt)).trim();
      if (line === '') continue;
      if (line === 'quit' || line === 'q' || line === 'exit') break;
      if (line === 'help' || line === '?') {
        console.log(usage());
        continue;
      }
      if (line === 'moves') {
        console.log(listMoves(state));
        continue;
      }
      if (line === 'drops') {
        console.log(listMoves(state, true));
        continue;
      }
      if (line === 'undo') {
        const previous = history.pop();
        if (!previous) {
          console.log('nothing to undo');
        } else {
          state = previous;
          console.log(renderState(state, policyName));
        }
        continue;
      }

      const result = applyParsedMove(state, line);
      console.log(result.message);
      if (result.ok) {
        history.push(state);
        state = result.state;
      }
      console.log(renderState(state, policyName));
    }
  } finally {
    rl.close();
  }
}

await main();
