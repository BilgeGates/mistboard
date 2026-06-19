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
    'Standard shogi rules, the primer behind Dark Shogi: how the eight pieces move, promotion in the far ranks, the drop rule that puts captured pieces back in play, and how a game is won.',
  showSummaryOnPage: false,
  status: 'draft',
  publishedAt: '2026-06-18',
  boardFamily: 'shogi',
  audience: 'Mistboard visitors who want the regular shogi baseline before reading Dark Shogi.',
  thumbnail: { kind: 'svg', svg: START_BOARD_SVG },
  intro: [
    {
      kind: 'paragraph',
      text: 'Shogi (将棋) is Japanese chess, a two-player game on a 9 by 9 board. It shares a common ancestor with chess and xiangqi in the Indian game chaturanga, and took its modern form in Japan by the 16th century. Its signature rule has no equal in Western chess: a captured piece switches sides and can be dropped back onto the board as your own.',
    },
  ],
  sections: [
    {
      heading: 'Board setup',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Shogi is played on a 9 by 9 grid of plain wooden squares, with no colors or markings. Each player starts with 20 pieces filling the three ranks nearest them. Black (the side conventionally drawn at the bottom) moves first, then players alternate.',
        },
        {
          kind: 'raw-svg',
          svg: () => renderShogiBoardSvg(START_VIEW, { showFog: false, showCoords: false }),
          className: 'shogi-figure-board',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: 'The pieces are flat five-sided tiles, the same wood color for both sides. Ownership shows in which way a piece points: every tile aims its tip at the enemy, so the pieces facing up the board are yours and the ones facing down are your opponent\'s. Each tile carries one or two Japanese characters naming the piece.',
        },
      ],
    },
    {
      heading: 'The pieces',
      blocks: [
        {
          kind: 'paragraph',
          text: 'There are eight kinds of piece. The king, rook, and bishop move exactly as they do in chess; the diagrams below cover the five that are unique to shogi, the dots marking every square the piece can move to or capture on. Shogi pieces capture the way they move: you take an enemy piece by moving onto its square, with no separate capturing rule like the chess pawn.',
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
          text: '**Bishop (角):** moves any number of empty squares diagonally, like the chess bishop. With no second bishop and no color-bound partner, a single bishop only ever reaches half the board until it promotes.',
        },
        {
          kind: 'paragraph',
          text: '**Gold general (金):** moves one square straight in any direction, or one square diagonally forward. It cannot step diagonally backward. The gold never promotes, and it is the shape that most promoted pieces turn into.',
        },
        moveDiagram('G'),
        {
          kind: 'paragraph',
          text: '**Silver general (銀):** moves one square straight forward, or one square in any of the four diagonals. It cannot step straight sideways or straight back, which makes a retreating silver slow and a little awkward.',
        },
        moveDiagram('S'),
        {
          kind: 'paragraph',
          text: '**Knight (桂):** jumps to one of two squares, two ranks forward and one file to either side, leaping over anything in between. It is the only jumping piece, and unlike the chess knight it only ever moves forward.',
        },
        moveDiagram('N'),
        {
          kind: 'paragraph',
          text: '**Lance (香):** moves any number of empty squares straight forward, never sideways or back. Think of it as a rook that can only charge ahead.',
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
          text: 'The far three ranks, the opponent\'s home rows, are the promotion zone. A piece may promote when it moves into, within, or out of that zone, by flipping over to its promoted side (usually printed in red). Promotion is a free upgrade and is optional, with one exception below.',
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
          text: 'The king and the gold do not promote. Promotion is forced only when a piece would otherwise have no legal move: a pawn or lance reaching the last rank, or a knight reaching the last two ranks, must promote, because an unpromoted one would be stuck forever.',
        },
      ],
    },
    {
      heading: 'Drops: the rule that defines shogi',
      blocks: [
        {
          kind: 'paragraph',
          text: 'When you capture a piece it does not leave the game. It joins your hand, a reserve of captured pieces beside the board, and switches to your color. On any turn, instead of moving a piece, you may drop one piece from your hand onto an empty square. It arrives unpromoted, facing the enemy, and is now yours to use.',
        },
        {
          kind: 'paragraph',
          text: 'Drops are why shogi rarely simplifies into a quiet endgame: material never really leaves, it changes hands, so attacks can be reinforced from nowhere and the board stays full. A piece you capture today can be parachuted behind your opponent\'s lines tomorrow.',
        },
        {
          kind: 'paragraph',
          text: 'Three restrictions keep drops fair, and the first two govern where a pawn can land. By the **two-pawn** rule (nifu), you cannot drop a pawn onto a file that already holds one of your unpromoted pawns. And you cannot drop a pawn or lance on the last rank, where it could never move again (a knight needs the last two free). Below, a pawn holds the centre file and the far rank is closed: every red square is off limits to a dropped pawn.',
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
          text: 'A king attacked by an enemy piece is **in check**, and you must answer it: move the king to safety, block the line, or capture the attacker. As in chess, you may not make a move that leaves your own king in check.',
        },
        {
          kind: 'paragraph',
          text: 'The game is won by **checkmate**: the opponent\'s king is in check and has no legal way out. Because captured pieces come back as drops, attacks build quickly and games are decided by checkmate far more often than they peter out.',
        },
      ],
    },
    {
      heading: 'Draws',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Draws are rare. **Repetition (千日手, sennichite):** if the same position with the same side to move occurs four times, the game is drawn, unless the repetition was forced by perpetual check, in which case the checking player must do something else or lose.',
        },
        {
          kind: 'paragraph',
          text: '**Impasse (持将棋, jishogi):** if both kings march into the far ranks where they can no longer be mated, the game is settled by counting piece values, with rook and bishop worth five and everything else worth one. There is no stalemate draw: a side with no legal move has simply lost.',
        },
      ],
    },
    relatedClosing({
      heading: 'Where to next',
      lead: 'Shogi is the open-information base game. Add Fog of War for Dark Shogi, where enemy pieces outside your vision disappear, each hand is private, and the king falls by capture.',
      links: [
        { label: 'Read Dark Shogi', href: '/rules/dark-shogi', emphasis: 'primary' },
        { label: 'All rules', href: '/rules', emphasis: 'secondary' },
      ],
    }),
  ],
};
