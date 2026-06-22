import {
  createInitialMiniXiangqiState,
  getMiniXiangqiOpenLegalMoves,
  isMiniXiangqiGeneralInCheckOnBoard,
  type MiniXiangqiBoard,
  type MiniXiangqiColor,
  type MiniXiangqiGameState,
  type MiniXiangqiGameStatus,
  type MiniXiangqiMove,
  type MiniXiangqiPieceRole,
  type MiniXiangqiSquare,
  miniXiangqiBoardAfterMove,
  miniXiangqiCoordOf,
  miniXiangqiInPalace,
  miniXiangqiPositionRepetitionKey,
  miniXiangqiSquareOf,
  oppositeMiniXiangqiColor,
} from './variants-mini-xiangqi.js';

export type DropMiniXiangqiDropRole = Exclude<MiniXiangqiPieceRole, 'general'>;
export type DropMiniXiangqiHand = Partial<Record<DropMiniXiangqiDropRole, number>>;
export type DropMiniXiangqiHands = Record<MiniXiangqiColor, DropMiniXiangqiHand>;
export type DropMiniXiangqiDropRegionPolicy = 'any-empty' | 'not-enemy-palace' | 'home-three-ranks';
export type DropMiniXiangqiDropAttackPolicy =
  | 'allow-immediate-general-threat'
  | 'forbid-immediate-general-threat';
export type DropMiniXiangqiReservePolicy = 'immediate' | 'one-turn-cooldown';

export type DropMiniXiangqiRules = {
  dropRegion: DropMiniXiangqiDropRegionPolicy;
  dropAttack: DropMiniXiangqiDropAttackPolicy;
  reserve: DropMiniXiangqiReservePolicy;
};

export type DropMiniXiangqiDropMove = {
  drop: DropMiniXiangqiDropRole;
  to: MiniXiangqiSquare;
};

export type DropMiniXiangqiMove = MiniXiangqiMove | DropMiniXiangqiDropMove;

export type DropMiniXiangqiGameState = Omit<MiniXiangqiGameState, 'lastMove' | 'positionCounts'> & {
  rules: DropMiniXiangqiRules;
  hands: DropMiniXiangqiHands;
  cooldownHands: DropMiniXiangqiHands;
  lastMove?: DropMiniXiangqiMove;
  positionCounts: Record<string, number>;
};

export type DropMiniXiangqiPlayerView = {
  id: string;
  perspective: MiniXiangqiColor;
  board: MiniXiangqiBoard;
  hands: DropMiniXiangqiHands;
  cooldownHands: DropMiniXiangqiHands;
  legalMoves: DropMiniXiangqiMove[];
  rules: DropMiniXiangqiRules;
  inCheck: boolean;
  status: MiniXiangqiGameStatus;
  moveNumber: number;
  lastMove?: DropMiniXiangqiMove;
};

export type DropMiniXiangqiApplyMoveOptions = {
  progressClockLimit?: number;
};

export const DROP_MINI_XIANGQI_DROP_ROLES = [
  'horse',
  'cannon',
  'chariot',
  'soldier',
] as const satisfies readonly DropMiniXiangqiDropRole[];

export const DEFAULT_DROP_MINI_XIANGQI_RULES: DropMiniXiangqiRules = {
  dropRegion: 'not-enemy-palace',
  dropAttack: 'allow-immediate-general-threat',
  reserve: 'immediate',
};

export const WILD_DROP_MINI_XIANGQI_RULES: DropMiniXiangqiRules = {
  dropRegion: 'any-empty',
  dropAttack: 'allow-immediate-general-threat',
  reserve: 'immediate',
};

export const GUARDED_DROP_MINI_XIANGQI_RULES: DropMiniXiangqiRules = {
  dropRegion: 'home-three-ranks',
  dropAttack: 'forbid-immediate-general-threat',
  reserve: 'immediate',
};

export const COOLDOWN_DROP_MINI_XIANGQI_RULES: DropMiniXiangqiRules = {
  dropRegion: 'any-empty',
  dropAttack: 'allow-immediate-general-threat',
  reserve: 'one-turn-cooldown',
};

const DEFAULT_PROGRESS_CLOCK_LIMIT = 60;
const ALL_MINI_XIANGQI_SQUARES: readonly MiniXiangqiSquare[] = (() => {
  const squares: MiniXiangqiSquare[] = [];
  for (let rank = 1; rank <= 7; rank += 1) {
    for (let file = 0; file < 7; file += 1) squares.push(miniXiangqiSquareOf(file, rank));
  }
  return squares;
})();

export function isDropMiniXiangqiDropMove(
  move: DropMiniXiangqiMove,
): move is DropMiniXiangqiDropMove {
  return 'drop' in move;
}

export function createInitialDropMiniXiangqiState(
  gameId: string,
  rules: DropMiniXiangqiRules = DEFAULT_DROP_MINI_XIANGQI_RULES,
): DropMiniXiangqiGameState {
  const base = createInitialMiniXiangqiState(gameId);
  const state: DropMiniXiangqiGameState = {
    ...base,
    rules,
    hands: emptyHands(),
    cooldownHands: emptyHands(),
    lastMove: undefined,
    positionCounts: {},
  };
  return {
    ...state,
    positionCounts: { [dropMiniXiangqiPositionRepetitionKey(state)]: 1 },
  };
}

export function getLegalDropMiniXiangqiMoves(
  state: DropMiniXiangqiGameState,
): DropMiniXiangqiMove[] {
  if (state.status.type !== 'playing') return [];
  const color = state.status.turn;
  return [
    ...getLegalDropMiniXiangqiBoardMoves(state, color),
    ...getLegalDropMiniXiangqiDrops(state, color),
  ];
}

export function getLegalDropMiniXiangqiDrops(
  state: DropMiniXiangqiGameState,
  color: MiniXiangqiColor,
): DropMiniXiangqiDropMove[] {
  if (state.status.type !== 'playing' || state.status.turn !== color) return [];
  const drops: DropMiniXiangqiDropMove[] = [];
  for (const role of DROP_MINI_XIANGQI_DROP_ROLES) {
    if ((state.hands[color][role] ?? 0) <= 0) continue;
    for (const to of ALL_MINI_XIANGQI_SQUARES) {
      const drop = { drop: role, to };
      if (isLegalDropMiniXiangqiDrop(state, drop, color)) drops.push(drop);
    }
  }
  return drops;
}

export function isLegalDropMiniXiangqiMove(
  state: DropMiniXiangqiGameState,
  move: DropMiniXiangqiMove,
): boolean {
  if (state.status.type !== 'playing') return false;
  if (isDropMiniXiangqiDropMove(move)) {
    return isLegalDropMiniXiangqiDrop(state, move, state.status.turn);
  }
  return getLegalDropMiniXiangqiBoardMoves(state, state.status.turn).some(
    (candidate) => candidate.from === move.from && candidate.to === move.to,
  );
}

export function applyDropMiniXiangqiMove(
  state: DropMiniXiangqiGameState,
  move: DropMiniXiangqiMove,
  opts: DropMiniXiangqiApplyMoveOptions = {},
): DropMiniXiangqiGameState {
  if (state.status.type !== 'playing') return state;
  if (!isLegalDropMiniXiangqiMove(state, move)) return state;

  return isDropMiniXiangqiDropMove(move)
    ? applyDrop(state, move, opts)
    : applyBoardMove(state, move, opts);
}

export function getDropMiniXiangqiPlayerView(
  state: DropMiniXiangqiGameState,
  color: MiniXiangqiColor,
): DropMiniXiangqiPlayerView {
  return {
    id: state.id,
    perspective: color,
    board: { ...state.board },
    hands: cloneHands(state.hands),
    cooldownHands: cloneHands(state.cooldownHands),
    legalMoves:
      state.status.type === 'playing'
        ? getLegalDropMiniXiangqiMoves({ ...state, status: { type: 'playing', turn: color } })
        : [],
    rules: { ...state.rules },
    inCheck:
      state.status.type === 'playing' ? isDropMiniXiangqiGeneralInCheck(state, color) : false,
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: state.lastMove,
  };
}

export function dropMiniXiangqiPositionRepetitionKey(state: DropMiniXiangqiGameState): string {
  const miniKey = miniXiangqiPositionRepetitionKey(miniStateOf(state));
  const rules = `${state.rules.dropRegion}/${state.rules.dropAttack}/${state.rules.reserve}`;
  return `${rules}|${miniKey}|h:${handsKey(state.hands)}|c:${handsKey(state.cooldownHands)}`;
}

function applyBoardMove(
  state: DropMiniXiangqiGameState,
  move: MiniXiangqiMove,
  opts: DropMiniXiangqiApplyMoveOptions,
): DropMiniXiangqiGameState {
  const movingColor = state.status.type === 'playing' ? state.status.turn : null;
  if (!movingColor) return state;

  const movingPiece = state.board[move.from];
  const capturedPiece = state.board[move.to];
  if (!movingPiece || capturedPiece?.role === 'general') return state;

  const board = miniXiangqiBoardAfterMove(state.board, move);
  const nextTurn = oppositeMiniXiangqiColor(movingColor);
  const nextMoveNumber = movingColor === 'black' ? state.moveNumber + 1 : state.moveNumber;
  const progressClock = capturedPiece ? 0 : state.progressClock + 1;

  const hands = cloneHands(state.hands);
  const cooldownHands = cloneHands(state.cooldownHands);
  releaseCooldownFor(hands, cooldownHands, movingColor);
  if (capturedPiece) {
    addCapturedToReserve(state.rules, hands, cooldownHands, movingColor, capturedPiece.role);
  }

  const provisional: DropMiniXiangqiGameState = {
    ...state,
    board,
    status: { type: 'playing', turn: nextTurn },
    moveNumber: nextMoveNumber,
    progressClock,
    lastMove: move,
    hands,
    cooldownHands,
  };

  return adjudicateAfterMove(state, provisional, movingColor, opts);
}

function applyDrop(
  state: DropMiniXiangqiGameState,
  move: DropMiniXiangqiDropMove,
  opts: DropMiniXiangqiApplyMoveOptions,
): DropMiniXiangqiGameState {
  const movingColor = state.status.type === 'playing' ? state.status.turn : null;
  if (!movingColor) return state;

  const hands = cloneHands(state.hands);
  const cooldownHands = cloneHands(state.cooldownHands);
  releaseCooldownFor(hands, cooldownHands, movingColor);
  decrementHand(hands[movingColor], move.drop);

  const nextTurn = oppositeMiniXiangqiColor(movingColor);
  const nextMoveNumber = movingColor === 'black' ? state.moveNumber + 1 : state.moveNumber;
  const provisional: DropMiniXiangqiGameState = {
    ...state,
    board: { ...state.board, [move.to]: { color: movingColor, role: move.drop } },
    status: { type: 'playing', turn: nextTurn },
    moveNumber: nextMoveNumber,
    progressClock: 0,
    lastMove: move,
    hands,
    cooldownHands,
  };

  return adjudicateAfterMove(state, provisional, movingColor, opts);
}

function adjudicateAfterMove(
  previous: DropMiniXiangqiGameState,
  provisional: DropMiniXiangqiGameState,
  movingColor: MiniXiangqiColor,
  opts: DropMiniXiangqiApplyMoveOptions,
): DropMiniXiangqiGameState {
  const nextTurn = oppositeMiniXiangqiColor(movingColor);
  const nextStateForKey = {
    ...provisional,
    status: { type: 'playing', turn: nextTurn } satisfies MiniXiangqiGameStatus,
  };
  const repKey = dropMiniXiangqiPositionRepetitionKey(nextStateForKey);
  const positionCounts = { ...previous.positionCounts };
  positionCounts[repKey] = (positionCounts[repKey] ?? 0) + 1;

  let status: MiniXiangqiGameStatus = provisional.status;
  if (provisional.status.type === 'playing') {
    const defender = provisional.status.turn;
    if (!hasLegalDropMiniXiangqiMove(provisional, defender)) {
      status = {
        type: 'finished',
        winner: movingColor,
        reason: isDropMiniXiangqiGeneralInCheck(provisional, defender) ? 'checkmate' : 'stalemate',
      };
    } else if ((positionCounts[repKey] ?? 0) >= 3) {
      status = { type: 'finished', winner: null, reason: 'repetition' };
    } else if (
      provisional.progressClock >= (opts.progressClockLimit ?? DEFAULT_PROGRESS_CLOCK_LIMIT)
    ) {
      status = { type: 'finished', winner: null, reason: 'progress-clock' };
    }
  }

  return { ...provisional, status, positionCounts };
}

function isLegalDropMiniXiangqiDrop(
  state: DropMiniXiangqiGameState,
  move: DropMiniXiangqiDropMove,
  color: MiniXiangqiColor,
): boolean {
  if (!DROP_MINI_XIANGQI_DROP_ROLES.includes(move.drop)) return false;
  if ((state.hands[color][move.drop] ?? 0) <= 0) return false;
  if (state.board[move.to]) return false;
  if (!isDropRegionLegal(state.rules.dropRegion, color, move.to)) return false;
  if (
    state.rules.dropAttack === 'forbid-immediate-general-threat' &&
    createsImmediateGeneralCaptureThreat(state, color, move)
  ) {
    return false;
  }
  const board: MiniXiangqiBoard = { ...state.board, [move.to]: { color, role: move.drop } };
  if (isMiniXiangqiGeneralInCheckOnBoard(board, color)) return false;
  return true;
}

function createsImmediateGeneralCaptureThreat(
  state: DropMiniXiangqiGameState,
  color: MiniXiangqiColor,
  move: DropMiniXiangqiDropMove,
): boolean {
  const opponent = oppositeMiniXiangqiColor(color);
  const board: MiniXiangqiBoard = { ...state.board, [move.to]: { color, role: move.drop } };
  return isMiniXiangqiGeneralInCheckOnBoard(board, opponent);
}

function hasLegalDropMiniXiangqiMove(
  state: DropMiniXiangqiGameState,
  color: MiniXiangqiColor,
): boolean {
  if (getLegalDropMiniXiangqiBoardMoves(state, color).length > 0) return true;
  return (
    getLegalDropMiniXiangqiDrops({ ...state, status: { type: 'playing', turn: color } }, color)
      .length > 0
  );
}

function getLegalDropMiniXiangqiBoardMoves(
  state: DropMiniXiangqiGameState,
  color: MiniXiangqiColor,
): MiniXiangqiMove[] {
  if (state.status.type !== 'playing') return [];
  return getMiniXiangqiOpenLegalMoves({
    ...miniStateOf(state),
    status: { type: 'playing', turn: color },
  });
}

export function isDropMiniXiangqiGeneralInCheck(
  state: DropMiniXiangqiGameState,
  color: MiniXiangqiColor,
): boolean {
  return isMiniXiangqiGeneralInCheckOnBoard(state.board, color);
}

function miniStateOf(state: DropMiniXiangqiGameState): MiniXiangqiGameState {
  const lastMove =
    state.lastMove && !isDropMiniXiangqiDropMove(state.lastMove) ? state.lastMove : undefined;
  return {
    id: state.id,
    board: state.board,
    status: state.status,
    moveNumber: state.moveNumber,
    progressClock: state.progressClock,
    lastMove,
    positionCounts: {},
  };
}

function isDropRegionLegal(
  policy: DropMiniXiangqiDropRegionPolicy,
  color: MiniXiangqiColor,
  square: MiniXiangqiSquare,
): boolean {
  if (policy === 'any-empty') return true;
  if (policy === 'not-enemy-palace') {
    const { file, rank } = miniXiangqiCoordOf(square);
    return !miniXiangqiInPalace(oppositeMiniXiangqiColor(color), file, rank);
  }
  const { rank } = miniXiangqiCoordOf(square);
  return color === 'red' ? rank <= 3 : rank >= 5;
}

function addCapturedToReserve(
  rules: DropMiniXiangqiRules,
  hands: DropMiniXiangqiHands,
  cooldownHands: DropMiniXiangqiHands,
  color: MiniXiangqiColor,
  role: DropMiniXiangqiDropRole,
): void {
  if (rules.reserve === 'one-turn-cooldown') {
    incrementHand(cooldownHands[color], role);
    return;
  }
  incrementHand(hands[color], role);
}

function releaseCooldownFor(
  hands: DropMiniXiangqiHands,
  cooldownHands: DropMiniXiangqiHands,
  color: MiniXiangqiColor,
): void {
  for (const role of DROP_MINI_XIANGQI_DROP_ROLES) {
    const count = cooldownHands[color][role] ?? 0;
    if (count <= 0) continue;
    hands[color][role] = (hands[color][role] ?? 0) + count;
    delete cooldownHands[color][role];
  }
}

function emptyHands(): DropMiniXiangqiHands {
  return { red: {}, black: {} };
}

function cloneHands(hands: DropMiniXiangqiHands): DropMiniXiangqiHands {
  return {
    red: { ...hands.red },
    black: { ...hands.black },
  };
}

function incrementHand(hand: DropMiniXiangqiHand, role: DropMiniXiangqiDropRole): void {
  hand[role] = (hand[role] ?? 0) + 1;
}

function decrementHand(hand: DropMiniXiangqiHand, role: DropMiniXiangqiDropRole): void {
  const next = (hand[role] ?? 0) - 1;
  if (next > 0) {
    hand[role] = next;
  } else {
    delete hand[role];
  }
}

function handsKey(hands: DropMiniXiangqiHands): string {
  return `r:${handKey(hands.red)}|b:${handKey(hands.black)}`;
}

function handKey(hand: DropMiniXiangqiHand): string {
  return DROP_MINI_XIANGQI_DROP_ROLES.map((role) => `${role[0]}${hand[role] ?? 0}`).join('');
}
