import type {
  BughouseBoardView,
  BughousePartnerRequest,
  BughousePartnerResponse,
  BughousePiece,
  BughouseReserves,
} from './bughouse-engine-protocol.js';
import { BUGHOUSE_PARTNER_PROTOCOL_VERSION } from './bughouse-engine-protocol.js';
import type { PieceRole, Square } from './types.js';

const startingBackRank: Array<[Square, Exclude<PieceRole, 'pawn'>]> = [
  ['a1', 'rook'],
  ['b1', 'knight'],
  ['c1', 'bishop'],
  ['d1', 'queen'],
  ['e1', 'king'],
  ['f1', 'bishop'],
  ['g1', 'knight'],
  ['h1', 'rook'],
] as const;

const emptyReserves: BughouseReserves = {
  'A:white': {},
  'A:black': {},
  'B:white': {},
  'B:black': {},
};

const fixtureBoardA: BughouseBoardView = {
  board: 'A',
  sideToMove: 'white',
  ply: 23,
  fullmoveNumber: 12,
  halfmoveClock: 0,
  pieces: [
    ...startingBackRank.map(([square, role]): [Square, BughousePiece] => [
      square,
      { color: 'white', role },
    ]),
    ['e8', { color: 'black', role: 'king' }],
    ['g8', { color: 'black', role: 'rook' }],
    ['f7', { color: 'black', role: 'pawn' }],
    ['g7', { color: 'black', role: 'pawn' }],
    ['h7', { color: 'black', role: 'pawn' }],
  ],
  castlingRights: { white: [], black: [] },
  enPassantSquare: null,
  lastAction: {
    id: 'A:black:move:g8-g7',
    kind: 'move',
    board: 'A',
    seat: 'A:black',
    move: { from: 'g8', to: 'g7' },
    uci: 'g8g7',
  },
  status: { type: 'playing' },
};

const fixtureBoardB: BughouseBoardView = {
  board: 'B',
  sideToMove: 'black',
  ply: 22,
  fullmoveNumber: 12,
  halfmoveClock: 1,
  pieces: [
    ['e1', { color: 'white', role: 'king' }],
    ['g1', { color: 'white', role: 'rook' }],
    ['e8', { color: 'black', role: 'king' }],
    ['d8', { color: 'black', role: 'queen' }],
    ['c5', { color: 'black', role: 'bishop' }],
    ['g4', { color: 'white', role: 'knight' }],
  ],
  castlingRights: { white: [], black: [] },
  enPassantSquare: null,
  lastAction: {
    id: 'B:white:move:g1-g4',
    kind: 'move',
    board: 'B',
    seat: 'B:white',
    move: { from: 'g1', to: 'g4' },
    uci: 'g1g4',
  },
  status: { type: 'playing' },
};

export const BUGHOUSE_PARTNER_REQUEST_FIXTURES = [
  {
    protocolVersion: BUGHOUSE_PARTNER_PROTOCOL_VERSION,
    gameSpecId: 'chess-bughouse',
    matchId: 'bughouse-fixture-need-piece',
    engineId: 'baseline-b2-team-heuristic',
    sessionId: 'bughouse-fixture-need-piece:A:white:baseline-b2-team-heuristic',
    seat: 'A:white',
    team: 'team-0',
    ply: 45,
    engineSeed: 19048121,
    boards: {
      A: fixtureBoardA,
      B: fixtureBoardB,
    },
    reserves: {
      ...emptyReserves,
      'A:white': { knight: 1, pawn: 2 },
      'B:black': { bishop: 1 },
    },
    clocks: {
      serverNowEpochMs: 1_782_029_600_000,
      boards: {
        A: {
          activeSeat: 'A:white',
          remainingMs: { white: 31_400, black: 42_300 },
          incrementMs: 2_000,
          runningSinceEpochMs: 1_782_029_598_250,
        },
        B: {
          activeSeat: 'B:black',
          remainingMs: { white: 36_900, black: 28_100 },
          incrementMs: 2_000,
          runningSinceEpochMs: 1_782_029_598_900,
        },
      },
    },
    legalActions: [
      {
        id: 'A:white:drop:knight-f6',
        kind: 'drop',
        board: 'A',
        seat: 'A:white',
        drop: { role: 'knight', to: 'f6' },
        san: 'N@f6+',
      },
      {
        id: 'A:white:move:d1-h5',
        kind: 'move',
        board: 'A',
        seat: 'A:white',
        move: { from: 'd1', to: 'h5' },
        uci: 'd1h5',
      },
    ],
    teamSignals: [
      {
        id: 'sig-need-knight-f6',
        kind: 'need-piece',
        from: 'B:black',
        to: 'A:white',
        createdAtPly: 42,
        urgency: 'high',
        role: 'knight',
        board: 'A',
        square: 'f6',
        expiresAtPly: 47,
      },
    ],
  },
  {
    protocolVersion: BUGHOUSE_PARTNER_PROTOCOL_VERSION,
    gameSpecId: 'chess-bughouse',
    matchId: 'bughouse-fixture-sit-for-piece',
    engineId: 'baseline-b2-team-heuristic',
    sessionId: 'bughouse-fixture-sit-for-piece:A:white:baseline-b2-team-heuristic',
    seat: 'A:white',
    team: 'team-0',
    ply: 67,
    engineSeed: 19048122,
    boards: {
      A: { ...fixtureBoardA, ply: 33, sideToMove: 'white' },
      B: { ...fixtureBoardB, ply: 34, sideToMove: 'black' },
    },
    reserves: emptyReserves,
    clocks: {
      serverNowEpochMs: 1_782_029_700_000,
      boards: {
        A: {
          activeSeat: 'A:white',
          remainingMs: { white: 18_200, black: 27_000 },
          incrementMs: 2_000,
          runningSinceEpochMs: 1_782_029_699_050,
        },
        B: {
          activeSeat: 'B:black',
          remainingMs: { white: 7_100, black: 41_000 },
          incrementMs: 2_000,
          runningSinceEpochMs: 1_782_029_699_300,
        },
      },
    },
    legalActions: [
      {
        id: 'A:white:move:d1-h5',
        kind: 'move',
        board: 'A',
        seat: 'A:white',
        move: { from: 'd1', to: 'h5' },
        uci: 'd1h5',
      },
      {
        id: 'A:white:move:g1-f3',
        kind: 'move',
        board: 'A',
        seat: 'A:white',
        move: { from: 'g1', to: 'f3' },
        uci: 'g1f3',
      },
    ],
    teamSignals: [
      {
        id: 'sig-sit-for-queen',
        kind: 'sit',
        from: 'B:black',
        to: 'A:white',
        createdAtPly: 64,
        urgency: 'high',
        role: 'queen',
        expiresAtPly: 69,
      },
    ],
  },
] as const satisfies readonly BughousePartnerRequest[];

export const BUGHOUSE_PARTNER_RESPONSE_FIXTURES = [
  {
    protocolVersion: BUGHOUSE_PARTNER_PROTOCOL_VERSION,
    matchId: 'bughouse-fixture-need-piece',
    sessionId: 'bughouse-fixture-need-piece:A:white:baseline-b2-team-heuristic',
    decision: { kind: 'play', actionId: 'A:white:drop:knight-f6' },
    signals: [
      {
        kind: 'have-piece',
        to: 'B:black',
        urgency: 'medium',
        role: 'bishop',
      },
    ],
    diagnostics: {
      policy: 'fixture-b2',
      partnerValueCentipawns: 650,
    },
  },
  {
    protocolVersion: BUGHOUSE_PARTNER_PROTOCOL_VERSION,
    matchId: 'bughouse-fixture-sit-for-piece',
    sessionId: 'bughouse-fixture-sit-for-piece:A:white:baseline-b2-team-heuristic',
    decision: {
      kind: 'wait',
      maxWaitMs: 1_500,
      reason: 'need-incoming-piece',
    },
    signals: [
      {
        kind: 'need-piece',
        to: 'B:black',
        urgency: 'high',
        role: 'queen',
        board: 'A',
        square: 'h5',
      },
    ],
    diagnostics: {
      policy: 'fixture-b2',
      expectedIncomingPiece: 'queen',
    },
  },
] as const satisfies readonly BughousePartnerResponse[];
