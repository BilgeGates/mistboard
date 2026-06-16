// Design probe for the invented Reveal Chess ruleset. The soak test proves the
// rules are COHERENT (games terminate, no illegal states, no identity leaks);
// this answers whether the design is INTERESTING/BALANCED by self-playing many
// games with a greedy-capture policy (more game-like than random) and reporting:
//   - outcome mix + first-move balance (is White over-favored?)
//   - game-length distribution
//   - how often the NOVEL mechanics actually fire (promote-on-reveal, castling
//     with a face-down corner, checks, promotions)
// so kernel/design revisions are driven by data, not vibes.
//
//   npm run reveal-chess:play -- [games] [seed]
//   tsx scripts/reveal-chess-playthrough.ts [games] [seed]

import {
  applyRevealChessMove,
  createInitialRevealChessState,
  createRevealChessDeal,
  getRevealChessLegalMoves,
  getRevealChessPlayerView,
  oppositeRevealChessColor,
  type RevealChessColor,
  type RevealChessGameState,
  type RevealChessMove,
  type RevealChessPiece,
  type RevealChessPieceRole,
  type RevealChessSquare,
} from '@mistboard/game';

const VALUE: Record<RevealChessPieceRole, number> = {
  king: 0,
  queen: 9,
  rook: 5,
  bishop: 3,
  knight: 3,
  pawn: 1,
};
// Expected value of an unrevealed enemy piece (army ex-king avg ≈ 2.6). A greedy
// player can't see a face-down identity, so it values capturing one at the pool mean.
const FACE_DOWN_VALUE = 2.6;
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const NO_PROGRESS_LIMIT = 60;

function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rankOf(sq: RevealChessSquare): number {
  return Number(sq[1]);
}
function fileIdx(sq: RevealChessSquare): number {
  return FILES.indexOf(sq[0] as (typeof FILES)[number]);
}
function farRank(color: RevealChessColor): number {
  return color === 'white' ? 8 : 1;
}

// Greedy-capture policy on PUBLIC info only (face-down captures valued at the
// pool mean; promotions of a known revealed pawn rewarded). Small noise breaks ties.
function pickMove(state: RevealChessGameState, rng: () => number): RevealChessMove {
  const mover = state.status.type === 'playing' ? state.status.turn : 'white';
  const legal = getRevealChessLegalMoves(state);
  let best = legal[0];
  let bestScore = -Infinity;
  for (const m of legal) {
    const from = state.board[m.from] as RevealChessPiece;
    const target = state.board[m.to];
    let score = 0;
    if (target && target.color !== mover)
      score += target.faceDown ? FACE_DOWN_VALUE : VALUE[target.role];
    // Reward a KNOWN (revealed) pawn promoting; face-down promote-on-reveal is luck, not policy.
    if (!from.faceDown && from.role === 'pawn' && rankOf(m.to) === farRank(mover)) score += 8;
    score += rng() * 0.01;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

type GameMetrics = {
  plies: number;
  result: 'white' | 'black' | 'draw';
  reason: string;
  reveals: number;
  captures: number;
  promotions: number;
  promoteOnReveal: number;
  castles: number;
  checks: number;
};

function playGame(seed: number): GameMetrics {
  const rng = makeRng(seed);
  let state = createInitialRevealChessState(
    `probe-${seed}`,
    createRevealChessDeal(makeRng(seed * 2654435761)),
  );
  const m: GameMetrics = {
    plies: 0,
    result: 'draw',
    reason: 'cap',
    reveals: 0,
    captures: 0,
    promotions: 0,
    promoteOnReveal: 0,
    castles: 0,
    checks: 0,
  };
  while (state.status.type === 'playing' && m.plies < 600) {
    const turn = state.status.turn;
    const move = pickMove(state, rng);
    const from = state.board[move.from] as RevealChessPiece;
    const target = state.board[move.to];
    const isCastle = from.role === 'king' && Math.abs(fileIdx(move.to) - fileIdx(move.from)) >= 2;
    const trueRolePawnToFar = from.role === 'pawn' && rankOf(move.to) === farRank(turn);

    const next = applyRevealChessMove(state, move, { noProgressClockLimit: NO_PROGRESS_LIMIT });
    m.plies += 1;
    if (from.faceDown) m.reveals += 1;
    if (target && target.color !== turn) m.captures += 1;
    if (isCastle) m.castles += 1;
    if (trueRolePawnToFar) {
      m.promotions += 1;
      if (from.faceDown) m.promoteOnReveal += 1;
    }
    if (getRevealChessPlayerView(next, oppositeRevealChessColor(turn)).inCheck) m.checks += 1;
    state = next;
  }
  if (state.status.type === 'finished') {
    m.reason = state.status.reason;
    m.result = state.status.winner ?? 'draw';
  } else {
    m.reason = 'ply-cap';
  }
  return m;
}

function pct(n: number, total: number): string {
  return `${((100 * n) / total).toFixed(1)}%`;
}
function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

const games = Number(process.argv[2] ?? 200);
const baseSeed = Number(process.argv[3] ?? 1);

const results: GameMetrics[] = [];
for (let i = 0; i < games; i += 1) results.push(playGame(baseSeed + i));

const lengths = results.map((r) => r.plies).sort((a, b) => a - b);
const whiteWins = results.filter((r) => r.result === 'white').length;
const blackWins = results.filter((r) => r.result === 'black').length;
const draws = results.filter((r) => r.result === 'draw').length;
const reasons: Record<string, number> = {};
for (const r of results) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;

console.log(`Reveal Chess self-play — ${games} games, greedy-capture policy, seed ${baseSeed}`);
console.log(
  '(coherence is proven by the soak test; this probes whether the DESIGN is interesting/balanced)\n',
);

console.log('Outcomes:');
console.log(`  White wins: ${whiteWins} (${pct(whiteWins, games)})`);
console.log(`  Black wins: ${blackWins} (${pct(blackWins, games)})`);
console.log(`  Draws:      ${draws} (${pct(draws, games)})`);
console.log(
  `  Decisive:   ${pct(whiteWins + blackWins, games)}  (first-move edge = white-minus-black ${pct(whiteWins - blackWins, games)})`,
);

console.log('\nEnd reasons:');
for (const [reason, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${reason.padEnd(20)} ${n} (${pct(n, games)})`);
}

console.log('\nGame length (plies):');
console.log(
  `  min ${lengths[0]}  p25 ${lengths[Math.floor(games * 0.25)]}  median ${lengths[Math.floor(games * 0.5)]}  p75 ${lengths[Math.floor(games * 0.75)]}  max ${lengths[games - 1]}  mean ${avg(lengths).toFixed(1)}`,
);

console.log('\nNovel-mechanic frequency (per game average, and % of games with >=1):');
const withAtLeastOne = (key: keyof GameMetrics) =>
  results.filter((r) => (r[key] as number) > 0).length;
for (const key of [
  'reveals',
  'captures',
  'promotions',
  'promoteOnReveal',
  'castles',
  'checks',
] as const) {
  console.log(
    `  ${key.padEnd(16)} avg ${avg(results.map((r) => r[key] as number)).toFixed(2)}  in ${pct(withAtLeastOne(key), games)} of games`,
  );
}
