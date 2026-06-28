// Replay a Drop Mini Xiangqi engine decision from a fail-closed record.
//
// When the engine fails closed (server-drop-mini-xiangqi-engine.ts), it logs a
// `drop_mini_xiangqi_engine_failed_closed` record whose `history` + tier fields
// fully determine the FSF call. This script re-runs that exact call against the
// game kernel so the rejection is reproducible offline — the antidote to
// "engine played weak live and we can't reproduce it".
//
// Usage:
//   tsx scripts/variant-lab/replay-drop-mini-xiangqi-decision.ts --record '<json log line>'
//   tsx scripts/variant-lab/replay-drop-mini-xiangqi-decision.ts \
//       --history "b1b3 c6c5 ..." [--engine fairy-stockfish-drop-mini-xiangqi-very-strong] [--repeat 5]
//
// --repeat re-runs the FSF call N times to surface nondeterminism (a move that
// is rejected only sometimes is an FSF-vs-kernel flake; always-rejected is a
// hard rules mismatch to fix in drop-mini-xiangqi.ini / the kernel).

import {
  DROP_MINI_XIANGQI_DEFAULT_ENGINE_ID,
  dropMiniXiangqiEngineMove,
  dropMiniXiangqiEngineTierFor,
} from '../../apps/server/src/drop-mini-xiangqi-fsf-engine.ts';
import {
  applyDropMiniXiangqiMove,
  createInitialDropMiniXiangqiState,
  DEFAULT_DROP_MINI_XIANGQI_RULES,
  type DropMiniXiangqiGameState,
  type DropMiniXiangqiMove,
  getLegalDropMiniXiangqiMoves,
  isDropMiniXiangqiDropMove,
  isDropMiniXiangqiGeneralInCheck,
  type MiniXiangqiSquare,
} from '../../packages/game/src/variants-drop-mini-xiangqi.ts';

// Mirror of server-drop-mini-xiangqi-engine.ts (kept tiny + dependency-free).
const DROP_ROLE_TO_FSF_LETTER: Record<string, string> = {
  cannon: 'C',
  horse: 'N',
  chariot: 'R',
  soldier: 'P',
};
const FSF_LETTER_TO_DROP_ROLE: Record<string, string> = {
  C: 'cannon',
  N: 'horse',
  R: 'chariot',
  P: 'soldier',
};
function moveToUci(m: DropMiniXiangqiMove): string {
  return isDropMiniXiangqiDropMove(m)
    ? `${DROP_ROLE_TO_FSF_LETTER[m.drop]}@${m.to}`
    : `${m.from}${m.to}`;
}
function legalMoveForUci(
  legal: readonly DropMiniXiangqiMove[],
  uci: string,
): DropMiniXiangqiMove | null {
  const d = uci.match(/^([CNRP])@([a-g][1-7])$/);
  if (d) {
    const role = FSF_LETTER_TO_DROP_ROLE[d[1]!];
    return (
      legal.find(
        (m) =>
          isDropMiniXiangqiDropMove(m) && (m as { drop: string }).drop === role && m.to === d[2],
      ) ?? null
    );
  }
  const b = uci.match(/^([a-g][1-7])([a-g][1-7])$/);
  if (b) {
    return (
      legal.find(
        (m) =>
          !isDropMiniXiangqiDropMove(m) && (m as { from: string }).from === b[1] && m.to === b[2],
      ) ?? null
    );
  }
  return null;
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1]! : null;
}

function boardAscii(state: DropMiniXiangqiGameState): string {
  const glyph: Record<string, string> = {
    general: 'K',
    chariot: 'R',
    cannon: 'C',
    horse: 'N',
    soldier: 'P',
  };
  const rows: string[] = [];
  for (let r = 7; r >= 1; r--) {
    let row = `${r} `;
    for (let f = 0; f < 7; f++) {
      const sq = `${'abcdefg'[f]}${r}` as MiniXiangqiSquare;
      const p = state.board[sq];
      row += p ? (p.color === 'red' ? glyph[p.role] : glyph[p.role]!.toLowerCase()) : '.';
      row += ' ';
    }
    rows.push(row);
  }
  rows.push('  a b c d e f g');
  return rows.join('\n');
}

function rebuildState(history: string[]): DropMiniXiangqiGameState {
  let state = createInitialDropMiniXiangqiState('replay', DEFAULT_DROP_MINI_XIANGQI_RULES);
  for (const [i, uci] of history.entries()) {
    const legal = getLegalDropMiniXiangqiMoves(state);
    const move = legalMoveForUci(legal, uci);
    if (!move)
      throw new Error(`history move ${i + 1} "${uci}" is not kernel-legal; record is inconsistent`);
    state = applyDropMiniXiangqiMove(state, move);
  }
  return state;
}

async function main(): Promise<void> {
  const recordArg = arg('record');
  let history: string[];
  let engineId = arg('engine') ?? DROP_MINI_XIANGQI_DEFAULT_ENGINE_ID;
  let skill: number | undefined;
  let nodes: number | undefined;
  let movetimeMs: number | undefined;

  if (recordArg) {
    const rec = JSON.parse(recordArg) as Record<string, unknown>;
    history = String(rec.history ?? '').trim() ? String(rec.history).trim().split(/\s+/) : [];
    if (typeof rec.engine_id === 'string') engineId = rec.engine_id;
    if (typeof rec.tier_skill === 'number') skill = rec.tier_skill;
    if (typeof rec.tier_nodes === 'number') nodes = rec.tier_nodes;
    if (typeof rec.tier_movetime_ms === 'number') movetimeMs = rec.tier_movetime_ms;
    console.log(
      `Loaded record: engine=${engineId} ply=${rec.ply} reject=${rec.reject_reason} last=${rec.last_output}`,
    );
  } else {
    const h = arg('history');
    history = h?.trim() ? h.trim().split(/\s+/) : [];
  }

  const tier = dropMiniXiangqiEngineTierFor(engineId);
  if (tier) {
    skill ??= tier.skill;
    nodes ??= tier.nodes;
    movetimeMs ??= tier.movetimeMs;
  }
  skill ??= 20;
  nodes ??= 800_000;
  movetimeMs ??= 2_000;

  const state = rebuildState(history);
  if (state.status.type !== 'playing') {
    console.log(`Position is terminal (${state.status.type}); engine would not be on the move.`);
    return;
  }
  const legal = getLegalDropMiniXiangqiMoves(state);
  console.log(
    `\nReplaying: engine=${engineId} skill=${skill} nodes=${nodes} movetime=${movetimeMs}ms`,
  );
  console.log(
    `to move: ${state.status.turn}  inCheck=${isDropMiniXiangqiGeneralInCheck(state, state.status.turn)}`,
  );
  console.log(`history (${history.length}): ${history.join(' ') || '(startpos)'}`);
  console.log(`kernel legal (${legal.length}): ${legal.map(moveToUci).join(' ')}`);
  console.log(`board:\n${boardAscii(state)}\n`);

  const repeat = Number.parseInt(arg('repeat') ?? '1', 10);
  let rejected = 0;
  for (let i = 1; i <= repeat; i++) {
    const uci = await dropMiniXiangqiEngineMove(history, { skill, nodes, movetimeMs });
    const match = uci ? legalMoveForUci(legal, uci) : null;
    const verdict = match ? 'ACCEPTED' : uci ? 'REJECTED (illegal-move)' : 'REJECTED (no-move)';
    if (!match) rejected += 1;
    console.log(`run ${i}/${repeat}: FSF=${uci ?? '(none)'}  -> ${verdict}`);
  }
  console.log(`\n${rejected}/${repeat} runs rejected by the kernel.`);
  if (rejected === repeat && repeat > 0) {
    console.log(
      '=> HARD mismatch: FSF deterministically produces a move the kernel rejects. Fix the rule (ini/kernel).',
    );
  } else if (rejected > 0) {
    console.log(
      '=> FLAKY: rejected only sometimes -> FSF nondeterminism; the retry path should usually recover it.',
    );
  } else {
    console.log(
      '=> No rejection reproduced here; capture more runs or check arch/version drift vs prod.',
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
