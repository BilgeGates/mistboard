// Dev probe for Drop Mini Xiangqi S0.
//
// Run:
//   tsx scripts/variant-lab/drop-mini-xiangqi-scenarios.ts
//
// This is not engine play. It checks a few constructed tactical positions under
// the wild policy and the guarded/cooldown comparators so the rules discussion
// has concrete pressure examples.

import {
  applyDropMiniXiangqiMove,
  COOLDOWN_DROP_MINI_XIANGQI_RULES,
  DEFAULT_DROP_MINI_XIANGQI_RULES,
  type DropMiniXiangqiGameState,
  type DropMiniXiangqiHands,
  type DropMiniXiangqiMove,
  type DropMiniXiangqiRules,
  dropMiniXiangqiPositionRepetitionKey,
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
import { createInitialMiniXiangqiBoard } from '../../packages/game/src/variants-mini-xiangqi.ts';

const ROLE_LETTER: Record<MiniXiangqiPieceRole, string> = {
  general: 'G',
  horse: 'H',
  cannon: 'C',
  chariot: 'R',
  soldier: 'S',
};

const PIECE_VALUE: Record<MiniXiangqiPieceRole, number> = {
  general: 0,
  chariot: 5,
  cannon: 4,
  horse: 3,
  soldier: 1,
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;

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

function makeState(args: {
  id: string;
  board: MiniXiangqiBoard;
  hands?: DropMiniXiangqiHands;
  rules?: DropMiniXiangqiRules;
  turn?: MiniXiangqiColor;
}): DropMiniXiangqiGameState {
  const state: DropMiniXiangqiGameState = {
    id: args.id,
    board: args.board,
    status: { type: 'playing', turn: args.turn ?? 'red' },
    moveNumber: 1,
    progressClock: 0,
    rules: args.rules ?? DEFAULT_DROP_MINI_XIANGQI_RULES,
    hands: cloneHands(args.hands ?? { red: {}, black: {} }),
    cooldownHands: { red: {}, black: {} },
    positionCounts: {},
  };
  return {
    ...state,
    positionCounts: { [dropMiniXiangqiPositionRepetitionKey(state)]: 1 },
  };
}

function cloneHands(hands: DropMiniXiangqiHands): DropMiniXiangqiHands {
  return {
    red: { ...hands.red },
    black: { ...hands.black },
  };
}

function findGeneral(board: MiniXiangqiBoard, color: MiniXiangqiColor): MiniXiangqiSquare | null {
  for (const [square, piece] of Object.entries(board)) {
    if (piece?.color === color && piece.role === 'general') return square as MiniXiangqiSquare;
  }
  return null;
}

function canCaptureGeneralNow(state: DropMiniXiangqiGameState, color: MiniXiangqiColor): boolean {
  const target = findGeneral(state.board, color === 'red' ? 'black' : 'red');
  if (!target) return false;
  const probe = { ...state, status: { type: 'playing', turn: color } as const };
  return getLegalDropMiniXiangqiMoves(probe).some(
    (move) => !isDropMiniXiangqiDropMove(move) && move.to === target,
  );
}

type ReplyAudit = {
  move: DropMiniXiangqiMove;
  safe: boolean;
  counterThreat: boolean;
  redMaterial: number;
};

type DropAudit = {
  move: DropMiniXiangqiMove;
  threat: boolean;
  replies: ReplyAudit[];
  classification: string;
  materialAfterDrop: number;
};

type PrepAudit = {
  prep: DropMiniXiangqiMove;
  drops: DropAudit[];
  worstRank: number;
};

type Scenario = {
  name: string;
  board: MiniXiangqiBoard;
  hands: DropMiniXiangqiHands;
  move: DropMiniXiangqiMove;
  turn?: MiniXiangqiColor;
};

type PolicyCase = {
  label: string;
  rules: DropMiniXiangqiRules;
};

const POLICIES: readonly PolicyCase[] = [
  { label: 'wild', rules: DEFAULT_DROP_MINI_XIANGQI_RULES },
  {
    label: 'any-no-threat',
    rules: {
      ...DEFAULT_DROP_MINI_XIANGQI_RULES,
      dropAttack: 'forbid-immediate-general-threat',
    },
  },
  { label: 'guarded-home', rules: GUARDED_DROP_MINI_XIANGQI_RULES },
  { label: 'cooldown', rules: COOLDOWN_DROP_MINI_XIANGQI_RULES },
];

function auditReplies(state: DropMiniXiangqiGameState, defender: MiniXiangqiColor): ReplyAudit[] {
  const attacker = opponentOf(defender);
  const legal = getLegalDropMiniXiangqiMoves(state);
  return legal.map((reply) => {
    const next = applyDropMiniXiangqiMove(state, reply);
    const safe = next.status.type !== 'playing' || !canCaptureGeneralNow(next, attacker);
    return {
      move: reply,
      safe,
      counterThreat: next.status.type === 'playing' && canCaptureGeneralNow(next, defender),
      redMaterial: materialDelta(next),
    };
  });
}

function moveText(move: DropMiniXiangqiMove): string {
  return isDropMiniXiangqiDropMove(move) ? `${move.drop}@${move.to}` : `${move.from}-${move.to}`;
}

function opponentOf(color: MiniXiangqiColor): MiniXiangqiColor {
  return color === 'red' ? 'black' : 'red';
}

function materialDelta(state: DropMiniXiangqiGameState): number {
  let red = 0;
  let black = 0;
  for (const piece of Object.values(state.board)) {
    if (!piece) continue;
    if (piece.color === 'red') red += PIECE_VALUE[piece.role];
    else black += PIECE_VALUE[piece.role];
  }
  for (const color of ['red', 'black'] as const) {
    for (const [role, count] of Object.entries(state.hands[color]) as [
      Exclude<MiniXiangqiPieceRole, 'general'>,
      number,
    ][]) {
      if (color === 'red') red += PIECE_VALUE[role] * count;
      else black += PIECE_VALUE[role] * count;
    }
    for (const [role, count] of Object.entries(state.cooldownHands[color]) as [
      Exclude<MiniXiangqiPieceRole, 'general'>,
      number,
    ][]) {
      if (color === 'red') red += PIECE_VALUE[role] * count;
      else black += PIECE_VALUE[role] * count;
    }
  }
  return red - black;
}

function classify(legal: boolean, threat: boolean, replies: ReplyAudit[]): string {
  if (!legal) return 'blocked-by-policy';
  if (!threat) return 'quiet/drop-setup';
  const safe = replies.filter((reply) => reply.safe);
  const counters = safe.filter((reply) => reply.counterThreat);
  if (safe.length === 0) return 'busted';
  if (safe.length <= 2 && counters.length === 0) return 'forcing';
  return 'playable';
}

function bestReplies(replies: ReplyAudit[], limit = 3): ReplyAudit[] {
  return [...replies]
    .sort((a, b) => {
      if (a.safe !== b.safe) return a.safe ? -1 : 1;
      if (a.counterThreat !== b.counterThreat) return a.counterThreat ? -1 : 1;
      return a.redMaterial - b.redMaterial;
    })
    .slice(0, limit);
}

function formatBestReplies(replies: ReplyAudit[]): string {
  return bestReplies(replies)
    .map(
      (reply) =>
        `${moveText(reply.move)}${reply.safe ? '' : '!'}${reply.counterThreat ? '+' : ''}(${
          reply.redMaterial >= 0 ? '+' : ''
        }${reply.redMaterial})`,
    )
    .join(' ');
}

function auditDrop(state: DropMiniXiangqiGameState, move: DropMiniXiangqiMove): DropAudit {
  const attacker = state.status.type === 'playing' ? state.status.turn : 'red';
  const next = applyDropMiniXiangqiMove(state, move);
  const threat = canCaptureGeneralNow(next, attacker);
  const replies = next.status.type === 'playing' ? auditReplies(next, next.status.turn) : [];
  return {
    move,
    threat,
    replies,
    classification: classify(true, threat, replies),
    materialAfterDrop: materialDelta(next),
  };
}

function reportScenario(scenario: Scenario): void {
  console.log(`\n## ${scenario.name}`);
  console.log(render(scenario.board));
  console.log(`candidate: ${moveText(scenario.move)}`);
  for (const policy of POLICIES) {
    const state = makeState({
      id: `${scenario.name}-${policy.label}`,
      board: scenario.board,
      hands: scenario.hands,
      rules: policy.rules,
      turn: scenario.turn,
    });
    const legal = isLegalDropMiniXiangqiMove(state, scenario.move);
    if (!legal) {
      console.log(`${policy.label.padEnd(12)} legal=false class=blocked-by-policy`);
      continue;
    }
    const next = applyDropMiniXiangqiMove(state, scenario.move);
    const attacker = scenario.turn ?? 'red';
    const threat = canCaptureGeneralNow(next, attacker);
    const replies = next.status.type === 'playing' ? auditReplies(next, next.status.turn) : [];
    const safe = replies.filter((reply) => reply.safe);
    const counters = safe.filter((reply) => reply.counterThreat);
    const samples = formatBestReplies(replies);
    console.log(
      `${policy.label.padEnd(12)} legal=true threat=${threat} replies=${replies.length} safe=${
        safe.length
      } counters=${counters.length} class=${classify(legal, threat, replies)}${
        samples ? ` best=${samples}` : ''
      }`,
    );
  }
}

function classRank(classification: string): number {
  switch (classification) {
    case 'busted':
      return 0;
    case 'forcing':
      return 1;
    case 'playable':
      return 2;
    case 'quiet/drop-setup':
      return 3;
    default:
      return 4;
  }
}

function reportDropSearch(
  label: string,
  board: MiniXiangqiBoard,
  hands: DropMiniXiangqiHands,
): void {
  console.log(`\n## search: ${label}`);
  console.log(render(board));
  for (const policy of POLICIES) {
    const state = makeState({
      id: `${label}-${policy.label}`,
      board,
      hands,
      rules: policy.rules,
    });
    const drops = getLegalDropMiniXiangqiMoves(state).filter(isDropMiniXiangqiDropMove);
    const audits = drops.map((drop) => auditDrop(state, drop));
    const counts = new Map<string, number>();
    for (const audit of audits)
      counts.set(audit.classification, (counts.get(audit.classification) ?? 0) + 1);
    const sharpest = [...audits]
      .sort((a, b) => {
        const rank = classRank(a.classification) - classRank(b.classification);
        if (rank !== 0) return rank;
        const safeA = a.replies.filter((reply) => reply.safe).length;
        const safeB = b.replies.filter((reply) => reply.safe).length;
        if (safeA !== safeB) return safeA - safeB;
        const counterA = a.replies.filter((reply) => reply.counterThreat).length;
        const counterB = b.replies.filter((reply) => reply.counterThreat).length;
        if (counterA !== counterB) return counterA - counterB;
        return b.materialAfterDrop - a.materialAfterDrop;
      })
      .slice(0, 5);
    const summary = ['busted', 'forcing', 'playable', 'quiet/drop-setup']
      .map((name) => `${name}=${counts.get(name) ?? 0}`)
      .join(' ');
    console.log(`${policy.label.padEnd(12)} legal-drops=${drops.length} ${summary}`);
    for (const audit of sharpest) {
      const safe = audit.replies.filter((reply) => reply.safe).length;
      const counters = audit.replies.filter((reply) => reply.counterThreat).length;
      const replies = formatBestReplies(audit.replies);
      console.log(
        `  ${moveText(audit.move).padEnd(12)} ${audit.classification.padEnd(16)} threat=${
          audit.threat
        } safe=${safe}/${audit.replies.length} counters=${counters} mat=${
          audit.materialAfterDrop >= 0 ? '+' : ''
        }${audit.materialAfterDrop}${replies ? ` best=${replies}` : ''}`,
      );
    }
  }
}

function countClass(audits: readonly DropAudit[], classification: string): number {
  return audits.filter((audit) => audit.classification === classification).length;
}

function reportDefensiveTempoSearch(
  label: string,
  board: MiniXiangqiBoard,
  hands: DropMiniXiangqiHands,
  policy: PolicyCase,
): void {
  console.log(`\n## tempo: ${label} (${policy.label})`);
  console.log(render(board));
  const state = makeState({
    id: `${label}-${policy.label}`,
    board,
    hands,
    rules: policy.rules,
    turn: 'black',
  });
  const prepMoves = getLegalDropMiniXiangqiMoves(state);
  const prepAudits: PrepAudit[] = [];
  for (const prep of prepMoves) {
    const afterPrep = applyDropMiniXiangqiMove(state, prep);
    if (afterPrep.status.type !== 'playing') continue;
    const cannonDrops = getLegalDropMiniXiangqiMoves(afterPrep).filter(
      (move) => isDropMiniXiangqiDropMove(move) && move.drop === 'cannon',
    );
    const drops = cannonDrops.map((drop) => auditDrop(afterPrep, drop));
    prepAudits.push({
      prep,
      drops,
      worstRank: drops.reduce(
        (worst, audit) => Math.min(worst, classRank(audit.classification)),
        4,
      ),
    });
  }
  const leavesBusted = prepAudits.filter((audit) => countClass(audit.drops, 'busted') > 0).length;
  const leavesForcing = prepAudits.filter((audit) => countClass(audit.drops, 'forcing') > 0).length;
  const eliminatesBusted = prepAudits.length - leavesBusted;
  const eliminatesSharp = prepAudits.filter(
    (audit) => countClass(audit.drops, 'busted') === 0 && countClass(audit.drops, 'forcing') === 0,
  ).length;

  console.log(
    `black prep moves=${prepAudits.length} eliminate-busted=${eliminatesBusted} eliminate-busted+forcing=${eliminatesSharp}`,
  );
  console.log(`prep moves leaving busted cannon drops=${leavesBusted}`);
  console.log(`prep moves leaving forcing cannon drops=${leavesForcing}`);

  const bestPreps = [...prepAudits]
    .sort((a, b) => {
      if (a.worstRank !== b.worstRank) return b.worstRank - a.worstRank;
      return countClass(a.drops, 'forcing') - countClass(b.drops, 'forcing');
    })
    .slice(0, 5);
  for (const audit of bestPreps) {
    const counts = ['busted', 'forcing', 'playable', 'quiet/drop-setup']
      .map((name) => `${name}=${countClass(audit.drops, name)}`)
      .join(' ');
    const sharpest = [...audit.drops]
      .sort((a, b) => {
        const rank = classRank(a.classification) - classRank(b.classification);
        if (rank !== 0) return rank;
        return (
          a.replies.filter((reply) => reply.safe).length -
          b.replies.filter((reply) => reply.safe).length
        );
      })
      .slice(0, 2)
      .map((drop) => `${moveText(drop.move)}:${drop.classification}`)
      .join(' ');
    console.log(
      `  prep ${moveText(audit.prep).padEnd(7)} ${counts}${sharpest ? ` sharp=${sharpest}` : ''}`,
    );
  }
}

const baseBoard: MiniXiangqiBoard = {
  d1: { color: 'red', role: 'general' },
  d2: { color: 'red', role: 'soldier' },
  d7: { color: 'black', role: 'general' },
};

const scenarios: readonly Scenario[] = [
  {
    name: 'chariot same-file drop',
    board: baseBoard,
    hands: { red: { chariot: 1 }, black: {} },
    move: { drop: 'chariot', to: 'd4' },
  },
  {
    name: 'cannon drop with existing screen',
    board: {
      d1: { color: 'red', role: 'general' },
      d2: { color: 'red', role: 'soldier' },
      d5: { color: 'red', role: 'soldier' },
      d7: { color: 'black', role: 'general' },
    },
    hands: { red: { cannon: 1 }, black: {} },
    move: { drop: 'cannon', to: 'd3' },
  },
  {
    name: 'horse palace fork drop',
    board: baseBoard,
    hands: { red: { horse: 1 }, black: {} },
    move: { drop: 'horse', to: 'c5' },
  },
  {
    name: 'soldier contact drop',
    board: baseBoard,
    hands: { red: { soldier: 1 }, black: {} },
    move: { drop: 'soldier', to: 'd6' },
  },
  {
    name: 'quiet home reinforcement',
    board: baseBoard,
    hands: { red: { horse: 1 }, black: {} },
    move: { drop: 'horse', to: 'a3' },
  },
  {
    name: 'material-up horse reserve fork',
    board: {
      d1: { color: 'red', role: 'general' },
      d2: { color: 'red', role: 'soldier' },
      b4: { color: 'red', role: 'chariot' },
      c4: { color: 'black', role: 'horse' },
      d7: { color: 'black', role: 'general' },
    },
    hands: { red: { horse: 1 }, black: {} },
    move: { drop: 'horse', to: 'c5' },
  },
];

console.log('Drop Mini Xiangqi policy audit');
console.log('best reply suffix: ! = still allows general capture, + = creates counter-threat');
console.log('material is red minus black after the reply, counting board + hands + cooldown');
for (const scenario of scenarios) reportScenario(scenario);

const allReserveHands: DropMiniXiangqiHands = {
  red: { chariot: 1, cannon: 1, horse: 1, soldier: 1 },
  black: {},
};
reportDropSearch('minimal all-role reserve stock', baseBoard, allReserveHands);
reportDropSearch(
  'initial board plus all-role reserve stock',
  createInitialMiniXiangqiBoard(),
  allReserveHands,
);

const afterCapturedCannonBoard = createInitialMiniXiangqiBoard();
delete afterCapturedCannonBoard.b7;
reportDefensiveTempoSearch(
  'red has captured one cannon, black gets one prep move',
  afterCapturedCannonBoard,
  { red: { cannon: 1 }, black: {} },
  { label: 'wild', rules: DEFAULT_DROP_MINI_XIANGQI_RULES },
);
reportDefensiveTempoSearch(
  'red has captured one cannon, black gets one prep move',
  afterCapturedCannonBoard,
  { red: { cannon: 1 }, black: {} },
  {
    label: 'any-no-threat',
    rules: {
      ...DEFAULT_DROP_MINI_XIANGQI_RULES,
      dropAttack: 'forbid-immediate-general-threat',
    },
  },
);

const cooldownCaptured = applyDropMiniXiangqiMove(
  makeState({
    id: 'cooldown-capture',
    board: {
      a1: { color: 'red', role: 'chariot' },
      a2: { color: 'black', role: 'horse' },
      d1: { color: 'red', role: 'general' },
      d7: { color: 'black', role: 'general' },
    },
    rules: COOLDOWN_DROP_MINI_XIANGQI_RULES,
  }),
  { from: 'a1', to: 'a2' },
);
const cooldownAfterReply = applyDropMiniXiangqiMove(cooldownCaptured, { from: 'd7', to: 'e7' });
console.log('\ncooldown comparator: captured horse is not available on the capturer next turn');
console.log(`red hand=${JSON.stringify(cooldownAfterReply.hands.red)}`);
console.log(`red cooldown=${JSON.stringify(cooldownAfterReply.cooldownHands.red)}`);
console.log(
  `red legal drops now=${
    getLegalDropMiniXiangqiMoves(cooldownAfterReply).filter((move) =>
      isDropMiniXiangqiDropMove(move),
    ).length
  }`,
);
