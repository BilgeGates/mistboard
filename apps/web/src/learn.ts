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
  steps: TutorialStep[];
  reveal?: {
    scout: Square;
    revealed: Square;
    text: string;
  };
};

type ChapterStatus = 'ready' | 'success' | 'soft-failure';

const pieceLessons = [
  { title: 'The Rook', icon: '♜' },
  { title: 'The Bishop', icon: '♝' },
  { title: 'The Queen', icon: '♛' },
  { title: 'The King', icon: '♚' },
  { title: 'The Knight', icon: '♞' },
  { title: 'The Pawn', icon: '♟' },
] as const;

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

  const pieces = document.createElement('section');
  pieces.className = 'learn-menu-category is-open';

  const piecesTitle = document.createElement('h2');
  piecesTitle.textContent = 'Chess pieces';
  pieces.append(piecesTitle);

  for (const lesson of pieceLessons) {
    pieces.append(buildPieceLessonMenuItem(state, lesson.title, lesson.icon));
  }

  menu.append(header, pieces);
  menu.append(buildCollapsedCategory('Fundamentals'));
  menu.append(buildCollapsedCategory('Intermediate'));
  menu.append(buildCollapsedCategory('Advanced'));
  return menu;
}

function buildPieceLessonMenuItem(
  state: TutorialState,
  lesson: (typeof pieceLessons)[number]['title'],
  icon: string,
): HTMLElement {
  const lessonChapters = chapterIndexesForLesson(lesson);
  const available = lessonChapters.length > 0;
  const isCurrentLesson = chapters[state.chapterIndex]?.lesson === lesson;

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
  piece.textContent = icon;

  const label = document.createElement('span');
  label.className = 'learn-menu-lesson-label';
  label.textContent = lesson;

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
  return {
    ...fogOfWarVariant.createInitialState(`learn-${id}`),
    board,
    status: { type: 'playing', turn: 'white' },
    castlingRights: [],
    halfmoveClock: 0,
    moveNumber: 1,
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
