import { darkChessVariant, type Square } from '@mistboard/game';
import { ARTICLE_OG_POSITIONS, fogFor, replayMoves } from '../diagrams.js';
import type { Article, ArticleBlock } from '../types.js';

// The position after 1.c4 d5 2.Qa4 e5, taken from a real game (chess.com
// #104462605). White is on move and the a4-e8 diagonal is clear, so the queen
// can see the black king. Built through the kernel rather than hand-placed so
// the diagram cannot drift from the rules.
const RAID_LINE = replayMoves(darkChessVariant.createInitialState('fog-openings-raid'), [
  { from: 'c2' as Square, to: 'c4' as Square },
  { from: 'd7' as Square, to: 'd5' as Square },
  { from: 'd1' as Square, to: 'a4' as Square },
  { from: 'e7' as Square, to: 'e5' as Square },
  { from: 'a4' as Square, to: 'e8' as Square },
]);
const BEFORE_RAID = RAID_LINE[4]!;
const AFTER_RAID = RAID_LINE[5]!;

// Same opening, but Black covers the diagonal's midpoint. The queen's sight
// stops at c6 and the king is hidden again.
const BLOCKED = replayMoves(darkChessVariant.createInitialState('fog-openings-blocked'), [
  { from: 'c2' as Square, to: 'c4' as Square },
  { from: 'd7' as Square, to: 'd5' as Square },
  { from: 'd1' as Square, to: 'a4' as Square },
  { from: 'b8' as Square, to: 'c6' as Square },
])[4]!;

export const fogOpeningsArticle: Article = {
  slug: 'fog-openings',
  kind: 'article',
  publisher: 'mistboard',
  title: 'The Three-Move Kill in Fog Chess',
  // "Fog Chess" is our name; "fog of war chess" is what players search.
  seoTitle: 'Fog of War Chess Openings: The Three-Move Kill',
  summary:
    'A Fog of War chess opening trap that captures the king on move three, and the Qa4 system it belongs to. Measured across 598 games: which Black replies switch it on, which stop it dead, and what actually happens to the queen afterwards.',
  status: 'draft',
  publishedAt: '2026-08-16',
  audience:
    'Fog of War players who want opening theory, and anyone who has lost a game on move three without understanding why.',
  thumbnail: ARTICLE_OG_POSITIONS['dark-chess'],
  intro: [
    {
      kind: 'paragraph',
      text:
        'There is an opening trap in Fog Chess that ends the game on move three. Everyone who plays enough of it eventually loses to it, then starts playing it themselves. As far as I can find, nobody has written it down.',
    },
    {
      kind: 'paragraph',
      text:
        'These numbers come from 1,949 of my own games, 598 of them with this system on the board, so it is measurable rather than remembered. It came up 54 times and landed 54 times. More usefully, the games say exactly which Black replies switch it on, which kill it outright, and what happens to the queen after it misses.',
    },
    {
      kind: 'paragraph',
      text:
        'One caveat first, because it colours everything below: these are one player’s games. It is a record of what worked against the people I played, not opening theory.',
    },
  ],
  sections: [
    {
      heading: 'The opening',
      blocks: [
        {
          kind: 'code',
          text: '1. c4    (anything)\n2. Qa4   (anything)\n3. Qxe8',
        },
        {
          kind: 'paragraph',
          text:
            'The queen goes to a4, then runs the a4-b5-c6-d7-e8 diagonal and takes the king on its home square. Under normal rules this is nonsense: your opponent watches the queen arrive, sees the diagonal pointing at their king, and blocks it or moves out.',
        },
        {
          kind: 'live-boards',
          spec: {
            layout: 'pair',
            boards: [
              {
                board: BEFORE_RAID.board,
                orientation: 'white',
                label: "WHAT'S ON THE BOARD",
                arrows: [{ orig: 'a4', dest: 'e8' }],
              },
              {
                board: BEFORE_RAID.board,
                fogSquares: fogFor(BEFORE_RAID, 'black'),
                orientation: 'black',
                label: 'WHAT BLACK CAN SEE',
              },
            ],
          },
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text:
            'Same position, same moment. Black has a legal move that stops this and no reason on earth to play it.',
        },
        {
          kind: 'live-boards',
          spec: {
            layout: 'pair',
            boards: [
              {
                board: AFTER_RAID.board,
                orientation: 'white',
                label: 'MOVE THREE',
                highlightSquares: ['e8' as Square],
              },
              {
                board: BLOCKED.board,
                orientation: 'white',
                label: 'OR: 2...Nc6 AND IT IS OVER',
                highlightSquares: ['c6' as Square],
              },
            ],
          },
        } as ArticleBlock,
      ],
    },
    {
      heading: 'The queen tells you it is there',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'What makes it work is that White is not guessing. In fog you see your own pieces and every square they can legally move to. A queen on a4 can move along a4-b5-c6-d7-e8 until something blocks her, so when those three intervening squares are empty, e8 is a square White can move to, and White sees what is standing on it.',
        },
        {
          kind: 'paragraph',
          text:
            'The board does not show a suspicion. It shows a black king. That turns the whole thing into a lookup: across 598 games with an early Qa4, White could see the black king on e8 in 54 of them, and took it in all 54.',
        },
      ],
    },
    {
      heading: 'What has to be true',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Three squares: b5, c6, d7. All three have to be empty. b5 and c6 start that way, so Black has to actively cover them. d7 starts with a pawn on it, so Black has to actively vacate it. Both conditions, at once, within two moves.',
        },
        {
          kind: 'paragraph',
          text:
            'That is why the same trap can look inevitable and rare at the same time. It fired in 9% of my Qa4 games, and in every one of those it was a certainty rather than a gamble.',
        },
      ],
    },
    {
      heading: 'What Black plays, and what it costs',
      blocks: [
        {
          kind: 'table',
          headers: ["Black's reply to Qa4", 'games', 'White scores', 'trap landed'],
          rows: [
            ['...Qb6', '18', '61.1%', '0'],
            ['...c6', '20', '67.5%', '0'],
            ['...Nf6', '55', '74.5%', '3'],
            ['...Nc6', '112', '75.0%', '0'],
            ['...e6', '44', '76.1%', '4'],
            ['...Bd7', '32', '78.1%', '0'],
            ['...g6', '33', '81.8%', '0'],
            ['...Bb7', '21', '85.7%', '0'],
            ['...Bg7', '24', '95.8%', '0'],
            ['...d5', '23', '100.0%', '17'],
            ['...dxc4', '17', '100.0%', '17'],
          ],
          highlightRows: [9, 10],
          caption: 'Sorted by how well Black did. The bottom two rows never survived.',
        },
        {
          kind: 'paragraph',
          text:
            'Taking the pawn loses every time. ...dxc4 is 17 for 17, because capturing on c4 vacates d7 and opens the diagonal in the same move. It looks like the most natural move on the board: free material, and the queen that would punish it is invisible. ...d5 is the same mistake one move slower, and it goes 17 of 23.',
        },
        {
          kind: 'paragraph',
          text:
            'Everything at zero is doing one of two jobs. ...Nc6 and ...c6 occupy the diagonal’s midpoint. ...Bd7 refills the square Black’s own pawn just left, which is why it holds even when the d-pawn has moved. Any piece on any of the three squares is enough, and Black almost never places it deliberately.',
        },
        {
          kind: 'paragraph',
          text:
            '...Qb6 is Black’s best at 61.1% and blocks nothing, which I cannot explain. It may be about counterplay against b2 rather than about the diagonal at all. The practical version for Black: leave the d-pawn alone, and if you move it, put something on c6 or d7 immediately.',
        },
      ],
    },
    {
      heading: 'Against 1...d5, the queen comes first',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'White gets two threats and Black gets one move. Qa4 hits the king down the diagonal, so Black has to answer with ...c6 or ...Bd7. Nc3 hits d5 instead, because cxd5 is coming with the knight behind it. Answering one leaves the other.',
        },
        {
          kind: 'table',
          headers: ['after 1.c4 d5', 'games', 'White scores', 'cxd5 followed'],
          rows: [
            ['2. Nc3', '59', '72.9%', '46'],
            ['2. Qa4', '38', '94.7%', '8'],
          ],
          highlightRows: [1],
        },
        {
          kind: 'paragraph',
          text:
            'Playing the queen first is worth roughly twenty points over developing first, though part of that gap is the king captures inflating the Qa4 row, so treat the size loosely and the direction as solid.',
        },
        {
          kind: 'paragraph',
          text:
            'Black mostly does find the defence. 68 of 100 covered c6 or d7 by move three, and doing it pulls White down from 81.0% to 72.1%. The threat does not win the game on its own. It buys the whole opening, because Black spends their first free moves answering a queen they cannot see instead of developing.',
        },
      ],
    },
    {
      heading: 'Against 1...e6 and 1...e5, watch f2 and then stop worrying',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The standard fear here is ...Bc5 and ...Qf6 both landing on f2, the square defended only by the king. It is the right thing to watch for and it has cost me almost nothing.',
        },
        {
          kind: 'table',
          headers: ['after 1.c4 e6 or e5', 'games', 'White scores'],
          rows: [
            ['Black played ...Bc5 by move 6', '41', '95.1%'],
            ['Black played ...Qf6 by move 6', '28', '85.7%'],
            ['both', '16', '87.5%'],
            ['something actually captured on f2', '22', '79.5%'],
            ['...of the ...Bc5 games', '9', '94.4%'],
          ],
          highlightRows: [0],
        },
        {
          kind: 'paragraph',
          text:
            '...Bc5 is one of the worst moves played against me in the whole corpus. Even when a piece does take on f2 I win four out of five. My guess is that taking f2 in fog costs more than it does in normal chess: the piece that grabs it is deep in a position it cannot see, it has spent two moves getting there, and it has captured a pawn rather than found anything out. Meanwhile the queenside threat is still live and still invisible.',
        },
        {
          kind: 'paragraph',
          text:
            'I have played f3, Nh3 and Nf3 against it and all three show 100%, on five to ten games each, which is not enough to recommend any of them over the others.',
        },
      ],
    },
    {
      heading: 'You detect the bishop by losing sight of a square',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Missing destinations are information in fog, which is a general habit worth having. This line is the sharpest concrete case of it I know.',
        },
        {
          kind: 'paragraph',
          text:
            'You see the squares your pieces can legally move to. A pawn on c4 can advance to c5, so c5 is visible. A pawn cannot advance onto an occupied square, so the moment a black bishop lands on c5, that square stops being a legal destination and drops out of your vision entirely.',
        },
        {
          kind: 'paragraph',
          text:
            'You never see the bishop. You see c5 go dark. A square you had been watching all game quietly stops reporting, and the thing that left is the thing telling you.',
        },
        {
          kind: 'paragraph',
          text:
            'It is also why c4 beats c3 as the first move here. c4 buys vision of c5, the square Black contests the centre from, and c3 does not. You pick the move partly for what it lets you watch.',
        },
      ],
    },
    {
      heading: 'The queen does not need rescuing',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'An early queen sortie should get harassed, so I expected the games to show a cost for leaving it on a4. The queen was captured on a4 three times in 598 games.',
        },
        {
          kind: 'table',
          headers: ['when the queen leaves a4', 'games', 'White scores'],
          rows: [
            ['by move 5', '251', '76.1%'],
            ['moves 6-10', '195', '74.1%'],
            ['after move 10', '89', '84.8%'],
          ],
          highlightRows: [2],
        },
        {
          kind: 'paragraph',
          text:
            'Some of that is reversed causation. A game that is going well never forces a retreat, so "stayed longer" partly means "was already winning". But the thing I believed going in, that the queen has to come home before it gets trapped, is not visible anywhere in 598 games.',
        },
        {
          kind: 'paragraph',
          text:
            'Under fog a piece deep in enemy territory is not the liability it is in normal chess, because the opponent has to find it before they can attack it. The queen on a4 is doing what any invisible piece does: forcing Black to defend against a threat they cannot confirm exists.',
        },
      ],
    },
    {
      heading: 'It only works downward',
      blocks: [
        {
          kind: 'table',
          headers: ['opponent rating', 'Qa4 score', 'games'],
          rows: [
            ['under 1500', '91.4%', '58'],
            ['1500-1799', '88.7%', '260'],
            ['1800-2099', '68.8%', '221'],
            ['2100+', '39.6%', '24'],
          ],
        },
        {
          kind: 'paragraph',
          text:
            'The 54 traps follow the same shape. Median victim rating 1500, highest 1879, not one above 2000.',
        },
        {
          kind: 'paragraph',
          text:
            'Read that table carefully. The bands are opponent rating, and my own rating moved from 1500 to 2140 across these games, so the 2100+ row partly measures "strong players beat the weaker version of me" rather than anything about the opening. The comparison that survives is Qa4 against the developing alternative Nc3 within each band, and there Qa4 wins all four.',
        },
        {
          kind: 'paragraph',
          text:
            'Strong players do not push the d-pawn early, or they cover c6, or both. The trap is the first thing they stopped falling for.',
        },
      ],
    },
    {
      heading: 'What this covers and what it does not',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'I played c4 in 899 of 950 games as White, so this is deep in one line and empty everywhere else. The rating bands are opponent rating where rating difference would be the better axis.',
        },
        {
          kind: 'paragraph',
          text:
            'The trap itself needs none of that hedging. It came up 54 times and converted 54 times, because "came up" means White was looking at a king. 17 of 17 against ...dxc4. Those numbers do not depend on who was playing.',
        },
        {
          kind: 'paragraph',
          text:
            'If you have been losing games on move three and never understood why: your d-pawn, and especially taking that c4 pawn with it. Leave it alone, or cover c6.',
        },
      ],
    },
  ],
};
