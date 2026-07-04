// Fairy-Stockfish ⟶ Fortress Xiangqi kernel bridge.
//
// The FSF variant `fortressxiangqi` (apps/server/src/fortress-xiangqi.ini) and
// chess-variant-puzzler emit positions as FSF FENs + UCI moves. The puzzle
// corpus is kernel-native (FortressXiangqiGameState + FortressXiangqiMove), so
// the tactics ingest (fortress-xiangqi-tactics-ingest.ts) needs to convert.
//
// This mirrors the kernel→FSF direction inline in fortress-xiangqi-fsf-play.ts
// (ROLE_TO_LETTER + moveToUci) and adds the reverse plus a serializer used only
// for a round-trip identity check (a wrong parse would place a piece on the
// wrong square yet still be "legal", which validateFortressXiangqiPuzzle alone
// would not catch).
//
// FEN letters (see the .ini): k=general, r=chariot, c=cannon, n=horse,
// a=advisor, e=elephant, q=treasure, p=soldier. Uppercase = red, lowercase =
// black. FSF ranks are listed top-first, so FEN rank 0 = board rank 8.

import {
  type FortressXiangqiBoard,
  type FortressXiangqiColor,
  type FortressXiangqiDropRole,
  type FortressXiangqiGameState,
  type FortressXiangqiHands,
  type FortressXiangqiMove,
  type FortressXiangqiPieceRole,
  type FortressXiangqiSquare,
  fortressXiangqiPositionRepetitionKey,
} from '@mistboard/game';

const FILES = 7;
const RANKS = 8;
const FILE_CHARS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;

const LETTER_TO_ROLE: Record<string, FortressXiangqiPieceRole> = {
  k: 'general',
  r: 'chariot',
  c: 'cannon',
  n: 'horse',
  a: 'advisor',
  e: 'elephant',
  q: 'treasure',
  p: 'soldier',
};

const ROLE_TO_LETTER: Record<FortressXiangqiPieceRole, string> = {
  general: 'K',
  chariot: 'R',
  cannon: 'C',
  horse: 'N',
  advisor: 'A',
  elephant: 'E',
  treasure: 'Q',
  soldier: 'P',
};

function squareOf(file: number, rank: number): FortressXiangqiSquare {
  return `${FILE_CHARS[file]}${rank}` as FortressXiangqiSquare;
}

function letterToPiece(letter: string): {
  color: FortressXiangqiColor;
  role: FortressXiangqiPieceRole;
} {
  const role = LETTER_TO_ROLE[letter.toLowerCase()];
  if (!role) throw new Error(`Unknown FSF piece letter: ${letter}`);
  return { color: letter === letter.toUpperCase() ? 'red' : 'black', role };
}

// Splits the FEN board field ("<8 ranks>[<pocket>]") into its rank strings and
// the raw pocket string (letters, empty for "[]" or an absent pocket).
function splitBoardAndPocket(boardField: string): { ranks: string[]; pocket: string } {
  const bracket = boardField.indexOf('[');
  const boardPart = bracket >= 0 ? boardField.slice(0, bracket) : boardField;
  const pocket = bracket >= 0 ? boardField.slice(bracket + 1).replace(']', '') : '';
  return { ranks: boardPart.split('/'), pocket };
}

function parseBoard(ranks: string[]): FortressXiangqiBoard {
  if (ranks.length !== RANKS) {
    throw new Error(`Expected ${RANKS} ranks, got ${ranks.length}`);
  }
  const board: FortressXiangqiBoard = {};
  ranks.forEach((rankStr, index) => {
    const rank = RANKS - index; // FEN lists rank 8 first
    let file = 0;
    for (const ch of rankStr) {
      if (ch >= '1' && ch <= '9') {
        file += Number(ch);
      } else {
        if (file >= FILES) throw new Error(`Rank ${rank} overflows ${FILES} files: ${rankStr}`);
        board[squareOf(file, rank)] = letterToPiece(ch);
        file += 1;
      }
    }
    if (file !== FILES)
      throw new Error(`Rank ${rank} has ${file} files, expected ${FILES}: ${rankStr}`);
  });
  return board;
}

function parseHands(pocket: string): FortressXiangqiHands {
  const hands: FortressXiangqiHands = { red: {}, black: {} };
  for (const ch of pocket) {
    const { color, role } = letterToPiece(ch);
    if (role === 'general') throw new Error('General cannot be in hand');
    const hand = hands[color];
    hand[role as FortressXiangqiDropRole] = (hand[role as FortressXiangqiDropRole] ?? 0) + 1;
  }
  return hands;
}

// Parses an FSF `fortressxiangqi` FEN into a fresh, playable kernel state.
export function parseFortressXiangqiFsfFen(fen: string, id: string): FortressXiangqiGameState {
  const fields = fen.trim().split(/\s+/);
  const boardField = fields[0];
  const stmField = fields[1];
  if (!boardField || !stmField) throw new Error(`Malformed FEN: ${fen}`);
  const { ranks, pocket } = splitBoardAndPocket(boardField);
  const board = parseBoard(ranks);
  const hands = parseHands(pocket);
  const turn: FortressXiangqiColor = stmField === 'w' ? 'red' : 'black';
  const moveNumber = Number.parseInt(fields[5] ?? '1', 10) || 1;

  const base: FortressXiangqiGameState = {
    id,
    board,
    hands,
    status: { type: 'playing', turn },
    moveNumber,
    lastMove: undefined,
    moveLog: [],
    positionCounts: {},
  };
  return { ...base, positionCounts: { [fortressXiangqiPositionRepetitionKey(base)]: 1 } };
}

// Converts an FSF UCI token ("b4g4" or a drop "R@c2") to a kernel move.
export function fortressXiangqiUciToMove(uci: string): FortressXiangqiMove {
  const at = uci.indexOf('@');
  if (at >= 0) {
    const role = LETTER_TO_ROLE[uci.slice(0, at).toLowerCase()];
    if (!role || role === 'general') throw new Error(`Bad drop UCI: ${uci}`);
    return {
      drop: role as FortressXiangqiDropRole,
      to: uci.slice(at + 1) as FortressXiangqiSquare,
    };
  }
  if (uci.length !== 4) throw new Error(`Bad move UCI: ${uci}`);
  return {
    from: uci.slice(0, 2) as FortressXiangqiSquare,
    to: uci.slice(2, 4) as FortressXiangqiSquare,
  };
}

// Serializes a kernel state's board + pocket + side-to-move back into FSF form,
// for the round-trip identity check. Only these fields are compared (not the
// move counters), so canonicalizeFsfPlacement() is the shared normal form.
export function fortressXiangqiStateToFsfFen(state: FortressXiangqiGameState): string {
  const rankStrings: string[] = [];
  for (let rank = RANKS; rank >= 1; rank -= 1) {
    let rankStr = '';
    let empty = 0;
    for (let file = 0; file < FILES; file += 1) {
      const piece = state.board[squareOf(file, rank)];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        rankStr += String(empty);
        empty = 0;
      }
      const letter = ROLE_TO_LETTER[piece.role];
      rankStr += piece.color === 'red' ? letter : letter.toLowerCase();
    }
    if (empty > 0) rankStr += String(empty);
    rankStrings.push(rankStr);
  }
  const pocket = handsToPocket(state.hands);
  const turn = state.status.type === 'playing' && state.status.turn === 'black' ? 'b' : 'w';
  return `${rankStrings.join('/')}[${pocket}] ${turn}`;
}

function handsToPocket(hands: FortressXiangqiHands): string {
  let pocket = '';
  for (const [role, count] of Object.entries(hands.red)) {
    pocket += ROLE_TO_LETTER[role as FortressXiangqiPieceRole].repeat(count ?? 0);
  }
  for (const [role, count] of Object.entries(hands.black)) {
    pocket += ROLE_TO_LETTER[role as FortressXiangqiPieceRole].toLowerCase().repeat(count ?? 0);
  }
  return pocket;
}

// Normal form for the round-trip check: board placement + sorted pocket + stm,
// ignoring pocket ordering and the trailing move counters.
export function canonicalizeFsfPlacement(fen: string): string {
  const fields = fen.trim().split(/\s+/);
  const { ranks, pocket } = splitBoardAndPocket(fields[0] ?? '');
  const sortedPocket = [...pocket].sort().join('');
  return `${ranks.join('/')} ${sortedPocket} ${fields[1] ?? 'w'}`;
}
