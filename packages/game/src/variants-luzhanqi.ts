import type { AbortReason } from './types.js';

export type LuzhanqiColor = 'red' | 'black';
export const LUZHANQI_COLORS: readonly [LuzhanqiColor, LuzhanqiColor] = ['red', 'black'];

export type LuzhanqiPieceRole =
  | 'marshal'
  | 'general'
  | 'major-general'
  | 'brigadier-general'
  | 'colonel'
  | 'major'
  | 'captain'
  | 'lieutenant'
  | 'engineer'
  | 'bomb'
  | 'mine'
  | 'flag';

export type LuzhanqiFile = 'a' | 'b' | 'c' | 'd' | 'e';
export type LuzhanqiRank =
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '8'
  | '9'
  | '10'
  | '11'
  | '12'
  | '13';
export type LuzhanqiSquare = `${LuzhanqiFile}${LuzhanqiRank}`;
export type LuzhanqiPoint = LuzhanqiSquare | 'a7' | 'b7' | 'c7' | 'd7' | 'e7';

export type LuzhanqiPiece = {
  color: LuzhanqiColor;
  role: LuzhanqiPieceRole;
  // Entering a headquarters freezes even normally mobile pieces.
  immobile?: boolean;
};

export type LuzhanqiBoard = Partial<Record<LuzhanqiSquare, LuzhanqiPiece>>;
export type LuzhanqiFormation = Partial<Record<LuzhanqiSquare, LuzhanqiPieceRole>>;

export type LuzhanqiMove = {
  from: LuzhanqiSquare;
  to: LuzhanqiSquare;
};

export type LuzhanqiBattleOutcome =
  | { type: 'move' }
  | {
      type: 'battle';
      attackerRemoved: boolean;
      defenderRemoved: boolean;
      flagCaptured?: LuzhanqiColor;
      revealedFlag?: { color: LuzhanqiColor; square: LuzhanqiSquare };
    };

export type LuzhanqiLastMove = LuzhanqiMove & {
  outcome: LuzhanqiBattleOutcome;
};

export type LuzhanqiGameEndReason =
  | 'flag-captured'
  | 'mobile-force-eliminated'
  | 'timeout'
  | 'resignation'
  | 'abandonment';

export type LuzhanqiGameStatus =
  | { type: 'setup' }
  | { type: 'playing'; turn: LuzhanqiColor }
  | { type: 'finished'; winner: LuzhanqiColor | null; reason: LuzhanqiGameEndReason }
  | { type: 'aborted'; reason: AbortReason };

export type LuzhanqiGameState = {
  id: string;
  board: LuzhanqiBoard;
  formations?: Partial<Record<LuzhanqiColor, LuzhanqiFormation>>;
  status: LuzhanqiGameStatus;
  moveNumber: number;
  ply: number;
  revealedFlags: Partial<Record<LuzhanqiColor, LuzhanqiSquare>>;
  lastMove?: LuzhanqiLastMove;
};

export type LuzhanqiVisiblePiece =
  | { color: LuzhanqiColor; role: LuzhanqiPieceRole; known: true; immobile?: boolean }
  | { color: LuzhanqiColor; known: false; immobile?: boolean };

export type LuzhanqiPlayerBoard = Partial<Record<LuzhanqiSquare, LuzhanqiVisiblePiece>>;

export type LuzhanqiPlayerView = {
  id: string;
  perspective: LuzhanqiColor;
  board: LuzhanqiPlayerBoard;
  legalMoves: LuzhanqiMove[];
  status: LuzhanqiGameStatus;
  moveNumber: number;
  ply: number;
  revealedFlags: Partial<Record<LuzhanqiColor, LuzhanqiSquare>>;
  lastMove?: LuzhanqiLastMove;
};

export type LuzhanqiSetupError =
  | 'wrong-square'
  | 'missing-square'
  | 'wrong-piece-count'
  | 'flag-not-in-headquarters'
  | 'bomb-on-front-rank'
  | 'mine-outside-back-two-ranks';

export type LuzhanqiSetupValidation =
  | { ok: true }
  | { ok: false; errors: Array<{ type: LuzhanqiSetupError; square?: LuzhanqiSquare }> };

const FILES = ['a', 'b', 'c', 'd', 'e'] as const;
const RED_RANKS = [1, 2, 3, 4, 5, 6] as const;
const BLACK_RANKS = [13, 12, 11, 10, 9, 8] as const;
const ALL_RANKS = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13] as const;

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export const LUZHANQI_PIECE_COUNTS: Record<LuzhanqiPieceRole, number> = {
  marshal: 1,
  general: 1,
  'major-general': 2,
  'brigadier-general': 2,
  colonel: 2,
  major: 2,
  captain: 3,
  lieutenant: 3,
  engineer: 3,
  bomb: 2,
  mine: 3,
  flag: 1,
};

const LUZHANQI_ROLES = new Set<LuzhanqiPieceRole>(
  Object.keys(LUZHANQI_PIECE_COUNTS) as LuzhanqiPieceRole[],
);

const RANK: Partial<Record<LuzhanqiPieceRole, number>> = {
  marshal: 9,
  general: 8,
  'major-general': 7,
  'brigadier-general': 6,
  colonel: 5,
  major: 4,
  captain: 3,
  lieutenant: 2,
  engineer: 1,
};

export const LUZHANQI_HEADQUARTERS: Record<
  LuzhanqiColor,
  readonly [LuzhanqiSquare, LuzhanqiSquare]
> = {
  red: ['b1', 'd1'],
  black: ['b13', 'd13'],
};

export const LUZHANQI_CAMPS: Record<LuzhanqiColor, readonly LuzhanqiSquare[]> = {
  red: ['b3', 'd3', 'c4', 'b5', 'd5'],
  black: ['b11', 'd11', 'c10', 'b9', 'd9'],
};

export const LUZHANQI_FRONTLINE_POINTS = ['a7', 'c7', 'e7'] as const;
export const LUZHANQI_MOUNTAINS = ['b7', 'd7'] as const;

export const ALL_LUZHANQI_SQUARES: readonly LuzhanqiSquare[] = (() => {
  const out: LuzhanqiSquare[] = [];
  for (const rank of ALL_RANKS) {
    for (const file of FILES) out.push(`${file}${rank}` as LuzhanqiSquare);
  }
  return out;
})();

export const LUZHANQI_SETUP_SQUARES: Record<LuzhanqiColor, readonly LuzhanqiSquare[]> = {
  red: ALL_LUZHANQI_SQUARES.filter(
    (sq) => luzhanqiSquareOwner(sq) === 'red' && !isLuzhanqiCamp(sq),
  ),
  black: ALL_LUZHANQI_SQUARES.filter(
    (sq) => luzhanqiSquareOwner(sq) === 'black' && !isLuzhanqiCamp(sq),
  ),
};

const ROAD_EDGES = new Set<string>();
const RAIL_EDGES = new Set<string>();

function edgeKey(a: LuzhanqiPoint, b: LuzhanqiPoint): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function addRoad(a: LuzhanqiPoint, b: LuzhanqiPoint): void {
  ROAD_EDGES.add(edgeKey(a, b));
}

function addRail(a: LuzhanqiPoint, b: LuzhanqiPoint): void {
  RAIL_EDGES.add(edgeKey(a, b));
  addRoad(a, b);
}

function addTerritoryRoads(ranks: readonly number[]): void {
  for (const rank of ranks) {
    for (let file = 0; file < FILES.length - 1; file += 1) {
      addRoad(pointOf(file, rank), pointOf(file + 1, rank));
    }
  }
  for (let i = 0; i < ranks.length - 1; i += 1) {
    for (let file = 0; file < FILES.length; file += 1) {
      addRoad(pointOf(file, ranks[i]), pointOf(file, ranks[i + 1]));
    }
  }
  const midRanks = ranks.slice(1);
  const diagPairs: ReadonlyArray<readonly [number, number, number, number]> = [
    [0, 0, 1, 1],
    [2, 0, 1, 1],
    [2, 0, 3, 1],
    [4, 0, 3, 1],
    [1, 1, 2, 2],
    [3, 1, 2, 2],
    [1, 3, 2, 2],
    [3, 3, 2, 2],
    [0, 4, 1, 3],
    [2, 4, 1, 3],
    [2, 4, 3, 3],
    [4, 4, 3, 3],
  ];
  for (const [f1, r1, f2, r2] of diagPairs) {
    addRoad(pointOf(f1, midRanks[r1]), pointOf(f2, midRanks[r2]));
  }
}

function addTerritoryRails(ranks: readonly number[]): void {
  const backRail = ranks[1];
  const frontRail = ranks[5];
  for (let file = 0; file < FILES.length - 1; file += 1) {
    addRail(pointOf(file, backRail), pointOf(file + 1, backRail));
    addRail(pointOf(file, frontRail), pointOf(file + 1, frontRail));
  }
  for (const file of [0, 2, 4]) {
    for (let i = 1; i < ranks.length - 1; i += 1) {
      addRail(pointOf(file, ranks[i]), pointOf(file, ranks[i + 1]));
    }
  }
}

addTerritoryRoads(RED_RANKS);
addTerritoryRoads(BLACK_RANKS);
addTerritoryRails(RED_RANKS);
addTerritoryRails(BLACK_RANKS);
for (const file of [0, 2, 4]) addRail(pointOf(file, 6), pointOf(file, 8));

function pointOf(file: number, rank: number): LuzhanqiSquare {
  return `${FILES[file]}${rank}` as LuzhanqiSquare;
}

export function oppositeLuzhanqiColor(color: LuzhanqiColor): LuzhanqiColor {
  return color === 'red' ? 'black' : 'red';
}

export function luzhanqiSquareOwner(square: LuzhanqiSquare): LuzhanqiColor {
  const rank = Number(square.slice(1));
  return rank <= 6 ? 'red' : 'black';
}

export function isLuzhanqiCamp(square: LuzhanqiSquare): boolean {
  return LUZHANQI_CAMPS.red.includes(square) || LUZHANQI_CAMPS.black.includes(square);
}

export function isLuzhanqiHeadquarters(square: LuzhanqiSquare): boolean {
  return LUZHANQI_HEADQUARTERS.red.includes(square) || LUZHANQI_HEADQUARTERS.black.includes(square);
}

export function luzhanqiFormationForColor(
  color: LuzhanqiColor,
  rolesBySetupSquare?: Partial<Record<LuzhanqiSquare, LuzhanqiPieceRole>>,
): LuzhanqiFormation {
  const out = color === 'red' ? redDefaultFormation() : mirrorRedFormation(redDefaultFormation());
  for (const [square, role] of Object.entries(rolesBySetupSquare ?? {}) as Array<
    [LuzhanqiSquare, LuzhanqiPieceRole]
  >) {
    out[square] = role;
  }
  return out;
}

export function validateLuzhanqiFormation(
  color: LuzhanqiColor,
  formation: LuzhanqiFormation,
): LuzhanqiSetupValidation {
  const errors: Array<{ type: LuzhanqiSetupError; square?: LuzhanqiSquare }> = [];
  const setupSquares = new Set(LUZHANQI_SETUP_SQUARES[color]);
  const counts = emptyRoleCounts();
  for (const [square, role] of Object.entries(formation) as Array<
    [LuzhanqiSquare, LuzhanqiPieceRole]
  >) {
    if (!setupSquares.has(square)) {
      errors.push({ type: 'wrong-square', square });
      continue;
    }
    counts[role] += 1;
    if (role === 'flag' && !LUZHANQI_HEADQUARTERS[color].includes(square)) {
      errors.push({ type: 'flag-not-in-headquarters', square });
    }
    if (role === 'bomb' && isFrontRank(color, square)) {
      errors.push({ type: 'bomb-on-front-rank', square });
    }
    if (role === 'mine' && !isBackTwoRanks(color, square)) {
      errors.push({ type: 'mine-outside-back-two-ranks', square });
    }
  }
  for (const square of setupSquares) {
    if (formation[square] === undefined) errors.push({ type: 'missing-square', square });
  }
  for (const role of Object.keys(LUZHANQI_PIECE_COUNTS) as LuzhanqiPieceRole[]) {
    if (counts[role] !== LUZHANQI_PIECE_COUNTS[role]) errors.push({ type: 'wrong-piece-count' });
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function isLuzhanqiFormation(value: unknown): value is LuzhanqiFormation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  for (const [square, role] of Object.entries(value)) {
    if (!isLuzhanqiSquare(square) || !LUZHANQI_ROLES.has(role as LuzhanqiPieceRole)) return false;
  }
  return true;
}

export function isLuzhanqiSquare(value: unknown): value is LuzhanqiSquare {
  return typeof value === 'string' && ALL_LUZHANQI_SQUARES.includes(value as LuzhanqiSquare);
}

export function createPendingLuzhanqiState(id: string): LuzhanqiGameState {
  return {
    id,
    board: {},
    formations: {},
    status: { type: 'setup' },
    moveNumber: 1,
    ply: 0,
    revealedFlags: {},
  };
}

export function createInitialLuzhanqiState(
  id: string,
  redFormation: LuzhanqiFormation,
  blackFormation: LuzhanqiFormation,
): LuzhanqiGameState {
  const redValidation = validateLuzhanqiFormation('red', redFormation);
  if (!redValidation.ok)
    throw new Error(`invalid red luzhanqi formation: ${redValidation.errors[0].type}`);
  const blackValidation = validateLuzhanqiFormation('black', blackFormation);
  if (!blackValidation.ok) {
    throw new Error(`invalid black luzhanqi formation: ${blackValidation.errors[0].type}`);
  }
  const board: LuzhanqiBoard = {};
  for (const [square, role] of Object.entries(redFormation) as Array<
    [LuzhanqiSquare, LuzhanqiPieceRole]
  >) {
    board[square] = { color: 'red', role };
  }
  for (const [square, role] of Object.entries(blackFormation) as Array<
    [LuzhanqiSquare, LuzhanqiPieceRole]
  >) {
    board[square] = { color: 'black', role };
  }
  return {
    id,
    board,
    formations: { red: redFormation, black: blackFormation },
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
    ply: 0,
    revealedFlags: {},
  };
}

export function submitLuzhanqiFormation(
  state: LuzhanqiGameState,
  color: LuzhanqiColor,
  formation: LuzhanqiFormation,
): LuzhanqiGameState {
  if (state.status.type !== 'setup') return state;
  const validation = validateLuzhanqiFormation(color, formation);
  if (!validation.ok) return state;
  const formations = { ...(state.formations ?? {}), [color]: formation };
  const red = formations.red;
  const black = formations.black;
  if (red && black) return createInitialLuzhanqiState(state.id, red, black);
  const board = boardFromFormations(formations);
  return { ...state, board, formations };
}

export function getLuzhanqiLegalMoves(
  state: LuzhanqiGameState,
  color: LuzhanqiColor,
): LuzhanqiMove[] {
  if (state.status.type !== 'playing' || state.status.turn !== color) return [];
  const moves: LuzhanqiMove[] = [];
  for (const square of ALL_LUZHANQI_SQUARES) {
    moves.push(...getLuzhanqiLegalMovesFrom(state, square));
  }
  return moves;
}

export function getLuzhanqiLegalMovesFrom(
  state: LuzhanqiGameState,
  from: LuzhanqiSquare,
): LuzhanqiMove[] {
  if (state.status.type !== 'playing') return [];
  const piece = state.board[from];
  if (!piece || piece.color !== state.status.turn || !isMobilePiece(piece)) return [];
  const dests = new Set<LuzhanqiSquare>();
  for (const to of roadNeighbors(from)) maybeAddDestination(state, piece, dests, to);
  for (const to of railDestinations(state, from, piece.role === 'engineer')) {
    maybeAddDestination(state, piece, dests, to);
  }
  return [...dests].sort().map((to) => ({ from, to }));
}

export function isLuzhanqiLegalMove(state: LuzhanqiGameState, move: LuzhanqiMove): boolean {
  return getLuzhanqiLegalMovesFrom(state, move.from).some((m) => m.to === move.to);
}

export function applyLuzhanqiMove(state: LuzhanqiGameState, move: LuzhanqiMove): LuzhanqiGameState {
  if (!isLuzhanqiLegalMove(state, move))
    throw new Error(`illegal luzhanqi move: ${move.from}-${move.to}`);
  if (state.status.type !== 'playing') return state;
  const attacker = state.board[move.from];
  if (!attacker) throw new Error(`missing attacker on ${move.from}`);
  const defender = state.board[move.to];
  const board: LuzhanqiBoard = { ...state.board };
  const revealedFlags = { ...state.revealedFlags };
  let status: LuzhanqiGameStatus = state.status;
  let outcome: LuzhanqiBattleOutcome = { type: 'move' };
  delete board[move.from];
  if (!defender) {
    board[move.to] = withHeadquartersLock(attacker, move.to);
  } else {
    const resolved = resolveBattle(attacker, defender);
    delete board[move.to];
    if (resolved.attackerSurvives) board[move.to] = withHeadquartersLock(attacker, move.to);
    if (resolved.defenderSurvives) board[move.to] = defender;
    const revealed = applyMarshalReveals(board, revealedFlags, attacker, defender, resolved);
    outcome = {
      type: 'battle',
      attackerRemoved: !resolved.attackerSurvives,
      defenderRemoved: !resolved.defenderSurvives,
      ...(defender.role === 'flag' && !resolved.defenderSurvives
        ? { flagCaptured: defender.color }
        : {}),
      ...(revealed ? { revealedFlag: revealed } : {}),
    };
    if (defender.role === 'flag' && !resolved.defenderSurvives) {
      status = { type: 'finished', winner: attacker.color, reason: 'flag-captured' };
    }
  }
  if (status.type === 'playing') {
    const opponent = oppositeLuzhanqiColor(attacker.color);
    status = sideHasMobileForce(board, opponent)
      ? {
          type: 'playing',
          turn: opponent,
        }
      : { type: 'finished', winner: attacker.color, reason: 'mobile-force-eliminated' };
  }
  return {
    ...state,
    board,
    status,
    moveNumber: attacker.color === 'black' ? state.moveNumber + 1 : state.moveNumber,
    ply: state.ply + 1,
    revealedFlags,
    lastMove: { ...move, outcome },
  };
}

export function getLuzhanqiPlayerView(
  state: LuzhanqiGameState,
  perspective: LuzhanqiColor,
): LuzhanqiPlayerView {
  const board: LuzhanqiPlayerBoard = {};
  for (const square of ALL_LUZHANQI_SQUARES) {
    const piece = state.board[square];
    if (!piece) continue;
    const ownPiece = piece.color === perspective;
    const revealedFlag = piece.role === 'flag' && state.revealedFlags[piece.color] === square;
    board[square] =
      ownPiece || revealedFlag
        ? {
            color: piece.color,
            role: piece.role,
            known: true,
            ...(piece.immobile ? { immobile: true } : {}),
          }
        : { color: piece.color, known: false, ...(piece.immobile ? { immobile: true } : {}) };
  }
  return {
    id: state.id,
    perspective,
    board,
    legalMoves: getLuzhanqiLegalMoves(state, perspective),
    status: state.status,
    moveNumber: state.moveNumber,
    ply: state.ply,
    revealedFlags: state.revealedFlags,
    lastMove: state.lastMove,
  };
}

// Full-information postgame projection. Live clients must use getLuzhanqiPlayerView;
// this view intentionally reveals every rank for review/export after the reveal gate.
export function luzhanqiTruthView(state: LuzhanqiGameState): LuzhanqiPlayerView {
  const board: LuzhanqiPlayerBoard = {};
  for (const square of ALL_LUZHANQI_SQUARES) {
    const piece = state.board[square];
    if (!piece) continue;
    board[square] = {
      color: piece.color,
      role: piece.role,
      known: true,
      ...(piece.immobile ? { immobile: true } : {}),
    };
  }
  return {
    id: state.id,
    perspective: 'red',
    board,
    legalMoves: [],
    status: state.status,
    moveNumber: state.moveNumber,
    ply: state.ply,
    revealedFlags: state.revealedFlags,
    lastMove: state.lastMove,
  };
}

function redDefaultFormation(): LuzhanqiFormation {
  return {
    a1: 'mine',
    b1: 'flag',
    c1: 'mine',
    d1: 'marshal',
    e1: 'mine',
    a2: 'general',
    b2: 'major-general',
    c2: 'major-general',
    d2: 'brigadier-general',
    e2: 'brigadier-general',
    a3: 'colonel',
    c3: 'colonel',
    e3: 'major',
    a4: 'bomb',
    b4: 'major',
    d4: 'captain',
    e4: 'bomb',
    a5: 'captain',
    c5: 'captain',
    e5: 'lieutenant',
    a6: 'lieutenant',
    b6: 'lieutenant',
    c6: 'engineer',
    d6: 'engineer',
    e6: 'engineer',
  };
}

function boardFromFormations(
  formations: Partial<Record<LuzhanqiColor, LuzhanqiFormation>>,
): LuzhanqiBoard {
  const board: LuzhanqiBoard = {};
  for (const color of LUZHANQI_COLORS) {
    const formation = formations[color];
    if (!formation) continue;
    for (const [square, role] of Object.entries(formation) as Array<
      [LuzhanqiSquare, LuzhanqiPieceRole]
    >) {
      board[square] = { color, role };
    }
  }
  return board;
}

function mirrorRedFormation(red: LuzhanqiFormation): LuzhanqiFormation {
  const out: LuzhanqiFormation = {};
  for (const [square, role] of Object.entries(red) as Array<[LuzhanqiSquare, LuzhanqiPieceRole]>) {
    const { file, rank } = coordOf(square);
    out[pointOf(file, 14 - rank)] = role;
  }
  return out;
}

function emptyRoleCounts(): Record<LuzhanqiPieceRole, number> {
  return Object.fromEntries(
    (Object.keys(LUZHANQI_PIECE_COUNTS) as LuzhanqiPieceRole[]).map((role) => [role, 0]),
  ) as Record<LuzhanqiPieceRole, number>;
}

function isFrontRank(color: LuzhanqiColor, square: LuzhanqiSquare): boolean {
  const rank = Number(square.slice(1));
  return color === 'red' ? rank === 6 : rank === 8;
}

function isBackTwoRanks(color: LuzhanqiColor, square: LuzhanqiSquare): boolean {
  const rank = Number(square.slice(1));
  return color === 'red' ? rank <= 2 : rank >= 12;
}

function isMobilePiece(piece: LuzhanqiPiece): boolean {
  return piece.role !== 'flag' && piece.role !== 'mine' && piece.immobile !== true;
}

function maybeAddDestination(
  state: LuzhanqiGameState,
  piece: LuzhanqiPiece,
  dests: Set<LuzhanqiSquare>,
  to: LuzhanqiSquare,
): void {
  const target = state.board[to];
  if (!target) {
    dests.add(to);
    return;
  }
  if (target.color === piece.color || isLuzhanqiCamp(to)) return;
  dests.add(to);
}

function roadNeighbors(from: LuzhanqiSquare): LuzhanqiSquare[] {
  return ALL_LUZHANQI_SQUARES.filter((to) => ROAD_EDGES.has(edgeKey(from, to)));
}

function railNeighbors(point: LuzhanqiPoint): LuzhanqiSquare[] {
  return ALL_LUZHANQI_SQUARES.filter((to) => RAIL_EDGES.has(edgeKey(point, to)));
}

function railDestinations(
  state: LuzhanqiGameState,
  from: LuzhanqiSquare,
  engineer: boolean,
): LuzhanqiSquare[] {
  if (engineer) return engineerRailDestinations(state, from);
  const out = new Set<LuzhanqiSquare>();
  const start = coordOf(from);
  for (const [df, dr] of ORTHO) {
    let current: LuzhanqiPoint = from;
    let nextCoord = nextRailCoord(start.file, start.rank, df, dr);
    while (true) {
      const next = nextCoord ? playableSquareAt(nextCoord.file, nextCoord.rank) : null;
      if (!next || !RAIL_EDGES.has(edgeKey(current, next))) break;
      out.add(next);
      if (state.board[next]) break;
      current = next;
      const coord = coordOf(next);
      nextCoord = nextRailCoord(coord.file, coord.rank, df, dr);
    }
  }
  return [...out];
}

function engineerRailDestinations(
  state: LuzhanqiGameState,
  from: LuzhanqiSquare,
): LuzhanqiSquare[] {
  const out = new Set<LuzhanqiSquare>();
  const queue: LuzhanqiSquare[] = [from];
  const seen = new Set<LuzhanqiSquare>([from]);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const next of railNeighbors(current)) {
      if (seen.has(next)) continue;
      seen.add(next);
      out.add(next);
      if (!state.board[next]) queue.push(next);
    }
  }
  return [...out];
}

function coordOf(square: LuzhanqiSquare): { file: number; rank: number } {
  return { file: FILES.indexOf(square[0] as LuzhanqiFile), rank: Number(square.slice(1)) };
}

function playableSquareAt(file: number, rank: number): LuzhanqiSquare | null {
  if (file < 0 || file >= FILES.length) return null;
  if (!ALL_RANKS.includes(rank as (typeof ALL_RANKS)[number])) return null;
  return pointOf(file, rank);
}

function nextRailCoord(
  file: number,
  rank: number,
  df: number,
  dr: number,
): { file: number; rank: number } | null {
  if (dr === 1 && rank === 6) return { file: file + df, rank: 8 };
  if (dr === -1 && rank === 8) return { file: file + df, rank: 6 };
  return { file: file + df, rank: rank + dr };
}

function withHeadquartersLock(piece: LuzhanqiPiece, square: LuzhanqiSquare): LuzhanqiPiece {
  return isLuzhanqiHeadquarters(square) ? { ...piece, immobile: true } : piece;
}

function resolveBattle(
  attacker: LuzhanqiPiece,
  defender: LuzhanqiPiece,
): { attackerSurvives: boolean; defenderSurvives: boolean } {
  if (defender.role === 'flag') return { attackerSurvives: true, defenderSurvives: false };
  if (attacker.role === 'bomb' || defender.role === 'bomb') {
    return { attackerSurvives: false, defenderSurvives: false };
  }
  if (defender.role === 'mine') {
    if (attacker.role === 'engineer') return { attackerSurvives: true, defenderSurvives: false };
    return { attackerSurvives: false, defenderSurvives: true };
  }
  const attackerRank = RANK[attacker.role];
  const defenderRank = RANK[defender.role];
  if (attackerRank === undefined || defenderRank === undefined) {
    throw new Error(`unranked luzhanqi battle: ${attacker.role} vs ${defender.role}`);
  }
  if (attackerRank > defenderRank) return { attackerSurvives: true, defenderSurvives: false };
  if (attackerRank < defenderRank) return { attackerSurvives: false, defenderSurvives: true };
  return { attackerSurvives: false, defenderSurvives: false };
}

function applyMarshalReveals(
  board: LuzhanqiBoard,
  revealedFlags: Partial<Record<LuzhanqiColor, LuzhanqiSquare>>,
  attacker: LuzhanqiPiece,
  defender: LuzhanqiPiece,
  resolved: { attackerSurvives: boolean; defenderSurvives: boolean },
): { color: LuzhanqiColor; square: LuzhanqiSquare } | null {
  const lostMarshalColor =
    attacker.role === 'marshal' && !resolved.attackerSurvives
      ? attacker.color
      : defender.role === 'marshal' && !resolved.defenderSurvives
        ? defender.color
        : null;
  if (lostMarshalColor === null || revealedFlags[lostMarshalColor]) return null;
  const flagSquare = findFlagSquare(board, lostMarshalColor);
  if (!flagSquare) return null;
  revealedFlags[lostMarshalColor] = flagSquare;
  return { color: lostMarshalColor, square: flagSquare };
}

function findFlagSquare(board: LuzhanqiBoard, color: LuzhanqiColor): LuzhanqiSquare | null {
  for (const square of ALL_LUZHANQI_SQUARES) {
    const piece = board[square];
    if (piece?.color === color && piece.role === 'flag') return square;
  }
  return null;
}

function sideHasMobileForce(board: LuzhanqiBoard, color: LuzhanqiColor): boolean {
  return Object.values(board).some((piece) => piece?.color === color && isMobilePiece(piece));
}
