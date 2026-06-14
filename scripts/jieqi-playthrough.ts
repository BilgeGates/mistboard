// Dev tool: play a random legal jieqi game and print the board each ply, so the
// rules kernel can be eyeballed by hand (origin-role moves, reveal-on-move,
// captures) and the capturer-only redaction can be seen at the end.
//
//   tsx scripts/jieqi-playthrough.ts [seed]
//   npm run jieqi:play -- [seed]

import {
  applyJieqiMove,
  createInitialJieqiState,
  getJieqiLegalMoves,
  getJieqiPlayerView,
  type JieqiBoard,
  type JieqiCapturedView,
  type JieqiDeal,
  type JieqiPiece,
  type JieqiPieceRole,
  type JieqiSquare,
  STANDARD_JIEQI_DEAL,
} from '@mistboard/game';

const ROLE_LETTER: Record<JieqiPieceRole, string> = {
  general: 'K',
  advisor: 'A',
  elephant: 'E',
  horse: 'H',
  chariot: 'R',
  cannon: 'C',
  soldier: 'P',
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] as const;

function glyph(piece: JieqiPiece | undefined): string {
  if (!piece) return ' .';
  if (piece.faceDown) return piece.color === 'red' ? ' X' : ' x'; // X/x echoes the Pikafish dark FEN
  const letter = ROLE_LETTER[piece.role];
  return ` ${piece.color === 'red' ? letter : letter.toLowerCase()}`;
}

function render(board: JieqiBoard): string {
  const lines: string[] = [];
  for (let rank = 10; rank >= 1; rank -= 1) {
    const cells = FILES.map((f) => glyph(board[`${f}${rank}` as JieqiSquare])).join('');
    lines.push(`${String(rank).padStart(2)} ${cells}`);
    if (rank === 6) lines.push('   ~~~~~~~~ river ~~~~~~~~');
  }
  lines.push(`    ${FILES.map((f) => ` ${f}`).join('')}`);
  return lines.join('\n');
}

function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function formatCaptured(captured: JieqiCapturedView[]): string {
  if (captured.length === 0) return '(none)';
  return captured.map((c) => `${c.owner[0]}:${c.role ? ROLE_LETTER[c.role] : '?'}`).join(' ');
}

const seed = Number(process.argv[2] ?? 1);
const rng = makeRng(seed);
const deal: JieqiDeal = {
  red: shuffled(STANDARD_JIEQI_DEAL.red, rng),
  black: shuffled(STANDARD_JIEQI_DEAL.black, rng),
};

let state = createInitialJieqiState(`play-${seed}`, deal);
console.log(`Jieqi random playthrough — seed ${seed}`);
console.log('(X/x = dark red/black; UPPER = red, lower = black; K A E H R C P)\n');
console.log(render(state.board));

let ply = 0;
while (state.status.type === 'playing' && ply < 400) {
  const turn = state.status.turn;
  const legal = getJieqiLegalMoves(state);
  const move = legal[Math.floor(rng() * legal.length)];
  const mover = state.board[move.from]!;
  const target = state.board[move.to];
  const next = applyJieqiMove(state, move, { noCaptureClockLimit: 30 });
  ply += 1;

  const reveal = mover.faceDown ? ` reveals ${ROLE_LETTER[mover.role]}` : '';
  const capture = target ? ` captures ${target.faceDown ? '?' : ROLE_LETTER[target.role]}` : '';
  console.log(`\n#${ply} ${turn} ${move.from}-${move.to}${reveal}${capture}`);
  console.log(render(next.board));
  state = next;
}

const status = state.status;
const outcome =
  status.type === 'finished'
    ? `${status.reason}${status.winner ? ` — ${status.winner} wins` : ' — draw'}`
    : status.type;
console.log(`\nResult: ${outcome} (after ${ply} plies)`);

// Capturer-only redaction is visible here: the two pools differ on dark losses.
console.log(`\nRed sees captured:   ${formatCaptured(getJieqiPlayerView(state, 'red').captured)}`);
console.log(`Black sees captured: ${formatCaptured(getJieqiPlayerView(state, 'black').captured)}`);
