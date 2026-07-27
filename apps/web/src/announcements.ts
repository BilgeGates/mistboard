// Entries for the landing News box and the /feed page.
//
// Workflow: when shipping a user-facing change, append a new entry with
// today's date. Newest first (both surfaces sort by date descending). Skip
// for internal-only changes (engine internals, infra, CI, refactors).
//
// STUDIES: do not post per published study, and never count them ("two new
// studies"): the count is wrong the next time one ships, and the homepage
// already lists them live from the API. Post when a WORK is finished (a manual,
// not a volume) or at a milestone worth a reader's attention. Individual
// publications reach people through the studies widget and /study on their own.

export type AnnouncementKind = 'status' | 'article' | 'release' | 'update';

export type Announcement = {
  date: string; // ISO YYYY-MM-DD
  kind: AnnouncementKind;
  headline: string;
  body?: string;
  href?: string;
  cta?: string; // inline link label on /feed; falls back to "Read more"
  showInHomeArticleWidget?: boolean;
};

const baseAnnouncements: Announcement[] = [
  {
    date: '2026-07-22',
    kind: 'release',
    headline: 'Rated xiangqi is live.',
    body: 'Choose Rated in the lobby. Your rating starts at 1500 and appears after it settles.',
    href: '/leaderboard',
    cta: 'See the leaderboard',
    showInHomeArticleWidget: false,
  },
  {
    date: '2026-07-23',
    kind: 'article',
    headline: 'Secret in the Tangerine, both game volumes.',
    body: 'Both volumes are playable move by move in English: 33 games with every printed variation.',
    href: '/study/Dfi3NpRE',
    cta: 'Open volume one',
    showInHomeArticleWidget: false,
  },
  {
    date: '2026-07-21',
    kind: 'article',
    headline: 'Classical xiangqi, from the original woodblocks.',
    body: 'Read the earliest printings move by move, with every corrected misprint marked on the board.',
    href: '/study',
    cta: 'Browse the studies',
    showInHomeArticleWidget: false,
  },
  {
    date: '2026-07-17',
    kind: 'release',
    headline: 'Correspondence play has launched.',
    body: 'Post or accept a days-per-move seek, or send a friend a challenge link and play at your own pace.',
    href: '/',
    cta: 'Find a game',
  },
  {
    date: '2026-07-17',
    kind: 'release',
    headline: 'An analysis board for every game.',
    body: 'Set up any position, import moves, run a local evaluation, or grade a finished game with server analysis.',
    href: '/analysis',
    cta: 'Open the board',
  },
  {
    date: '2026-07-11',
    kind: 'release',
    headline: 'Studies have launched.',
    body: 'Build shareable analysis boards: draw on the board, comment, branch variations, organize chapters, and publish interactive gamebook lessons.',
    href: '/study',
    cta: 'Browse studies',
  },
  {
    date: '2026-07-11',
    kind: 'release',
    headline: 'Mistboard TV is live.',
    body: 'Watch live games on the new Watch page, with a channel for every game and an Engines channel for bot-versus-bot matches.',
    href: '/watch',
    cta: 'Watch now',
  },
  {
    date: '2026-07-10',
    kind: 'release',
    headline: 'Learn xiangqi from scratch.',
    body: 'A free interactive course: 20 stages and 111 hands-on levels take you from how each piece moves to the named checkmate patterns.',
    href: '/learn',
    cta: 'Start the course',
  },
  {
    date: '2026-07-10',
    kind: 'release',
    headline: 'Xiangqi puzzles have launched.',
    body: 'Tactics mined from real games, with puzzle ratings, hints, and a daily puzzle on the homepage.',
    href: '/puzzles',
    cta: 'Solve puzzles',
  },
  {
    date: '2026-07-04',
    kind: 'release',
    headline: 'Xiangqi has launched.',
    body: 'Standard Chinese chess on the full 9 by 10 board is now first-class on Mistboard: play the Pikafish engine at three strengths, or challenge a friend.',
    href: '/rules/xiangqi',
    cta: 'Study the rules',
  },
  {
    date: '2026-07-03',
    kind: 'release',
    headline: 'Forum and global chat have launched.',
    body: 'The forum is open for game analysis, engine talk, and site feedback, with the homepage global chat available for quick table-talk during live sessions.',
    href: '/forum',
    cta: 'Join the forum',
  },
  {
    date: '2026-07-01',
    kind: 'release',
    headline: 'Fortress has launched.',
    body: 'Xiangqi with a pocket: every piece moves as in Chinese chess, plus crazyhouse-style drops and the new Treasure. Play the bot or challenge a friend.',
    href: '/rules/fortress-xiangqi',
    cta: 'Study the rules',
  },
  {
    date: '2026-06-30',
    kind: 'release',
    headline: 'Jungle Chess has launched.',
    body: 'Rank-based animal chess on a 7 by 9 board with rivers, dens, and traps is live. Challenge a friend or take on the Misty Jungle engine.',
    href: '/rules/jungle',
    cta: 'Read rules',
  },
  {
    date: '2026-06-30',
    kind: 'release',
    headline: 'Flip Jungle has launched.',
    body: 'Every animal starts face-down on a 4 by 4 board and flips as you play. Challenge a friend or the engine.',
    href: '/rules/jungle-flip',
    cta: 'Read rules',
  },
  {
    date: '2026-06-22',
    kind: 'release',
    headline: 'Drop Mini Xiangqi has launched.',
    body: 'The 7 by 7 reserve fight is live with no enemy-palace drops, a full rules page, and a 114-ply FSF sample game to study.',
    href: '/rules/drop-mini-xiangqi',
    cta: 'Study the rules',
  },
  {
    date: '2026-06-20',
    kind: 'release',
    headline: 'Dark Crazyhouse has launched.',
    body: 'Crazyhouse under Fog of War is now live for invite games, with private hands, captured pieces entering reserve, and drops into the fog.',
    href: '/rules/dark-crazyhouse',
    cta: 'Read rules',
  },
  {
    date: '2026-06-20',
    kind: 'release',
    headline: 'Dark Crossroads Chess has launched.',
    body: 'Crossroads Chess under Fog of War is now live for invite games, with hidden enemy pieces, no check warnings, and the far-rank Try.',
    href: '/rules/dark-crossroads-chess',
    cta: 'Read rules',
  },
  {
    date: '2026-06-20',
    kind: 'release',
    headline: 'Fog Shogi has launched.',
    body: 'Shogi under Fog of War is now live for invite games, with private hands, drops into the fog, and king capture wins.',
    href: '/rules/dark-shogi',
    cta: 'Read rules',
  },
  {
    date: '2026-06-20',
    kind: 'release',
    headline: 'Kriegspiel is open for alpha play.',
    body: 'The original hidden-information chess: see only your own pieces, try moves through the umpire, and challenge a friend to a match.',
    href: '/rules/kriegspiel',
    cta: 'Read rules',
    showInHomeArticleWidget: false,
  },
  {
    date: '2026-06-18',
    kind: 'release',
    headline: 'Reveal Chess is open for alpha play.',
    body: 'Standard chess with a hidden starting arrangement: every piece but the king begins face-down and reveals its true identity the moment it moves. Challenge a friend to a match.',
    href: '/rules/reveal-chess',
    cta: 'Read rules',
  },
  {
    date: '2026-06-18',
    kind: 'release',
    headline: 'Fog Xiangqi is open for alpha play.',
    body: 'Fog of War on the full 9 by 10 xiangqi board: each side sees only the points its pieces reach. Challenge a friend to a match.',
    href: '/rules/fog-xiangqi',
    cta: 'Read rules',
  },
  {
    date: '2026-06-17',
    kind: 'release',
    headline: 'Banqi is open for alpha play.',
    body: 'Banqi on an 8 by 4 board: all 32 pieces start face-down and flip as you play. Challenge a friend to a match.',
    href: '/rules/banqi',
    cta: 'Read rules',
    showInHomeArticleWidget: false,
  },
  {
    date: '2026-06-15',
    kind: 'release',
    headline: 'Jieqi is open for alpha play.',
    body: 'Hidden-identity xiangqi: every non-general piece starts face-down and reveals as it moves. Take on PikaJieQi, our jieqi engine.',
    href: '/rules/jieqi',
    cta: 'Read rules',
  },
  {
    date: '2026-06-11',
    kind: 'release',
    headline: 'Crossroads Chess has launched.',
    body: 'A 6 by 8 chess-xiangqi variant with checkmate and king-race wins is now live on Mistboard.',
    href: '/rules/crossroads-chess',
    cta: 'Read rules',
  },
  {
    date: '2026-05-09',
    kind: 'release',
    headline: 'Fog Chess is open for alpha play.',
    body: 'Fog of War chess is live on Mistboard, with private vision, no check warnings, and king capture wins.',
    href: '/rules/fog-chess',
    cta: 'Read rules',
  },
  {
    date: '2026-05-09',
    kind: 'status',
    headline: 'Mistboard is in alpha.',
    body: 'Casual dark chess is open. Rated beta is coming.',
    href: '/contact',
    cta: 'Send feedback',
  },
  {
    date: '2026-06-09',
    kind: 'release',
    headline: 'Dark Mini Xiangqi is open for alpha play.',
    body: 'A smaller Fog of War variant on a 7 by 7 xiangqi board, with Misty engine support.',
    href: '/rules/dark-mini-xiangqi',
    cta: 'Read rules',
  },
  {
    date: '2026-06-03',
    kind: 'release',
    headline: 'Misty 1.0 has launched.',
    body: 'Our Fog of War dark chess engine is now live to play.',
    href: '/?play=computer',
    cta: 'Play the engine',
  },
];

export function announcements(): Announcement[] {
  return baseAnnouncements;
}
