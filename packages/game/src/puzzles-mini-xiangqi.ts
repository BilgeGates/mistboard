import { DROP_MINI_XIANGQI_SPEC_ID, type GameSpecId, MINI_XIANGQI_SPEC_ID } from './game-specs.js';
import { MINED_DROP_MINI_XIANGQI_PUZZLES } from './puzzles-mini-xiangqi-mined.js';
import {
  applyDropMiniXiangqiMove,
  DEFAULT_DROP_MINI_XIANGQI_RULES,
  type DropMiniXiangqiGameState,
  type DropMiniXiangqiHands,
  type DropMiniXiangqiMove,
  dropMiniXiangqiPositionRepetitionKey,
  getLegalDropMiniXiangqiMoves,
  isDropMiniXiangqiDropMove,
  isDropMiniXiangqiGeneralInCheck,
  isLegalDropMiniXiangqiMove,
} from './variants-drop-mini-xiangqi.js';
import {
  applyMiniXiangqiOpenMove,
  getMiniXiangqiLegalMoves,
  getMiniXiangqiOpenLegalMoves,
  isMiniXiangqiGeneralInCheckOnBoard,
  isMiniXiangqiOpenLegalMove,
  type MiniXiangqiBoard,
  type MiniXiangqiColor,
  type MiniXiangqiGameState,
  type MiniXiangqiGameStatus,
  type MiniXiangqiMove,
  type MiniXiangqiSquare,
  miniXiangqiPositionRepetitionKey,
  oppositeMiniXiangqiColor,
} from './variants-mini-xiangqi.js';

export type MiniXiangqiPuzzleVariant =
  | typeof MINI_XIANGQI_SPEC_ID
  | typeof DROP_MINI_XIANGQI_SPEC_ID;

export type MiniXiangqiPuzzleTheme = 'back-rank' | 'checkmate' | 'chariot' | 'drop' | 'palace-net';

export type MiniXiangqiPuzzleGoal = {
  type: 'checkmate';
  winner?: MiniXiangqiColor;
};

type MiniXiangqiPuzzleBase<Variant extends MiniXiangqiPuzzleVariant, State, Move> = {
  id: string;
  variant: Variant;
  title: string;
  initial: State;
  solution: Move[];
  goal: MiniXiangqiPuzzleGoal;
  themes: MiniXiangqiPuzzleTheme[];
};

export type OpenMiniXiangqiPuzzle = MiniXiangqiPuzzleBase<
  typeof MINI_XIANGQI_SPEC_ID,
  MiniXiangqiGameState,
  MiniXiangqiMove
>;

export type DropMiniXiangqiPuzzle = MiniXiangqiPuzzleBase<
  typeof DROP_MINI_XIANGQI_SPEC_ID,
  DropMiniXiangqiGameState,
  DropMiniXiangqiMove
>;

export type MiniXiangqiPuzzle = OpenMiniXiangqiPuzzle | DropMiniXiangqiPuzzle;
export type MiniXiangqiPuzzleMove = MiniXiangqiMove | DropMiniXiangqiMove;
export type MiniXiangqiPuzzleState = MiniXiangqiGameState | DropMiniXiangqiGameState;

export type MiniXiangqiPuzzleValidationIssueCode =
  | 'ambiguous-immediate-general-capture'
  | 'empty-solution'
  | 'illegal-move'
  | 'not-playing'
  | 'solution-continues-after-finish'
  | 'solution-ended-before-goal'
  | 'unsupported-variant'
  | 'wrong-finish-reason'
  | 'wrong-move-shape'
  | 'wrong-winner';

export type MiniXiangqiPuzzleValidationIssue = {
  code: MiniXiangqiPuzzleValidationIssueCode;
  message: string;
  ply: number;
  move?: MiniXiangqiPuzzleMove;
};

export type MiniXiangqiPuzzleValidationResult =
  | {
      ok: true;
      puzzleId: string;
      variant: MiniXiangqiPuzzleVariant;
      solver: MiniXiangqiColor;
      finalStatus: Extract<MiniXiangqiGameStatus, { type: 'finished' }>;
      plyCount: number;
    }
  | {
      ok: false;
      puzzleId: string;
      variant: MiniXiangqiPuzzleVariant | GameSpecId;
      issue: MiniXiangqiPuzzleValidationIssue;
    };

export type MiniXiangqiPuzzleAttemptFailureCode =
  | 'incorrect-move'
  | 'illegal-move'
  | 'line-too-long'
  | 'wrong-move-shape';

export type MiniXiangqiPuzzleAttemptResult =
  | {
      ok: true;
      puzzleId: string;
      variant: MiniXiangqiPuzzleVariant;
      complete: boolean;
      ply: number;
      state: MiniXiangqiPuzzleState;
      lastMove?: MiniXiangqiPuzzleMove;
    }
  | {
      ok: false;
      puzzleId: string;
      variant: MiniXiangqiPuzzleVariant;
      code: MiniXiangqiPuzzleAttemptFailureCode;
      ply: number;
      state: MiniXiangqiPuzzleState;
      move: MiniXiangqiPuzzleMove;
    };

export type MiniXiangqiMateInOneCandidate = {
  variant: MiniXiangqiPuzzleVariant;
  state: MiniXiangqiPuzzleState;
  move: MiniXiangqiPuzzleMove;
  winner: MiniXiangqiColor;
};

export const MINI_XIANGQI_PUZZLES: readonly MiniXiangqiPuzzle[] = [
  {
    id: 'mini-xiangqi-red-back-rank-net-1',
    variant: MINI_XIANGQI_SPEC_ID,
    title: 'Red back-rank net',
    initial: miniPuzzleState(
      'mini-xiangqi-red-back-rank-net-1',
      {
        c1: { color: 'red', role: 'chariot' },
        c4: { color: 'red', role: 'chariot' },
        d1: { color: 'red', role: 'general' },
        d2: { color: 'red', role: 'soldier' },
        e1: { color: 'red', role: 'chariot' },
        d7: { color: 'black', role: 'general' },
      },
      'red',
    ),
    solution: [{ from: 'c4', to: 'd4' }],
    goal: { type: 'checkmate', winner: 'red' },
    themes: ['back-rank', 'checkmate', 'chariot', 'palace-net'],
  },
  {
    id: 'mini-xiangqi-black-back-rank-net-1',
    variant: MINI_XIANGQI_SPEC_ID,
    title: 'Black back-rank net',
    initial: miniPuzzleState(
      'mini-xiangqi-black-back-rank-net-1',
      {
        c7: { color: 'black', role: 'chariot' },
        c4: { color: 'black', role: 'chariot' },
        d7: { color: 'black', role: 'general' },
        d6: { color: 'black', role: 'soldier' },
        e7: { color: 'black', role: 'chariot' },
        d1: { color: 'red', role: 'general' },
      },
      'black',
    ),
    solution: [{ from: 'c4', to: 'd4' }],
    goal: { type: 'checkmate', winner: 'black' },
    themes: ['back-rank', 'checkmate', 'chariot', 'palace-net'],
  },
  {
    id: 'drop-mini-xiangqi-red-chariot-drop-mate-1',
    variant: DROP_MINI_XIANGQI_SPEC_ID,
    title: 'Red chariot drop mate',
    initial: dropMiniPuzzleState(
      'drop-mini-xiangqi-red-chariot-drop-mate-1',
      {
        c1: { color: 'red', role: 'chariot' },
        d1: { color: 'red', role: 'general' },
        d3: { color: 'red', role: 'soldier' },
        e1: { color: 'red', role: 'chariot' },
        d7: { color: 'black', role: 'general' },
      },
      'red',
      { red: { chariot: 1 }, black: {} },
    ),
    solution: [{ drop: 'chariot', to: 'd4' }],
    goal: { type: 'checkmate', winner: 'red' },
    themes: ['checkmate', 'chariot', 'drop', 'palace-net'],
  },
  ...MINED_DROP_MINI_XIANGQI_PUZZLES,
  {
    id: 'drop-mini-xiangqi-black-chariot-drop-mate-1',
    variant: DROP_MINI_XIANGQI_SPEC_ID,
    title: 'Black chariot drop mate',
    initial: dropMiniPuzzleState(
      'drop-mini-xiangqi-black-chariot-drop-mate-1',
      {
        c7: { color: 'black', role: 'chariot' },
        d7: { color: 'black', role: 'general' },
        d5: { color: 'black', role: 'soldier' },
        e7: { color: 'black', role: 'chariot' },
        d1: { color: 'red', role: 'general' },
      },
      'black',
      { red: {}, black: { chariot: 1 } },
    ),
    solution: [{ drop: 'chariot', to: 'd4' }],
    goal: { type: 'checkmate', winner: 'black' },
    themes: ['checkmate', 'chariot', 'drop', 'palace-net'],
  },
];

export function miniXiangqiPuzzleById(id: string): MiniXiangqiPuzzle | null {
  return MINI_XIANGQI_PUZZLES.find((puzzle) => puzzle.id === id) ?? null;
}

export function miniXiangqiPuzzlesForVariant(
  variant: MiniXiangqiPuzzleVariant,
): MiniXiangqiPuzzle[] {
  return MINI_XIANGQI_PUZZLES.filter((puzzle) => puzzle.variant === variant);
}

export function findMiniXiangqiMateInOneCandidates(
  variant: MiniXiangqiPuzzleVariant,
  state: MiniXiangqiPuzzleState,
): MiniXiangqiMateInOneCandidate[] {
  if (state.status.type !== 'playing') return [];
  const attacker = state.status.turn;
  if (isDefenderAlreadyInCheck(variant, state, attacker)) return [];
  const moves = legalPuzzleMoves(variant, state);
  const candidates: MiniXiangqiMateInOneCandidate[] = [];
  for (const move of moves) {
    const next = applyPuzzleMove(variant, state, move);
    if (
      next?.status.type === 'finished' &&
      next.status.reason === 'checkmate' &&
      next.status.winner === attacker
    ) {
      candidates.push({ variant, state, move, winner: attacker });
    }
  }
  return candidates;
}

export function validateMiniXiangqiPuzzle(
  puzzle: MiniXiangqiPuzzle,
): MiniXiangqiPuzzleValidationResult {
  if (puzzle.initial.status.type !== 'playing') {
    return validationError(puzzle, 'not-playing', 0, 'Puzzle initial state must be playable.');
  }
  if (puzzle.solution.length === 0) {
    return validationError(puzzle, 'empty-solution', 0, 'Puzzle solution must contain a move.');
  }
  const immediateGeneralCaptures = immediateGeneralCaptureMoves(puzzle.initial);
  const firstMove = puzzle.solution[0] as MiniXiangqiPuzzleMove;
  if (
    immediateGeneralCaptures.length > 0 &&
    !immediateGeneralCaptures.some((move) => miniXiangqiPuzzleMoveEquals(move, firstMove))
  ) {
    return validationError(
      puzzle,
      'ambiguous-immediate-general-capture',
      0,
      'Puzzle initial state allows an immediate general capture outside the solution.',
      immediateGeneralCaptures[0],
    );
  }

  const solver = puzzle.initial.status.turn;
  let state: MiniXiangqiPuzzleState = puzzle.initial;
  for (let ply = 0; ply < puzzle.solution.length; ply += 1) {
    const move = puzzle.solution[ply] as MiniXiangqiPuzzleMove;
    if (state.status.type !== 'playing') {
      return validationError(
        puzzle,
        'solution-continues-after-finish',
        ply,
        'Puzzle solution continues after the game is already finished.',
        move,
      );
    }

    const applied = applyPuzzleMove(puzzle.variant, state, move);
    if (!applied) {
      return validationError(
        puzzle,
        moveShapeIssueCode(puzzle.variant, move),
        ply,
        'Illegal puzzle move.',
        move,
      );
    }
    state = applied;
  }

  if (state.status.type !== 'finished') {
    return validationError(
      puzzle,
      'solution-ended-before-goal',
      puzzle.solution.length,
      'Puzzle solution ended before the goal was reached.',
    );
  }

  const expectedWinner = puzzle.goal.winner ?? solver;
  if (puzzle.goal.type === 'checkmate' && state.status.reason !== 'checkmate') {
    return validationError(
      puzzle,
      'wrong-finish-reason',
      puzzle.solution.length,
      `Expected checkmate, got ${state.status.reason}.`,
    );
  }
  if (state.status.winner !== expectedWinner) {
    return validationError(
      puzzle,
      'wrong-winner',
      puzzle.solution.length,
      `Expected ${expectedWinner} to win.`,
    );
  }

  return {
    ok: true,
    puzzleId: puzzle.id,
    variant: puzzle.variant,
    solver,
    finalStatus: state.status,
    plyCount: puzzle.solution.length,
  };
}

export function miniXiangqiPuzzleSideToMove(puzzle: MiniXiangqiPuzzle): MiniXiangqiColor | null {
  return puzzle.initial.status.type === 'playing' ? puzzle.initial.status.turn : null;
}

export function miniXiangqiPuzzleNextMove(
  puzzle: MiniXiangqiPuzzle,
  playedPlyCount: number,
): MiniXiangqiPuzzleMove | null {
  return (puzzle.solution[playedPlyCount] as MiniXiangqiPuzzleMove | undefined) ?? null;
}

export function isMiniXiangqiPuzzleSolverPly(playedPlyCount: number): boolean {
  return playedPlyCount % 2 === 0;
}

export function miniXiangqiPuzzleMoveEquals(
  left: MiniXiangqiPuzzleMove,
  right: MiniXiangqiPuzzleMove,
): boolean {
  if (isDropMiniXiangqiDropMove(left) || isDropMiniXiangqiDropMove(right)) {
    return (
      isDropMiniXiangqiDropMove(left) &&
      isDropMiniXiangqiDropMove(right) &&
      left.drop === right.drop &&
      left.to === right.to
    );
  }
  return left.from === right.from && left.to === right.to;
}

export function miniXiangqiPuzzleMoveLabel(move: MiniXiangqiPuzzleMove): string {
  if (isDropMiniXiangqiDropMove(move)) return `${dropRoleLetter(move.drop)}@${move.to}`;
  return `${move.from}-${move.to}`;
}

export function attemptMiniXiangqiPuzzleLine(
  puzzle: MiniXiangqiPuzzle,
  moves: readonly MiniXiangqiPuzzleMove[],
): MiniXiangqiPuzzleAttemptResult {
  let state: MiniXiangqiPuzzleState = puzzle.initial;
  let lastMove: MiniXiangqiPuzzleMove | null = null;
  for (let ply = 0; ply < moves.length; ply += 1) {
    const move = moves[ply]!;
    const expected = puzzle.solution[ply] as MiniXiangqiPuzzleMove | undefined;
    if (!expected) {
      return attemptFailure(puzzle, 'line-too-long', ply, state, move);
    }
    if (!miniXiangqiPuzzleMoveEquals(move, expected)) {
      const code = moveShapeIssueCode(puzzle.variant, move);
      return attemptFailure(
        puzzle,
        code === 'wrong-move-shape' ? 'wrong-move-shape' : 'incorrect-move',
        ply,
        state,
        move,
      );
    }
    const applied = applyPuzzleMove(puzzle.variant, state, move);
    if (!applied) {
      return attemptFailure(puzzle, 'illegal-move', ply, state, move);
    }
    state = applied;
    lastMove = move;
  }

  const ply = moves.length;
  return {
    ok: true,
    puzzleId: puzzle.id,
    variant: puzzle.variant,
    complete: ply >= puzzle.solution.length && state.status.type === 'finished',
    ply,
    state,
    ...(lastMove ? { lastMove } : {}),
  };
}

function applyPuzzleMove(
  variant: MiniXiangqiPuzzleVariant,
  state: MiniXiangqiPuzzleState,
  move: MiniXiangqiPuzzleMove,
): MiniXiangqiPuzzleState | null {
  if (variant === MINI_XIANGQI_SPEC_ID) {
    const miniState = state as MiniXiangqiGameState;
    if (isDropMiniXiangqiDropMove(move) || !isMiniXiangqiOpenLegalMove(miniState, move)) {
      return null;
    }
    return applyMiniXiangqiOpenMove(miniState, move);
  }
  if (variant === DROP_MINI_XIANGQI_SPEC_ID) {
    const dropState = state as DropMiniXiangqiGameState;
    if (!isLegalDropMiniXiangqiMove(dropState, move)) return null;
    return applyDropMiniXiangqiMove(dropState, move);
  }
  return null;
}

function legalPuzzleMoves(
  variant: MiniXiangqiPuzzleVariant,
  state: MiniXiangqiPuzzleState,
): MiniXiangqiPuzzleMove[] {
  if (variant === MINI_XIANGQI_SPEC_ID) {
    return getMiniXiangqiOpenLegalMoves(state as MiniXiangqiGameState);
  }
  return getLegalDropMiniXiangqiMoves(state as DropMiniXiangqiGameState);
}

function immediateGeneralCaptureMoves(state: MiniXiangqiPuzzleState): MiniXiangqiMove[] {
  if (state.status.type !== 'playing') return [];
  const defender = oppositeMiniXiangqiColor(state.status.turn);
  const defenderGeneral = findGeneralSquare(state.board, defender);
  if (!defenderGeneral) return [];
  return getMiniXiangqiLegalMoves({
    id: state.id,
    board: state.board,
    status: state.status,
    moveNumber: state.moveNumber,
    progressClock: state.progressClock,
    positionCounts: {},
  }).filter((move) => move.to === defenderGeneral);
}

function isDefenderAlreadyInCheck(
  variant: MiniXiangqiPuzzleVariant,
  state: MiniXiangqiPuzzleState,
  attacker: MiniXiangqiColor,
): boolean {
  const defender = attacker === 'red' ? 'black' : 'red';
  if (variant === MINI_XIANGQI_SPEC_ID) {
    return isMiniXiangqiGeneralInCheckOnBoard((state as MiniXiangqiGameState).board, defender);
  }
  return isDropMiniXiangqiGeneralInCheck(state as DropMiniXiangqiGameState, defender);
}

function findGeneralSquare(
  board: MiniXiangqiBoard,
  color: MiniXiangqiColor,
): MiniXiangqiSquare | null {
  for (const [square, piece] of Object.entries(board)) {
    if (piece?.color === color && piece.role === 'general') return square as MiniXiangqiSquare;
  }
  return null;
}

function moveShapeIssueCode(
  variant: MiniXiangqiPuzzleVariant,
  move: MiniXiangqiPuzzleMove,
): MiniXiangqiPuzzleValidationIssueCode {
  return variant === MINI_XIANGQI_SPEC_ID && isDropMiniXiangqiDropMove(move)
    ? 'wrong-move-shape'
    : 'illegal-move';
}

function validationError(
  puzzle: MiniXiangqiPuzzle,
  code: MiniXiangqiPuzzleValidationIssueCode,
  ply: number,
  message: string,
  move?: MiniXiangqiPuzzleMove,
): MiniXiangqiPuzzleValidationResult {
  return {
    ok: false,
    puzzleId: puzzle.id,
    variant: puzzle.variant,
    issue: {
      code,
      message,
      ply,
      ...(move ? { move } : {}),
    },
  };
}

function attemptFailure(
  puzzle: MiniXiangqiPuzzle,
  code: MiniXiangqiPuzzleAttemptFailureCode,
  ply: number,
  state: MiniXiangqiPuzzleState,
  move: MiniXiangqiPuzzleMove,
): MiniXiangqiPuzzleAttemptResult {
  return {
    ok: false,
    puzzleId: puzzle.id,
    variant: puzzle.variant,
    code,
    ply,
    state,
    move,
  };
}

function miniPuzzleState(
  id: string,
  board: MiniXiangqiBoard,
  turn: MiniXiangqiColor,
): MiniXiangqiGameState {
  const state: MiniXiangqiGameState = {
    id,
    board,
    status: { type: 'playing', turn },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  };
  return {
    ...state,
    positionCounts: { [miniXiangqiPositionRepetitionKey(state)]: 1 },
  };
}

function dropMiniPuzzleState(
  id: string,
  board: MiniXiangqiBoard,
  turn: MiniXiangqiColor,
  hands: DropMiniXiangqiHands,
): DropMiniXiangqiGameState {
  const state: DropMiniXiangqiGameState = {
    id,
    board,
    status: { type: 'playing', turn },
    moveNumber: 1,
    progressClock: 0,
    rules: DEFAULT_DROP_MINI_XIANGQI_RULES,
    hands: cloneHands(hands),
    cooldownHands: { red: {}, black: {} },
    positionCounts: {},
  };
  return {
    ...state,
    positionCounts: { [dropMiniXiangqiPositionRepetitionKey(state)]: 1 },
  };
}

function cloneHands(hands: DropMiniXiangqiHands): DropMiniXiangqiHands {
  return {
    red: { ...hands.red },
    black: { ...hands.black },
  };
}

function dropRoleLetter(role: Exclude<DropMiniXiangqiMove, MiniXiangqiMove>['drop']): string {
  switch (role) {
    case 'chariot':
      return 'R';
    case 'horse':
      return 'H';
    case 'cannon':
      return 'C';
    case 'soldier':
      return 'S';
  }
}
