import {
  KRIEGSPIEL_CHECK_BOARD,
  KRIEGSPIEL_CHECK_FOG,
  KRIEGSPIEL_HERO_BOARD,
  KRIEGSPIEL_HERO_FOG_W,
  relatedClosing,
} from '../diagrams.js';
import type { Article, ArticleBlock } from '../types.js';

export const kriegspielArticle: Article = {
    slug: 'kriegspiel',
    kind: 'rules',
    title: 'Kriegspiel Rules',
    summary:
      'The complete rules of Kriegspiel, the 1899 ancestor of dark chess: you see only your own pieces, an umpire rejects illegal tries and announces captures, checks, and pawn tries, and checkmate wins.',
    showSummaryOnPage: false,
    status: 'draft',
    audience:
      'Chess and dark chess players who want the full rules of Kriegspiel, the original umpired hidden-information chess.',
    intro: [
      {
        kind: 'paragraph',
        text:
          'Kriegspiel is chess played blind: you see only your own pieces. A neutral umpire (here, the server) keeps the true position, rejects your illegal tries, and announces captures, checks, and pawn tries to both players. Underneath the fog it is standard chess, and checkmate ends the game.',
      },
      {
        kind: 'paragraph',
        text:
          'Henry Michael Temple invented Kriegspiel in 1899, borrowing the umpire from the Prussian war games that gave it its name. It is the direct ancestor of [dark chess](/rules/dark-chess). If standard chess is new to you, start with [Chess Rules](/rules/chess); everything below assumes them.',
      },
    ],
    sections: [
      {
        heading: 'How a turn works',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'On your turn you attempt a move. If it is legal in the true position, it stands, and the umpire tells your opponent only that you have moved. If it is illegal (the path is blocked, the piece is pinned, your king would be left in check), the umpire rejects it and you try again, as many times as it takes. You may attempt any move that would be legal on a board holding only your own pieces, plus pawn captures.',
          },
          {
            kind: 'paragraph',
            text:
              'Every chess rule is enforced even though you cannot verify it yourself. You can never move into check, and the king is never captured: an attempt that would lose your king is simply rejected. This is the deepest difference from [dark chess](/rules/dark-chess), where nothing is announced and the king falls by capture.',
          },
          {
            kind: 'paragraph',
            text:
              'Rejected tries are information. Each refusal tells you something stands in the way, and a careful player probes with tries before committing. Your opponent is not told your attempts were rejected, only that you eventually moved.',
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'pair',
              boards: [
                { board: KRIEGSPIEL_HERO_BOARD, fogSquares: KRIEGSPIEL_HERO_FOG_W, orientation: 'white', label: "WHITE'S VIEW" },
                { board: KRIEGSPIEL_HERO_BOARD, orientation: 'white', label: "UMPIRE'S BOARD" },
              ],
            },
            caption:
              'The same position. Unlike dark chess, Kriegspiel grants no derived vision: your board holds your pieces and nothing else.',
          } as ArticleBlock,
        ],
      },
      {
        heading: 'What the umpire announces',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "**Captures.** When a piece is captured, both players hear the square and whether the captured unit was a pawn or a piece, never which piece. 'Pawn gone on d4' tells the owner a pawn died and tells the capturer what they took was a pawn. Capture announcements are also how you track how much material your opponent has left.",
          },
          {
            kind: 'paragraph',
            text:
              "**Checks.** A check is announced to both players with its direction from the checked king's point of view: on the rank, on the file, on the long diagonal, on the short diagonal, or by a knight. A double check announces both directions. The checking piece's square is never given, though you can often deduce it.",
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'grid',
              boards: [
                { board: KRIEGSPIEL_CHECK_BOARD, fogSquares: KRIEGSPIEL_CHECK_FOG, orientation: 'white', label: 'RANK', arrows: [{ orig: 'a4', dest: 'e4' }] },
                { board: KRIEGSPIEL_CHECK_BOARD, fogSquares: KRIEGSPIEL_CHECK_FOG, orientation: 'white', label: 'FILE', arrows: [{ orig: 'e8', dest: 'e4' }] },
                { board: KRIEGSPIEL_CHECK_BOARD, fogSquares: KRIEGSPIEL_CHECK_FOG, orientation: 'white', label: 'LONG DIAGONAL', arrows: [{ orig: 'a8', dest: 'e4' }] },
                { board: KRIEGSPIEL_CHECK_BOARD, fogSquares: KRIEGSPIEL_CHECK_FOG, orientation: 'white', label: 'SHORT DIAGONAL', arrows: [{ orig: 'h7', dest: 'e4' }] },
                { board: KRIEGSPIEL_CHECK_BOARD, fogSquares: KRIEGSPIEL_CHECK_FOG, orientation: 'white', label: 'KNIGHT', arrows: [{ orig: 'd6', dest: 'e4' }] },
              ],
            },
            caption:
              "The five check announcements, from the checked king's point of view. The arrow is the announced direction; the checking piece stays hidden.",
          } as ArticleBlock,
        ],
      },
      {
        heading: 'Pawn tries',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'At the start of each turn, the umpire tells the player to move how many pawn captures they have. A pawn capture is the one move you cannot even attempt without an enemy piece actually standing on the target square, so the count is hard information about where your opponent is. The count includes en passant captures.',
          },
        ],
      },
      {
        heading: 'Castling, promotion, en passant',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Castling is never announced; a legal castle is just another completed move. Promotion is silent too: your opponent learns about the new queen the hard way. En passant captures are announced as ordinary pawn captures, without the fact that they were en passant.',
          },
        ],
      },
      {
        heading: 'Winning and draws',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Checkmate ends the game, announced by the umpire. Mates in Kriegspiel are usually accidental: the winner often does not know the mating move was mate until the announcement. Stalemate and the standard chess draws (repetition, fifty moves, insufficient material) are announced the same way.',
          },
        ],
      },
      {
        heading: 'Conventions vary',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "Kriegspiel has no single rulebook. This page follows the convention online play standardized, the Internet Chess Club ruleset later adopted by the computer Kriegspiel olympiads: pawn-try counts each turn, captures announced as pawn or piece with the square, and illegal tries seen only by the player making them. The older English club rules instead let a player ask 'any?' about pawn captures, with a yes obliging one capture try, and over-the-board play often makes every rejection audible to both players, which itself leaks information. Agree on a convention before you play with a human umpire.",
          },
        ],
      },
      {
        heading: 'From Kriegspiel to dark chess',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "Temple's invention spread through London's chess clubs and stayed a fixture of club culture for a century. It became the lunchtime game of the RAND Corporation's game theorists in the 1950s: Lloyd Shapley was nearly unbeatable, and John Nash and John von Neumann both played. Computer Kriegspiel has its own research lineage, from solved endgames (a king and rook can force mate against a lone king even in the fog) to Monte Carlo engines at the Computer Olympiad.",
          },
          {
            kind: 'paragraph',
            text:
              'Dark chess, born in 1989, removed the umpire by changing the rules instead: each side sees the squares its pieces can reach, nothing is announced, and the king falls by capture. Kriegspiel keeps every chess rule and pays for it with an umpire; dark chess gives up check and checkmate to need no referee at all. The two variants are the same idea solved two ways.',
          },
        ],
      },
      relatedClosing({
        heading: 'Where to next',
        lead: "Kriegspiel isn't playable on Mistboard yet; for now this page is the rules reference. Its descendant dark chess is playable today.",
        links: [
          { label: 'Read Dark Chess', href: '/rules/dark-chess', emphasis: 'primary' },
          { label: 'Chess Rules', href: '/rules/chess', emphasis: 'secondary' },
          { label: 'All rules', href: '/rules', emphasis: 'secondary' },
        ],
      }),
    ],
};
