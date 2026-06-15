// Pikafish-jieqi FEN encoder — the redaction boundary for the jieqi UCI engine
// (the Pikafish `jieqi` / `jieqi_old` branch, our "PikaJieQi" binary). This is the
// jieqi analogue of engine-protocol/build*.ts: it takes canonical game state and
// produces exactly what the engine is allowed to observe.
//
// Pikafish-jieqi FEN grammar (reverse-engineered from official-pikafish/Pikafish
// src/position.cpp on the jieqi branches):
//
//   <board> <stm> <restPieces> <rule40> <fullmove>
//
// - board: 10 ranks top-to-bottom = Pikafish RANK_9..RANK_0 = platform rank 10..1
//   (platform rank 1 is red's back rank). Files a..i left-to-right within a rank;
//   empty runs collapse to a digit. A revealed piece is its role char (UPPER=red,
//   lower=black). A face-down ("dark") piece is 'X' (red) / 'x' (black) with NO
//   identity. Generals are never dark, so they are always 'K' / 'k'.
// - stm: 'w' (red to move) | 'b' (black to move). Pikafish WHITE == red.
// - restPieces: for WHITE then BLACK, each non-king type in Pikafish order
//   (ROOK, ADVISOR, CANNON, PAWN, KNIGHT, BISHOP), as "<char><count>" where count
//   is that side's pieces still face-down. This is the flip-distribution pool.
//
// Redaction argument (why building from canonical truth is leak-free):
//   The board only ever emits X/x for a dark piece, never its role, so no hidden
//   identity reaches the engine. restPieces is the multiset of remaining hidden
//   types — which for the OPPONENT is fully public information (start - revealed -
//   captured), so it leaks no opponent secret; we compute it from canonical truth
//   purely to keep the FEN internally consistent (its counts must sum to the
//   on-board dark-square count, which a public-only derivation cannot guarantee
//   once an own dark piece is captured). The only over-disclosure is that the
//   engine's OWN pool reflects the true types of its own captured-while-dark
//   pieces — self-information, never an opponent secret, strategically negligible,
//   and not expressible as a single FEN multiset otherwise. Documented as a known
//   minor rule-fidelity gap (the strict capturer-only-reveal rule).

import {
  coordOf,
  squareOf,
  type JieqiBoard,
  type JieqiGameState,
  type JieqiMove,
  type JieqiPiece,
  type JieqiPieceRole,
  type JieqiSquare,
} from '@mistboard/game';

const RED_ROLE_CHAR: Record<JieqiPieceRole, string> = {
  chariot: 'R',
  advisor: 'A',
  cannon: 'C',
  soldier: 'P',
  horse: 'N',
  elephant: 'B',
  general: 'K',
};

// Pikafish restPieces order: the non-king types as ROOK, ADVISOR, CANNON, PAWN,
// KNIGHT, BISHOP — i.e. chariot, advisor, cannon, soldier, horse, elephant.
const POOL_ROLES: readonly JieqiPieceRole[] = [
  'chariot',
  'advisor',
  'cannon',
  'soldier',
  'horse',
  'elephant',
];

function pieceChar(piece: JieqiPiece): string {
  if (piece.faceDown) return piece.color === 'red' ? 'X' : 'x';
  const ch = RED_ROLE_CHAR[piece.role];
  return piece.color === 'red' ? ch : ch.toLowerCase();
}

function boardField(board: JieqiBoard): string {
  const rows: string[] = [];
  for (let rank = 10; rank >= 1; rank -= 1) {
    let row = '';
    let empty = 0;
    for (let file = 0; file <= 8; file += 1) {
      const piece = board[squareOf(file, rank)];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        row += String(empty);
        empty = 0;
      }
      row += pieceChar(piece);
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }
  return rows.join('/');
}

function restPiecesField(board: JieqiBoard): string {
  const counts = new Map<string, number>();
  for (const piece of Object.values(board)) {
    if (!piece?.faceDown) continue;
    const key = `${piece.color}:${piece.role}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let out = '';
  for (const color of ['red', 'black'] as const) {
    for (const role of POOL_ROLES) {
      const ch = color === 'red' ? RED_ROLE_CHAR[role] : RED_ROLE_CHAR[role].toLowerCase();
      out += `${ch}${counts.get(`${color}:${role}`) ?? 0}`;
    }
  }
  return out;
}

/** Encode canonical jieqi state as a redacted Pikafish-jieqi FEN for the engine. */
export function jieqiStateToPikafishFen(state: JieqiGameState): string {
  const turn = state.status.type === 'playing' ? state.status.turn : 'red';
  return [
    boardField(state.board),
    turn === 'red' ? 'w' : 'b',
    restPiecesField(state.board),
    state.noCaptureClock,
    state.moveNumber,
  ].join(' ');
}

/** Platform square (rank 1..10) -> Pikafish square (rank 0..9). */
export function jieqiSquareToPikafish(square: JieqiSquare): string {
  const { file, rank } = coordOf(square);
  return `${String.fromCharCode(97 + file)}${rank - 1}`;
}

/** Platform move -> Pikafish UCI string (e.g. {from:'a1',to:'a2'} -> "a0a1"). */
export function jieqiMoveToPikafishUci(move: JieqiMove): string {
  return `${jieqiSquareToPikafish(move.from)}${jieqiSquareToPikafish(move.to)}`;
}

const PIKAFISH_UCI = /^([a-i])([0-9])([a-i])([0-9])$/;

/** Pikafish bestmove (rank 0..9) -> platform move (rank 1..10). Null if unparseable. */
export function pikafishUciToJieqiMove(uci: string): JieqiMove | null {
  const m = PIKAFISH_UCI.exec(uci.trim());
  if (!m) return null;
  const toSquare = (f: string, r: string): JieqiSquare =>
    squareOf(f.charCodeAt(0) - 97, Number(r) + 1);
  return { from: toSquare(m[1], m[2]), to: toSquare(m[3], m[4]) };
}
