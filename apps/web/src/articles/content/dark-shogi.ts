import {
  createInitialShogiState,
  createShogiPiece,
  getShogiPlayerView,
  type ShogiBoard,
  type ShogiColor,
  type ShogiHandRole,
  type ShogiPlayerView,
  type ShogiSquare,
  shogiSquareOf,
} from '@mistboard/game';
import { renderShogiBoardSvg, shogiHandKomaSvg } from '../../shogi-render.js';
import type { Article, ArticleBlock } from '../types.js';

// ── Fog diagram builders ─────────────────────────────────────────────────────
// Built from the real fog view (getShogiPlayerView) + the real renderer, so the
// diagrams show exactly what the server would send a player. The in-article boards
// are thunks (they follow the live appearance picker via shogiAppearanceChanged);
// the thumbnail bakes the kanji/wood default.

function allShogiSquares(): ShogiSquare[] {
  const squares: ShogiSquare[] = [];
  for (let file = 1; file <= 9; file += 1) {
    for (let rankIndex = 0; rankIndex < 9; rankIndex += 1) {
      squares.push(shogiSquareOf(file, rankIndex));
    }
  }
  return squares;
}

const EVERY_SQUARE = allShogiSquares();

function truthView(board: ShogiBoard, perspective: ShogiColor = 'black'): ShogiPlayerView {
  return {
    id: 'diagram',
    perspective,
    board,
    hand: {},
    visibleSquares: EVERY_SQUARE,
    legalMoves: [],
    status: { type: 'playing', turn: 'black' },
    moveNumber: 1,
  };
}

function placeSvg(svg: string, x: number, y: number, width: number, height = width): string {
  return svg.replace(
    '<svg ',
    `<svg x="${x}" y="${y}" width="${width}" height="${height}" `,
  );
}

function pairedBoardSvg(input: {
  leftLabel: string;
  leftSvg: string;
  rightLabel: string;
  rightSvg: string;
}): string {
  const boardSize = 340;
  const pad = 18;
  const gap = 34;
  const labelY = 24;
  const boardY = 42;
  const width = pad * 2 + boardSize * 2 + gap;
  const height = boardY + boardSize + 16;
  const rightX = pad + boardSize + gap;
  return `<svg class="shogi-article-pair" viewBox="0 0 ${width} ${height}" role="img" xmlns="http://www.w3.org/2000/svg">
<rect x="0" y="0" width="${width}" height="${height}" rx="10" fill="#fff8e8"/>
<text x="${pad + boardSize / 2}" y="${labelY}" text-anchor="middle" class="shogi-article-pair-label" fill="#3a2c14" font-family="system-ui, sans-serif" font-size="18" font-weight="600">${input.leftLabel}</text>
<text x="${rightX + boardSize / 2}" y="${labelY}" text-anchor="middle" class="shogi-article-pair-label" fill="#3a2c14" font-family="system-ui, sans-serif" font-size="18" font-weight="600">${input.rightLabel}</text>
${placeSvg(input.leftSvg, pad, boardY, boardSize)}
${placeSvg(input.rightSvg, rightX, boardY, boardSize)}
</svg>`;
}

function pieceInHand(role: ShogiHandRole, color: ShogiColor, x: number, y: number): string {
  return placeSvg(shogiHandKomaSvg(role, color, color === 'black'), x, y, 38);
}

function fogHandSlots(x: number, y: number, count: number): string {
  const slots: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const slotX = x + i * 42;
    slots.push(
      `<rect x="${slotX}" y="${y}" width="38" height="38" rx="5" class="shogi-hand-fog-slot" fill="rgba(232, 227, 216, 0.9)" stroke="#c9bda9" stroke-width="1.2"/>`,
    );
  }
  return slots.join('');
}

function handPrivacySvg(): string {
  const width = 700;
  const height = 214;
  const panelWidth = 314;
  const gap = 32;
  const leftX = 18;
  const rightX = leftX + panelWidth + gap;
  const topY = 60;
  const bottomY = 136;
  return `<svg class="shogi-hand-privacy-svg" viewBox="0 0 ${width} ${height}" role="img" xmlns="http://www.w3.org/2000/svg">
<rect x="0" y="0" width="${width}" height="${height}" rx="10" fill="#fff8e8"/>
<text x="${leftX + panelWidth / 2}" y="24" text-anchor="middle" class="shogi-article-pair-label" fill="#3a2c14" font-family="system-ui, sans-serif" font-size="18" font-weight="600">True hands</text>
<text x="${rightX + panelWidth / 2}" y="24" text-anchor="middle" class="shogi-article-pair-label" fill="#3a2c14" font-family="system-ui, sans-serif" font-size="18" font-weight="600">Black sees</text>
<g transform="translate(${leftX} 0)">
<text x="0" y="${topY - 10}" class="shogi-hand-row-label" fill="#736650" font-family="system-ui, sans-serif" font-size="13" font-weight="600">White hand</text>
<rect x="0" y="${topY}" width="${panelWidth}" height="48" rx="7" class="shogi-hand-row" fill="#fbf6ea" stroke="#d2c4ac" stroke-width="1.5"/>
${pieceInHand('R', 'white', 8, topY + 5)}
<text x="0" y="${bottomY - 10}" class="shogi-hand-row-label" fill="#736650" font-family="system-ui, sans-serif" font-size="13" font-weight="600">Black hand</text>
<rect x="0" y="${bottomY}" width="${panelWidth}" height="48" rx="7" class="shogi-hand-row" fill="#fbf6ea" stroke="#d2c4ac" stroke-width="1.5"/>
${pieceInHand('S', 'black', 8, bottomY + 5)}
${pieceInHand('P', 'black', 50, bottomY + 5)}
${pieceInHand('P', 'black', 92, bottomY + 5)}
</g>
<g transform="translate(${rightX} 0)">
<text x="0" y="${topY - 10}" class="shogi-hand-row-label" fill="#736650" font-family="system-ui, sans-serif" font-size="13" font-weight="600">White hand hidden</text>
<rect x="0" y="${topY}" width="${panelWidth}" height="48" rx="7" class="shogi-hand-row" fill="#fbf6ea" stroke="#d2c4ac" stroke-width="1.5"/>
${fogHandSlots(8, topY + 5, 3)}
<text x="0" y="${bottomY - 10}" class="shogi-hand-row-label" fill="#736650" font-family="system-ui, sans-serif" font-size="13" font-weight="600">Black hand visible</text>
<rect x="0" y="${bottomY}" width="${panelWidth}" height="48" rx="7" class="shogi-hand-row" fill="#fbf6ea" stroke="#d2c4ac" stroke-width="1.5"/>
${pieceInHand('S', 'black', 8, bottomY + 5)}
${pieceInHand('P', 'black', 50, bottomY + 5)}
${pieceInHand('P', 'black', 92, bottomY + 5)}
</g>
</svg>`;
}

const START_STATE = createInitialShogiState('diagram');
const START_TRUE_VIEW = truthView(START_STATE.board);
const START_FOG_VIEW = getShogiPlayerView(START_STATE, 'black');
const START_FOG_SVG = renderShogiBoardSvg(START_FOG_VIEW, {
  showFog: true,
  pieceSet: 'kanji',
  boardTheme: 'wood',
  showCoords: false,
});

// Black rook on an open file: it sees up to the first enemy piece (the pawn on
// 5c) and no further, so the king hiding behind it on 5a stays in the fog.
const FIELD_OF_FIRE_ROOK = createShogiPiece('black', 'R');
const FIELD_OF_FIRE_BOARD: ShogiBoard = {
  '5i': createShogiPiece('black', 'K'),
  '5e': FIELD_OF_FIRE_ROOK,
  '5c': createShogiPiece('white', 'P'),
  '5a': createShogiPiece('white', 'K'),
};
const FIELD_OF_FIRE_TARGETS: ShogiSquare[] = ['5d', '5c'];
const FIELD_OF_FIRE_TRUE_VIEW = truthView(FIELD_OF_FIRE_BOARD);
const FIELD_OF_FIRE_VIEW = getShogiPlayerView(
  {
    id: 'diagram',
    board: FIELD_OF_FIRE_BOARD,
    hands: { black: {}, white: {} },
    status: { type: 'playing', turn: 'black' },
    moveNumber: 1,
  },
  'black',
);

function openingDiagram(): ArticleBlock {
  return {
    kind: 'raw-svg',
    svg: () =>
      pairedBoardSvg({
        leftLabel: 'Server truth',
        leftSvg: renderShogiBoardSvg(START_TRUE_VIEW, { showFog: false, showCoords: false }),
        rightLabel: 'Black sees',
        rightSvg: renderShogiBoardSvg(START_FOG_VIEW, { showFog: true, showCoords: false }),
      }),
    className: 'shogi-figure-pair',
    caption: 'The server holds the full start position. Black receives only its army and the squares those pieces reach.',
  } as ArticleBlock;
}

function fieldOfFireDiagram(): ArticleBlock {
  return {
    kind: 'raw-svg',
    svg: () =>
      pairedBoardSvg({
        leftLabel: 'Server truth',
        leftSvg: renderShogiBoardSvg(FIELD_OF_FIRE_TRUE_VIEW, {
          showFog: false,
          showCoords: false,
          targets: FIELD_OF_FIRE_TARGETS,
        }),
        rightLabel: 'Black sees',
        rightSvg: renderShogiBoardSvg(FIELD_OF_FIRE_VIEW, {
          showFog: true,
          showCoords: false,
          targets: FIELD_OF_FIRE_TARGETS,
        }),
      }),
    className: 'shogi-figure-pair',
    caption: 'The rook sees the pawn it can hit, but the king behind that pawn stays hidden.',
  } as ArticleBlock;
}

function privateHandsDiagram(): ArticleBlock {
  return {
    kind: 'raw-svg',
    svg: () => handPrivacySvg(),
    className: 'shogi-figure-hand',
    caption: 'Captured pieces in your hand are visible to you; the opponent hand is private.',
  } as ArticleBlock;
}

export const darkShogiArticle: Article = {
  slug: 'dark-shogi',
  kind: 'rules',
  title: 'Dark Shogi (Fog of War) Rules',
  summary:
    'Shogi under Fog of War: each side sees only the squares its pieces reach, captured pieces stay private in hand, check warnings disappear, and the king falls by capture.',
  showSummaryOnPage: false,
  status: 'draft',
  publishedAt: '2026-06-18',
  boardFamily: 'shogi',
  audience:
    'Shogi players, dark chess players, and anyone who wants a clean first explanation of shogi under fog.',
  thumbnail: { kind: 'svg', svg: START_FOG_SVG },
  intro: [
    {
      kind: 'paragraph',
      text: 'Dark Shogi is [shogi](/rules/shogi) under Fog of War. Pieces keep their shogi movement, and drops still put captured pieces back into play, but enemy pieces outside your vision are hidden, each side\'s hand is private, and there are no check warnings. Capture the king to win.',
    },
    {
      kind: 'paragraph',
      text: 'For the open-information base game, read [Shogi Rules](/rules/shogi). If you already play shogi, the sections below focus on what fog changes.',
    },
  ],
  sections: [
    {
      heading: 'The starting position',
      blocks: [
        {
          kind: 'paragraph',
          text: 'At the start, you see your own 20 pieces and every square they reach. Everything beyond that is fog. The pair below compares the server\'s true opening board with Black\'s opening view: the pawn rank and the squares just ahead of it are visible, while the far half of the board, including White\'s army, remains hidden.',
        },
        openingDiagram(),
      ],
    },
    {
      heading: 'Vision is field of fire',
      blocks: [
        {
          kind: 'paragraph',
          text: 'You see a square when one of your pieces reaches it. A rook, bishop, or lance sees up to the first piece in its path and stops there, so you see the piece you can hit but nothing behind it. Vision is recomputed from the true board after every move, which means opening a line, advancing a pawn, or dropping a piece changes what you know immediately.',
        },
        {
          kind: 'paragraph',
          text: 'Below, Black\'s rook looks straight up an open file. It sees the White pawn it can capture, but the White king one square behind that pawn stays in the fog. If the pawn moves away, the king appears.',
        },
        fieldOfFireDiagram(),
      ],
    },
    {
      heading: 'Hands are private',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Captured pieces still join your hand, and you can still drop them, but your reserve is yours alone to see. In open shogi both hands sit face-up beside the board. Under fog, you see only your own hand, so you never know exactly what your opponent is holding.',
        },
        privateHandsDiagram(),
        {
          kind: 'paragraph',
          text: 'You can drop into the fog too. A piece dropped onto a square your opponent cannot see stays invisible to them until one of their pieces reaches it. The two-pawn rule still applies, and so do the dead-drop rules: no pawn or lance on the last rank, and no knight on the last two ranks. These restrictions are checked against the true board.',
        },
      ],
    },
    {
      heading: 'Win condition: king capture',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Capture the king and you win on the spot. There is no check and no checkmate. The server never tells you your king is attacked, and it will allow moves that walk into danger or leave a threat unanswered. You must read threats from what your own pieces can see.',
        },
        {
          kind: 'paragraph',
          text: 'Because there is no checkmate, the open-shogi ban on drop-pawn mate does not apply. A pawn dropped where it attacks the king is legal; if the king is captured next move, that capture wins.',
        },
      ],
    },
    {
      heading: 'How a game ends',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The main ending is king capture. The other endings are the ordinary ones for a timed online game: running out of time, resigning, or abandoning the board. There is no checkmate to call the game early, so play continues until a king actually comes off the board.',
        },
      ],
    },
    {
      heading: 'Play status',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Dark Shogi is in development on Mistboard and is not playable yet. This page is the rules reference, not a launch announcement. For the open-information base game, read Shogi Rules. For chess under the same fog model, read Dark Chess.',
        },
        {
          kind: 'cta',
          buttons: [
            { label: 'Shogi Rules', href: '/rules/shogi', emphasis: 'secondary' },
            { label: 'Dark Chess', href: '/rules/dark-chess', emphasis: 'secondary' },
            { label: 'All rules', href: '/rules', emphasis: 'secondary' },
          ],
        } as ArticleBlock,
      ],
    },
  ],
};
