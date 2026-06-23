import {
  ARTICLE_OG_POSITIONS,
  BLACK_PICK_SCREEN_FOG,
  D960_FULL_STATES,
  DRAFT960_BLACK_OFFER_A,
  DRAFT960_BLACK_OFFER_B,
  DRAFT960_BLACK_OFFER_C,
  DRAFT960_OFFER_A,
  DRAFT960_OFFER_B,
  DRAFT960_OFFER_C,
  fogFor,
  PICK_SCREEN_FOG,
  piecesToBoard,
  startingPositionFromBackRank,
} from '../diagrams.js';
import type { Article, ArticleBlock } from '../types.js';

export const darkDraft960Article: Article = {
    slug: 'dark-draft960',
    kind: 'rules',
    title: 'Dark Draft960',
    summary:
      "Dark Chess with a sealed opening draft: each player picks one of three Chess960 back ranks and never sees the other's.",
    status: 'published',
    publishedAt: '2026-05-31',
    audience:
      'Readers who have grokked dark chess (start with the rules article if not). Curious chess players following the Mistboard OG card to learn what makes Dark Draft960 unique.',
    thumbnail: ARTICLE_OG_POSITIONS['dark-draft960'],
    sections: [
      {
        heading: 'The draft',
        blocks: [
          {
            kind: 'paragraph',
            text: "The server deals each player three random Chess960 back ranks. You pick one. Your opponent independently picks one of theirs. The drafts are sealed. Neither side sees the other's offers or choice.",
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'triptych',
              boards: [
                { board: piecesToBoard(startingPositionFromBackRank(DRAFT960_OFFER_A).filter((p) => p.color === 'white')), fogSquares: PICK_SCREEN_FOG, orientation: 'white', label: 'A' },
                { board: piecesToBoard(startingPositionFromBackRank(DRAFT960_OFFER_B).filter((p) => p.color === 'white')), fogSquares: PICK_SCREEN_FOG, orientation: 'white', label: 'B' },
                { board: piecesToBoard(startingPositionFromBackRank(DRAFT960_OFFER_C).filter((p) => p.color === 'white')), fogSquares: PICK_SCREEN_FOG, orientation: 'white', label: 'C' },
              ],
            },
          } as ArticleBlock,
          {
            kind: 'live-boards',
            spec: {
              layout: 'triptych',
              boards: [
                { board: piecesToBoard(startingPositionFromBackRank(DRAFT960_BLACK_OFFER_A).filter((p) => p.color === 'black')), fogSquares: BLACK_PICK_SCREEN_FOG, orientation: 'black', label: 'A' },
                { board: piecesToBoard(startingPositionFromBackRank(DRAFT960_BLACK_OFFER_B).filter((p) => p.color === 'black')), fogSquares: BLACK_PICK_SCREEN_FOG, orientation: 'black', label: 'B' },
                { board: piecesToBoard(startingPositionFromBackRank(DRAFT960_BLACK_OFFER_C).filter((p) => p.color === 'black')), fogSquares: BLACK_PICK_SCREEN_FOG, orientation: 'black', label: 'C' },
              ],
            },
          } as ArticleBlock,
        ],
      },
      {
        heading: 'The starting position',
        blocks: [
          {
            kind: 'paragraph',
            text: "Say both players picked offer A. Each side sees only its own back rank; the opponent's stays in fog. Only the server holds both.",
          },
          {
            kind: 'live-boards',
            spec: {
              layout: 'triptych',
              boards: [
                { board: D960_FULL_STATES[0]!.board, fogSquares: fogFor(D960_FULL_STATES[0]!, 'white'), orientation: 'white', label: "WHITE'S VIEW" },
                { board: D960_FULL_STATES[0]!.board, orientation: 'white', label: 'SERVER TRUTH' },
                { board: D960_FULL_STATES[0]!.board, fogSquares: fogFor(D960_FULL_STATES[0]!, 'black'), orientation: 'white', label: "BLACK'S VIEW" },
              ],
            },
          } as ArticleBlock,
          {
            kind: 'paragraph',
            text: "960 × 960 = **921,600** possible starts. Standard chess is one of them.",
          },
        ],
      },
      {
        heading: 'Play status',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Dark Draft960 is a future variant, not playable yet. There is no set release date.',
          },
          {
            kind: 'cta',
            buttons: [
              { label: 'Back to all rules', href: '/rules', emphasis: 'secondary' },
            ],
          } as ArticleBlock,
        ],
      },
    ],
};
