import {
  fogOfWarVariant,
  type Board,
  type GameState,
  type Move,
  type PlayerView,
  type Square,
} from '@bichess/game';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type * as cg from 'chessground/types';
import { boardFen, hiddenSquareClasses } from './board-ui.js';

const GITHUB_URL = 'https://github.com/brianhliou/bichess';
const SHOW_ENGINE_LAB_LINKS =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_SHOW_ENGINE_LAB_NAV === 'true';

type Uci = `${Square}${Square}`;

type TutorialStep = {
  teach: string;
  challenge: string;
  targets: Square[];
  afterTargets: Square[];
  accepted: Uci[];
  softFailures: Partial<Record<Uci, string>>;
  success: string;
};

type TutorialChapter = {
  id: string;
  title: string;
  lesson: string;
  goal: string;
  board: Board;
  castlingRights?: Square[];
  enPassantSquare?: Square;
  halfmoveClock?: number;
  moveNumber?: number;
  steps: TutorialStep[];
  reveal?: {
    scout: Square;
    revealed: Square;
    text: string;
  };
};

type ChapterStatus = 'ready' | 'success' | 'soft-failure';

type TutorialLesson = {
  title: string;
  icon: string;
};

type TutorialCategory = {
  title: string;
  lessons: TutorialLesson[];
};

const learnCategories: TutorialCategory[] = [
  {
    title: 'Chess pieces',
    lessons: [
      { title: 'The Rook', icon: '♜' },
      { title: 'The Bishop', icon: '♝' },
      { title: 'The Queen', icon: '♛' },
      { title: 'The King', icon: '♚' },
      { title: 'The Knight', icon: '♞' },
      { title: 'The Pawn', icon: '♟' },
    ],
  },
  {
    title: 'Fundamentals',
    lessons: [
      { title: 'Capture', icon: '✕' },
      { title: 'Protection', icon: '◇' },
      { title: 'Combat', icon: '⚔' },
      { title: 'Find The King', icon: '♔' },
      { title: 'Save The King', icon: '♚' },
      { title: 'Final Capture', icon: '⚑' },
    ],
  },
  {
    title: 'Intermediate',
    lessons: [
      { title: 'Board Setup', icon: '▦' },
      { title: 'Castling', icon: '⇄' },
      { title: 'En Passant', icon: '↗' },
      { title: 'Draws', icon: '=' },
    ],
  },
  {
    title: 'Advanced',
    lessons: [
      { title: 'Piece Value', icon: '$' },
      { title: 'Capture In Two', icon: '2' },
      { title: 'Scouting', icon: '?' },
    ],
  },
];

const chapters: TutorialChapter[] = [
  {
    id: 'rook-up-file',
    lesson: 'The Rook',
    title: 'Up The File',
    goal: 'Move the rook straight up to the marked square.',
    board: {
      b1: { color: 'white', role: 'king' },
      e2: { color: 'white', role: 'rook' },
    },
    steps: [
      {
        teach: 'Rooks move in straight lines. In Fog, the clear squares are the places your rook can move or see.',
        challenge: 'Bring the rook to e7.',
        targets: ['e7'],
        afterTargets: ['e3', 'e4', 'e5', 'e6', 'e7', 'e8'],
        accepted: ['e2e7'],
        softFailures: {},
        success: 'The rook moved straight up the file.',
      },
    ],
  },
  {
    id: 'rook-down-file',
    lesson: 'The Rook',
    title: 'Back Down',
    goal: 'Move the rook back down the same file.',
    board: {
      b1: { color: 'white', role: 'king' },
      e7: { color: 'white', role: 'rook' },
    },
    steps: [
      {
        teach: 'A rook can also move straight back through the fog when the file is clear.',
        challenge: 'Bring the rook to e2.',
        targets: ['e2'],
        afterTargets: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'],
        accepted: ['e7e2'],
        softFailures: {},
        success: 'The rook moved back down the file.',
      },
    ],
  },
  {
    id: 'rook-across-rank',
    lesson: 'The Rook',
    title: 'Across The Rank',
    goal: 'Move the rook sideways to the marked square.',
    board: {
      b1: { color: 'white', role: 'king' },
      b4: { color: 'white', role: 'rook' },
    },
    steps: [
      {
        teach: 'Rooks move sideways too. Files go up and down; ranks go left and right.',
        challenge: 'Slide the rook to g4.',
        targets: ['g4'],
        afterTargets: ['a4', 'b4', 'c4', 'd4', 'e4', 'f4', 'g4', 'h4'],
        accepted: ['b4g4'],
        softFailures: {},
        success: 'The rook crossed the rank in one straight move.',
      },
    ],
  },
  {
    id: 'rook-stop-before-blocker',
    lesson: 'The Rook',
    title: 'Stop Before The Blocker',
    goal: 'Move as far as the rook can go before its path is blocked.',
    board: {
      b1: { color: 'white', role: 'king' },
      e2: { color: 'white', role: 'rook' },
      e5: { color: 'white', role: 'knight' },
    },
    steps: [
      {
        teach: 'Rooks cannot jump over pieces. Your knight blocks the file.',
        challenge: 'Move the rook to the last clear square before the knight.',
        targets: ['e4'],
        afterTargets: ['e3', 'e4', 'e5'],
        accepted: ['e2e4'],
        softFailures: {
          e2e3: 'That is legal, but the rook can move one square farther before the blocker.',
        },
        success: 'The rook stopped before the blocker.',
      },
    ],
  },
  {
    id: 'rook-turn-corner',
    lesson: 'The Rook',
    title: 'Turn The Corner',
    goal: 'Use two straight rook moves to turn a corner.',
    board: {
      b1: { color: 'white', role: 'king' },
      a2: { color: 'white', role: 'rook' },
    },
    steps: [
      {
        teach: 'A rook cannot bend during one move. First, move straight up.',
        challenge: 'Move the rook to a6.',
        targets: ['a6'],
        afterTargets: ['a6'],
        accepted: ['a2a6'],
        softFailures: {
          a2f2: 'That is a straight rook move, but this path turns upward first.',
        },
        success: 'Good. Now the rook is lined up for the sideways move.',
      },
      {
        teach: 'Now turn the corner with a second straight move.',
        challenge: 'Move the rook to f6.',
        targets: ['f6'],
        afterTargets: ['a6', 'b6', 'c6', 'd6', 'e6', 'f6', 'g6', 'h6'],
        accepted: ['a6f6'],
        softFailures: {},
        success: 'The rook reached the corner target with two straight moves.',
      },
    ],
  },
  {
    id: 'rook-trail',
    lesson: 'The Rook',
    title: 'Rook Trail',
    goal: 'Follow a short trail of straight rook moves.',
    board: {
      b1: { color: 'white', role: 'king' },
      c2: { color: 'white', role: 'rook' },
    },
    steps: [
      {
        teach: 'Now collect several marked squares. Each move is still one straight line.',
        challenge: 'Move to c6.',
        targets: ['c6'],
        afterTargets: ['c6'],
        accepted: ['c2c6'],
        softFailures: {},
        success: 'First marker reached.',
      },
      {
        teach: 'Keep following the trail.',
        challenge: 'Move to h6.',
        targets: ['h6'],
        afterTargets: ['h6'],
        accepted: ['c6h6'],
        softFailures: {},
        success: 'Second marker reached.',
      },
      {
        teach: 'The rook can move down the file too.',
        challenge: 'Move to h3.',
        targets: ['h3'],
        afterTargets: ['h3'],
        accepted: ['h6h3'],
        softFailures: {},
        success: 'Third marker reached.',
      },
      {
        teach: 'Finish with one more sideways move.',
        challenge: 'Move to d3.',
        targets: ['d3'],
        afterTargets: ['c3', 'd3', 'e3', 'f3', 'g3', 'h3'],
        accepted: ['h3d3'],
        softFailures: {},
        success: 'The rook followed the whole trail through the fog.',
      },
    ],
  },
  {
    id: 'bishop-up-right',
    lesson: 'The Bishop',
    title: 'Up Right',
    goal: 'Move the bishop along a diagonal to the marked square.',
    board: {
      e1: { color: 'white', role: 'king' },
      c1: { color: 'white', role: 'bishop' },
    },
    steps: [
      {
        teach: 'Bishops move diagonally. This bishop can climb through the fog up and right.',
        challenge: 'Move the bishop to g5.',
        targets: ['g5'],
        afterTargets: ['d2', 'e3', 'f4', 'g5', 'h6'],
        accepted: ['c1g5'],
        softFailures: {},
        success: 'The bishop moved up the diagonal.',
      },
    ],
  },
  {
    id: 'bishop-up-left',
    lesson: 'The Bishop',
    title: 'Up Left',
    goal: 'Move the bishop along the other rising diagonal.',
    board: {
      e1: { color: 'white', role: 'king' },
      f1: { color: 'white', role: 'bishop' },
    },
    steps: [
      {
        teach: 'A bishop can also move up and left when that diagonal is clear.',
        challenge: 'Move the bishop to b5.',
        targets: ['b5'],
        afterTargets: ['a6', 'b5', 'c4', 'd3', 'e2'],
        accepted: ['f1b5'],
        softFailures: {},
        success: 'The bishop crossed the board on a diagonal.',
      },
    ],
  },
  {
    id: 'bishop-back-down',
    lesson: 'The Bishop',
    title: 'Back Down',
    goal: 'Move the bishop back down the same diagonal.',
    board: {
      e1: { color: 'white', role: 'king' },
      g5: { color: 'white', role: 'bishop' },
    },
    steps: [
      {
        teach: 'Bishops can move backward on diagonals too.',
        challenge: 'Bring the bishop back to c1.',
        targets: ['c1'],
        afterTargets: ['c1', 'd2', 'e3', 'f4', 'h6'],
        accepted: ['g5c1'],
        softFailures: {},
        success: 'The bishop moved back down the diagonal.',
      },
    ],
  },
  {
    id: 'bishop-stop-before-blocker',
    lesson: 'The Bishop',
    title: 'Stop Before The Blocker',
    goal: 'Move as far as the bishop can go before its path is blocked.',
    board: {
      e1: { color: 'white', role: 'king' },
      c1: { color: 'white', role: 'bishop' },
      f4: { color: 'white', role: 'knight' },
    },
    steps: [
      {
        teach: 'Bishops cannot jump over pieces. Your knight blocks this diagonal.',
        challenge: 'Move the bishop to the last clear square before the knight.',
        targets: ['e3'],
        afterTargets: ['d2', 'e3', 'f4'],
        accepted: ['c1e3'],
        softFailures: {
          c1d2: 'That is legal, but the bishop can move one square farther before the blocker.',
        },
        success: 'The bishop stopped before the blocker.',
      },
    ],
  },
  {
    id: 'bishop-change-diagonal',
    lesson: 'The Bishop',
    title: 'Change Diagonals',
    goal: 'Use two bishop moves to reach a new diagonal.',
    board: {
      e1: { color: 'white', role: 'king' },
      b2: { color: 'white', role: 'bishop' },
    },
    steps: [
      {
        teach: 'A bishop cannot turn during one move. First, move along this diagonal.',
        challenge: 'Move the bishop to e5.',
        targets: ['e5'],
        afterTargets: ['e5'],
        accepted: ['b2e5'],
        softFailures: {},
        success: 'Good. From e5 the bishop has a new diagonal.',
      },
      {
        teach: 'Now use the new diagonal.',
        challenge: 'Move the bishop to b8.',
        targets: ['b8'],
        afterTargets: ['b8', 'c7', 'd6', 'e5', 'f4', 'g3', 'h2'],
        accepted: ['e5b8'],
        softFailures: {},
        success: 'The bishop reached the new diagonal in two moves.',
      },
    ],
  },
  {
    id: 'bishop-trail',
    lesson: 'The Bishop',
    title: 'Bishop Trail',
    goal: 'Follow a short trail of diagonal bishop moves.',
    board: {
      e1: { color: 'white', role: 'king' },
      d2: { color: 'white', role: 'bishop' },
    },
    steps: [
      {
        teach: 'Now collect several markers. Every bishop move stays diagonal.',
        challenge: 'Move to h6.',
        targets: ['h6'],
        afterTargets: ['h6'],
        accepted: ['d2h6'],
        softFailures: {},
        success: 'First marker reached.',
      },
      {
        teach: 'Keep following the diagonal trail.',
        challenge: 'Move to e3.',
        targets: ['e3'],
        afterTargets: ['e3'],
        accepted: ['h6e3'],
        softFailures: {},
        success: 'Second marker reached.',
      },
      {
        teach: 'Turn onto another diagonal.',
        challenge: 'Move to b6.',
        targets: ['b6'],
        afterTargets: ['b6'],
        accepted: ['e3b6'],
        softFailures: {},
        success: 'Third marker reached.',
      },
      {
        teach: 'Finish with one more diagonal move.',
        challenge: 'Move to d8.',
        targets: ['d8'],
        afterTargets: ['b6', 'c7', 'd8'],
        accepted: ['b6d8'],
        softFailures: {},
        success: 'The bishop followed the whole trail through the fog.',
      },
    ],
  },
  {
    id: 'queen-up-file',
    lesson: 'The Queen',
    title: 'Up The File',
    goal: 'Move the queen straight up like a rook.',
    board: {
      b1: { color: 'white', role: 'king' },
      d2: { color: 'white', role: 'queen' },
    },
    steps: [
      {
        teach: 'The queen can move like a rook. Start with a straight file move.',
        challenge: 'Move the queen to d7.',
        targets: ['d7'],
        afterTargets: ['d3', 'd4', 'd5', 'd6', 'd7', 'd8'],
        accepted: ['d2d7'],
        softFailures: {},
        success: 'The queen moved straight up the file.',
      },
    ],
  },
  {
    id: 'queen-across-rank',
    lesson: 'The Queen',
    title: 'Across The Rank',
    goal: 'Move the queen sideways like a rook.',
    board: {
      b1: { color: 'white', role: 'king' },
      c4: { color: 'white', role: 'queen' },
    },
    steps: [
      {
        teach: 'The queen can also slide left and right across a rank.',
        challenge: 'Move the queen to h4.',
        targets: ['h4'],
        afterTargets: ['a4', 'b4', 'c4', 'd4', 'e4', 'f4', 'g4', 'h4'],
        accepted: ['c4h4'],
        softFailures: {},
        success: 'The queen crossed the rank.',
      },
    ],
  },
  {
    id: 'queen-diagonal',
    lesson: 'The Queen',
    title: 'Diagonal Line',
    goal: 'Move the queen diagonally like a bishop.',
    board: {
      e1: { color: 'white', role: 'king' },
      d1: { color: 'white', role: 'queen' },
    },
    steps: [
      {
        teach: 'The queen can move like a bishop too. This time, use the diagonal.',
        challenge: 'Move the queen to h5.',
        targets: ['h5'],
        afterTargets: ['e2', 'f3', 'g4', 'h5'],
        accepted: ['d1h5'],
        softFailures: {},
        success: 'The queen moved on the diagonal.',
      },
    ],
  },
  {
    id: 'queen-choose-line',
    lesson: 'The Queen',
    title: 'Choose The Line',
    goal: 'Choose the queen line that reaches the marked target.',
    board: {
      b1: { color: 'white', role: 'king' },
      d4: { color: 'white', role: 'queen' },
    },
    steps: [
      {
        teach: 'The queen has straight and diagonal lines. Follow the target the lesson marks.',
        challenge: 'Move the queen to h8.',
        targets: ['h8'],
        afterTargets: ['e5', 'f6', 'g7', 'h8'],
        accepted: ['d4h8'],
        softFailures: {
          d4h4: 'That is a legal queen move, but this target is on the diagonal.',
          d4d8: 'That is a legal queen move, but this target is not on the file.',
        },
        success: 'The queen chose the diagonal line.',
      },
    ],
  },
  {
    id: 'queen-stop-before-blocker',
    lesson: 'The Queen',
    title: 'Stop Before The Blocker',
    goal: 'Move as far as the queen can go before a friendly blocker.',
    board: {
      b1: { color: 'white', role: 'king' },
      d2: { color: 'white', role: 'queen' },
      d6: { color: 'white', role: 'bishop' },
    },
    steps: [
      {
        teach: 'Even a queen cannot jump over pieces. Your bishop blocks the file.',
        challenge: 'Move the queen to the last clear square before the bishop.',
        targets: ['d5'],
        afterTargets: ['d3', 'd4', 'd5', 'd6'],
        accepted: ['d2d5'],
        softFailures: {
          d2d4: 'That is legal, but the queen can move one square farther before the blocker.',
        },
        success: 'The queen stopped before the blocker.',
      },
    ],
  },
  {
    id: 'queen-lantern-trail',
    lesson: 'The Queen',
    title: 'Queen Lantern Trail',
    goal: 'Follow a trail that mixes straight and diagonal queen moves.',
    board: {
      b1: { color: 'white', role: 'king' },
      d1: { color: 'white', role: 'queen' },
    },
    steps: [
      {
        teach: 'The queen can follow a trail through fog by mixing her lines.',
        challenge: 'Move to d5.',
        targets: ['d5'],
        afterTargets: ['d5'],
        accepted: ['d1d5'],
        softFailures: {},
        success: 'First marker reached.',
      },
      {
        teach: 'The next marker appears on a rank.',
        challenge: 'Move to h5.',
        targets: ['h5'],
        afterTargets: ['h5'],
        accepted: ['d5h5'],
        softFailures: {},
        success: 'Second marker reached.',
      },
      {
        teach: 'Now use a diagonal.',
        challenge: 'Move to e8.',
        targets: ['e8'],
        afterTargets: ['e8'],
        accepted: ['h5e8'],
        softFailures: {},
        success: 'Third marker reached.',
      },
      {
        teach: 'Finish with a long diagonal back through the fog.',
        challenge: 'Move to b5.',
        targets: ['b5'],
        afterTargets: ['b5', 'c6', 'd7', 'e8'],
        accepted: ['e8b5'],
        softFailures: {},
        success: 'The queen followed the whole lantern trail.',
      },
    ],
  },
  {
    id: 'king-one-step-up',
    lesson: 'The King',
    title: 'One Step Up',
    goal: 'Move the king one square forward.',
    board: {
      e2: { color: 'white', role: 'king' },
    },
    steps: [
      {
        teach: 'The king moves one square at a time. Start with one step up.',
        challenge: 'Move the king to e3.',
        targets: ['e3'],
        afterTargets: ['d2', 'd3', 'd4', 'e2', 'e3', 'e4', 'f2', 'f3', 'f4'],
        accepted: ['e2e3'],
        softFailures: {},
        success: 'The king moved one square up.',
      },
    ],
  },
  {
    id: 'king-side-step',
    lesson: 'The King',
    title: 'Side Step',
    goal: 'Move the king one square sideways.',
    board: {
      d4: { color: 'white', role: 'king' },
    },
    steps: [
      {
        teach: 'The king can step sideways too, but still only one square.',
        challenge: 'Move the king to e4.',
        targets: ['e4'],
        afterTargets: ['d3', 'd4', 'd5', 'e3', 'e4', 'e5', 'f3', 'f4', 'f5'],
        accepted: ['d4e4'],
        softFailures: {},
        success: 'The king made a sideways step.',
      },
    ],
  },
  {
    id: 'king-diagonal-step',
    lesson: 'The King',
    title: 'Diagonal Step',
    goal: 'Move the king one square diagonally.',
    board: {
      d3: { color: 'white', role: 'king' },
    },
    steps: [
      {
        teach: 'The king can also step diagonally.',
        challenge: 'Move the king to e4.',
        targets: ['e4'],
        afterTargets: ['d3', 'd4', 'd5', 'e3', 'e4', 'e5', 'f3', 'f4', 'f5'],
        accepted: ['d3e4'],
        softFailures: {},
        success: 'The king moved one square diagonally.',
      },
    ],
  },
  {
    id: 'king-corner',
    lesson: 'The King',
    title: 'From The Corner',
    goal: 'Move the king out of the corner.',
    board: {
      a1: { color: 'white', role: 'king' },
    },
    steps: [
      {
        teach: 'A king on the corner has fewer places to go.',
        challenge: 'Move the king to b2.',
        targets: ['b2'],
        afterTargets: ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3'],
        accepted: ['a1b2'],
        softFailures: {
          a1a2: 'That is legal, but the marker is on the diagonal.',
          a1b1: 'That is legal, but the marker is on the diagonal.',
        },
        success: 'The king stepped out of the corner.',
      },
    ],
  },
  {
    id: 'king-occupied-square',
    lesson: 'The King',
    title: 'Occupied Square',
    goal: 'Move the king around a friendly piece.',
    board: {
      e2: { color: 'white', role: 'king' },
      e3: { color: 'white', role: 'rook' },
    },
    steps: [
      {
        teach: 'The king cannot move onto a square occupied by your own piece.',
        challenge: 'Move the king to d3 instead.',
        targets: ['d3'],
        afterTargets: ['c2', 'c3', 'c4', 'd2', 'd3', 'd4', 'e2', 'e3', 'e4'],
        accepted: ['e2d3'],
        softFailures: {
          e2d2: 'That is legal, but the marker is diagonally around the rook.',
          e2f3: 'That is legal, but the marker is on the other side.',
        },
        success: 'The king moved around the occupied square.',
      },
    ],
  },
  {
    id: 'king-walk',
    lesson: 'The King',
    title: 'King Walk',
    goal: 'Follow a short trail of one-square king moves.',
    board: {
      e1: { color: 'white', role: 'king' },
    },
    steps: [
      {
        teach: 'Now follow a small path. Every king move is one square.',
        challenge: 'Move to e2.',
        targets: ['e2'],
        afterTargets: ['e2'],
        accepted: ['e1e2'],
        softFailures: {},
        success: 'First step reached.',
      },
      {
        teach: 'Keep walking through the fog.',
        challenge: 'Move to f3.',
        targets: ['f3'],
        afterTargets: ['f3'],
        accepted: ['e2f3'],
        softFailures: {},
        success: 'Second step reached.',
      },
      {
        teach: 'The king keeps moving one square at a time.',
        challenge: 'Move to f4.',
        targets: ['f4'],
        afterTargets: ['f4'],
        accepted: ['f3f4'],
        softFailures: {},
        success: 'Third step reached.',
      },
      {
        teach: 'Finish with one more step.',
        challenge: 'Move to e5.',
        targets: ['e5'],
        afterTargets: ['d4', 'd5', 'd6', 'e4', 'e5', 'e6', 'f4', 'f5', 'f6'],
        accepted: ['f4e5'],
        softFailures: {},
        success: 'The king completed the walk.',
      },
    ],
  },
  {
    id: 'knight-first-l',
    lesson: 'The Knight',
    title: 'First L',
    goal: 'Move the knight in an L shape.',
    board: {
      e1: { color: 'white', role: 'king' },
      b1: { color: 'white', role: 'knight' },
    },
    steps: [
      {
        teach: 'Knights move in an L shape: two squares one way, then one square sideways.',
        challenge: 'Move the knight to c3.',
        targets: ['c3'],
        afterTargets: ['a2', 'a4', 'b5', 'd1', 'e2', 'e4'],
        accepted: ['b1c3'],
        softFailures: {
          b1a3: 'That is a legal knight jump, but this marker is on c3.',
          b1d2: 'That is a legal knight jump, but this marker is on c3.',
        },
        success: 'The knight made its first L-shaped jump.',
      },
    ],
  },
  {
    id: 'knight-other-l',
    lesson: 'The Knight',
    title: 'Other L',
    goal: 'Move the knight to a different L-shaped target.',
    board: {
      e1: { color: 'white', role: 'king' },
      d4: { color: 'white', role: 'knight' },
    },
    steps: [
      {
        teach: 'A knight has several L-shaped jumps from the center.',
        challenge: 'Move the knight to f5.',
        targets: ['f5'],
        afterTargets: ['d4', 'd6', 'e3', 'g3', 'h4', 'h6'],
        accepted: ['d4f5'],
        softFailures: {
          d4f3: 'That is a legal knight jump, but the marker is on f5.',
          d4b5: 'That is a legal knight jump, but the marker is on the other side.',
        },
        success: 'The knight found another L-shaped jump.',
      },
    ],
  },
  {
    id: 'knight-jump-wall',
    lesson: 'The Knight',
    title: 'Jump The Wall',
    goal: 'Jump the knight over nearby friendly pieces.',
    board: {
      e1: { color: 'white', role: 'king' },
      b1: { color: 'white', role: 'knight' },
      b2: { color: 'white', role: 'pawn' },
      c2: { color: 'white', role: 'pawn' },
    },
    steps: [
      {
        teach: 'Knights jump. Nearby pieces do not block the L-shaped move.',
        challenge: 'Jump the knight to c3.',
        targets: ['c3'],
        afterTargets: ['a2', 'a4', 'b1', 'b5', 'd1', 'e2', 'e4'],
        accepted: ['b1c3'],
        softFailures: {
          b1a3: 'That is legal too, but this marker is on c3.',
          b1d2: 'That is legal too, but this marker is on c3.',
        },
        success: 'The knight jumped over the nearby pieces.',
      },
    ],
  },
  {
    id: 'knight-from-edge',
    lesson: 'The Knight',
    title: 'From The Edge',
    goal: 'Move a knight from the edge of the board.',
    board: {
      e1: { color: 'white', role: 'king' },
      a1: { color: 'white', role: 'knight' },
    },
    steps: [
      {
        teach: 'A knight on the edge has fewer jumps.',
        challenge: 'Move the knight to b3.',
        targets: ['b3'],
        afterTargets: ['a1', 'c1', 'd2', 'd4'],
        accepted: ['a1b3'],
        softFailures: {
          a1c2: 'That is legal, but the marker is on b3.',
        },
        success: 'The knight jumped out from the edge.',
      },
    ],
  },
  {
    id: 'knight-choose-pocket',
    lesson: 'The Knight',
    title: 'Choose The Pocket',
    goal: 'Choose the knight jump that reaches the marked pocket.',
    board: {
      g1: { color: 'white', role: 'king' },
      e4: { color: 'white', role: 'knight' },
    },
    steps: [
      {
        teach: 'Knights land in pockets. Pick the pocket with the marker.',
        challenge: 'Move the knight to d6.',
        targets: ['d6'],
        afterTargets: ['b5', 'b7', 'c4', 'e4', 'f5', 'f7'],
        accepted: ['e4d6'],
        softFailures: {
          e4f6: 'That is a legal pocket, but the marker is on d6.',
          e4c5: 'That is a legal pocket, but the marker is higher up.',
        },
        success: 'The knight chose the marked pocket.',
      },
    ],
  },
  {
    id: 'knight-pocket-trail',
    lesson: 'The Knight',
    title: 'Pocket Trail',
    goal: 'Follow a short trail of knight jumps.',
    board: {
      e1: { color: 'white', role: 'king' },
      b1: { color: 'white', role: 'knight' },
    },
    steps: [
      {
        teach: 'Now follow several pockets through the fog.',
        challenge: 'Move to c3.',
        targets: ['c3'],
        afterTargets: ['c3'],
        accepted: ['b1c3'],
        softFailures: {},
        success: 'First pocket reached.',
      },
      {
        teach: 'The next marker appears after the jump.',
        challenge: 'Move to e4.',
        targets: ['e4'],
        afterTargets: ['e4'],
        accepted: ['c3e4'],
        softFailures: {},
        success: 'Second pocket reached.',
      },
      {
        teach: 'Keep jumping in L shapes.',
        challenge: 'Move to f6.',
        targets: ['f6'],
        afterTargets: ['f6'],
        accepted: ['e4f6'],
        softFailures: {},
        success: 'Third pocket reached.',
      },
      {
        teach: 'Finish with one more knight jump.',
        challenge: 'Move to h5.',
        targets: ['h5'],
        afterTargets: ['f4', 'f6', 'g3', 'h5'],
        accepted: ['f6h5'],
        softFailures: {},
        success: 'The knight followed the whole pocket trail.',
      },
    ],
  },
  {
    id: 'pawn-one-step',
    lesson: 'The Pawn',
    title: 'One Step',
    goal: 'Move the pawn one square forward.',
    board: {
      e1: { color: 'white', role: 'king' },
      e3: { color: 'white', role: 'pawn' },
    },
    steps: [
      {
        teach: 'Pawns move forward. White pawns move toward higher ranks.',
        challenge: 'Move the pawn to e4.',
        targets: ['e4'],
        afterTargets: ['e5'],
        accepted: ['e3e4'],
        softFailures: {},
        success: 'The pawn moved one square forward.',
      },
    ],
  },
  {
    id: 'pawn-first-double',
    lesson: 'The Pawn',
    title: 'First Double',
    goal: 'Move the pawn two squares from its starting rank.',
    board: {
      e1: { color: 'white', role: 'king' },
      d2: { color: 'white', role: 'pawn' },
    },
    steps: [
      {
        teach: 'From its starting rank, a pawn may move one or two squares if the path is clear.',
        challenge: 'Move the pawn to d4.',
        targets: ['d4'],
        afterTargets: ['d5'],
        accepted: ['d2d4'],
        softFailures: {
          d2d3: 'That is legal, but this marker asks for the first-move double step.',
        },
        success: 'The pawn used its first double step.',
      },
    ],
  },
  {
    id: 'pawn-after-first',
    lesson: 'The Pawn',
    title: 'After The First Move',
    goal: 'Move a pawn that is no longer on its starting rank.',
    board: {
      e1: { color: 'white', role: 'king' },
      d4: { color: 'white', role: 'pawn' },
    },
    steps: [
      {
        teach: 'After a pawn has moved, it goes one square at a time.',
        challenge: 'Move the pawn to d5.',
        targets: ['d5'],
        afterTargets: ['d6'],
        accepted: ['d4d5'],
        softFailures: {},
        success: 'The pawn moved one square after its first move.',
      },
    ],
  },
  {
    id: 'pawn-blocked',
    lesson: 'The Pawn',
    title: 'Blocked Pawn',
    goal: 'Move the unblocked pawn, because the other pawn cannot move.',
    board: {
      e1: { color: 'white', role: 'king' },
      d3: { color: 'white', role: 'pawn' },
      d4: { color: 'white', role: 'bishop' },
      f3: { color: 'white', role: 'pawn' },
    },
    steps: [
      {
        teach: 'A pawn cannot move forward into an occupied square.',
        challenge: 'The d-pawn is blocked. Move the f-pawn to f4.',
        targets: ['f4'],
        afterTargets: ['f5'],
        accepted: ['f3f4'],
        softFailures: {},
        success: 'The unblocked pawn moved forward.',
      },
    ],
  },
  {
    id: 'pawn-no-backward',
    lesson: 'The Pawn',
    title: 'No Backward',
    goal: 'Continue forward; pawns do not move backward.',
    board: {
      e1: { color: 'white', role: 'king' },
      e5: { color: 'white', role: 'pawn' },
    },
    steps: [
      {
        teach: 'Pawns do not move backward. They keep moving toward promotion.',
        challenge: 'Move the pawn to e6.',
        targets: ['e6'],
        afterTargets: ['e7'],
        accepted: ['e5e6'],
        softFailures: {},
        success: 'The pawn kept moving forward.',
      },
    ],
  },
  {
    id: 'pawn-forward-trail',
    lesson: 'The Pawn',
    title: 'Forward Trail',
    goal: 'Follow a short trail of forward pawn moves.',
    board: {
      e1: { color: 'white', role: 'king' },
      b2: { color: 'white', role: 'pawn' },
    },
    steps: [
      {
        teach: 'Finish with a simple pawn path. Start with the double step.',
        challenge: 'Move to b4.',
        targets: ['b4'],
        afterTargets: ['b4'],
        accepted: ['b2b4'],
        softFailures: {
          b2b3: 'That is legal, but this trail starts with the double step.',
        },
        success: 'First marker reached.',
      },
      {
        teach: 'After the double step, move one square at a time.',
        challenge: 'Move to b5.',
        targets: ['b5'],
        afterTargets: ['b5'],
        accepted: ['b4b5'],
        softFailures: {},
        success: 'Second marker reached.',
      },
      {
        teach: 'Keep moving forward.',
        challenge: 'Move to b6.',
        targets: ['b6'],
        afterTargets: ['b6'],
        accepted: ['b5b6'],
        softFailures: {},
        success: 'Third marker reached.',
      },
      {
        teach: 'One more forward step.',
        challenge: 'Move to b7.',
        targets: ['b7'],
        afterTargets: ['b7', 'b8'],
        accepted: ['b6b7'],
        softFailures: {},
        success: 'The pawn followed the forward trail.',
      },
    ],
  },
  {
    id: 'capture-rook-contact',
    lesson: 'Capture',
    title: 'First Contact',
    goal: 'Capture the visible enemy piece with a rook.',
    board: {
      b1: { color: 'white', role: 'king' },
      e2: { color: 'white', role: 'rook' },
      e6: { color: 'black', role: 'pawn' },
    },
    steps: [
      {
        teach: 'Enemy pieces appear when one of your pieces can see them. A rook can capture a visible enemy on its line.',
        challenge: 'Capture the pawn on e6.',
        targets: ['e6'],
        afterTargets: ['e3', 'e4', 'e5', 'e6', 'e7', 'e8'],
        accepted: ['e2e6'],
        softFailures: {
          e2e5: 'That is legal, but the visible pawn is one square farther up the file.',
        },
        success: 'The rook captured the visible pawn.',
      },
    ],
  },
  {
    id: 'capture-bishop-contact',
    lesson: 'Capture',
    title: 'Diagonal Contact',
    goal: 'Capture on a diagonal with a bishop.',
    board: {
      e1: { color: 'white', role: 'king' },
      c1: { color: 'white', role: 'bishop' },
      f4: { color: 'black', role: 'knight' },
    },
    steps: [
      {
        teach: 'A bishop captures the same way it moves: along a clear diagonal.',
        challenge: 'Capture the knight on f4.',
        targets: ['f4'],
        afterTargets: ['d2', 'e3', 'f4', 'g5', 'h6'],
        accepted: ['c1f4'],
        softFailures: {
          c1e3: 'That is legal, but the enemy knight is still visible on the next diagonal square.',
        },
        success: 'The bishop captured along the diagonal.',
      },
    ],
  },
  {
    id: 'capture-knight-pocket',
    lesson: 'Capture',
    title: 'Pocket Capture',
    goal: 'Use a knight jump to capture a visible enemy.',
    board: {
      e1: { color: 'white', role: 'king' },
      c3: { color: 'white', role: 'knight' },
      d5: { color: 'black', role: 'bishop' },
    },
    steps: [
      {
        teach: 'A knight captures only on its landing pockets. It does not need a clear path between squares.',
        challenge: 'Capture the bishop on d5.',
        targets: ['d5'],
        afterTargets: ['b4', 'b6', 'c3', 'f4', 'f6'],
        accepted: ['c3d5'],
        softFailures: {
          c3b5: 'That is a legal knight jump, but it lands beside the enemy instead of on it.',
        },
        success: 'The knight captured from a pocket.',
      },
    ],
  },
  {
    id: 'capture-pawn-diagonal',
    lesson: 'Capture',
    title: 'Pawn Takes Diagonal',
    goal: 'Capture diagonally with a pawn.',
    board: {
      e1: { color: 'white', role: 'king' },
      d4: { color: 'white', role: 'pawn' },
      e5: { color: 'black', role: 'knight' },
    },
    steps: [
      {
        teach: 'Pawns move forward, but they capture diagonally when an enemy is there.',
        challenge: 'Capture the knight on e5.',
        targets: ['e5'],
        afterTargets: ['e5', 'e6'],
        accepted: ['d4e5'],
        softFailures: {
          d4d5: 'That is the pawn move, but captures go diagonally.',
        },
        success: 'The pawn captured diagonally.',
      },
    ],
  },
  {
    id: 'capture-queen-choice',
    lesson: 'Capture',
    title: 'Choose The Capture',
    goal: 'Choose the queen line that captures the marked enemy.',
    board: {
      b1: { color: 'white', role: 'king' },
      d3: { color: 'white', role: 'queen' },
      d7: { color: 'black', role: 'rook' },
      h3: { color: 'black', role: 'bishop' },
    },
    steps: [
      {
        teach: 'The queen may see more than one enemy. Follow the marker and capture the requested piece.',
        challenge: 'Capture the rook on d7.',
        targets: ['d7'],
        afterTargets: ['d4', 'd5', 'd6', 'd7', 'd8'],
        accepted: ['d3d7'],
        softFailures: {
          d3h3: 'That captures a bishop, but the marked target is the rook on d7.',
        },
        success: 'The queen chose the marked capture.',
      },
    ],
  },
  {
    id: 'capture-king-direct',
    lesson: 'Capture',
    title: 'Take The King',
    goal: 'Capture the enemy king directly.',
    board: {
      b1: { color: 'white', role: 'king' },
      e2: { color: 'white', role: 'rook' },
      e8: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach: 'In Fog of War chess there is no check warning. If the king is visible and reachable, you capture it.',
        challenge: 'Capture the king on e8.',
        targets: ['e8'],
        afterTargets: ['e3', 'e4', 'e5', 'e6', 'e7', 'e8'],
        accepted: ['e2e8'],
        softFailures: {
          e2e7: 'That is legal, but the king is visible one square farther away.',
        },
        success: 'The rook captured the king. That is how Fog games end.',
      },
    ],
  },
  {
    id: 'protection-rook-file',
    lesson: 'Protection',
    title: 'Guard The File',
    goal: 'Move the rook so it protects the pawn through the fog.',
    board: {
      b1: { color: 'white', role: 'king' },
      e1: { color: 'white', role: 'rook' },
      e5: { color: 'white', role: 'pawn' },
    },
    steps: [
      {
        teach: 'Protection uses the same lines as movement. A rook protects a friendly piece when it sees it on a clear file or rank.',
        challenge: 'Move the rook to e3 so it guards the pawn on e5.',
        targets: ['e3'],
        afterTargets: ['e3', 'e4', 'e5'],
        accepted: ['e1e3'],
        softFailures: {
          e1e2: 'That is legal, but e3 makes the guard line easier to see.',
        },
        success: 'The rook guards the pawn up the file.',
      },
    ],
  },
  {
    id: 'protection-bishop-diagonal',
    lesson: 'Protection',
    title: 'Guard The Diagonal',
    goal: 'Move the bishop so it protects a friendly pawn diagonally.',
    board: {
      e1: { color: 'white', role: 'king' },
      c1: { color: 'white', role: 'bishop' },
      f4: { color: 'white', role: 'pawn' },
    },
    steps: [
      {
        teach: 'Bishops protect on diagonals. The protected piece can be friendly; the bishop stops when it reaches it.',
        challenge: 'Move the bishop to e3 to guard the pawn on f4.',
        targets: ['e3'],
        afterTargets: ['d2', 'e3', 'f4'],
        accepted: ['c1e3'],
        softFailures: {
          c1d2: 'That is diagonal, but e3 puts the bishop next to the pawn it is guarding.',
        },
        success: 'The bishop guards the pawn on the diagonal.',
      },
    ],
  },
  {
    id: 'protection-knight-pocket',
    lesson: 'Protection',
    title: 'Guard A Pocket',
    goal: 'Use a knight jump to protect a friendly pawn.',
    board: {
      e1: { color: 'white', role: 'king' },
      b1: { color: 'white', role: 'knight' },
      e4: { color: 'white', role: 'pawn' },
    },
    steps: [
      {
        teach: 'Knights protect the same landing pockets they can capture. They do not need a clear path.',
        challenge: 'Jump the knight to c3 so it guards the pawn on e4.',
        targets: ['c3'],
        afterTargets: ['c3', 'e4'],
        accepted: ['b1c3'],
        softFailures: {
          b1a3: 'That is a legal knight pocket, but it does not guard the pawn on e4.',
          b1d2: 'That is legal too, but c3 is the pocket that guards e4.',
        },
        success: 'The knight guards the pawn from a pocket.',
      },
    ],
  },
  {
    id: 'protection-king-close',
    lesson: 'Protection',
    title: 'King Guard',
    goal: 'Move the king close enough to protect a friendly pawn.',
    board: {
      e2: { color: 'white', role: 'king' },
      f4: { color: 'white', role: 'pawn' },
    },
    steps: [
      {
        teach: 'The king protects nearby pieces one square away. Its guard zone is small but important.',
        challenge: 'Move the king to e3 so it guards the pawn on f4.',
        targets: ['e3'],
        afterTargets: ['e3', 'f4'],
        accepted: ['e2e3'],
        softFailures: {
          e2d3: 'That is a legal king step, but it is too far from the pawn on f4.',
        },
        success: 'The king guards the nearby pawn.',
      },
    ],
  },
  {
    id: 'protection-before-material',
    lesson: 'Protection',
    title: 'Protect Before Material',
    goal: 'Choose the protecting queen move instead of the tempting capture.',
    board: {
      b1: { color: 'white', role: 'king' },
      d1: { color: 'white', role: 'queen' },
      d5: { color: 'white', role: 'pawn' },
      h5: { color: 'black', role: 'bishop' },
    },
    steps: [
      {
        teach: 'In Fog, a visible capture is not always the lesson. Sometimes the right move is to keep your own piece guarded.',
        challenge: 'Move the queen to d3 to protect the pawn on d5.',
        targets: ['d3'],
        afterTargets: ['d3', 'd4', 'd5'],
        accepted: ['d1d3'],
        softFailures: {
          d1h5: 'That captures the bishop, but this chapter is teaching the protecting move.',
        },
        success: 'The queen chose protection before material.',
      },
    ],
  },
  {
    id: 'protection-guard-chain',
    lesson: 'Protection',
    title: 'Guard Chain',
    goal: 'Build two simple guard lines in one sequence.',
    board: {
      e1: { color: 'white', role: 'king' },
      a1: { color: 'white', role: 'rook' },
      a5: { color: 'white', role: 'pawn' },
      c1: { color: 'white', role: 'bishop' },
      g5: { color: 'white', role: 'pawn' },
    },
    steps: [
      {
        teach: 'First, make a rook guard line up the file.',
        challenge: 'Move the rook to a3.',
        targets: ['a3'],
        afterTargets: ['a3', 'a4', 'a5'],
        accepted: ['a1a3'],
        softFailures: {},
        success: 'The rook guards the a-pawn.',
      },
      {
        teach: 'Now add a diagonal guard with the bishop.',
        challenge: 'Move the bishop to e3.',
        targets: ['e3'],
        afterTargets: ['e3', 'f4', 'g5'],
        accepted: ['c1e3'],
        softFailures: {
          c1d2: 'That is legal, but e3 lines up with the pawn on g5.',
        },
        success: 'Both guard lines are in place.',
      },
    ],
  },
  {
    id: 'combat-capture-with-backup',
    lesson: 'Combat',
    title: 'Capture With Backup',
    goal: 'Capture a visible piece while another friendly piece guards the destination.',
    board: {
      b1: { color: 'white', role: 'king' },
      e2: { color: 'white', role: 'rook' },
      b3: { color: 'white', role: 'bishop' },
      e6: { color: 'black', role: 'pawn' },
    },
    steps: [
      {
        teach: 'Combat combines capture and protection. This rook capture lands on a square your bishop already guards.',
        challenge: 'Capture the pawn on e6.',
        targets: ['e6'],
        afterTargets: ['b3', 'c4', 'd5', 'e6', 'e7', 'e8'],
        accepted: ['e2e6'],
        softFailures: {
          e2e5: 'That is legal, but the pawn on e6 can be captured with backup.',
        },
        success: 'The rook captured on a guarded square.',
      },
    ],
  },
  {
    id: 'combat-knight-backed-capture',
    lesson: 'Combat',
    title: 'Backed Pocket',
    goal: 'Use a queen-backed knight capture.',
    board: {
      e1: { color: 'white', role: 'king' },
      d1: { color: 'white', role: 'queen' },
      c3: { color: 'white', role: 'knight' },
      d5: { color: 'black', role: 'bishop' },
    },
    steps: [
      {
        teach: 'A knight can jump into combat while a line piece guards the landing square.',
        challenge: 'Capture the bishop on d5.',
        targets: ['d5'],
        afterTargets: ['d2', 'd3', 'd4', 'd5'],
        accepted: ['c3d5'],
        softFailures: {
          c3b5: 'That is a legal jump, but it does not capture the backed target.',
        },
        success: 'The knight captured on a queen-guarded pocket.',
      },
    ],
  },
  {
    id: 'combat-remove-attacker',
    lesson: 'Combat',
    title: 'Remove The Attacker',
    goal: 'Capture the visible enemy that is pressuring your pawn.',
    board: {
      b1: { color: 'white', role: 'king' },
      d1: { color: 'white', role: 'queen' },
      d5: { color: 'white', role: 'pawn' },
      h5: { color: 'black', role: 'bishop' },
    },
    steps: [
      {
        teach: 'Sometimes protection is not enough. If the attacker is visible and reachable, remove it.',
        challenge: 'Capture the bishop on h5.',
        targets: ['h5'],
        afterTargets: ['e2', 'f3', 'g4', 'h5'],
        accepted: ['d1h5'],
        softFailures: {
          d1d3: 'That protects the pawn, but this time the attacker can be captured directly.',
        },
        success: 'The queen removed the visible attacker.',
      },
    ],
  },
  {
    id: 'combat-protect-then-capture',
    lesson: 'Combat',
    title: 'Protect Then Capture',
    goal: 'Build a guard line before making the pawn capture.',
    board: {
      e1: { color: 'white', role: 'king' },
      c1: { color: 'white', role: 'bishop' },
      g5: { color: 'white', role: 'pawn' },
      h6: { color: 'black', role: 'rook' },
    },
    steps: [
      {
        teach: 'First prepare the capture by guarding the pawn path.',
        challenge: 'Move the bishop to e3.',
        targets: ['e3'],
        afterTargets: ['e3', 'f4', 'g5', 'h6'],
        accepted: ['c1e3'],
        softFailures: {
          c1d2: 'That is legal, but e3 lines up with the pawn and capture square.',
        },
        success: 'The bishop now guards the pawn path.',
      },
      {
        teach: 'Now the pawn can capture on a guarded square.',
        challenge: 'Capture the rook on h6.',
        targets: ['h6'],
        afterTargets: ['e3', 'f4', 'g5', 'h6'],
        accepted: ['g5h6'],
        softFailures: {
          g5g6: 'That moves forward, but the combat move is the diagonal capture.',
        },
        success: 'The pawn captured with support behind it.',
      },
    ],
  },
  {
    id: 'combat-choose-safe-capture',
    lesson: 'Combat',
    title: 'Choose The Safe Capture',
    goal: 'Choose the marked capture that has backup.',
    board: {
      b1: { color: 'white', role: 'king' },
      d1: { color: 'white', role: 'rook' },
      d3: { color: 'white', role: 'queen' },
      d7: { color: 'black', role: 'rook' },
      h3: { color: 'black', role: 'bishop' },
    },
    steps: [
      {
        teach: 'Two captures may be visible. In combat, the marked capture also lands on a guarded file.',
        challenge: 'Capture the rook on d7.',
        targets: ['d7'],
        afterTargets: ['d1', 'd2', 'd4', 'd5', 'd6', 'd7'],
        accepted: ['d3d7'],
        softFailures: {
          d3h3: 'That captures a bishop, but the marked rook capture has backup from your rook.',
        },
        success: 'The queen chose the backed capture.',
      },
    ],
  },
  {
    id: 'combat-backed-king-capture',
    lesson: 'Combat',
    title: 'Backed King Capture',
    goal: 'Finish by capturing the visible king with backup.',
    board: {
      b1: { color: 'white', role: 'king' },
      e1: { color: 'white', role: 'queen' },
      e2: { color: 'white', role: 'rook' },
      e8: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach: 'A direct king capture still ends the game. Here, even the final capture has a guard line behind it.',
        challenge: 'Capture the king on e8.',
        targets: ['e8'],
        afterTargets: ['e1', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'],
        accepted: ['e2e8'],
        softFailures: {
          e2e7: 'That is legal, but the visible king can be captured now.',
        },
        success: 'The backed king capture ends the combat lesson.',
      },
    ],
  },
  {
    id: 'find-king-rook-line',
    lesson: 'Find The King',
    title: 'Open File',
    goal: 'Use a rook line to find and capture the visible king.',
    board: {
      b1: { color: 'white', role: 'king' },
      e2: { color: 'white', role: 'rook' },
      e8: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach: 'There is no check announcement in Fog. If your piece can see the king, the lesson marks the capture.',
        challenge: 'Capture the king on e8.',
        targets: ['e8'],
        afterTargets: ['e3', 'e4', 'e5', 'e6', 'e7', 'e8'],
        accepted: ['e2e8'],
        softFailures: {
          e2e7: 'That is legal, but the king is visible one square farther away.',
        },
        success: 'The rook found the king on the open file.',
      },
    ],
  },
  {
    id: 'find-king-bishop-line',
    lesson: 'Find The King',
    title: 'Diagonal King',
    goal: 'Use a bishop diagonal to find and capture the king.',
    board: {
      e1: { color: 'white', role: 'king' },
      c1: { color: 'white', role: 'bishop' },
      h6: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach: 'A king can be found on a diagonal too. Capture it directly when it is visible.',
        challenge: 'Capture the king on h6.',
        targets: ['h6'],
        afterTargets: ['d2', 'e3', 'f4', 'g5', 'h6'],
        accepted: ['c1h6'],
        softFailures: {
          c1g5: 'That is legal, but the king is one square farther on the same diagonal.',
        },
        success: 'The bishop found the king on the diagonal.',
      },
    ],
  },
  {
    id: 'find-king-knight-pocket',
    lesson: 'Find The King',
    title: 'King Pocket',
    goal: 'Use a knight pocket to capture the king.',
    board: {
      e1: { color: 'white', role: 'king' },
      c3: { color: 'white', role: 'knight' },
      d5: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach: 'Knights find kings by landing on exact pockets. The path between squares does not matter.',
        challenge: 'Capture the king on d5.',
        targets: ['d5'],
        afterTargets: ['b4', 'b6', 'f4', 'f6'],
        accepted: ['c3d5'],
        softFailures: {
          c3b5: 'That is a legal pocket, but the king is on d5.',
        },
        success: 'The knight found the king pocket.',
      },
    ],
  },
  {
    id: 'save-king-step-away',
    lesson: 'Save The King',
    title: 'Step Away',
    goal: 'Move the king to the marked safer square.',
    board: {
      e2: { color: 'white', role: 'king' },
      e5: { color: 'black', role: 'rook' },
    },
    steps: [
      {
        teach: 'Fog does not warn you with check. When a danger line is marked, move the king out of it.',
        challenge: 'Move the king to f2.',
        targets: ['f2'],
        afterTargets: ['f2', 'f3'],
        accepted: ['e2f2'],
        softFailures: {
          e2e3: 'That steps along the marked file. Move sideways instead.',
        },
        success: 'The king stepped away from the file.',
      },
    ],
  },
  {
    id: 'save-king-block-line',
    lesson: 'Save The King',
    title: 'Block The Line',
    goal: 'Place a rook between your king and the marked danger line.',
    board: {
      e1: { color: 'white', role: 'king' },
      a3: { color: 'white', role: 'rook' },
      e7: { color: 'black', role: 'rook' },
    },
    steps: [
      {
        teach: 'You can also answer a line threat by blocking the corridor.',
        challenge: 'Move the rook to e3.',
        targets: ['e3'],
        afterTargets: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'],
        accepted: ['a3e3'],
        softFailures: {
          a3a7: 'That is legal, but it does not block the e-file.',
        },
        success: 'The rook blocked the line in front of the king.',
      },
    ],
  },
  {
    id: 'save-king-capture-attacker',
    lesson: 'Save The King',
    title: 'Take The Threat',
    goal: 'Capture the visible attacker with your king.',
    board: {
      e2: { color: 'white', role: 'king' },
      f3: { color: 'black', role: 'rook' },
    },
    steps: [
      {
        teach: 'If the attacker is adjacent and visible, the king can remove it directly.',
        challenge: 'Capture the rook on f3.',
        targets: ['f3'],
        afterTargets: ['e2', 'e3', 'f2', 'f3', 'g2', 'g3', 'g4'],
        accepted: ['e2f3'],
        softFailures: {
          e2e3: 'That moves the king, but the visible attacker can be captured.',
        },
        success: 'The king removed the adjacent threat.',
      },
    ],
  },
  {
    id: 'final-capture-rook',
    lesson: 'Final Capture',
    title: 'Rook Finish',
    goal: 'Finish the game with a rook king capture.',
    board: {
      b1: { color: 'white', role: 'king' },
      h2: { color: 'white', role: 'rook' },
      h8: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach: 'Final Capture is the Fog version of mate-in-one: find the direct king capture.',
        challenge: 'Capture the king on h8.',
        targets: ['h8'],
        afterTargets: ['h3', 'h4', 'h5', 'h6', 'h7', 'h8'],
        accepted: ['h2h8'],
        softFailures: {},
        success: 'The rook made the final capture.',
      },
    ],
  },
  {
    id: 'final-capture-pawn',
    lesson: 'Final Capture',
    title: 'Pawn Finish',
    goal: 'Finish with a pawn diagonal king capture.',
    board: {
      e1: { color: 'white', role: 'king' },
      d6: { color: 'white', role: 'pawn' },
      e7: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach: 'A pawn can finish the game diagonally when the king is on its capture square.',
        challenge: 'Capture the king on e7.',
        targets: ['e7'],
        afterTargets: ['e7', 'e8'],
        accepted: ['d6e7'],
        softFailures: {
          d6d7: 'That moves forward, but the king is captured diagonally.',
        },
        success: 'The pawn made the final capture.',
      },
    ],
  },
  {
    id: 'final-capture-king',
    lesson: 'Final Capture',
    title: 'King Finish',
    goal: 'Finish with an adjacent king capture.',
    board: {
      e4: { color: 'white', role: 'king' },
      f5: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach: 'In Fog, adjacent kings are resolved by direct capture, not by a check warning.',
        challenge: 'Capture the king on f5.',
        targets: ['f5'],
        afterTargets: ['e4', 'e5', 'f4', 'f5', 'g4', 'g5', 'g6'],
        accepted: ['e4f5'],
        softFailures: {
          e4e5: 'That is a legal step, but the final capture is on f5.',
        },
        success: 'The king made the final capture.',
      },
    ],
  },
  {
    id: 'setup-open-pawn',
    lesson: 'Board Setup',
    title: 'First Pawn',
    goal: 'Start from the full board and move a pawn.',
    board: {
      a1: { color: 'white', role: 'rook' },
      b1: { color: 'white', role: 'knight' },
      c1: { color: 'white', role: 'bishop' },
      d1: { color: 'white', role: 'queen' },
      e1: { color: 'white', role: 'king' },
      f1: { color: 'white', role: 'bishop' },
      g1: { color: 'white', role: 'knight' },
      h1: { color: 'white', role: 'rook' },
      a2: { color: 'white', role: 'pawn' },
      b2: { color: 'white', role: 'pawn' },
      c2: { color: 'white', role: 'pawn' },
      d2: { color: 'white', role: 'pawn' },
      e2: { color: 'white', role: 'pawn' },
      f2: { color: 'white', role: 'pawn' },
      g2: { color: 'white', role: 'pawn' },
      h2: { color: 'white', role: 'pawn' },
      e8: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach: 'The normal army starts in familiar places, but Fog hides what your pieces cannot see.',
        challenge: 'Move the e-pawn two squares to e4.',
        targets: ['e4'],
        afterTargets: ['e3', 'e4', 'e5'],
        accepted: ['e2e4'],
        softFailures: {
          e2e3: 'That is legal, but this opening chapter asks for the two-square start.',
        },
        success: 'The first pawn opened space for your pieces.',
      },
    ],
  },
  {
    id: 'setup-knight-develop',
    lesson: 'Board Setup',
    title: 'First Knight',
    goal: 'Develop a knight from its starting square.',
    board: {
      e1: { color: 'white', role: 'king' },
      g1: { color: 'white', role: 'knight' },
      e8: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach: 'Knights can jump out immediately from the starting rank.',
        challenge: 'Move the knight to f3.',
        targets: ['f3'],
        afterTargets: ['d2', 'd4', 'e1', 'e5', 'g1', 'g5', 'h2', 'h4'],
        accepted: ['g1f3'],
        softFailures: {
          g1h3: 'That is legal, but f3 is the marked developing square.',
        },
        success: 'The knight developed into the fog.',
      },
    ],
  },
  {
    id: 'setup-bishop-develop',
    lesson: 'Board Setup',
    title: 'First Bishop',
    goal: 'Open and develop a bishop in sequence.',
    board: {
      e1: { color: 'white', role: 'king' },
      e2: { color: 'white', role: 'pawn' },
      f1: { color: 'white', role: 'bishop' },
      e8: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach: 'A bishop needs an opened diagonal before it can leave home.',
        challenge: 'Move the e-pawn to e4.',
        targets: ['e4'],
        afterTargets: ['e3', 'e4', 'e5'],
        accepted: ['e2e4'],
        softFailures: {},
        success: 'The pawn opened the diagonal.',
      },
      {
        teach: 'Now the bishop can develop through the opened diagonal.',
        challenge: 'Move the bishop to c4.',
        targets: ['c4'],
        afterTargets: ['c4', 'd3', 'e2', 'g2', 'h3'],
        accepted: ['f1c4'],
        softFailures: {
          f1b5: 'That is legal, but c4 is the marked development square.',
        },
        success: 'The bishop developed after the pawn moved.',
      },
    ],
  },
  {
    id: 'castling-kingside',
    lesson: 'Castling',
    title: 'King Side Castle',
    goal: 'Castle by moving the king to its rook.',
    board: {
      e1: { color: 'white', role: 'king' },
      h1: { color: 'white', role: 'rook' },
      e8: { color: 'black', role: 'king' },
    },
    castlingRights: ['h1'],
    steps: [
      {
        teach: 'In this interface, Fog castling is made by moving the king onto the castling rook.',
        challenge: 'Castle with the h1 rook.',
        targets: ['h1'],
        afterTargets: ['f1', 'g1', 'h1'],
        accepted: ['e1h1'],
        softFailures: {},
        success: 'The king castled to g1 and the rook moved to f1.',
      },
    ],
  },
  {
    id: 'castling-queenside',
    lesson: 'Castling',
    title: 'Queen Side Castle',
    goal: 'Castle on the queen side.',
    board: {
      e1: { color: 'white', role: 'king' },
      a1: { color: 'white', role: 'rook' },
      e8: { color: 'black', role: 'king' },
    },
    castlingRights: ['a1'],
    steps: [
      {
        teach: 'Queen-side castling works the same way: move the king to the rook.',
        challenge: 'Castle with the a1 rook.',
        targets: ['a1'],
        afterTargets: ['a1', 'c1', 'd1'],
        accepted: ['e1a1'],
        softFailures: {},
        success: 'The king castled to c1 and the rook moved to d1.',
      },
    ],
  },
  {
    id: 'castling-draft960-shape',
    lesson: 'Castling',
    title: 'Draft960 Shape',
    goal: 'Castle from a nonstandard king and rook layout.',
    board: {
      d1: { color: 'white', role: 'king' },
      g1: { color: 'white', role: 'rook' },
      e8: { color: 'black', role: 'king' },
    },
    castlingRights: ['g1'],
    steps: [
      {
        teach: 'Draft960 can start pieces on different files, but castling still lands the king and rook on familiar final squares.',
        challenge: 'Castle with the g1 rook.',
        targets: ['g1'],
        afterTargets: ['f1', 'g1'],
        accepted: ['d1g1'],
        softFailures: {},
        success: 'The Draft960-shaped castle completed.',
      },
    ],
  },
  {
    id: 'en-passant-left',
    lesson: 'En Passant',
    title: 'Left Capture',
    goal: 'Capture en passant to the marked square.',
    board: {
      a1: { color: 'white', role: 'king' },
      e5: { color: 'white', role: 'pawn' },
      d5: { color: 'black', role: 'pawn' },
      h8: { color: 'black', role: 'king' },
    },
    enPassantSquare: 'd6',
    steps: [
      {
        teach: 'En passant captures the pawn that just crossed beside you, even though your pawn lands behind it.',
        challenge: 'Capture en passant on d6.',
        targets: ['d6'],
        afterTargets: ['d5', 'd6', 'd7'],
        accepted: ['e5d6'],
        softFailures: {
          e5e6: 'That moves forward, but the en passant capture is diagonal to d6.',
        },
        success: 'The pawn captured en passant.',
      },
    ],
  },
  {
    id: 'en-passant-right',
    lesson: 'En Passant',
    title: 'Right Capture',
    goal: 'Capture en passant on the other side.',
    board: {
      a1: { color: 'white', role: 'king' },
      f5: { color: 'white', role: 'pawn' },
      g5: { color: 'black', role: 'pawn' },
      h8: { color: 'black', role: 'king' },
    },
    enPassantSquare: 'g6',
    steps: [
      {
        teach: 'The same rule works to the right when the en passant square is available.',
        challenge: 'Capture en passant on g6.',
        targets: ['g6'],
        afterTargets: ['g5', 'g6', 'g7'],
        accepted: ['f5g6'],
        softFailures: {
          f5f6: 'That moves forward, but the special capture lands on g6.',
        },
        success: 'The pawn captured en passant to the right.',
      },
    ],
  },
  {
    id: 'en-passant-expires',
    lesson: 'En Passant',
    title: 'Only Now',
    goal: 'Take the en passant chance immediately.',
    board: {
      a1: { color: 'white', role: 'king' },
      c5: { color: 'white', role: 'pawn' },
      b5: { color: 'black', role: 'pawn' },
      h8: { color: 'black', role: 'king' },
    },
    enPassantSquare: 'b6',
    steps: [
      {
        teach: 'En passant is only available right away. If the marker appears, take it now.',
        challenge: 'Capture en passant on b6.',
        targets: ['b6'],
        afterTargets: ['b5', 'b6', 'b7'],
        accepted: ['c5b6'],
        softFailures: {
          c5c6: 'That is legal, but it lets the special capture pass by.',
        },
        success: 'The immediate en passant capture worked.',
      },
    ],
  },
  {
    id: 'draw-clock',
    lesson: 'Draws',
    title: 'Fifty-Move Clock',
    goal: 'Make the quiet move that reaches the draw clock.',
    board: {
      e1: { color: 'white', role: 'king' },
      a1: { color: 'white', role: 'rook' },
      e8: { color: 'black', role: 'king' },
    },
    halfmoveClock: 99,
    steps: [
      {
        teach: 'Fog still has draw rules. A quiet non-pawn move can reach the fifty-move limit.',
        challenge: 'Move the rook to a2.',
        targets: ['a2'],
        afterTargets: ['a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'],
        accepted: ['a1a2'],
        softFailures: {},
        success: 'The quiet move reached the draw clock.',
      },
    ],
  },
  {
    id: 'draw-reset-clock',
    lesson: 'Draws',
    title: 'Reset The Clock',
    goal: 'Use a pawn move to reset the draw clock.',
    board: {
      e1: { color: 'white', role: 'king' },
      a2: { color: 'white', role: 'pawn' },
      e8: { color: 'black', role: 'king' },
    },
    halfmoveClock: 98,
    steps: [
      {
        teach: 'Pawn moves and captures reset the fifty-move clock.',
        challenge: 'Move the pawn to a4.',
        targets: ['a4'],
        afterTargets: ['a3', 'a4', 'a5'],
        accepted: ['a2a4'],
        softFailures: {
          a2a3: 'That also resets the clock, but this chapter asks for the double step.',
        },
        success: 'The pawn move reset the draw clock.',
      },
    ],
  },
  {
    id: 'draw-repeat-shape',
    lesson: 'Draws',
    title: 'Repeat Shape',
    goal: 'Repeat a small rook route to learn the pattern.',
    board: {
      e1: { color: 'white', role: 'king' },
      a1: { color: 'white', role: 'rook' },
      e8: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach: 'Repeated positions can draw the game. Start by moving out and back along the same line.',
        challenge: 'Move the rook to a3.',
        targets: ['a3'],
        afterTargets: ['a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'],
        accepted: ['a1a3'],
        softFailures: {},
        success: 'First half of the repeated shape.',
      },
      {
        teach: 'Now return to the original square.',
        challenge: 'Move the rook back to a1.',
        targets: ['a1'],
        afterTargets: ['a1', 'a2'],
        accepted: ['a3a1'],
        softFailures: {},
        success: 'The position shape returned.',
      },
    ],
  },
  {
    id: 'value-queen-over-pawn',
    lesson: 'Piece Value',
    title: 'Big Prize',
    goal: 'Choose the higher-value marked capture.',
    board: {
      b1: { color: 'white', role: 'king' },
      d3: { color: 'white', role: 'queen' },
      d7: { color: 'black', role: 'rook' },
      h3: { color: 'black', role: 'pawn' },
    },
    steps: [
      {
        teach: 'Value still matters in Fog, but only among pieces you can actually see and reach.',
        challenge: 'Capture the rook on d7.',
        targets: ['d7'],
        afterTargets: ['d4', 'd5', 'd6', 'd7', 'd8'],
        accepted: ['d3d7'],
        softFailures: {
          d3h3: 'That wins a pawn, but the rook is the bigger visible prize.',
        },
        success: 'The queen took the higher-value visible piece.',
      },
    ],
  },
  {
    id: 'value-king-over-material',
    lesson: 'Piece Value',
    title: 'King Beats Material',
    goal: 'Choose the king capture over material.',
    board: {
      b1: { color: 'white', role: 'king' },
      e2: { color: 'white', role: 'rook' },
      e8: { color: 'black', role: 'king' },
      h2: { color: 'black', role: 'queen' },
    },
    steps: [
      {
        teach: 'The king is worth the game. If you can capture it, material no longer matters.',
        challenge: 'Capture the king on e8.',
        targets: ['e8'],
        afterTargets: ['e3', 'e4', 'e5', 'e6', 'e7', 'e8'],
        accepted: ['e2e8'],
        softFailures: {
          e2h2: 'The queen is valuable, but the king capture ends the game.',
        },
        success: 'The king capture beat material.',
      },
    ],
  },
  {
    id: 'value-scout-before-value',
    lesson: 'Piece Value',
    title: 'Information Value',
    goal: 'Choose the move that reveals the marked high-value target.',
    board: {
      e1: { color: 'white', role: 'king' },
      a1: { color: 'white', role: 'rook' },
      a7: { color: 'black', role: 'rook' },
    },
    steps: [
      {
        teach: 'Sometimes the valuable move is the one that reveals the line first.',
        challenge: 'Move the rook to a4.',
        targets: ['a4'],
        afterTargets: ['a4', 'a5', 'a6', 'a7'],
        accepted: ['a1a4'],
        softFailures: {
          a1a3: 'That is legal, but a4 reaches the marked scouting square.',
        },
        success: 'The rook moved to value information before material.',
      },
    ],
  },
  {
    id: 'capture-two-rook-route',
    lesson: 'Capture In Two',
    title: 'Turn To Capture',
    goal: 'Use two rook moves to capture the king.',
    board: {
      b1: { color: 'white', role: 'king' },
      a2: { color: 'white', role: 'rook' },
      f6: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach: 'Some king captures need a route. First line up the rook.',
        challenge: 'Move the rook to a6.',
        targets: ['a6'],
        afterTargets: ['a6', 'b6', 'c6', 'd6', 'e6', 'f6'],
        accepted: ['a2a6'],
        softFailures: {},
        success: 'The rook lined up on the rank.',
      },
      {
        teach: 'Now finish along the rank.',
        challenge: 'Capture the king on f6.',
        targets: ['f6'],
        afterTargets: ['b6', 'c6', 'd6', 'e6', 'f6'],
        accepted: ['a6f6'],
        softFailures: {},
        success: 'The rook captured in two.',
      },
    ],
  },
  {
    id: 'capture-two-bishop-route',
    lesson: 'Capture In Two',
    title: 'Diagonal Route',
    goal: 'Use two bishop moves to capture the king.',
    board: {
      e1: { color: 'white', role: 'king' },
      b2: { color: 'white', role: 'bishop' },
      b8: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach: 'First move to the diagonal that points at the king.',
        challenge: 'Move the bishop to e5.',
        targets: ['e5'],
        afterTargets: ['c3', 'd4', 'e5', 'f6', 'g7', 'h8'],
        accepted: ['b2e5'],
        softFailures: {},
        success: 'The bishop changed diagonals.',
      },
      {
        teach: 'Now finish on the new diagonal.',
        challenge: 'Capture the king on b8.',
        targets: ['b8'],
        afterTargets: ['b8', 'c7', 'd6'],
        accepted: ['e5b8'],
        softFailures: {},
        success: 'The bishop captured in two.',
      },
    ],
  },
  {
    id: 'capture-two-knight-route',
    lesson: 'Capture In Two',
    title: 'Two Pockets',
    goal: 'Use two knight jumps to capture the king.',
    board: {
      e1: { color: 'white', role: 'king' },
      b1: { color: 'white', role: 'knight' },
      e4: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach: 'A knight route is a chain of pockets.',
        challenge: 'Jump the knight to c3.',
        targets: ['c3'],
        afterTargets: ['c3', 'e4'],
        accepted: ['b1c3'],
        softFailures: {},
        success: 'The first pocket points at the king.',
      },
      {
        teach: 'Now take the king from the pocket.',
        challenge: 'Capture the king on e4.',
        targets: ['e4'],
        afterTargets: ['e4'],
        accepted: ['c3e4'],
        softFailures: {},
        success: 'The knight captured in two.',
      },
    ],
  },
  {
    id: 'scouting-reveal-file',
    lesson: 'Scouting',
    title: 'File Scout',
    goal: 'Move to the marked square to reveal farther up the file.',
    board: {
      e1: { color: 'white', role: 'king' },
      a1: { color: 'white', role: 'rook' },
      a7: { color: 'black', role: 'bishop' },
    },
    steps: [
      {
        teach: 'A scout move can be right even before it captures anything.',
        challenge: 'Move the rook to a4.',
        targets: ['a4'],
        afterTargets: ['a4', 'a5', 'a6', 'a7'],
        accepted: ['a1a4'],
        softFailures: {
          a1a2: 'That is legal, but the scouting marker is deeper on the file.',
        },
        success: 'The rook scouted deeper up the file.',
      },
    ],
  },
  {
    id: 'scouting-knight-pocket',
    lesson: 'Scouting',
    title: 'Pocket Scout',
    goal: 'Jump to the pocket that reveals the marked area.',
    board: {
      e1: { color: 'white', role: 'king' },
      b1: { color: 'white', role: 'knight' },
      e4: { color: 'black', role: 'rook' },
    },
    steps: [
      {
        teach: 'Knights scout by changing which pockets are visible.',
        challenge: 'Jump the knight to c3.',
        targets: ['c3'],
        afterTargets: ['c3', 'e4'],
        accepted: ['b1c3'],
        softFailures: {
          b1a3: 'That scouts a different pocket. This marker points toward c3.',
        },
        success: 'The knight scouted the marked pocket.',
      },
    ],
  },
  {
    id: 'scouting-relevant-not-most',
    lesson: 'Scouting',
    title: 'Relevant Squares',
    goal: 'Choose the scout move that reveals the marked enemy line.',
    board: {
      e1: { color: 'white', role: 'king' },
      d2: { color: 'white', role: 'queen' },
      d7: { color: 'black', role: 'rook' },
    },
    steps: [
      {
        teach: 'Good scouting is not always the move that reveals the most squares. It reveals the right squares.',
        challenge: 'Move the queen to d4.',
        targets: ['d4'],
        afterTargets: ['d4', 'd5', 'd6', 'd7'],
        accepted: ['d2d4'],
        softFailures: {
          d2h6: 'That reveals many squares, but the marked file is the relevant one.',
        },
        success: 'The queen scouted the relevant file.',
      },
    ],
  },
];

export function mountLearn(root: HTMLElement): void {
  const state = createTutorialState();
  root.replaceChildren();
  root.classList.add('landing-page', 'learn-route');
  root.append(buildNav(), buildShell(state), buildFooter());
  render(state);
}

type TutorialState = {
  api: Api | null;
  boardEl: HTMLElement | null;
  chapterIndex: number;
  stepIndex: number;
  status: ChapterStatus;
  activeState: GameState;
  message: string;
  shell: HTMLElement | null;
};

function createTutorialState(): TutorialState {
  const first = chapters[0]!;
  return {
    api: null,
    boardEl: null,
    chapterIndex: 0,
    stepIndex: 0,
    status: 'ready',
    activeState: gameStateFromBoard(first.id, first.board),
    message: first.steps[0]!.teach,
    shell: null,
  };
}

function buildShell(state: TutorialState): HTMLElement {
  const shell = document.createElement('main');
  shell.className = 'learn-shell learn-tutorial-shell';
  state.shell = shell;
  return shell;
}

function render(state: TutorialState): void {
  const shell = state.shell;
  if (!shell) return;

  const chapter = chapters[state.chapterIndex]!;
  const view = fogOfWarVariant.getPlayerView(state.activeState, 'white');
  const menu = buildLearnMenu(state);
  const boardPanel = document.createElement('section');
  boardPanel.className = 'learn-board-panel';
  const boardEl = document.createElement('div');
  boardEl.className = 'board learn-board';
  boardEl.setAttribute('aria-label', 'Fog of War tutorial board');
  boardPanel.append(boardEl);

  const panel = buildPanel(state, chapter);
  shell.replaceChildren(menu, boardPanel, panel);
  state.boardEl = boardEl;
  state.api = createTutorialBoard(boardEl, view, chapter, state);
  updateBoard(state, chapter, view);
}

function buildLearnMenu(state: TutorialState): HTMLElement {
  const menu = document.createElement('aside');
  menu.className = 'learn-menu';
  menu.setAttribute('aria-label', 'Learn menu');

  const header = document.createElement('div');
  header.className = 'learn-menu-header';

  const badge = document.createElement('div');
  badge.className = 'learn-menu-badge';
  badge.textContent = '♜';

  const title = document.createElement('span');
  title.textContent = 'Menu';
  header.append(badge, title);

  menu.append(header);
  for (const category of learnCategories) {
    menu.append(buildLearnCategory(state, category));
  }
  menu.append(buildCollapsedCategory('What Next?'));
  return menu;
}

function buildLearnCategory(state: TutorialState, category: TutorialCategory): HTMLElement {
  const isCurrentCategory = category.lessons.some((lesson) => chapters[state.chapterIndex]?.lesson === lesson.title);
  const section = document.createElement('section');
  section.className = `learn-menu-category${isCurrentCategory ? ' is-open' : ' is-collapsed'}`;

  const title = document.createElement('h2');
  title.textContent = category.title;
  section.append(title);

  for (const lesson of category.lessons) {
    section.append(buildPieceLessonMenuItem(state, lesson));
  }

  return section;
}

function buildPieceLessonMenuItem(
  state: TutorialState,
  lesson: TutorialLesson,
): HTMLElement {
  const lessonChapters = chapterIndexesForLesson(lesson.title);
  const available = lessonChapters.length > 0;
  const isCurrentLesson = chapters[state.chapterIndex]?.lesson === lesson.title;

  const group = document.createElement('div');
  group.className = `learn-menu-lesson${isCurrentLesson ? ' is-current' : ''}${available ? '' : ' is-locked'}`;

  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'learn-menu-lesson-row';
  row.disabled = !available;
  row.setAttribute('aria-expanded', String(isCurrentLesson && available));
  if (isCurrentLesson) row.setAttribute('aria-current', 'true');

  const piece = document.createElement('span');
  piece.className = 'learn-menu-piece';
  piece.textContent = lesson.icon;

  const label = document.createElement('span');
  label.className = 'learn-menu-lesson-label';
  label.textContent = lesson.title;

  const meta = document.createElement('span');
  meta.className = 'learn-menu-lesson-meta';
  meta.textContent = available ? `${lessonChapters.length}` : 'soon';

  row.append(piece, label, meta);
  row.addEventListener('click', () => {
    if (!available) return;
    goToChapter(state, lessonChapters[0]!);
  });
  group.append(row);

  if (available && isCurrentLesson) {
    const chapterList = document.createElement('div');
    chapterList.className = 'learn-menu-chapters';
    for (let localIndex = 0; localIndex < lessonChapters.length; localIndex += 1) {
      const chapterIndex = lessonChapters[localIndex]!;
      const chapter = chapters[chapterIndex]!;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `learn-menu-chapter${chapterIndex === state.chapterIndex ? ' is-current' : ''}`;
      if (chapterIndex === state.chapterIndex) item.setAttribute('aria-current', 'step');
      item.textContent = `${localIndex + 1}. ${chapter.title}`;
      item.addEventListener('click', () => goToChapter(state, chapterIndex));
      chapterList.append(item);
    }
    group.append(chapterList);
  }

  return group;
}

function buildCollapsedCategory(title: string): HTMLElement {
  const category = document.createElement('section');
  category.className = 'learn-menu-category is-collapsed';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'learn-menu-category-row';
  button.disabled = true;
  button.setAttribute('aria-expanded', 'false');
  button.textContent = title;

  category.append(button);
  return category;
}

function buildPanel(state: TutorialState, chapter: TutorialChapter): HTMLElement {
  const step = currentStep(state, chapter);
  const panel = document.createElement('section');
  panel.className = 'learn-panel learn-tutorial-panel';

  const progress = document.createElement('div');
  progress.className = 'learn-progress';
  progress.textContent = lessonProgress(state.chapterIndex, chapter.lesson);

  const heading = document.createElement('h1');
  heading.className = 'learn-heading';
  heading.textContent = chapter.lesson;

  const chapterTitle = document.createElement('h2');
  chapterTitle.className = 'learn-chapter-title';
  chapterTitle.textContent = chapter.title;

  const goal = document.createElement('p');
  goal.className = 'learn-copy';
  goal.textContent = chapter.goal;

  const prompt = document.createElement('div');
  prompt.className = `learn-tutorial-message ${state.status}`;
  prompt.textContent = state.message;

  const targetList = document.createElement('div');
  targetList.className = 'learn-target-list';
  for (const target of step.targets) {
    const item = document.createElement('span');
    item.textContent = target;
    targetList.append(item);
  }

  const actions = document.createElement('div');
  actions.className = 'learn-actions';

  if (state.status === 'success') {
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'landing-cta-primary';
    next.textContent = state.chapterIndex === chapters.length - 1 ? 'Restart' : 'Next';
    next.addEventListener('click', () => {
      if (state.chapterIndex === chapters.length - 1) {
        state.chapterIndex = 0;
      } else {
        state.chapterIndex += 1;
      }
      resetChapter(state);
    });
    actions.append(next);
  } else if (state.status === 'soft-failure') {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'landing-cta-primary';
    retry.textContent = 'Try again';
    retry.addEventListener('click', () => resetChapter(state));
    actions.append(retry);
  } else {
    const hint = document.createElement('p');
    hint.className = 'learn-hint';
    hint.textContent = step.challenge;
    actions.append(hint);
  }

  panel.append(progress, heading, chapterTitle, goal, prompt, targetList, actions);
  return panel;
}

function createTutorialBoard(
  el: HTMLElement,
  view: PlayerView,
  chapter: TutorialChapter,
  state: TutorialState,
): Api {
  const api = Chessground(el, {
    animation: { enabled: true, duration: 160 },
    coordinates: true,
    coordinatesOnSquares: false,
    fen: boardFen(view.board),
    orientation: 'white',
    movable: {
      free: false,
      color: 'white',
      dests: legalDests(view),
    },
    draggable: { enabled: true },
    selectable: { enabled: true },
    premovable: { enabled: false },
    highlight: { custom: tutorialSquareClasses(view, chapter, state), lastMove: false },
    events: {
      move: (from, to) => handleMove(state, `${from}${to}` as Uci),
    },
    disableContextMenu: true,
  });
  return api;
}

function handleMove(state: TutorialState, uci: Uci): void {
  const chapter = chapters[state.chapterIndex]!;
  const step = currentStep(state, chapter);
  if (state.status !== 'ready') return;

  const move = moveFromUci(uci);
  const legal = fogOfWarVariant.getLegalMoves(state.activeState, 'white')
    .some((candidate) => movesMatch(candidate, move));
  if (!legal) {
    state.message = 'That move is not legal from this position.';
    render(state);
    return;
  }

  const nextState = fogOfWarVariant.applyMove(state.activeState, move);
  state.activeState = {
    ...nextState,
    status: { type: 'playing', turn: 'white' },
    lastMove: move,
  };

  if (step.accepted.includes(uci)) {
    const isFinalStep = state.stepIndex === chapter.steps.length - 1;
    if (isFinalStep) {
      state.status = 'success';
      state.message = chapter.reveal ? `${step.success} ${chapter.reveal.text}` : step.success;
    } else {
      state.stepIndex += 1;
      state.status = 'ready';
      state.message = `${step.success} ${currentStep(state, chapter).teach}`;
    }
  } else {
    state.status = 'soft-failure';
    state.message = step.softFailures[uci] ?? 'That is legal, but it does not solve this chapter.';
  }
  render(state);
}

function resetChapter(state: TutorialState): void {
  const chapter = chapters[state.chapterIndex]!;
  state.activeState = gameStateFromBoard(chapter.id, chapter.board);
  state.stepIndex = 0;
  state.status = 'ready';
  state.message = chapter.steps[0]!.teach;
  render(state);
}

function goToChapter(state: TutorialState, chapterIndex: number): void {
  if (!chapters[chapterIndex]) return;
  state.chapterIndex = chapterIndex;
  resetChapter(state);
}

function updateBoard(state: TutorialState, chapter: TutorialChapter, view: PlayerView): void {
  state.api?.set({
    fen: boardFen(view.board),
    movable: {
      color: state.status === 'ready' ? 'white' : undefined,
      dests: state.status === 'ready' ? legalDests(view) : new Map(),
    },
    highlight: { custom: tutorialSquareClasses(view, chapter, state), lastMove: false },
  });
}

function tutorialSquareClasses(
  view: PlayerView,
  chapter: TutorialChapter,
  state: TutorialState,
): cg.SquareClasses {
  const classes = hiddenSquareClasses(view);
  const step = currentStep(state, chapter);
  const activeTargets = step.targets;
  for (const square of activeTargets) {
    classes.set(square as cg.Key, `${classes.get(square as cg.Key) ?? ''} learn-highlight`.trim());
  }
  if (state.status === 'success') {
    for (const square of step.afterTargets) {
      if (step.targets.includes(square)) continue;
      classes.set(square as cg.Key, `${classes.get(square as cg.Key) ?? ''} learn-explained`.trim());
    }
  }
  if (chapter.reveal && state.status === 'success') {
    for (const square of [chapter.reveal.scout, chapter.reveal.revealed]) {
      classes.set(square as cg.Key, `${classes.get(square as cg.Key) ?? ''} learn-reveal`.trim());
    }
  }
  return classes;
}

function currentStep(state: TutorialState, chapter: TutorialChapter): TutorialStep {
  return chapter.steps[state.stepIndex] ?? chapter.steps[chapter.steps.length - 1]!;
}

function lessonProgress(chapterIndex: number, lesson: string): string {
  let current = 0;
  let total = 0;
  for (let i = 0; i < chapters.length; i += 1) {
    if (chapters[i]!.lesson !== lesson) continue;
    total += 1;
    if (i <= chapterIndex) current += 1;
  }
  return `${lesson} ${current} of ${total}`;
}

function chapterIndexesForLesson(lesson: string): number[] {
  const indexes: number[] = [];
  for (let i = 0; i < chapters.length; i += 1) {
    if (chapters[i]!.lesson === lesson) indexes.push(i);
  }
  return indexes;
}

function legalDests(view: PlayerView): cg.Dests {
  const dests: cg.Dests = new Map();
  for (const move of view.legalMoves) {
    const list = dests.get(move.from as cg.Key) ?? [];
    list.push(move.to as cg.Key);
    dests.set(move.from as cg.Key, list);
  }
  return dests;
}

function gameStateFromBoard(id: string, board: Board): GameState {
  const chapter = chapters.find((candidate) => candidate.id === id);
  return {
    ...fogOfWarVariant.createInitialState(`learn-${id}`),
    board,
    status: { type: 'playing', turn: 'white' },
    castlingRights: chapter?.castlingRights ?? [],
    enPassantSquare: chapter?.enPassantSquare,
    halfmoveClock: chapter?.halfmoveClock ?? 0,
    moveNumber: chapter?.moveNumber ?? 1,
  };
}

function moveFromUci(uci: Uci): Move {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
  };
}

function movesMatch(left: Move, right: Move): boolean {
  return left.from === right.from && left.to === right.to;
}

function buildNav(): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'site-nav';
  nav.setAttribute('aria-label', 'Primary');

  const brand = document.createElement('a');
  brand.className = 'site-nav-brand';
  brand.href = '/';

  const brandLogo = document.createElement('img');
  brandLogo.className = 'site-nav-logo';
  brandLogo.src = '/logo.svg';
  brandLogo.alt = '';
  brandLogo.width = 28;
  brandLogo.height = 28;

  const brandText = document.createElement('span');
  brandText.textContent = 'BICHESS';
  brand.append(brandLogo, brandText);

  const links = document.createElement('div');
  links.className = 'site-nav-links';

  if (SHOW_ENGINE_LAB_LINKS) {
    links.append(navLink('Engine Lab', '/engine-lab'));
  }
  links.append(navLink('Watch', '/watch'), navLink('Learn', '/learn'), navLink('About', '/about'));

  const gh = document.createElement('a');
  gh.href = GITHUB_URL;
  gh.target = '_blank';
  gh.rel = 'noreferrer noopener';
  gh.className = 'site-nav-link';
  gh.textContent = 'GitHub';
  links.append(gh);

  nav.append(brand, links);
  return nav;
}

function navLink(label: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.className = 'site-nav-link';
  link.textContent = label;
  if (currentPath() === href) {
    link.classList.add('active');
    link.setAttribute('aria-current', 'page');
  }
  return link;
}

function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

function buildFooter(): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'site-footer';

  const left = document.createElement('div');
  left.className = 'site-footer-left';
  left.textContent = '© 2026 Bichess';

  const right = document.createElement('div');
  right.className = 'site-footer-right';

  const license = document.createElement('span');
  license.textContent = 'GPL-3.0';

  const sep = document.createElement('span');
  sep.className = 'site-footer-sep';
  sep.textContent = '·';

  const gh = document.createElement('a');
  gh.href = GITHUB_URL;
  gh.target = '_blank';
  gh.rel = 'noreferrer noopener';
  gh.textContent = 'GitHub';

  right.append(license, sep, gh);
  footer.append(left, right);
  return footer;
}
