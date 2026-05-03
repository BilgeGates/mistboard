import type { Board, Color, PieceRole, Square } from './types.js';

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const darkSquareIndexes = [0, 2, 4, 6];
const lightSquareIndexes = [1, 3, 5, 7];

export type BackRankRole = 'rook' | 'knight' | 'bishop' | 'queen' | 'king';

export type Chess960Start = {
  id: number;
  backRank: BackRankRole[];
  fenPlacement: string;
};

export function generateChess960Starts(): Chess960Start[] {
  const starts: Chess960Start[] = [];

  for (const firstBishop of darkSquareIndexes) {
    for (const secondBishop of lightSquareIndexes) {
      const rank = Array<BackRankRole | null>(8).fill(null);
      rank[firstBishop] = 'bishop';
      rank[secondBishop] = 'bishop';

      for (const queen of emptyIndexes(rank)) {
        const withQueen = rank.slice();
        withQueen[queen] = 'queen';

        const knightSquares = combinations(emptyIndexes(withQueen), 2);
        for (const [firstKnight, secondKnight] of knightSquares) {
          const full = withQueen.slice();
          full[firstKnight] = 'knight';
          full[secondKnight] = 'knight';
          const remaining = emptyIndexes(full);
          full[remaining[0]] = 'rook';
          full[remaining[1]] = 'king';
          full[remaining[2]] = 'rook';

          starts.push({
            id: starts.length,
            backRank: full as BackRankRole[],
            fenPlacement: toFenPlacement(full as BackRankRole[]),
          });
        }
      }
    }
  }

  return starts;
}

export function pickDraft960Offer(seed = Date.now()): Chess960Start[] {
  const starts = generateChess960Starts();
  const chosen: Chess960Start[] = [];
  let value = Math.abs(seed);

  while (chosen.length < 3) {
    value = (value * 1664525 + 1013904223) >>> 0;
    const candidate = starts[value % starts.length];
    if (!chosen.some((start) => start.id === candidate.id)) {
      chosen.push(candidate);
    }
  }

  return chosen;
}

function emptyIndexes(rank: Array<BackRankRole | null>): number[] {
  return rank.flatMap((role, index) => role === null ? [index] : []);
}

function combinations(values: number[], size: number): number[][] {
  if (size === 0) return [[]];
  if (values.length < size) return [];
  const [head, ...tail] = values;
  return [
    ...combinations(tail, size - 1).map((combo) => [head, ...combo]),
    ...combinations(tail, size),
  ];
}

function toFenPlacement(rank: BackRankRole[]): string {
  const letters: Record<BackRankRole, string> = {
    bishop: 'b',
    king: 'k',
    knight: 'n',
    queen: 'q',
    rook: 'r',
  };
  return rank.map((role) => letters[role]).join('');
}

export function describeBackRank(start: Chess960Start): string {
  return start.backRank.map((role, index) => `${files[index]}:${role}`).join(' ');
}

export function createChess960InitialBoard(start: Chess960Start): Board {
  const board: Board = {};

  for (const color of ['white', 'black'] satisfies Color[]) {
    const backRank = color === 'white' ? 1 : 8;
    const pawnRank = color === 'white' ? 2 : 7;

    for (const [index, file] of files.entries()) {
      board[`${file}${backRank}` as Square] = {
        color,
        role: start.backRank[index] as PieceRole,
      };
      board[`${file}${pawnRank}` as Square] = {
        color,
        role: 'pawn',
      };
    }
  }

  return board;
}
