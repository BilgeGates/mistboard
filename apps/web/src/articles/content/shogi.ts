import {
  controlledSquares,
  createInitialShogiState,
  createShogiPiece,
  type ShogiBoard,
  type ShogiColor,
  type ShogiPieceRole,
  type ShogiPlayerView,
  type ShogiSquare,
  shogiSquareOf,
} from '@mistboard/game';
import { renderShogiBoardSvg } from '../../shogi-render.js';
import { relatedClosing } from '../diagrams.js';
import type { Article, ArticleBlock } from '../types.js';

// ── Diagram builders ─────────────────────────────────────────────────────────
// Shogi has no chessground board family, so the rules diagrams are baked once
// from the real renderer (renderShogiBoardSvg) at module load. Pure SVG strings,
// safe under the Node prerender.

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

function diagramView(board: ShogiBoard, perspective: ShogiColor = 'black'): ShogiPlayerView {
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

// One koma on an empty board, every square it reaches dotted. Black sits at the
// bottom, so a forward-only piece (pawn, lance, knight) dots upward.
function moveDiagram(
  role: ShogiPieceRole,
  promoted = false,
  square: ShogiSquare = '5e',
): ArticleBlock {
  const piece = createShogiPiece('black', role, promoted);
  const board: ShogiBoard = { [square]: piece };
  const targets = controlledSquares(board, square, piece);
  const view = diagramView(board);
  return {
    kind: 'raw-svg',
    // A thunk (not a baked string) so the diagram follows the live appearance
    // picker: renderShogiBoardSvg reads the stored piece set + board theme, and
    // articles.ts re-runs it on shogiAppearanceChangedEvent.
    svg: () => renderShogiBoardSvg(view, { showFog: false, targets, showCoords: false }),
    className: 'shogi-figure-move',
  } as ArticleBlock;
}

// The two pawn-drop restrictions on one board: a pawn already holds the centre
// file (the two-pawn rule, nifu), and the last rank is closed (a dropped pawn
// there could never move). Every red square is off limits to a dropped pawn.
function pawnDropDiagram(): ArticleBlock {
  const pawnSquare: ShogiSquare = '5f';
  const file: ShogiSquare[] = ['5a', '5b', '5c', '5d', '5e', '5f', '5g', '5h', '5i'];
  const lastRank: ShogiSquare[] = ['1a', '2a', '3a', '4a', '5a', '6a', '7a', '8a', '9a'];
  const board: ShogiBoard = { [pawnSquare]: createShogiPiece('black', 'P', false) };
  const view = diagramView(board);
  const forbidden = [...new Set<ShogiSquare>([...file, ...lastRank])].filter(
    (square) => square !== pawnSquare,
  );
  return {
    kind: 'raw-svg',
    svg: () => renderShogiBoardSvg(view, { showFog: false, showCoords: false, forbidden }),
    className: 'shogi-figure-move',
  } as ArticleBlock;
}

const START_VIEW = diagramView(createInitialShogiState('diagram').board);
// Baked kanji/wood for the index/rail thumbnail (a static brand image); the
// in-article board below uses a live thunk instead.
const START_BOARD_SVG = renderShogiBoardSvg(START_VIEW, {
  showFog: false,
  pieceSet: 'kanji',
  boardTheme: 'wood',
  showCoords: false,
});

export const shogiArticle: Article = {
  slug: 'shogi',
  kind: 'rules',
  title: 'Shogi Rules',
  summary:
    'Standard shogi rules, the open-information primer behind Dark Shogi: setup, piece movement, promotion, drops, and how games end.',
  showSummaryOnPage: false,
  status: 'draft',
  publishedAt: '2026-06-18',
  boardFamily: 'shogi',
  audience: 'Mistboard visitors who want the regular shogi baseline before reading Dark Shogi.',
  thumbnail: { kind: 'svg', svg: START_BOARD_SVG },
  intro: [
    {
      kind: 'paragraph',
      text: 'Shogi (将棋), often called Japanese chess, is a two-player strategy game on a 9 by 9 board. It shares ancestry with chess and xiangqi through the Indian game chaturanga, and took its modern form in Japan by the 16th century. Its defining rule is the drop: a captured piece switches sides and can return to the board as your own.',
    },
  ],
  sections: [
    {
      heading: 'Board setup',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Shogi is played on a plain wooden 9 by 9 grid, with no alternating colors. Each player starts with 20 pieces spread across the three ranks nearest them. Black, or sente, is conventionally drawn at the bottom and moves first; White, or gote, moves second.',
        },
        {
          kind: 'raw-svg',
          svg: () => renderShogiBoardSvg(START_VIEW, { showFog: false, showCoords: false }),
          className: 'shogi-figure-board',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: 'The pieces are flat five-sided tiles, the same wood color for both sides. Ownership comes from direction: every tile points toward the opponent, so the pieces facing up the board belong to Black and the pieces facing down belong to White. Each tile carries one or two Japanese characters naming the piece.',
        },
      ],
    },
    {
      heading: 'The pieces',
      blocks: [
        {
          kind: 'paragraph',
          text: 'There are eight kinds of piece. The king, rook, and bishop move as they do in chess; the diagrams below cover the five that are specific to shogi, with dots marking every square the piece can move to or capture on. Shogi pieces capture the way they move: move onto an enemy piece to take it.',
        },
        {
          kind: 'paragraph',
          text: '**King (王 / 玉):** moves one square in any of the eight directions, exactly like the chess king.',
        },
        {
          kind: 'paragraph',
          text: '**Rook (飛):** moves any number of empty squares straight along a rank or file, like the chess rook. The first piece in its path stops it, and an enemy there can be captured.',
        },
        {
          kind: 'paragraph',
          text: '**Bishop (角):** moves any number of empty squares diagonally, like the chess bishop. With only one bishop, it reaches only half the board until it promotes.',
        },
        {
          kind: 'paragraph',
          text: '**Gold general (金):** moves one square orthogonally in any direction, or one square diagonally forward. It cannot step diagonally backward. The gold never promotes, and most promoted pieces use the gold\'s move.',
        },
        moveDiagram('G'),
        {
          kind: 'paragraph',
          text: '**Silver general (銀):** moves one square straight forward, or one square in any of the four diagonals. It cannot step straight sideways or straight back, so a silver attacks flexibly but retreats slowly.',
        },
        moveDiagram('S'),
        {
          kind: 'paragraph',
          text: '**Knight (桂):** jumps to one of two squares, two ranks forward and one file to either side, leaping over anything in between. It is the only jumping piece, and unlike the chess knight it only ever moves forward.',
        },
        moveDiagram('N'),
        {
          kind: 'paragraph',
          text: '**Lance (香):** moves any number of empty squares straight forward, never sideways or back. It is a rook reduced to one forward file.',
        },
        moveDiagram('L'),
        {
          kind: 'paragraph',
          text: '**Pawn (歩):** moves and captures one square straight forward. There is no two-square first move and no diagonal capture: the shogi pawn does everything with that single forward step.',
        },
        moveDiagram('P'),
      ],
    },
    {
      heading: 'Promotion',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The far three ranks on the opponent\'s side are the promotion zone. A piece may promote when it moves into, within, or out of that zone, flipping to its promoted side (usually printed in red). Promotion is optional, except when an unpromoted piece would otherwise have no future move.',
        },
        {
          kind: 'paragraph',
          text: 'Rook and bishop keep their long range and gain a little more. A promoted **rook (龍, dragon)** moves as a rook plus one square diagonally. A promoted **bishop (馬, horse)** moves as a bishop plus one square straight. The dragon and horse below show each long-range line with its added one-square steps.',
        },
        moveDiagram('R', true),
        moveDiagram('B', true),
        {
          kind: 'paragraph',
          text: 'The silver, knight, lance, and pawn all promote to the **gold general\'s** move shown earlier: one step in any straight direction plus the two forward diagonals. A promoted pawn (と, tokin) is the workhorse of shogi, a cheap piece that suddenly moves like a gold.',
        },
        {
          kind: 'paragraph',
          text: 'The king and gold do not promote. Promotion is forced only when a piece would otherwise have no legal move: a pawn or lance reaching the last rank, or a knight reaching the last two ranks, must promote.',
        },
      ],
    },
    {
      heading: 'Drops: the rule that defines shogi',
      blocks: [
        {
          kind: 'paragraph',
          text: 'When you capture a piece, it does not leave the game. It joins your hand, the reserve of captured pieces beside the board, and switches to your side. On any turn, instead of moving a piece already on the board, you may drop one piece from your hand onto an empty square. It enters unpromoted, points toward the opponent, and is now yours to use.',
        },
        {
          kind: 'paragraph',
          text: 'Drops are why shogi rarely simplifies into a quiet endgame. Material never truly disappears, it changes hands. Attacks can be reinforced from reserve, and the board stays tactically full long after the first exchanges.',
        },
        {
          kind: 'paragraph',
          text: 'Three restrictions keep drops fair, and the first two govern where a pawn can land. By the **two-pawn** rule (nifu), you cannot drop a pawn onto a file that already holds one of your unpromoted pawns. You also cannot drop a pawn or lance on the last rank, where it could never move again (a knight needs the last two ranks free). Below, a pawn holds the centre file and the far rank is closed: every red square is off limits to a dropped pawn.',
        },
        pawnDropDiagram(),
        {
          kind: 'paragraph',
          text: 'The third is the **drop-pawn-mate** rule (uchifuzume): you cannot drop a pawn that gives immediate checkmate, though you may freely move a pawn into the same mate.',
        },
      ],
    },
    {
      heading: 'Check and checkmate',
      blocks: [
        {
          kind: 'paragraph',
          text: 'A king attacked by an enemy piece is **in check**, and the checked player must answer it: move the king to safety, block the line, or capture the attacker. As in chess, you may not make a move that leaves your own king in check.',
        },
        {
          kind: 'paragraph',
          text: 'The game is won by **checkmate**: the opponent\'s king is in check and has no legal way out. Because captured pieces return as drops, attacks build quickly and games are usually decided by mate rather than by quiet simplification.',
        },
      ],
    },
    {
      heading: 'Draws',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Draws are rare. **Repetition (千日手, sennichite):** if the same position with the same side to move occurs four times, the game is drawn, unless one player is forcing the cycle with perpetual check. In that case, the checking player must choose another move or lose.',
        },
        {
          kind: 'paragraph',
          text: '**Impasse (持将棋, jishogi):** if both kings enter the far ranks and can no longer realistically be mated, the game is settled by counting piece values, with rook and bishop worth five and everything else worth one. There is no stalemate draw: a side with no legal move has lost.',
        },
      ],
    },
    {
      heading: 'A famous game',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'To see shogi\'s pieces, promotions, and drops work together in a real game, step through the 61st NHK Cup final from March 18, 2012. Yoshiharu Habu defeated Akira Watanabe in 147 moves, winning his fourth consecutive NHK Cup and becoming the first Lifetime NHK Cup Champion. Watanabe resigns after 147.Gx9c.',
        },
        {
          kind: 'shogi-replay',
          spec: {
            // The public western score for this game has a few transcription
            // errors that do not replay legally: 10.P-4b is S-4b, 24.P-7c is
            // P-7d, and 136.Lx8e+ is unpromoted Lx8e. The 11.G4i-5h origin is
            // added to disambiguate which gold moves.
            notation:
              'P-7f P-8d S-6h P-3d P-6f S-6b P-5f P-5d S-4h S-4b G4i-5h G-3b G-7h K-4a K-6i G-5b S-7g S-3c B-7i B-3a P-3f P-4d G5h-6g P-7d S-3g B-6d B-6h G5b-4c K-7i K-3a K-8h K-2b S-4f S-5c N-3g P-9d P-1f P-1d P-2f B-7c R-3h S-2d L-1h P-9e P-6e P-8e N-2e S-4b P-3e Sx3e Sx3e Px3e P-1e S*3g R-3i Px1e P-6d Bx6d Lx1e Lx1e S*6e Sx2f+ Sx6d Px6d Rx3e S*2d Nx1c+ Nx1c P*1d Sx3e Bx3e P*1b Px1c+ Px1c B*7a +S-2e B3ex4d Gx4d Bx4d+ S-3c +B-7a R-4b P*3d Sx3d N*4f R*3i S*4h R-3f+ +Bx8a P*4e Nx3d +Rx3d +Bx9a P-8f +Bx6d Px8g+ Kx8g P*8e K-8h N*8f G7h-6h P-9f P*3e +Sx3e P*3f +Sx3f L*3i N*9e N*2f +R-3e Sx8f R-6b Sx9e Rx6d Lx3f +Rx3f S*4d P-1d N*3d K-1b S*3c L*8f Sx8f Px8f N*2d Px2d Sx3b P-8g+ Kx8g L*8a P*8d Lx8d P*8e Rx6g+ Gx6g Lx8e Kx9f G*8f K-9e B*7c G*8d P*9d Kx9d B*7b L*8c P*9c Gx9c',
            sente: 'Yoshiharu Habu',
            gote: 'Akira Watanabe',
            event: '61st NHK Cup Final, 2012',
            resultText: 'Watanabe resigns. Habu (Sente) wins the 61st NHK Cup final.',
          },
        } as ArticleBlock,
      ],
    },
    relatedClosing({
      heading: 'Where to next',
      lead: 'Shogi is the open-information base game. Dark Shogi keeps the same movement and drops, then adds fog: enemy pieces outside your vision disappear, hands are private, and the king falls by capture.',
      links: [
        { label: 'Read Dark Shogi', href: '/rules/dark-shogi', emphasis: 'primary' },
        { label: 'All rules', href: '/rules', emphasis: 'secondary' },
      ],
    }),
  ],
};
