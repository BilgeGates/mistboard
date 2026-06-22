import {
  CROSSROADS_CHESS_SAMPLE_GAME,
  CROSSROADS_CHESS_START_FEN,
  relatedClosing,
  renderCrossroadsChessBoard,
  renderCrossroadsChessRow,
} from '../diagrams.js';
import type { Article, ArticleBlock } from '../types.js';

export const crossroadsChessArticle: Article = {
    slug: 'crossroads-chess',
    kind: 'rules',
    playableOnMistboard: true,
    title: 'Crossroads Chess Rules',
    summary:
      'A modern variant that fuses chess and xiangqi on a 6 by 8 river board. The pieces you already know from both games, and two ways to win: checkmate, or race your king across.',
    showSummaryOnPage: false,
    showInIndex: false,
    status: 'published',
    publishedAt: '2026-06-11',
    audience: 'Mistboard readers who know chess or xiangqi and want the Crossroads Chess rules.',
    thumbnail: { kind: 'svg', svg: renderCrossroadsChessBoard({ fen: CROSSROADS_CHESS_START_FEN }) },
    intro: [
      {
        kind: 'paragraph',
        text:
          'Crossroads Chess puts chess and xiangqi on one board: six files by eight ranks, split by a river. Each side has a king, an army, and a finish line behind the enemy pieces.',
      },
      {
        kind: 'paragraph',
        text:
          'Most pieces move as they do in their parent games. The rule that changes everything is the race: checkmate wins, and so does getting your own king safely to the far rank.',
      },
    ],
    sections: [
      {
        heading: 'Board setup',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'The river lies between the fourth and fifth ranks. As in xiangqi, only soldiers care about crossing it.',
          },
          {
            kind: 'raw-svg',
            svg: renderCrossroadsChessBoard({ fen: CROSSROADS_CHESS_START_FEN }),
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              'White moves first. The armies start in rotational symmetry: turn the board 180 degrees and the position is unchanged.',
          },
        ],
      },
      {
        heading: 'The pieces',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'The highlighted squares below show legal moves and captures for each marked piece.',
          },
          { kind: 'sub-heading', text: 'From chess' },
          {
            kind: 'paragraph',
            text:
              '**King:** moves one square in any direction. It may not move onto a square attacked by the opponent. The king is also your racing piece (see How to win).',
          },
          {
            kind: 'raw-svg',
            svg: renderCrossroadsChessBoard({
              fen: '6/6/6/6/2K3/6/6/6',
              moveDots: ['b5', 'c5', 'd5', 'b4', 'd4', 'b3', 'c3', 'd3'],
            }),
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Bishop:** moves any number of squares diagonally. Both bishops are dark-square bishops: they start on dark squares and remain on dark squares for the whole game.',
          },
          {
            kind: 'raw-svg',
            svg: renderCrossroadsChessBoard({
              fen: '6/6/6/6/2B3/6/6/6',
              moveDots: ['a6', 'b5', 'd5', 'e6', 'f7', 'a2', 'b3', 'd3', 'e2', 'f1'],
            }),
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Knight:** moves in an L shape, two squares one way and one square sideways. It jumps over any pieces in its path.',
          },
          {
            kind: 'raw-svg',
            svg: renderCrossroadsChessBoard({
              fen: '6/6/6/6/2N3/6/6/6',
              moveDots: ['a5', 'b6', 'd6', 'e5', 'a3', 'b2', 'd2', 'e3'],
            }),
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Pawn:** moves one square straight forward into an empty square, or two squares from its starting position, and never moves backward. It captures one square diagonally forward (the red rings), never straight ahead. When it reaches the far rank it promotes to a queen.',
          },
          {
            kind: 'raw-svg',
            svg: renderCrossroadsChessRow([
              {
                fen: '6/6/6/6/6/2n1o1/3P2/6',
                moveDots: ['d3', 'd4'],
                captures: ['c3', 'e3'],
                label: 'FROM START',
              },
              {
                fen: '6/6/6/3P2/6/6/6/6',
                moveDots: ['d6'],
                label: 'AFTER MOVING',
              },
            ]),
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Queen:** a pawn that reaches the far rank promotes to a queen. The queen moves any number of squares horizontally, vertically, or diagonally.',
          },
          {
            kind: 'raw-svg',
            svg: renderCrossroadsChessRow([
              {
                fen: '6/5P/6/6/6/6/6/6',
                arrows: [{ from: 'f7', to: 'f8' }],
                label: 'PROMOTE',
              },
              {
                fen: '5Q/6/6/6/6/6/6/6',
                moveDots: [
                  'a8',
                  'b8',
                  'c8',
                  'd8',
                  'e8',
                  'f7',
                  'f6',
                  'f5',
                  'f4',
                  'f3',
                  'f2',
                  'f1',
                  'e7',
                  'd6',
                  'c5',
                  'b4',
                  'a3',
                ],
                label: 'QUEEN',
              },
            ]),
          } as ArticleBlock,
          { kind: 'sub-heading', text: 'From xiangqi' },
          {
            kind: 'paragraph',
            text:
              '**Chariot:** moves any number of squares horizontally or vertically and cannot jump, exactly like a rook.',
          },
          {
            kind: 'raw-svg',
            svg: renderCrossroadsChessBoard({
              fen: '6/6/6/6/2V3/6/6/6',
              moveDots: ['c8', 'c7', 'c6', 'c5', 'c3', 'c2', 'c1', 'a4', 'b4', 'd4', 'e4', 'f4'],
            }),
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Cannon:** moves like a chariot when it is not capturing. To capture, it jumps over exactly one piece, friend or foe, called the screen, and lands on an enemy piece beyond it.',
          },
          {
            kind: 'raw-svg',
            svg: renderCrossroadsChessRow([
              {
                fen: '6/6/6/6/2C3/6/6/6',
                moveDots: ['c8', 'c7', 'c6', 'c5', 'c3', 'c2', 'c1', 'a4', 'b4', 'd4', 'e4', 'f4'],
                label: 'MOVE',
              },
              {
                fen: '6/6/2b3/6/2o3/6/6/2C3',
                moveDots: ['c2', 'c3'],
                captures: ['c6'],
                highlights: ['c4'],
                label: 'CAPTURE (jump the screen)',
              },
            ]),
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Horse:** moves like the knight, one square orthogonally and then one square diagonally outward, **but it does not jump.** Only the adjacent leg square can block it. If that square is occupied, the two moves through that leg disappear; pieces farther along the line do not block by themselves.',
          },
          {
            kind: 'raw-svg',
            svg: renderCrossroadsChessRow([
              {
                fen: '6/6/6/6/2H3/6/6/6',
                moveDots: ['a5', 'b6', 'd6', 'e5', 'a3', 'b2', 'd2', 'e3'],
                label: 'MOVES LIKE THE KNIGHT',
              },
              {
                fen: '6/6/6/2P3/2H1o1/6/6/6',
                moveDots: ['a5', 'e5', 'a3', 'b2', 'd2', 'e3'],
                highlights: ['c5'],
                crosses: ['b6', 'd6'],
                label: 'ONLY THE LEG BLOCKS',
              },
            ]),
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              '**Soldier:** moves one square straight forward, to move or to capture, and never backward. After it crosses the river it may also move one square sideways. It never promotes.',
          },
          {
            kind: 'raw-svg',
            svg: renderCrossroadsChessRow([
              { fen: '6/6/6/6/6/2O3/6/6', moveDots: ['c4'], label: 'BEFORE THE RIVER' },
              { fen: '6/6/2O3/6/6/6/6/6', moveDots: ['c7', 'b6', 'd6'], label: 'AFTER CROSSING' },
            ]),
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text:
              'The pawn and the soldier are opposites worth remembering: the pawn moves straight and captures diagonally, while the soldier both moves and captures straight ahead.',
          },
        ],
      },
      {
        heading: 'How to win',
        blocks: [
          { kind: 'sub-heading', text: 'Checkmate' },
          {
            kind: 'paragraph',
            text:
              'The king is protected by check, as in chess and xiangqi. A king is in check when an enemy piece attacks it, and the player in check must answer by moving the king, blocking the line of attack, or capturing the attacker. If there is no legal answer, it is checkmate and the checked player loses.',
          },
          { kind: 'sub-heading', text: 'The race' },
          {
            kind: 'paragraph',
            text:
              'The king is also a runner. Move your king onto an enemy back-rank square that is not protected by the enemy, and you win at once. White wins by landing the king on the eighth rank, Red by landing on the first.',
          },
          {
            kind: 'raw-svg',
            svg: renderCrossroadsChessRow([
              {
                fen: '2vV2/4Ko/kC4/2O3/p5/O5/5P/6',
                arrows: [{ from: 'e7', to: 'e8' }],
                highlights: ['e7', 'e8'],
                label: 'THE KING RACES IN',
              },
              {
                fen: '2vVK1/6/kC3o/2O3/p5/O5/5P/6',
                highlights: ['e8'],
                label: 'RANK 8: WHITE WINS',
              },
            ]),
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Draws',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'By design, Crossroads Chess has a very low draw rate and games are meant to be fought out. Stalemate is a loss for the player with no legal move. Threefold repetition is also a loss, charged to the side that forces the repetition. Only the fifty-move rule can draw a game, after a long run with no capture and no pawn move.',
          },
        ],
      },
      {
        heading: 'A sample game',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'The replay below is a Fairy-Stockfish self-play game showing the pieces in motion. The sides trade down through the middlegame, then White wins the race by marching the king to the eighth rank.',
          },
          {
            kind: 'crossroads-replay',
            spec: {
              white: CROSSROADS_CHESS_SAMPLE_GAME.white,
              red: CROSSROADS_CHESS_SAMPLE_GAME.red,
              event: CROSSROADS_CHESS_SAMPLE_GAME.event,
              resultText: CROSSROADS_CHESS_SAMPLE_GAME.result,
              moves: CROSSROADS_CHESS_SAMPLE_GAME.moves,
            },
          } as ArticleBlock,
        ],
      },
      {
        heading: 'The nature of the game',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'The early game often becomes a race of pawn and soldier advances, because both armies can cross the center quickly. The endgame is less about holding a fortress than managing king routes: your king must stay safe, but it is also the fastest way to win.',
          },
        ],
      },
      relatedClosing({
        heading: 'Where to next',
        lead: 'Start a local game, or read the rules of the two games Crossroads Chess borrows from.',
        layout: 'single-row',
        links: [
          {
            label: 'Play Crossroads Chess',
            href: '/?play=friend&gameSpecId=crossroads-chess',
            emphasis: 'primary',
          },
          { label: 'Chess rules', href: '/rules/chess', emphasis: 'secondary' },
          { label: 'Xiangqi rules', href: '/rules/xiangqi', emphasis: 'secondary' },
          { label: 'Back to all rules', href: '/rules', emphasis: 'secondary' },
        ],
      }),
    ],
};
