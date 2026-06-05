/**
 * DMX (Dark Mini Xiangqi) engine request builder — THE REDACTION BOUNDARY for
 * the 7×7 variant. Sibling of build.ts (chess): same invariants and shape, but
 *
 *   - mini geometry: square index = (rank-1)*7 + file (vs *8 for chess);
 *   - mini piece letters: general→G, horse→H, cannon→C, chariot→R, soldier→S;
 *   - the `shrouded` color-only channel (cannon screens / horse legs — occupant
 *     color known, type hidden) emitted from the player view;
 *   - gameSpecId='dark-mini-xiangqi' so the worker parses 7-wide geometry.
 *
 * Protocol Color is white/black; DMX is red/black with red = the first player =
 * the white slot. All emitted colors are mapped to the protocol's white/black.
 *
 * Like build.ts, this consumes the canonical MiniXiangqiGameState (full truth)
 * and emits ONLY what `engineColor`'s player can observe under FoW. The redaction
 * invariants are asserted in build-mini-xiangqi.test.ts.
 */

import {
  type Color,
  type EngineClock,
  type EngineObservation,
  type EngineTurnRequest,
  type Move,
  type SquareIndex,
  type MiniXiangqiColor,
  type MiniXiangqiGameState,
  type MiniXiangqiMove,
  type MiniXiangqiPieceRole,
  type MiniXiangqiSquare,
  type MiniXiangqiVisibleBoardEntry,
  applyMiniXiangqiMove,
  createInitialMiniXiangqiState,
  getMiniXiangqiPlayerView,
  miniXiangqiCoordOf,
} from '@mistboard/game';
import type { DarkMiniXiangqiEvent } from '../dark-mini-xiangqi-runtime.js';
import { buildSessionId, deriveEngineSeed } from './build.js';

const DARK_MINI_XIANGQI_SPEC_ID = 'dark-mini-xiangqi';

const ROLE_TO_LETTER: Record<MiniXiangqiPieceRole, 'G' | 'H' | 'C' | 'R' | 'S'> = {
  general: 'G',
  horse: 'H',
  cannon: 'C',
  chariot: 'R',
  soldier: 'S',
};

/** DMX red is the first player → the protocol's white slot. */
function toProtocolColor(c: MiniXiangqiColor): Color {
  return c === 'red' ? 'white' : 'black';
}

/** 7-wide square index: a1=0, b1=1, …, g1=6, a2=7, …, g7=48. */
function miniSquareIndex(sq: MiniXiangqiSquare): SquareIndex {
  const { file, rank } = miniXiangqiCoordOf(sq);
  return (rank - 1) * 7 + file;
}

function maskHex(mask: bigint): string {
  return `0x${mask.toString(16).padStart(16, '0')}`;
}

function ownSquaresOf(
  state: MiniXiangqiGameState,
  color: MiniXiangqiColor,
): MiniXiangqiSquare[] {
  return (
    Object.entries(state.board) as Array<[MiniXiangqiSquare, { color: MiniXiangqiColor }]>
  )
    .filter(([, piece]) => piece?.color === color)
    .map(([sq]) => sq);
}

/**
 * One ply's observation for `perspective`, computed from the transition
 * prevState → nextState driven by `move`. Mirror of chess buildObservationForPly.
 */
export function buildMiniXiangqiObservationForPly(args: {
  prevState: MiniXiangqiGameState | null;
  nextState: MiniXiangqiGameState;
  move: MiniXiangqiMove | null;
  perspective: MiniXiangqiColor;
  ply: number;
}): EngineObservation {
  const { prevState, nextState, move, perspective, ply } = args;
  const mover = prevState?.status.type === 'playing' ? prevState.status.turn : null;
  const kind: EngineObservation['kind'] = !mover
    ? 'initial'
    : mover === perspective
      ? 'own_move'
      : 'opp_move';

  // Redacted view of the post-move state: visibility mask, visible pieces, and
  // the shrouded color-only entries.
  const view = getMiniXiangqiPlayerView(nextState, perspective);
  let visibility_mask = 0n;
  for (const sq of view.visibleSquares) {
    visibility_mask |= 1n << BigInt(miniSquareIndex(sq));
  }

  const visible_pieces: Array<[SquareIndex, { type: 'G' | 'H' | 'C' | 'R' | 'S'; color: Color }]> = [];
  const shrouded: Array<[SquareIndex, Color]> = [];
  for (const [sq, entry] of Object.entries(view.board) as Array<
    [MiniXiangqiSquare, MiniXiangqiVisibleBoardEntry]
  >) {
    if (!entry) continue;
    const idx = miniSquareIndex(sq);
    if (entry.shrouded) {
      shrouded.push([idx, toProtocolColor(entry.color)]);
    } else {
      visible_pieces.push([
        idx,
        { type: ROLE_TO_LETTER[entry.piece.role], color: toProtocolColor(entry.piece.color) },
      ]);
    }
  }
  visible_pieces.sort((a, b) => a[0] - b[0]);
  shrouded.sort((a, b) => a[0] - b[0]);

  // Captures — must mirror the engine's observation_from_transition EXACTLY, or
  // the belief filter (consistent_with) discards the true world and |P| collapses
  // to 0. The engine's convention: own_capture_square = the single square that is
  // own in prev but not in next — i.e. the from-square of OUR OWN move, OR a
  // square the opponent captured. (Chess excludes the own-move from-square; the
  // mini belief update does NOT.) opp_capture_landing_square = that square iff it
  // now holds an opponent piece (the opponent captured us and landed there).
  let own_capture_square: SquareIndex | null = null;
  let opp_capture_landing_square: SquareIndex | null = null;
  if (prevState) {
    const nextOwn = new Set(ownSquaresOf(nextState, perspective));
    const vacated = ownSquaresOf(prevState, perspective).find((sq) => !nextOwn.has(sq));
    if (vacated !== undefined) {
      own_capture_square = miniSquareIndex(vacated);
      const landed = nextState.board[vacated];
      if (landed && landed.color !== perspective) {
        opp_capture_landing_square = miniSquareIndex(vacated);
      }
    }
  }

  const game_over =
    nextState.status.type === 'finished'
      ? {
          winner: nextState.status.winner ? toProtocolColor(nextState.status.winner) : null,
          reason: nextState.status.reason,
        }
      : null;

  // own_move present only on own-move plies — needed for deterministic belief
  // advance on cold replay. Mini square strings are a subset of chess squares.
  const own_move: Move | null = kind === 'own_move' && move ? (move as Move) : null;

  const obs: EngineObservation = {
    ply,
    kind,
    own_move,
    visibility_mask: maskHex(visibility_mask),
    visible_pieces,
    own_capture_square,
    opp_capture_landing_square,
    game_over,
  };
  // Emit shrouded only when non-empty (chess never carries it → byte-identical).
  if (shrouded.length > 0) obs.shrouded = shrouded;
  return obs;
}

/**
 * Full observation transcript for `perspective`, by replaying the move-played
 * events from the initial state. Non-move events don't change the board, so only
 * move-played plies are replayed (via applyMiniXiangqiMove).
 */
export function buildMiniXiangqiObservationTranscript(args: {
  gameId: string;
  events: DarkMiniXiangqiEvent[];
  perspective: MiniXiangqiColor;
}): EngineObservation[] {
  let state = createInitialMiniXiangqiState(args.gameId);
  const transcript: EngineObservation[] = [
    buildMiniXiangqiObservationForPly({
      prevState: null,
      nextState: state,
      move: null,
      perspective: args.perspective,
      ply: 0,
    }),
  ];
  let ply = 0;
  for (const ev of args.events) {
    if (ev.type !== 'move-played') continue;
    const prevState = state;
    state = applyMiniXiangqiMove(state, ev.move);
    ply += 1;
    transcript.push(
      buildMiniXiangqiObservationForPly({
        prevState,
        nextState: state,
        move: ev.move,
        perspective: args.perspective,
        ply,
      }),
    );
  }
  return transcript;
}

/**
 * Main entry: build an EngineTurnRequest for the DMX engine seated as
 * `engineColor` (the side to move; caller validates). The worker reuses belief
 * across turns from the full transcript (delta-feeds the tail), so this always
 * sends the full observationTranscript rather than a delta.
 */
export function buildMiniXiangqiEngineTurnRequest(args: {
  gameId: string;
  engineId: string;
  engineSecret: string;
  engineColor: MiniXiangqiColor;
  state: MiniXiangqiGameState;
  events: DarkMiniXiangqiEvent[];
  ply: number;
  clockRemainingMs: number | null;
  incrementMs: number;
}): EngineTurnRequest {
  const protocolColor = toProtocolColor(args.engineColor);
  const sessionId = buildSessionId({
    gameId: args.gameId,
    engineId: args.engineId,
    color: protocolColor,
  });
  const engineSeed = deriveEngineSeed({
    engineSecret: args.engineSecret,
    gameId: args.gameId,
    engineId: args.engineId,
    color: protocolColor,
    ply: args.ply,
  });
  const observationTranscript = buildMiniXiangqiObservationTranscript({
    gameId: args.gameId,
    events: args.events,
    perspective: args.engineColor,
  });
  const legalMoves = getMiniXiangqiPlayerView(args.state, args.engineColor)
    .legalMoves as Move[];
  const clock: EngineClock = {
    remaining_ms: args.clockRemainingMs,
    increment_ms: args.incrementMs,
  };
  return {
    protocolVersion: '1',
    gameId: args.gameId,
    engineId: args.engineId,
    gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
    sessionId,
    color: protocolColor,
    ply: args.ply,
    engineSeed,
    clock,
    legalMoves,
    observationTranscript,
  };
}
