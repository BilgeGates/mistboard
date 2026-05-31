// Random-vs-random Dark Mini Xiangqi self-play, run directly against the rules
// kernel (no server / WebSocket), to characterise the game under uniform random
// play: outcomes, termination reasons, and game length.
//
//   npx tsx apps/server/src/scripts/mini-xiangqi-sim.ts [games] [maxPlies]
//   SIM_SEED=42 npx tsx apps/server/src/scripts/mini-xiangqi-sim.ts 5000
import {
  applyMiniXiangqiMove,
  createInitialMiniXiangqiState,
  getMiniXiangqiLegalMoves,
} from '@mistboard/game';

const GAMES = Number(process.argv[2] ?? 2000);
const MAX_PLIES = Number(process.argv[3] ?? 2000);
const SEED = Number(process.env.SIM_SEED ?? 1234567);

// mulberry32 — small seeded PRNG so a run is reproducible.
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(SEED);

const reasonCounts: Record<string, number> = {};
const reasonPlies: Record<string, number[]> = {};
let redWins = 0;
let blackWins = 0;
let draws = 0;
let capHit = 0;
let anomalyNoMoves = 0;
const plyCounts: number[] = [];

for (let g = 0; g < GAMES; g += 1) {
  let state = createInitialMiniXiangqiState(`sim-${g}`);
  let plies = 0;
  while (state.status.type === 'playing' && plies < MAX_PLIES) {
    const moves = getMiniXiangqiLegalMoves(state);
    if (moves.length === 0) {
      // Kernel should have ended the game on the prior move (immobilisation);
      // reaching here with no moves while "playing" would be a rules bug.
      anomalyNoMoves += 1;
      break;
    }
    const move = moves[Math.floor(rng() * moves.length)]!;
    state = applyMiniXiangqiMove(state, move);
    plies += 1;
  }
  plyCounts.push(plies);
  if (state.status.type === 'finished') {
    const reason = state.status.reason;
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    let plies_ = reasonPlies[reason];
    if (!plies_) {
      plies_ = [];
      reasonPlies[reason] = plies_;
    }
    plies_.push(plies);
    if (state.status.winner === 'red') redWins += 1;
    else if (state.status.winner === 'black') blackWins += 1;
    else draws += 1;
  } else {
    capHit += 1;
  }
}

function pct(n: number): string {
  return `${((100 * n) / GAMES).toFixed(1)}%`;
}
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx]!;
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

const sortedPlies = [...plyCounts].sort((a, b) => a - b);
const decisive = redWins + blackWins;

console.log(`Dark Mini Xiangqi — ${GAMES} random self-play games (seed ${SEED})\n`);
console.log('Outcomes');
console.log(`  red wins    ${redWins} (${pct(redWins)})`);
console.log(`  black wins  ${blackWins} (${pct(blackWins)})`);
console.log(`  draws       ${draws} (${pct(draws)})`);
console.log(`  unfinished  ${capHit} (${pct(capHit)}) [hit ${MAX_PLIES}-ply cap]`);
if (anomalyNoMoves > 0) console.log(`  ANOMALY: no-moves-while-playing ${anomalyNoMoves}`);
if (decisive > 0) {
  console.log(
    `  first-move edge: red took ${((100 * redWins) / decisive).toFixed(1)}% of ${decisive} decisive games`,
  );
}

console.log('\nTermination reasons');
for (const [reason, count] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])) {
  console.log(
    `  ${reason.padEnd(16)} ${count} (${pct(count)})  avg ${mean(reasonPlies[reason] ?? []).toFixed(1)} plies`,
  );
}

console.log('\nGame length (plies)');
console.log(
  `  min ${sortedPlies[0]}  p10 ${quantile(sortedPlies, 0.1)}  median ${quantile(
    sortedPlies,
    0.5,
  )}  mean ${mean(plyCounts).toFixed(1)}  p90 ${quantile(sortedPlies, 0.9)}  max ${
    sortedPlies[sortedPlies.length - 1]
  }`,
);
