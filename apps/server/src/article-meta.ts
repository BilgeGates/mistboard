// Article slug -> page meta. Content source of truth is
// apps/web/src/articles-data.ts; this map duplicates only the share-card
// surface (title + description) plus `kind`, which decides the canonical URL
// space: kind 'rules' lives under /rules/<slug>, everything else under
// /articles/<slug>. The server can't import the web bundle, so the
// duplication is enforced by apps/web/src/articles-meta-sync.test.ts: a new
// or renamed article without a matching entry here fails web tests instead
// of shipping a wrong-direction 301 or a generic share card.
export type ArticleKind = 'rules' | 'article';

export const ARTICLE_META: Record<
  string,
  { title: string; description: string; kind: ArticleKind }
> = {
  chess: {
    title: 'Chess Rules',
    kind: 'rules',
    description:
      'Standard chess rules, the primer behind Dark Chess: castling, promotion, en passant, the draw rules, and a famous game to play through.',
  },
  'dark-chess': {
    title: 'Dark Chess (Fog of War) Rules',
    kind: 'rules',
    description:
      'Chess under Fog of War: each side sees only the squares its pieces reach, there are no check warnings, and the king falls by capture.',
  },
  'dark-chess-concepts': {
    title: 'Dark Chess Concepts',
    kind: 'article',
    description:
      'Strategy concepts for dark chess: how to read fogged squares, pawn signals, vanished moves, and capture clues after you know the rules.',
  },
  'dark-draft960': {
    title: 'Dark Draft960',
    kind: 'rules',
    description:
      "Dark Chess with a sealed opening draft: each player picks one of three Chess960 back ranks and never sees the other's.",
  },
  xiangqi: {
    title: 'Xiangqi Rules',
    kind: 'rules',
    description:
      'Standard xiangqi rules, the primer behind Dark Xiangqi: palaces, the river, cannon screens, facing generals, and a famous game to play through.',
  },
  'dark-xiangqi': {
    title: 'Dark Xiangqi',
    kind: 'rules',
    description:
      'Xiangqi under Fog of War: each side sees only the points its pieces reach, hidden blockers matter, and the general falls by capture.',
  },
  'mini-xiangqi': {
    title: 'Mini Xiangqi',
    kind: 'rules',
    description:
      'Mini Xiangqi rules, the 7×7 primer behind Dark Mini Xiangqi: no advisors or elephants, no river, sideways soldiers, and checkmate to win.',
  },
  'dark-mini-xiangqi': {
    title: 'Dark Mini Xiangqi',
    kind: 'rules',
    description:
      'Mini Xiangqi under Fog of War: each side sees only the points its pieces reach on the 7×7 board, and the general falls by capture.',
  },
  'crossroads-chess': {
    title: 'Crossroads Chess Rules',
    kind: 'rules',
    description:
      'A modern variant that fuses chess and xiangqi on a 6 by 8 river board. The pieces you already know from both games, and two ways to win: checkmate, or race your king across.',
  },
  shogi4: {
    title: 'Shogi4 (4×4 Shogi) Rules',
    kind: 'rules',
    description:
      "The complete rules of Shogi4, Oca Studios' public-domain animal drop-shogi on a 4×4 board: how the Carp, Tapir, Raccoon-dog, Fox, and royal move, plus the friendly-jump, evolution, drops, and king-capture wins.",
  },
  misty: {
    title: 'How Misty Plays',
    kind: 'article',
    description:
      "Misty is the engine you play on Mistboard, built for Fog of War chess and guided by the Obscuro architecture. How it thinks, what's hard, and where it stands.",
  },
  'server-enforced-fog': {
    title: 'Programming Dark Chess with Server-Side Truth',
    kind: 'article',
    description:
      'How Mistboard keeps hidden information on the server: canonical state, seat-scoped views, private live rooms, and public postgame review.',
  },
  kriegspiel: {
    title: 'Kriegspiel Rules',
    kind: 'rules',
    description:
      'The complete rules of Kriegspiel, the 1899 ancestor of dark chess: you see only your own pieces, an umpire rejects illegal tries and announces captures, checks, and pawn tries, and checkmate wins.',
  },
  jieqi: {
    title: 'Jieqi (揭棋) Rules',
    kind: 'rules',
    description:
      'The complete rules of Jieqi (揭棋), xiangqi with shuffled identities: every piece except the generals starts face-down, makes its first move as the point it stands on, and reveals itself after moving. Checkmate the general to win.',
  },
  banqi: {
    title: 'Banqi (Chinese Dark Chess) Rules',
    kind: 'rules',
    description:
      'The complete rules of Banqi (暗棋), the half-board xiangqi flip game known as Chinese Dark Chess: flip or move one square each turn, capture by rank, cannons jump, and win by wiping the enemy out.',
  },
  'reveal-chess': {
    title: 'Reveal Chess Rules',
    kind: 'rules',
    description:
      'The complete rules of Reveal Chess, standard chess with a hidden starting arrangement: every piece except the king starts face-down, moves by the square it occupies, and reveals its true identity the moment it moves. Checkmate to win.',
  },
};

export function canonicalArticleBase(slug: string): 'articles' | 'rules' {
  return ARTICLE_META[slug]?.kind === 'rules' ? 'rules' : 'articles';
}
