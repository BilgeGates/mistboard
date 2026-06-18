// Dark Crazyhouse pure rules — a thin layer over the dark-chess fog kernel.
//
// Crazyhouse is chess with drops: a captured piece switches sides into the
// captor's HAND and can later be dropped back onto an empty square as a move.
// This module reuses `darkChessVariant` for ALL board play (fog move-gen,
// field-of-fire vision, castling, en passant, king-capture win, repetition /
// 50-move draws) and adds only the crazyhouse layer: hands, drops, and
// promoted-pawn tracking (a captured promoted pawn reverts to a pawn in hand).
//
// Like Dark Shogi, hands are PRIVATE under fog (a view carries only its own
// reserve). Drops are CONFIRMED-EMPTY only: you may drop a piece onto a square
// only if you can currently see it is empty (in your field of fire) — a fogged
// square might hide an enemy piece, and you cannot confirm it is empty.

import type { Color, GameState, Move, PieceRole, PlayerView, Square } from './types.js';
import { capturedRoleFor, darkChessVariant } from './variants.js';

export type CrazyhouseDropRole = Exclude<PieceRole, 'king'>;
export type CrazyhouseHand = Partial<Record<CrazyhouseDropRole, number>>;
export type CrazyhouseHands = Record<Color, CrazyhouseHand>;

// A drop places a hand piece onto an empty square. Board moves reuse the chess
// `Move` shape unchanged.
export type CrazyhouseDropMove = { drop: CrazyhouseDropRole; to: Square };
export type CrazyhouseMove = Move | CrazyhouseDropMove;

export function isCrazyhouseDrop(move: CrazyhouseMove): move is CrazyhouseDropMove {
  return 'drop' in move;
}

export type CrazyhouseGameState = Omit<GameState, 'variant' | 'lastMove'> & {
  variant: 'dark-crazyhouse';
  lastMove?: CrazyhouseMove;
  hands: CrazyhouseHands;
  // Squares currently holding a promoted pawn, threaded through every board move
  // so a capture returns a PAWN to hand (not the promoted role).
  promoted: Square[];
};

export type CrazyhousePlayerView = Omit<PlayerView, 'legalMoves' | 'lastMove'> & {
  legalMoves: CrazyhouseMove[];
  lastMove?: CrazyhouseMove; // own last action (board or drop); tenant redacts to own-only
  hand: CrazyhouseHand; // the viewer's OWN reserve only (private under fog)
};

const DROP_ROLES: readonly CrazyhouseDropRole[] = ['queen', 'rook', 'bishop', 'knight', 'pawn'];

export function isCrazyhouseDropRole(value: unknown): value is CrazyhouseDropRole {
  return typeof value === 'string' && (DROP_ROLES as readonly string[]).includes(value);
}

function opposite(color: Color): Color {
  return color === 'white' ? 'black' : 'white';
}

function rankOf(square: Square): number {
  return Number(square[1]);
}

// A pure dark-chess GameState for delegating to darkChessVariant. The crazyhouse
// extras (hands/promoted) ride along harmlessly; lastMove is sanitized to a chess
// move (a drop has no chess from/to) so the dark-chess view never trips on it.
function chessOf(state: CrazyhouseGameState): GameState {
  const lastMove = state.lastMove && !isCrazyhouseDrop(state.lastMove) ? state.lastMove : undefined;
  return { ...state, variant: 'dark-chess', lastMove } as unknown as GameState;
}

export function createInitialCrazyhouseState(gameId: string): CrazyhouseGameState {
  const base = darkChessVariant.createInitialState(gameId);
  return {
    ...base,
    variant: 'dark-crazyhouse',
    lastMove: undefined,
    hands: { white: {}, black: {} },
    promoted: [],
  };
}

// Confirmed-empty drop targets: squares the dropper can SEE are empty (field of
// fire). Fogged squares are excluded — emptiness there cannot be confirmed.
function confirmedEmptyDropSquares(state: CrazyhouseGameState, color: Color): Square[] {
  const view = darkChessVariant.getPlayerView(chessOf(state), color);
  return view.visibleSquares.filter((square) => !state.board[square]);
}

export function getLegalCrazyhouseDrops(
  state: CrazyhouseGameState,
  color: Color,
  emptyTargets: Square[] = confirmedEmptyDropSquares(state, color),
): CrazyhouseDropMove[] {
  const hand = state.hands[color];
  const roles = DROP_ROLES.filter((role) => (hand[role] ?? 0) > 0);
  if (roles.length === 0) return [];
  const drops: CrazyhouseDropMove[] = [];
  for (const role of roles) {
    for (const to of emptyTargets) {
      // A pawn may not be dropped onto the first or last rank.
      if (role === 'pawn' && (rankOf(to) === 1 || rankOf(to) === 8)) continue;
      drops.push({ drop: role, to });
    }
  }
  return drops;
}

export function getLegalCrazyhouseMoves(state: CrazyhouseGameState): CrazyhouseMove[] {
  if (state.status.type !== 'playing') return [];
  const color = state.status.turn;
  const board: CrazyhouseMove[] = darkChessVariant.getLegalMoves(chessOf(state), color);
  return [...board, ...getLegalCrazyhouseDrops(state, color)];
}

export function isLegalCrazyhouseMove(state: CrazyhouseGameState, move: CrazyhouseMove): boolean {
  if (state.status.type !== 'playing') return false;
  const color = state.status.turn;
  if (isCrazyhouseDrop(move)) {
    if ((state.hands[color][move.drop] ?? 0) <= 0) return false;
    if (state.board[move.to]) return false;
    if (move.drop === 'pawn' && (rankOf(move.to) === 1 || rankOf(move.to) === 8)) return false;
    return confirmedEmptyDropSquares(state, color).includes(move.to);
  }
  return darkChessVariant
    .getLegalMoves(chessOf(state), color)
    .some(
      (candidate) =>
        candidate.from === move.from &&
        candidate.to === move.to &&
        (candidate.promotion ?? null) === (move.promotion ?? null),
    );
}

function addToHand(
  hands: CrazyhouseHands,
  color: Color,
  role: CrazyhouseDropRole,
): CrazyhouseHands {
  return {
    ...hands,
    [color]: { ...hands[color], [role]: (hands[color][role] ?? 0) + 1 },
  };
}

function removeFromHand(
  hands: CrazyhouseHands,
  color: Color,
  role: CrazyhouseDropRole,
): CrazyhouseHands {
  const remaining = (hands[color][role] ?? 0) - 1;
  const hand: CrazyhouseHand = { ...hands[color] };
  if (remaining > 0) hand[role] = remaining;
  else delete hand[role];
  return { ...hands, [color]: hand };
}

// Track which squares hold a promoted pawn after a board move.
function nextPromoted(promoted: Square[], move: Move): Square[] {
  const set = new Set(promoted);
  const moverWasPromoted = set.has(move.from);
  set.delete(move.from); // source vacated
  set.delete(move.to); // any promoted pawn captured at the destination is gone
  if (moverWasPromoted) set.add(move.to); // a promoted pawn relocated
  if (move.promotion) set.add(move.to); // a pawn just promoted here
  return [...set];
}

export function applyCrazyhouseMove(
  state: CrazyhouseGameState,
  move: CrazyhouseMove,
): CrazyhouseGameState {
  if (state.status.type !== 'playing') return state;
  if (!isLegalCrazyhouseMove(state, move)) return state;
  const color = state.status.turn;

  if (isCrazyhouseDrop(move)) {
    return {
      ...state,
      board: { ...state.board, [move.to]: { color, role: move.drop } },
      hands: removeFromHand(state.hands, color, move.drop),
      enPassantSquare: undefined, // a drop is not a double pawn push
      halfmoveClock: 0, // a drop adds material to the board: progress, resets the clock
      status: { type: 'playing', turn: opposite(color) },
      moveNumber: color === 'black' ? state.moveNumber + 1 : state.moveNumber,
      lastMove: move,
    };
  }

  // Board move: route any capture into the captor's hand (a captured promoted
  // pawn reverts to a pawn), then delegate board mechanics to dark chess.
  const capturedRole = capturedRoleFor(chessOf(state), move);
  const next = darkChessVariant.applyMove(chessOf(state), move);
  const hands =
    capturedRole && capturedRole !== 'king'
      ? addToHand(
          state.hands,
          color,
          state.promoted.includes(move.to) ? 'pawn' : (capturedRole as CrazyhouseDropRole),
        )
      : state.hands;
  return {
    ...state,
    ...next,
    variant: 'dark-crazyhouse',
    lastMove: move,
    hands,
    promoted: nextPromoted(state.promoted, move),
  };
}

export function crazyhouseVisibleSquares(state: CrazyhouseGameState, color: Color): Square[] {
  return darkChessVariant.getPlayerView(chessOf(state), color).visibleSquares;
}

export function getCrazyhousePlayerView(
  state: CrazyhouseGameState,
  color: Color,
): CrazyhousePlayerView {
  const base = darkChessVariant.getPlayerView(chessOf(state), color);
  const drops =
    state.status.type === 'playing' && state.status.turn === color
      ? getLegalCrazyhouseDrops(
          state,
          color,
          base.visibleSquares.filter((square) => !state.board[square]),
        )
      : [];
  return {
    ...base,
    legalMoves: [...base.legalMoves, ...drops],
    hand: { ...state.hands[color] }, // each side sees only its own reserve
    lastMove: state.lastMove, // the crazyhouse last action (board or drop); tenant redacts to own-only
  };
}
