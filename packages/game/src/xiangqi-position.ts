import {
  coordOf,
  inPalace,
  positionRepetitionKey,
  squareOf,
  type XiangqiBoard,
  type XiangqiColor,
  type XiangqiGameState,
  type XiangqiPieceRole,
  type XiangqiSquare,
} from './variants-xiangqi.js';
import { getStandardXiangqiLegalMoves } from './variants-xiangqi-standard.js';

const ROLE_TO_FEN: Record<XiangqiPieceRole, string> = {
  general: 'k',
  advisor: 'a',
  elephant: 'b',
  horse: 'n',
  chariot: 'r',
  cannon: 'c',
  soldier: 'p',
};

function fenPiece(role: XiangqiPieceRole, color: XiangqiColor): string {
  const code = ROLE_TO_FEN[role];
  return color === 'red' ? code.toUpperCase() : code;
}

function turnForKey(state: XiangqiGameState): XiangqiColor | '-' {
  return state.status.type === 'playing' ? state.status.turn : '-';
}

function turnFen(color: XiangqiColor | '-'): 'r' | 'b' | '-' {
  if (color === '-') return '-';
  return color === 'red' ? 'r' : 'b';
}

function squareAt(file: number, rank: number): XiangqiSquare {
  const fileChar = String.fromCharCode(97 + file);
  return `${fileChar}${rank}` as XiangqiSquare;
}

export function standardXiangqiPlacementKey(state: XiangqiGameState): string {
  const rows: string[] = [];
  for (let rank = 10; rank >= 1; rank -= 1) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 9; file += 1) {
      const piece = state.board[squareAt(file, rank)];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        row += String(empty);
        empty = 0;
      }
      row += fenPiece(piece.role, piece.color);
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }
  return rows.join('/');
}

export function standardXiangqiPositionKey(state: XiangqiGameState): string {
  return `${standardXiangqiPlacementKey(state)} ${turnFen(turnForKey(state))}`;
}

export function standardXiangqiFen(state: XiangqiGameState): string {
  return `${standardXiangqiPositionKey(state)} - - ${state.progressClock} ${state.moveNumber}`;
}

// FEN a Fairy-Stockfish / Pikafish xiangqi engine will accept as `position fen`.
// This is DISTINCT from standardXiangqiFen (a dedup/repetition position KEY):
// the engine's xiangqi dialect writes the side-to-move as 'w' (red) / 'b'
// (black), where the position key uses 'r'/'b'. Placement (ranks 10..1, files
// a..i, uppercase = red) already matches the engine, so only the turn token and
// its always-present clock fields differ. A finished position has no side to
// move; default to 'w' since callers only analyse playable positions.
export function standardXiangqiEngineFen(state: XiangqiGameState): string {
  const turn = turnForKey(state);
  const turnToken = turn === 'black' ? 'b' : 'w';
  return `${standardXiangqiPlacementKey(state)} ${turnToken} - - ${state.progressClock} ${state.moveNumber}`;
}

export function standardXiangqiMoveUci(move: { from: XiangqiSquare; to: XiangqiSquare }): string {
  return `${move.from}${move.to}`;
}

export function compareXiangqiSquares(a: XiangqiSquare, b: XiangqiSquare): number {
  const ca = coordOf(a);
  const cb = coordOf(b);
  return ca.rank === cb.rank ? ca.file - cb.file : ca.rank - cb.rank;
}

// ── FEN parsing ────────────────────────────────────────────────────────────
// Reads placement + side-to-move (+ optional clock fields) back into a
// XiangqiGameState. Compositions (排局) are hand-set positions, so this is the
// authoring entry point for the classical library. Errors are specific on
// purpose: a rejected FEN usually means a misread diagram, and the message has
// to say which piece is wrong.

export type ParseXiangqiFenResult =
  | { ok: true; state: XiangqiGameState }
  | { ok: false; error: string };

const FEN_TO_ROLE: Record<string, XiangqiPieceRole> = Object.fromEntries(
  Object.entries(ROLE_TO_FEN).map(([role, code]) => [code, role as XiangqiPieceRole]),
);

const MAX_PER_SIDE: Record<XiangqiPieceRole, number> = {
  general: 1,
  advisor: 2,
  elephant: 2,
  horse: 2,
  chariot: 2,
  cannon: 2,
  soldier: 5,
};

const ROLE_LABEL: Record<XiangqiPieceRole, string> = {
  general: 'general',
  advisor: 'advisor',
  elephant: 'elephant',
  horse: 'horse',
  chariot: 'chariot',
  cannon: 'cannon',
  soldier: 'soldier',
};

// Elephants and advisors reach a small fixed set of points; a piece off that
// set can never occur in a real position, so it is a misread, not a variant.
function onElephantPoint(color: XiangqiColor, file: number, rank: number): boolean {
  const r = color === 'red' ? rank : 11 - rank;
  return (
    (r === 1 && (file === 2 || file === 6)) ||
    (r === 3 && (file === 0 || file === 4 || file === 8)) ||
    (r === 5 && (file === 2 || file === 6))
  );
}

function onAdvisorPoint(color: XiangqiColor, file: number, rank: number): boolean {
  const r = color === 'red' ? rank : 11 - rank;
  return (
    (r === 1 && (file === 3 || file === 5)) ||
    (r === 2 && file === 4) ||
    (r === 3 && (file === 3 || file === 5))
  );
}

export function parseStandardXiangqiFen(fen: string, gameId = 'fen-import'): ParseXiangqiFenResult {
  const fields = fen.trim().split(/\s+/);
  const placement = fields[0];
  if (!placement) return { ok: false, error: 'Empty FEN.' };

  const rows = placement.split('/');
  if (rows.length !== 10) {
    return { ok: false, error: `Expected 10 ranks in the placement, got ${rows.length}.` };
  }

  const board: XiangqiBoard = {};
  for (let i = 0; i < 10; i += 1) {
    const rank = 10 - i;
    let file = 0;
    for (const ch of rows[i]!) {
      if (ch >= '1' && ch <= '9') {
        file += Number(ch);
        continue;
      }
      const role = FEN_TO_ROLE[ch.toLowerCase()];
      if (!role) return { ok: false, error: `Unknown piece "${ch}" on rank ${rank}.` };
      if (file > 8) return { ok: false, error: `Rank ${rank} runs past 9 files.` };
      const color: XiangqiColor = /[A-Z]/.test(ch) ? 'red' : 'black';
      board[squareOf(file, rank)] = { color, role };
      file += 1;
    }
    if (file !== 9) {
      return { ok: false, error: `Rank ${rank} covers ${file} files, expected 9.` };
    }
  }

  const counts: Record<XiangqiColor, Partial<Record<XiangqiPieceRole, number>>> = {
    red: {},
    black: {},
  };
  const generals: Partial<Record<XiangqiColor, XiangqiSquare>> = {};
  for (const [square, piece] of Object.entries(board)) {
    if (!piece) continue;
    const sq = square as XiangqiSquare;
    const { file, rank } = coordOf(sq);
    counts[piece.color][piece.role] = (counts[piece.color][piece.role] ?? 0) + 1;
    if (piece.role === 'general') {
      if (!inPalace(piece.color, file, rank)) {
        return { ok: false, error: `The ${piece.color} general on ${sq} is outside the palace.` };
      }
      generals[piece.color] = sq;
    } else if (piece.role === 'advisor' && !onAdvisorPoint(piece.color, file, rank)) {
      return {
        ok: false,
        error: `The ${piece.color} advisor on ${sq} is off the palace diagonals.`,
      };
    } else if (piece.role === 'elephant' && !onElephantPoint(piece.color, file, rank)) {
      return {
        ok: false,
        error: `The ${piece.color} elephant on ${sq} is not on a legal elephant point.`,
      };
    } else if (piece.role === 'soldier') {
      const behind = piece.color === 'red' ? rank < 4 : rank > 7;
      if (behind) {
        return {
          ok: false,
          error: `The ${piece.color} soldier on ${sq} is behind its starting rank.`,
        };
      }
    }
  }
  for (const color of ['red', 'black'] as const) {
    if (!generals[color]) return { ok: false, error: `Missing the ${color} general.` };
    for (const [role, count] of Object.entries(counts[color])) {
      const max = MAX_PER_SIDE[role as XiangqiPieceRole];
      if (count !== undefined && count > max) {
        return {
          ok: false,
          error: `Too many ${color} ${ROLE_LABEL[role as XiangqiPieceRole]}s: ${count} (max ${max}).`,
        };
      }
    }
  }

  const turnToken = fields[1] ?? 'r';
  let turn: XiangqiColor;
  if (turnToken === 'r' || turnToken === 'w') turn = 'red';
  else if (turnToken === 'b') turn = 'black';
  else return { ok: false, error: `Unknown side-to-move "${turnToken}" (expected r/w or b).` };

  const progressField = fields[4];
  const moveField = fields[5];
  const progressClock = progressField && /^\d+$/.test(progressField) ? Number(progressField) : 0;
  const moveNumber = moveField && /^\d+$/.test(moveField) ? Number(moveField) : 1;

  const base: XiangqiGameState = {
    id: gameId,
    board,
    status: { type: 'playing', turn },
    moveNumber,
    progressClock,
    positionCounts: {},
  };
  // The side that is NOT to move must not have a capturable general: if the
  // mover can take the general (including the flying-general facing rule), the
  // previous "move" could never have been played, so the diagram is wrong. The
  // elephantops kernel rejects such setups (facing kings, opposite check) by
  // throwing, so probing the legal-move generator doubles as that validation.
  const enemyGeneral = generals[turn === 'red' ? 'black' : 'red']!;
  try {
    if (getStandardXiangqiLegalMoves(base).some((move) => move.to === enemyGeneral)) {
      return {
        ok: false,
        error: `Illegal position: ${turn} to move can capture the general on ${enemyGeneral}.`,
      };
    }
  } catch {
    return {
      ok: false,
      error: `Illegal position: ${turn} to move can capture the general on ${enemyGeneral}.`,
    };
  }
  return { ok: true, state: { ...base, positionCounts: { [positionRepetitionKey(base)]: 1 } } };
}
