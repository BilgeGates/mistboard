import { boardFen, mountBoard } from '@mistboard/board-render/interactive';
import type { Board, Color, PieceRole, Square } from '@mistboard/game';
import type { Config } from 'chessground/config';

type ChessPieceSpec = {
  color: Color;
  role: PieceRole;
};

type BoardSpec = {
  title: string;
  caption: string;
  board: Board;
  orientation?: Color;
  lastMove?: [Square, Square];
  classes?: Map<Square, string>;
};

const CHESS_TO_DOBUTSU: Record<PieceRole, string> = {
  king: 'general',
  queen: 'treasure',
  rook: 'chariot',
  bishop: 'elephant',
  knight: 'horse',
  pawn: 'soldier',
};
const BOARD_LIGHT = '#b9a885';
const BOARD_DARK = '#796a50';

const HOME_ROW: PieceRole[] = [
  'rook',
  'knight',
  'bishop',
  'queen',
  'king',
  'bishop',
  'knight',
  'rook',
];

function p(color: Color, role: PieceRole): ChessPieceSpec {
  return { color, role };
}

function startingBoard(): Board {
  const board: Board = {};
  for (let file = 0; file < 8; file += 1) {
    const name = String.fromCharCode('a'.charCodeAt(0) + file);
    board[`${name}1` as Square] = p('white', HOME_ROW[file]!);
    board[`${name}2` as Square] = p('white', 'pawn');
    board[`${name}7` as Square] = p('black', 'pawn');
    board[`${name}8` as Square] = p('black', HOME_ROW[file]!);
  }
  return board;
}

function midgameBoard(): Board {
  return {
    a1: p('white', 'rook'),
    c1: p('white', 'bishop'),
    d1: p('white', 'queen'),
    g1: p('white', 'king'),
    f1: p('white', 'rook'),
    a2: p('white', 'pawn'),
    b2: p('white', 'pawn'),
    c3: p('white', 'knight'),
    e4: p('white', 'pawn'),
    f2: p('white', 'pawn'),
    g2: p('white', 'pawn'),
    h3: p('white', 'pawn'),
    a7: p('black', 'pawn'),
    b7: p('black', 'pawn'),
    c6: p('black', 'knight'),
    d6: p('black', 'pawn'),
    e5: p('black', 'pawn'),
    f7: p('black', 'pawn'),
    g7: p('black', 'pawn'),
    h7: p('black', 'pawn'),
    a8: p('black', 'rook'),
    c8: p('black', 'bishop'),
    d8: p('black', 'queen'),
    g8: p('black', 'king'),
    f8: p('black', 'rook'),
  };
}

function tacticalBoard(): Board {
  return {
    a1: p('white', 'rook'),
    b5: p('white', 'bishop'),
    c4: p('white', 'pawn'),
    d3: p('white', 'queen'),
    e2: p('white', 'king'),
    f3: p('white', 'knight'),
    g2: p('white', 'pawn'),
    h4: p('white', 'pawn'),
    a7: p('black', 'pawn'),
    b6: p('black', 'knight'),
    c7: p('black', 'bishop'),
    d6: p('black', 'queen'),
    e7: p('black', 'king'),
    f6: p('black', 'pawn'),
    g8: p('black', 'rook'),
    h7: p('black', 'pawn'),
  };
}

function fogClasses(): Map<Square, string> {
  return new Map<Square, string>([
    ['a8', 'dobutsu-preview-fog'],
    ['b8', 'dobutsu-preview-fog'],
    ['c8', 'dobutsu-preview-fog'],
    ['f8', 'dobutsu-preview-fog'],
    ['g8', 'dobutsu-preview-fog'],
    ['h8', 'dobutsu-preview-fog'],
    ['a7', 'dobutsu-preview-fog'],
    ['b7', 'dobutsu-preview-fog'],
    ['g7', 'dobutsu-preview-fog'],
    ['h7', 'dobutsu-preview-fog'],
  ]);
}

const BOARDS: BoardSpec[] = [
  {
    title: 'Opening density',
    caption: 'Full back ranks and pawn rows show whether the heads crowd adjacent files.',
    board: startingBoard(),
  },
  {
    title: 'Middle game',
    caption: 'A normal chess cluster with castled kings, open files, and mixed piece scale.',
    board: midgameBoard(),
    lastMove: ['e7', 'e5'],
  },
  {
    title: 'Small/fog stress',
    caption: 'Same raw assets at compact size with fog overlays and last-move highlights.',
    board: tacticalBoard(),
    lastMove: ['d8', 'd6'],
    classes: fogClasses(),
  },
];

export function mountDobutsuChessPreview(root: HTMLElement): void {
  installStyles();
  root.classList.add('dobutsu-chess-preview-route');
  root.replaceChildren();

  const page = document.createElement('main');
  page.className = 'dobutsu-chess-preview';

  const header = document.createElement('header');
  header.className = 'dobutsu-chess-preview__header';
  const title = document.createElement('h1');
  title.textContent = 'Dobutsu Chess Board';
  const summary = document.createElement('p');
  summary.textContent =
    'Existing Dobutsu animal art mapped onto chess pieces, rendered raw without the xiangqi disc.';
  header.append(title, summary);

  const legend = buildLegend();
  const boardGrid = document.createElement('section');
  boardGrid.className = 'dobutsu-chess-preview__boards';
  for (const spec of BOARDS) boardGrid.append(buildBoardCard(spec));

  page.append(header, legend, boardGrid);
  root.append(page);
}

function buildLegend(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'dobutsu-chess-preview__legend';
  for (const role of ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'] as const) {
    const item = document.createElement('div');
    item.className = 'dobutsu-chess-preview__legend-item';

    const art = document.createElement('span');
    art.className = 'dobutsu-chess-preview__legend-art';
    for (const color of ['white', 'black'] as const) {
      const img = document.createElement('img');
      img.src = animalSrc(color, role);
      img.alt = '';
      img.width = 72;
      img.height = 72;
      art.append(img);
    }

    const label = document.createElement('span');
    label.className = 'dobutsu-chess-preview__legend-label';
    label.textContent = `${role} -> ${CHESS_TO_DOBUTSU[role]}`;
    item.append(art, label);
    section.append(item);
  }
  return section;
}

function buildBoardCard(spec: BoardSpec): HTMLElement {
  const article = document.createElement('article');
  article.className = 'dobutsu-chess-preview__card';

  const heading = document.createElement('h2');
  heading.textContent = spec.title;
  const caption = document.createElement('p');
  caption.textContent = spec.caption;
  const board = document.createElement('div');
  board.className = 'dobutsu-chess-preview__board cg-wrap dobutsu-board';

  article.append(heading, board, caption);
  queueMicrotask(() => mountPreviewBoard(board, spec));
  return article;
}

function mountPreviewBoard(el: HTMLElement, spec: BoardSpec): void {
  const config = {
    animation: { enabled: false, duration: 0 },
    coordinates: false,
    coordinatesOnSquares: false,
    fen: boardFen(spec.board),
    highlight: {
      custom: spec.classes ?? new Map(),
      lastMove: true,
    },
    lastMove: spec.lastMove,
    movable: { color: undefined, free: false, dests: new Map() },
    draggable: { enabled: false },
    selectable: { enabled: false },
    premovable: { enabled: false },
    orientation: spec.orientation ?? 'white',
    viewOnly: true,
  } satisfies Config;
  mountBoard(el, config);
}

function animalSrc(color: Color, role: PieceRole): string {
  const familyColor = color === 'white' ? 'red' : 'black';
  return `/piece-sets/xiangqi/animal-dobutsu/${familyColor}-${CHESS_TO_DOBUTSU[role]}.png?v=4`;
}

function checkerboardDataUri(): string {
  const rects: string[] = [`<rect width="8" height="8" fill="${BOARD_DARK}"/>`];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      if ((x + y) % 2 !== 0) continue;
      rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${BOARD_LIGHT}"/>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8">${rects.join('')}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function installStyles(): void {
  if (document.getElementById('dobutsu-chess-preview-styles')) return;
  const style = document.createElement('style');
  style.id = 'dobutsu-chess-preview-styles';
  style.textContent = `
    .dobutsu-chess-preview-route {
      min-height: 100vh;
      background: #141713;
      color: #ece7dc;
    }

    .dobutsu-chess-preview {
      width: min(1440px, 100%);
      margin: 0 auto;
      padding: 24px clamp(16px, 3vw, 40px) 56px;
    }

    .dobutsu-chess-preview__header {
      max-width: 760px;
      margin-bottom: 20px;
    }

    .dobutsu-chess-preview__header h1 {
      margin: 0 0 8px;
      font-size: clamp(28px, 4vw, 44px);
      line-height: 1.05;
      letter-spacing: 0;
    }

    .dobutsu-chess-preview__header p,
    .dobutsu-chess-preview__card p {
      margin: 0;
      color: rgba(236, 231, 220, 0.72);
      line-height: 1.45;
    }

    .dobutsu-chess-preview__legend {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 10px;
      margin: 0 0 24px;
    }

    .dobutsu-chess-preview__legend-item {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 8px;
      min-width: 0;
      padding: 8px 10px;
      border: 1px solid rgba(236, 231, 220, 0.15);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.045);
    }

    .dobutsu-chess-preview__legend-art {
      display: flex;
      width: 56px;
      height: 32px;
      align-items: center;
    }

    .dobutsu-chess-preview__legend-art img {
      width: 34px;
      height: 34px;
      object-fit: contain;
    }

    .dobutsu-chess-preview__legend-art img + img {
      margin-left: -12px;
    }

    .dobutsu-chess-preview__legend-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
      color: rgba(236, 231, 220, 0.82);
    }

    .dobutsu-chess-preview__boards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr));
      gap: 18px;
      align-items: start;
    }

    .dobutsu-chess-preview__card {
      min-width: 0;
    }

    .dobutsu-chess-preview__card h2 {
      margin: 0 0 10px;
      font-size: 16px;
      line-height: 1.2;
      letter-spacing: 0;
    }

    .dobutsu-chess-preview__card p {
      margin-top: 10px;
      font-size: 13px;
    }

    .dobutsu-chess-preview__board.cg-wrap {
      --cg-w: min(100%, 440px);
      width: min(100%, 440px);
      aspect-ratio: 1;
      box-shadow: 0 18px 44px rgba(0, 0, 0, 0.34);
      background: #342c21;
    }

    .dobutsu-chess-preview__card:nth-child(3) .dobutsu-chess-preview__board.cg-wrap {
      --cg-w: min(100%, 320px);
      width: min(100%, 320px);
    }

    .dobutsu-chess-preview-route .dobutsu-board cg-board {
      background-color: ${BOARD_DARK};
      background-image: url("${checkerboardDataUri()}");
      background-size: 100% 100%;
    }

    .dobutsu-chess-preview-route .dobutsu-board cg-board piece {
      background-size: 112%;
      background-position: 50% 50%;
      background-repeat: no-repeat;
      filter: none;
    }

    .dobutsu-chess-preview-route .dobutsu-board piece.king.white {
      background-image: url("${animalSrc('white', 'king')}");
    }
    .dobutsu-chess-preview-route .dobutsu-board piece.queen.white {
      background-image: url("${animalSrc('white', 'queen')}");
    }
    .dobutsu-chess-preview-route .dobutsu-board piece.rook.white {
      background-image: url("${animalSrc('white', 'rook')}");
    }
    .dobutsu-chess-preview-route .dobutsu-board piece.bishop.white {
      background-image: url("${animalSrc('white', 'bishop')}");
    }
    .dobutsu-chess-preview-route .dobutsu-board piece.knight.white {
      background-image: url("${animalSrc('white', 'knight')}");
    }
    .dobutsu-chess-preview-route .dobutsu-board piece.pawn.white {
      background-image: url("${animalSrc('white', 'pawn')}");
    }
    .dobutsu-chess-preview-route .dobutsu-board piece.king.black {
      background-image: url("${animalSrc('black', 'king')}");
    }
    .dobutsu-chess-preview-route .dobutsu-board piece.queen.black {
      background-image: url("${animalSrc('black', 'queen')}");
    }
    .dobutsu-chess-preview-route .dobutsu-board piece.rook.black {
      background-image: url("${animalSrc('black', 'rook')}");
    }
    .dobutsu-chess-preview-route .dobutsu-board piece.bishop.black {
      background-image: url("${animalSrc('black', 'bishop')}");
    }
    .dobutsu-chess-preview-route .dobutsu-board piece.knight.black {
      background-image: url("${animalSrc('black', 'knight')}");
    }
    .dobutsu-chess-preview-route .dobutsu-board piece.pawn.black {
      background-image: url("${animalSrc('black', 'pawn')}");
    }

    .dobutsu-chess-preview-route .dobutsu-board square.last-move {
      background: rgba(255, 216, 92, 0.35);
    }

    .dobutsu-chess-preview-route .dobutsu-board square.dobutsu-preview-fog {
      background:
        repeating-linear-gradient(
          45deg,
          rgba(26, 31, 27, 0.78) 0 8px,
          rgba(40, 48, 42, 0.78) 8px 16px
        ),
        rgba(19, 23, 20, 0.88);
      box-shadow: inset 0 0 0 1px rgba(255, 245, 218, 0.12);
    }

    @media (max-width: 760px) {
      .dobutsu-chess-preview {
        padding-top: 18px;
      }

      .dobutsu-chess-preview__boards {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.append(style);
}
