/**
 * Kriegspiel (ICC wild-16 spec) — standard chess played blind.
 *
 * Canonical state IS standard chess: the same GameState shape (board, castling,
 * en passant, half-move clock), real check, real checkmate. Kriegspiel is a
 * VIEW + umpire layer over that truth, not a new move kernel — so the legality,
 * apply, and checkmate detection all reuse `draft960Variant`'s chessops engine
 * verbatim (only the canonical state, never the fog, drives those). What this
 * file adds:
 *
 *  - Own-pieces-only player view (stricter than fog: you see NO enemy square,
 *    not even the ones you attack).
 *  - The player's *offered* moves are pseudo-legal — every geometric move of
 *    your own pieces as if the unseen squares were passable, INCLUDING pawn
 *    diagonal captures onto empty-looking squares. The umpire resolves each try
 *    against the truth; an illegal try bounces (the try-loop) and the player
 *    retries with no information beyond "no".
 *  - The umpire announcements (public to both players): a capture's square and
 *    whether a Pawn or a Piece was taken; the check category (File / Rank /
 *    Long-diagonal / Short-diagonal / Knight, multiple on a double check); and,
 *    private to the player on the move, their pawn-try count.
 *
 * Long vs short diagonal: canon is silent on the exact split, so we use the
 * deterministic "longer of the king's two diagonals" rule — a diagonal check is
 * Long if the checker sits on the longer of the two diagonals through the king,
 * Short otherwise (ties resolve to Long).
 */

import { attacks } from 'chessops/attacks';
import { SquareSet } from 'chessops/squareSet';
import type { Square as ChessopsSquare } from 'chessops/types';
import { makeSquare, parseSquare } from 'chessops/util';
import type { Board, Color, GameStatus, Move, PieceRole, Square } from './types.js';
import { draft960Variant, isLegalStandardChessMove, positionFromState } from './variants.js';

// Kriegspiel never has a pregame status (the room seats both sides, then play
// begins), matching the tenant's TenantGameStateLike contract.
export type KriegspielGameStatus = Exclude<GameStatus, { type: 'pregame' }>;

// Canonical Kriegspiel state is standard chess under its own variant tag so the
// tenant/replay path identifies it without colliding with draft960 games.
export type KriegspielGameState = Omit<import('./types.js').GameState, 'variant' | 'status'> & {
  variant: 'kriegspiel';
  status: KriegspielGameStatus;
};

export type KriegspielCheckType = 'file' | 'rank' | 'long-diagonal' | 'short-diagonal' | 'knight';

/** The umpire's public call for a single move. Absent fields = silent. */
export interface KriegspielAnnouncement {
  capture?: { square: Square; kind: 'pawn' | 'piece' };
  check?: KriegspielCheckType[];
}

export interface KriegspielPlayerView {
  id: string;
  perspective: Color;
  /** Own pieces only — Kriegspiel reveals nothing of the enemy. */
  board: Board;
  visibleSquares: Square[];
  /** Pseudo-legal offered moves (some will bounce against the truth). */
  legalMoves: Move[];
  /** Capturing-pawn moves available this turn (0 when it isn't your move). */
  pawnTries: number;
  status: KriegspielGameStatus;
  moveNumber: number;
  lastMove?: Move;
}

const promotionRoles: readonly PieceRole[] = ['queen', 'rook', 'bishop', 'knight'];

function opposite(color: Color): Color {
  return color === 'white' ? 'black' : 'white';
}

// Treat the Kriegspiel state as the standard-chess GameState it structurally is,
// so the shared chessops engine (legality, apply, position queries) can read it.
function asChess(state: KriegspielGameState) {
  return { ...state, variant: 'draft960' as const };
}

export function createInitialKriegspielState(gameId: string): KriegspielGameState {
  const base = draft960Variant.createInitialState(gameId);
  return { ...base, variant: 'kriegspiel', status: { type: 'playing', turn: 'white' } };
}

/** Truth-legal? (respects check). The umpire's resolution of a player's try. */
export function isLegalKriegspielMove(state: KriegspielGameState, move: Move): boolean {
  return isLegalStandardChessMove(asChess(state), move);
}

export function applyKriegspielMove(state: KriegspielGameState, move: Move): KriegspielGameState {
  if (state.status.type !== 'playing') return state;
  const next = draft960Variant.applyMove(asChess(state), move);
  // draft960's apply never yields pregame; narrow to the Kriegspiel status.
  const status = next.status as KriegspielGameStatus;
  return { ...next, variant: 'kriegspiel', status };
}

// ── Offered (pseudo-legal) moves ───────────────────────────────────────────
// Every geometric move of the player's own pieces, treating unseen squares as
// passable. Own pieces block (the player sees them); enemies are unknown, so a
// slider runs to the board edge and a pawn is always offered both diagonal
// captures. The umpire bounces whatever the truth forbids.

function ownOccupied(
  state: KriegspielGameState,
  color: Color,
): {
  occupied: SquareSet;
  pieces: { square: ChessopsSquare; role: PieceRole }[];
} {
  let occupied = SquareSet.empty();
  const pieces: { square: ChessopsSquare; role: PieceRole }[] = [];
  for (const [square, piece] of Object.entries(state.board)) {
    if (!piece || piece.color !== color) continue;
    const cs = parseSquare(square);
    if (cs === undefined) continue;
    occupied = occupied.with(cs);
    pieces.push({ square: cs, role: piece.role });
  }
  return { occupied, pieces };
}

function toMove(from: ChessopsSquare, to: ChessopsSquare, promotion?: PieceRole): Move {
  return {
    from: makeSquare(from) as Square,
    to: makeSquare(to) as Square,
    promotion: promotion === 'king' || promotion === 'pawn' ? undefined : promotion,
  };
}

function pushPawnMove(moves: Move[], color: Color, from: ChessopsSquare, to: ChessopsSquare): void {
  const lastRank = color === 'white' ? 7 : 0;
  if (to >> 3 === lastRank) {
    for (const promotion of promotionRoles) moves.push(toMove(from, to, promotion));
  } else {
    moves.push(toMove(from, to));
  }
}

function addPawnOffers(moves: Move[], color: Color, from: ChessopsSquare, own: SquareSet): void {
  const dir = color === 'white' ? 8 : -8;
  const startRank = color === 'white' ? 1 : 6;
  const fromRank = from >> 3;
  const fromFile = from & 7;
  const one = from + dir;
  // Forward pushes: offered onto a non-own square (an unseen enemy there makes
  // it illegal — that bounces).
  if (one >= 0 && one < 64 && !own.has(one)) {
    pushPawnMove(moves, color, from, one);
    const two = from + 2 * dir;
    if (fromRank === startRank && two >= 0 && two < 64 && !own.has(two)) {
      pushPawnMove(moves, color, from, two);
    }
  }
  // Diagonal captures: always offered (a probe bounces when no enemy is there).
  for (const df of [-1, 1]) {
    const file = fromFile + df;
    if (file < 0 || file > 7) continue;
    const to = one + df;
    if (to < 0 || to >= 64) continue;
    if (own.has(to)) continue;
    pushPawnMove(moves, color, from, to);
  }
}

function castlingOffers(
  state: KriegspielGameState,
  color: Color,
  kingSquare: ChessopsSquare,
  own: SquareSet,
): Move[] {
  // Offer a castle whenever the king is home with the matching rook right and
  // the squares it crosses are not blocked by the player's OWN pieces. The
  // umpire still bounces castling through/into check or across an unseen enemy.
  const homeRank = color === 'white' ? 0 : 7;
  if (kingSquare !== homeRank * 8 + 4) return [];
  const offers: Move[] = [];
  const kingsideRook = (homeRank * 8 + 7) as ChessopsSquare;
  const queensideRook = (homeRank * 8) as ChessopsSquare;
  const has = (sq: number) =>
    state.castlingRights.includes(makeSquare(sq as ChessopsSquare) as Square);
  if (
    has(kingsideRook) &&
    !own.has((homeRank * 8 + 5) as ChessopsSquare) &&
    !own.has((homeRank * 8 + 6) as ChessopsSquare)
  ) {
    offers.push(toMove(kingSquare, (homeRank * 8 + 6) as ChessopsSquare));
  }
  if (
    has(queensideRook) &&
    !own.has((homeRank * 8 + 1) as ChessopsSquare) &&
    !own.has((homeRank * 8 + 2) as ChessopsSquare) &&
    !own.has((homeRank * 8 + 3) as ChessopsSquare)
  ) {
    offers.push(toMove(kingSquare, (homeRank * 8 + 2) as ChessopsSquare));
  }
  return offers;
}

export function getKriegspielOfferedMoves(state: KriegspielGameState, color: Color): Move[] {
  if (state.status.type !== 'playing' || state.status.turn !== color) return [];
  const { occupied, pieces } = ownOccupied(state, color);
  const moves: Move[] = [];
  for (const { square, role } of pieces) {
    if (role === 'pawn') {
      addPawnOffers(moves, color, square, occupied);
      continue;
    }
    const reach = attacks({ color, role }, square, occupied).diff(occupied);
    for (const to of reach) moves.push(toMove(square, to));
    if (role === 'king') moves.push(...castlingOffers(state, color, square, occupied));
  }
  return moves;
}

// ── Umpire computations ─────────────────────────────────────────────────────

/** Capture call from the move + the board BEFORE it (square + pawn/piece). */
export function kriegspielCaptureAnnouncement(
  before: KriegspielGameState,
  move: Move,
): KriegspielAnnouncement['capture'] {
  const target = before.board[move.to];
  if (target) return { square: move.to, kind: target.role === 'pawn' ? 'pawn' : 'piece' };
  // En passant: a pawn steps diagonally onto the empty e.p. square; the pawn it
  // removes sits one rank back, on the destination file. Announce that square.
  const mover = before.board[move.from];
  const fromFile = move.from.charCodeAt(0);
  const toFile = move.to.charCodeAt(0);
  if (mover?.role === 'pawn' && move.to === before.enPassantSquare && fromFile !== toFile) {
    const capturedSquare = (move.to[0] + move.from[1]) as Square;
    return { square: capturedSquare, kind: 'pawn' };
  }
  return undefined;
}

function classifyCheck(
  king: ChessopsSquare,
  checker: ChessopsSquare,
  role: PieceRole,
): KriegspielCheckType {
  if (role === 'knight') return 'knight';
  const kf = king & 7;
  const kr = king >> 3;
  const cf = checker & 7;
  const cr = checker >> 3;
  if (cf === kf) return 'file';
  if (cr === kr) return 'rank';
  // Diagonal: compare the two diagonals through the king. NE = a1-h8 sense
  // (file - rank constant), NW = h1-a8 sense (file + rank constant).
  const lenNE = 8 - Math.abs(kf - kr);
  const lenNW = 8 - Math.abs(kf + kr - 7);
  const onNE = cf - cr === kf - kr;
  const thisLen = onNE ? lenNE : lenNW;
  const otherLen = onNE ? lenNW : lenNE;
  return thisLen >= otherLen ? 'long-diagonal' : 'short-diagonal';
}

/**
 * Check categories against the king of the side to move in `after` (the player
 * who just received the move). Handles checkmate too — the mated king is still
 * in check, so we inspect the mated side.
 */
export function kriegspielCheckAnnouncement(after: KriegspielGameState): KriegspielCheckType[] {
  let turn: Color | undefined;
  if (after.status.type === 'playing') turn = after.status.turn;
  else if (after.status.type === 'finished' && after.status.reason === 'checkmate') {
    turn = after.status.winner ? opposite(after.status.winner) : undefined;
  }
  if (!turn) return [];
  const position = positionFromState(asChess(after), turn);
  const context = position.ctx();
  if (context.king === undefined || context.checkers.isEmpty()) return [];
  const seen = new Set<KriegspielCheckType>();
  const categories: KriegspielCheckType[] = [];
  for (const checker of context.checkers) {
    const piece = position.board.get(checker);
    if (!piece) continue;
    const category = classifyCheck(context.king, checker, piece.role);
    if (seen.has(category)) continue;
    seen.add(category);
    categories.push(category);
  }
  return categories;
}

/** How many capturing pawn moves the side to move has (each square = one try). */
export function kriegspielPawnTries(state: KriegspielGameState, color: Color): number {
  if (state.status.type !== 'playing' || state.status.turn !== color) return 0;
  const position = positionFromState(asChess(state));
  const context = position.ctx();
  let tries = 0;
  for (const [from, dests] of position.allDests(context)) {
    if (position.board.get(from)?.role !== 'pawn') continue;
    const fromFile = from & 7;
    for (const to of dests) if ((to & 7) !== fromFile) tries += 1;
  }
  return tries;
}

/** Combined public umpire call for a move (capture + check). */
export function kriegspielAnnouncementFor(
  before: KriegspielGameState,
  move: Move,
  after: KriegspielGameState,
): KriegspielAnnouncement {
  const announcement: KriegspielAnnouncement = {};
  const capture = kriegspielCaptureAnnouncement(before, move);
  if (capture) announcement.capture = capture;
  const check = kriegspielCheckAnnouncement(after);
  if (check.length > 0) announcement.check = check;
  return announcement;
}

// ── Spatial check rendering ──────────────────────────────────────────────────
// Turn the umpire's literal check call into the squares a checking piece could
// occupy, derived ONLY from the call + the player's own (visible) pieces. This
// adds no information the player couldn't compute themselves — it just draws the
// umpire's sentence in board-space. Own pieces block a slider's line, so the
// walk stops at the first own piece (the checker can't be there or beyond it).

const KNIGHT_DELTAS: readonly [number, number][] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

function fileRankOf(square: Square): { f: number; r: number } {
  return { f: square.charCodeAt(0) - 97, r: Number(square.slice(1)) - 1 };
}

function squareOf(f: number, r: number): Square | null {
  if (f < 0 || f > 7 || r < 0 || r > 7) return null;
  return `${String.fromCharCode(97 + f)}${r + 1}` as Square;
}

export function kriegspielCheckCandidateSquares(
  kingSquare: Square,
  categories: readonly KriegspielCheckType[],
  ownSquares: Iterable<Square>,
): Square[] {
  const own = new Set<Square>(ownSquares);
  const { f: kf, r: kr } = fileRankOf(kingSquare);
  const out = new Set<Square>();

  const walk = (df: number, dr: number): void => {
    let f = kf + df;
    let r = kr + dr;
    for (;;) {
      const square = squareOf(f, r);
      if (!square || own.has(square)) break; // edge, or own piece blocks the line
      out.add(square);
      f += df;
      r += dr;
    }
  };

  for (const category of categories) {
    if (category === 'knight') {
      for (const [df, dr] of KNIGHT_DELTAS) {
        const square = squareOf(kf + df, kr + dr);
        if (square && !own.has(square)) out.add(square);
      }
    } else if (category === 'file') {
      walk(0, 1);
      walk(0, -1);
    } else if (category === 'rank') {
      walk(1, 0);
      walk(-1, 0);
    } else {
      // long-/short-diagonal: walk the matching one of the king's two diagonals.
      const lenNE = 8 - Math.abs(kf - kr);
      const lenNW = 8 - Math.abs(kf + kr - 7);
      const neIsLong = lenNE >= lenNW;
      const useNE = category === 'long-diagonal' ? neIsLong : !neIsLong;
      if (useNE) {
        walk(1, 1);
        walk(-1, -1);
      } else {
        walk(1, -1);
        walk(-1, 1);
      }
    }
  }
  return [...out];
}

// ── Player view ──────────────────────────────────────────────────────────────

export function getKriegspielPlayerView(
  state: KriegspielGameState,
  color: Color,
): KriegspielPlayerView {
  const board: Board = {};
  for (const [square, piece] of Object.entries(state.board)) {
    if (piece && piece.color === color) board[square as Square] = piece;
  }
  return {
    id: state.id,
    perspective: color,
    board,
    visibleSquares: Object.keys(board) as Square[],
    legalMoves: getKriegspielOfferedMoves(state, color),
    pawnTries: kriegspielPawnTries(state, color),
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}
