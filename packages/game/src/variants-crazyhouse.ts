// Dark Crazyhouse pure rules — a thin layer over the dark-chess fog kernel.
//
// Crazyhouse is chess with drops: a captured piece switches sides into the
// captor's HAND and can later be dropped back onto an empty square as a move.
// This module reuses `darkChessVariant` for ALL board play (fog move-gen,
// field-of-fire vision, castling, en passant, king-capture win, repetition /
// 50-move draws) and adds only the crazyhouse layer: hands, drops, and
// promoted-pawn tracking (a captured promoted pawn reverts to a pawn in hand).
//
// Hands are PRIVATE under fog (a view carries only its own reserve). The drop
// rule is a parameter (`dropPolicy`), so this one kernel serves both philosophies
// the catalog names:
//   * 'any-legal-square' (PARACHUTE, the default + standard crazyhouse): you may
//     attempt a drop onto any square that looks empty from your side, INCLUDING
//     into the fog. The OFFERABLE list is computed from your view (so it never
//     leaks which fogged squares hold a piece); a drop only RESOLVES if the
//     square is truly empty, and a drop onto a hidden piece is illegal (the
//     server bounces it — a probe). This is the Sun Tzu drop rule.
//   * 'seen-squares-only' (VISION-BOUND): you may only drop onto squares you can
//     currently see are empty. No fog drops, no bounce. This is the Lao Tzu rule.

import type { Board, Color, GameState, Move, PieceRole, PlayerView, Square } from './types.js';
import { capturedRoleFor, darkChessVariant } from './variants.js';

export type CrazyhouseDropRole = Exclude<PieceRole, 'king'>;
export type CrazyhouseHand = Partial<Record<CrazyhouseDropRole, number>>;
export type CrazyhouseHands = Record<Color, CrazyhouseHand>;

// 'any-legal-square' = parachute (drop into the fog, bounce on a hidden piece).
// 'seen-squares-only' = vision-bound (drop only onto squares you can see).
export type CrazyhouseDropPolicy = 'any-legal-square' | 'seen-squares-only';

// A drop places a hand piece onto an empty square. Board moves reuse the chess
// `Move` shape unchanged.
export type CrazyhouseDropMove = { drop: CrazyhouseDropRole; to: Square };
export type CrazyhouseMove = Move | CrazyhouseDropMove;

export function isCrazyhouseDrop(move: CrazyhouseMove): move is CrazyhouseDropMove {
  return 'drop' in move;
}

export type CrazyhouseGameState = Omit<GameState, 'variant' | 'lastMove'> & {
  variant: 'dark-crazyhouse';
  dropPolicy: CrazyhouseDropPolicy;
  lastMove?: CrazyhouseMove;
  hands: CrazyhouseHands;
  // Squares currently holding a promoted pawn, threaded through every board move
  // so a capture returns a PAWN to hand (not the promoted role).
  promoted: Square[];
};

export type CrazyhousePlayerView = Omit<PlayerView, 'legalMoves' | 'lastMove'> & {
  // Board moves + OFFERABLE drops (under parachute these include fogged squares
  // that may bounce). Computed from the view, never from the true board.
  legalMoves: CrazyhouseMove[];
  lastMove?: CrazyhouseMove; // own last action (board or drop); tenant redacts to own-only
  hand: CrazyhouseHand; // the viewer's OWN reserve only (private under fog)
};

const DROP_ROLES: readonly CrazyhouseDropRole[] = ['queen', 'rook', 'bishop', 'knight', 'pawn'];

const ALL_SQUARES: readonly Square[] = (() => {
  const squares: Square[] = [];
  for (const file of 'abcdefgh') {
    for (let rank = 1; rank <= 8; rank += 1) squares.push(`${file}${rank}` as Square);
  }
  return squares;
})();

export function isCrazyhouseDropRole(value: unknown): value is CrazyhouseDropRole {
  return typeof value === 'string' && (DROP_ROLES as readonly string[]).includes(value);
}

function opposite(color: Color): Color {
  return color === 'white' ? 'black' : 'white';
}

function rankOf(square: Square): number {
  return Number(square[1]);
}

function isPawnDropBackRank(square: Square): boolean {
  return rankOf(square) === 1 || rankOf(square) === 8;
}

// A pure dark-chess GameState for delegating to darkChessVariant. The crazyhouse
// extras (hands/promoted/dropPolicy) ride along harmlessly; lastMove is sanitized
// to a chess move (a drop has no chess from/to) so the dark-chess view never trips.
function chessOf(state: CrazyhouseGameState): GameState {
  const lastMove = state.lastMove && !isCrazyhouseDrop(state.lastMove) ? state.lastMove : undefined;
  return { ...state, variant: 'dark-chess', lastMove } as unknown as GameState;
}

export function createInitialCrazyhouseState(
  gameId: string,
  dropPolicy: CrazyhouseDropPolicy = 'any-legal-square',
): CrazyhouseGameState {
  const base = darkChessVariant.createInitialState(gameId);
  return {
    ...base,
    variant: 'dark-crazyhouse',
    dropPolicy,
    lastMove: undefined,
    hands: { white: {}, black: {} },
    promoted: [],
  };
}

export function crazyhouseVisibleSquares(state: CrazyhouseGameState, color: Color): Square[] {
  return darkChessVariant.getPlayerView(chessOf(state), color).visibleSquares;
}

function dropsFromSquares(hand: CrazyhouseHand, squares: readonly Square[]): CrazyhouseDropMove[] {
  const roles = DROP_ROLES.filter((role) => (hand[role] ?? 0) > 0);
  if (roles.length === 0) return [];
  const drops: CrazyhouseDropMove[] = [];
  for (const role of roles) {
    for (const to of squares) {
      if (role === 'pawn' && isPawnDropBackRank(to)) continue;
      drops.push({ drop: role, to });
    }
  }
  return drops;
}

// Squares the dropper may ATTEMPT a drop on, derived from their VIEW (so the
// list never leaks which fogged squares are occupied). Parachute: every square
// where the viewer sees no piece (visible-empty + all fog). Vision-bound: only
// squares the viewer can see are empty.
function offerableDropSquares(view: PlayerView, policy: CrazyhouseDropPolicy): Square[] {
  if (policy === 'seen-squares-only') {
    return view.visibleSquares.filter((square) => !view.board[square]);
  }
  return ALL_SQUARES.filter((square) => !view.board[square]);
}

// TRUTH-legal drop targets — squares a drop actually RESOLVES onto. Parachute:
// any truly-empty square. Vision-bound: truly-empty squares the dropper can see.
function resolvableDropSquares(state: CrazyhouseGameState, color: Color): Square[] {
  const empty = ALL_SQUARES.filter((square) => !state.board[square]);
  if (state.dropPolicy === 'seen-squares-only') {
    const visible = new Set(crazyhouseVisibleSquares(state, color));
    return empty.filter((square) => visible.has(square));
  }
  return empty;
}

// The drop moves a player may OFFER (client/move-list), from the view.
export function getCrazyhouseDropOffers(
  state: CrazyhouseGameState,
  color: Color,
  view = darkChessVariant.getPlayerView(chessOf(state), color),
): CrazyhouseDropMove[] {
  return dropsFromSquares(state.hands[color], offerableDropSquares(view, state.dropPolicy));
}

// The drop moves that actually resolve (truth-legal) — enumeration for bots /
// server validation.
export function getLegalCrazyhouseDrops(
  state: CrazyhouseGameState,
  color: Color,
): CrazyhouseDropMove[] {
  return dropsFromSquares(state.hands[color], resolvableDropSquares(state, color));
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
    if (move.drop === 'pawn' && isPawnDropBackRank(move.to)) return false;
    if (state.board[move.to]) return false; // truly occupied: illegal (parachute bounces here)
    if (state.dropPolicy === 'seen-squares-only') {
      return crazyhouseVisibleSquares(state, color).includes(move.to);
    }
    return true;
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
    const board: Board = { ...state.board, [move.to]: { color, role: move.drop } };
    return {
      ...state,
      board,
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

export function getCrazyhousePlayerView(
  state: CrazyhouseGameState,
  color: Color,
): CrazyhousePlayerView {
  const base = darkChessVariant.getPlayerView(chessOf(state), color);
  const drops =
    state.status.type === 'playing' && state.status.turn === color
      ? getCrazyhouseDropOffers(state, color, base)
      : [];
  return {
    ...base,
    legalMoves: [...base.legalMoves, ...drops],
    hand: { ...state.hands[color] }, // each side sees only its own reserve
    lastMove: state.lastMove, // the crazyhouse last action (board or drop); tenant redacts to own-only
  };
}
