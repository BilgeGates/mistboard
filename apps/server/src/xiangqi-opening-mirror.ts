// Left-right mirror canonicalization for the opening explorer.
//
// The xiangqi opening position is symmetric about the central file: general on
// e, palace spanning d-f, and every other piece paired across the board. So a
// line and its mirror are the same opening — 炮二平五 and 炮八平五 are one idea
// played from either side. Without canonicalization the explorer splits every
// such opening into two rows and halves its apparent popularity; our own corpus
// showed the central cannon as h3e3 (3,282) and b3e3 (1,536) rather than one
// line with 4,818.
//
// Chess has no such symmetry (king and queen break it), which is why the
// mainstream explorers do not do this and why it is easy to miss.
//
// The scheme: store every position under whichever of (key, mirror(key)) sorts
// first, with its moves mirrored to match. A lookup canonicalizes the query the
// same way and un-mirrors the answer, so callers never see the internal form.

import type { XiangqiMove } from '@mistboard/game';

const FILES = 'abcdefghi';
const RANK_CELLS = 9;

export type CanonicalPosition = {
  /** The stored key: the lexicographically smaller of the position and its mirror. */
  key: string;
  /** True when the caller's position had to be mirrored to reach the key, so the
   *  moves that come back must be mirrored again before they mean anything to it. */
  mirrored: boolean;
};

/** Mirror a square across the central file: a↔i, b↔h, c↔g, d↔f, e↔e. */
export function mirrorSquare(square: string): string {
  const file = square[0];
  const rank = square.slice(1);
  const index = FILES.indexOf(file ?? '');
  if (index < 0) return square;
  return `${FILES[FILES.length - 1 - index]}${rank}`;
}

export function mirrorMove(move: XiangqiMove): XiangqiMove {
  return { from: mirrorSquare(move.from), to: mirrorSquare(move.to) } as XiangqiMove;
}

/**
 * Mirror a position key ("<placement> <side>"). The placement is FEN-style with
 * digits for empty runs, so each rank is expanded to nine cells, reversed, and
 * re-compressed; reversing the raw string would corrupt multi-digit runs and
 * silently produce a different position.
 */
export function mirrorPositionKey(key: string): string {
  const [placement, side] = splitKey(key);
  if (placement === null) return key;
  const ranks = placement.split('/').map((rank) => compressRank(expandRank(rank).reverse()));
  return side === null ? ranks.join('/') : `${ranks.join('/')} ${side}`;
}

/** The stored form of a position, plus whether reaching it required mirroring. */
export function canonicalPosition(key: string): CanonicalPosition {
  const mirror = mirrorPositionKey(key);
  // A position that mirrors onto itself (the opening position, and every
  // symmetric position after it) yields mirrored=false, so nothing is flipped
  // needlessly.
  if (mirror < key) return { key: mirror, mirrored: true };
  return { key, mirrored: false };
}

function splitKey(key: string): [string | null, string | null] {
  const trimmed = key.trim();
  if (trimmed.length === 0) return [null, null];
  const space = trimmed.indexOf(' ');
  if (space < 0) return [trimmed, null];
  return [trimmed.slice(0, space), trimmed.slice(space + 1)];
}

function expandRank(rank: string): string[] {
  const cells: string[] = [];
  let digits = '';
  const flushDigits = (): void => {
    if (digits.length === 0) return;
    for (let i = 0; i < Number(digits); i += 1) cells.push('');
    digits = '';
  };
  for (const char of rank) {
    if (char >= '0' && char <= '9') {
      digits += char;
      continue;
    }
    flushDigits();
    cells.push(char);
  }
  flushDigits();
  // A malformed rank would otherwise mirror into a different-width board.
  while (cells.length < RANK_CELLS) cells.push('');
  return cells.slice(0, RANK_CELLS);
}

function compressRank(cells: string[]): string {
  let out = '';
  let empty = 0;
  for (const cell of cells) {
    if (cell === '') {
      empty += 1;
      continue;
    }
    if (empty > 0) {
      out += String(empty);
      empty = 0;
    }
    out += cell;
  }
  if (empty > 0) out += String(empty);
  return out;
}

/**
 * Canonical form of a (position, move) PAIR, which is the unit the explorer
 * actually stores.
 *
 * Doing the pair together is what folds the two spellings of one opening. For an
 * asymmetric position the smaller key wins and the move follows it. For a
 * position that mirrors onto itself — the opening position, most notably — the
 * two keys tie, so the tie breaks on the move, and 炮二平五 (h3e3) and 炮八平五
 * (b3e3) collapse onto a single row instead of splitting one opening in half.
 */
export function canonicalPositionMove(
  key: string,
  move: XiangqiMove,
): { key: string; move: XiangqiMove; mirrored: boolean } {
  const mirrorKey = mirrorPositionKey(key);
  const mirrored = mirrorMove(move);
  const here = moveKey(move);
  const there = moveKey(mirrored);
  if (mirrorKey < key || (mirrorKey === key && there < here)) {
    return { key: mirrorKey, move: mirrored, mirrored: true };
  }
  return { key, move, mirrored: false };
}

function moveKey(move: XiangqiMove): string {
  return `${move.from}${move.to}`;
}
