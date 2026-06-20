import {
  banqiEnabled,
  darkMiniXiangqiPublicEntryEnabled,
  darkShogiEnabled,
  darkXiangqiEnabled,
  jieqiEnabled,
  revealChessEnabled,
} from './feature-flags.js';

// Entries for the landing News box and the /news page.
//
// Workflow: when shipping a user-facing change, append a new entry with
// today's date. Newest first (both surfaces sort by date descending). Skip
// for internal-only changes (engine internals, infra, CI, refactors).

export type AnnouncementKind = 'status' | 'article' | 'release' | 'update';

export type Announcement = {
  date: string; // ISO YYYY-MM-DD
  kind: AnnouncementKind;
  headline: string;
  body?: string;
  href?: string;
  cta?: string; // inline link label on /news; falls back to "Read more"
  requiresDarkMiniXiangqiPublicEntry?: boolean;
  // Gated to the jieqi flag so it only shows once jieqi PvE is live.
  requiresJieqi?: boolean;
  // Gated to the banqi flag so it only shows once banqi is live.
  requiresBanqi?: boolean;
  // Gated to the dark-xiangqi flag so it only shows once Dark Xiangqi is live.
  requiresDarkXiangqi?: boolean;
  // Gated to the dark-shogi flag so it only shows once Dark Shogi is live.
  requiresDarkShogi?: boolean;
  // Gated to the reveal-chess flag so it only shows once Reveal Chess is live.
  requiresRevealChess?: boolean;
};

const baseAnnouncements: Announcement[] = [
  {
    date: '2026-06-20',
    kind: 'release',
    headline: 'Dark Shogi has launched.',
    body: 'Shogi under Fog of War is now live for invite games, with private hands, drops into the fog, and king capture wins.',
    href: '/rules/dark-shogi',
    cta: 'Read rules',
    requiresDarkShogi: true,
  },
  {
    date: '2026-06-18',
    kind: 'release',
    headline: 'Reveal Chess is open for alpha play.',
    body: 'Standard chess with a hidden starting arrangement: every piece but the king begins face-down and reveals its true identity the moment it moves. Challenge a friend to a match.',
    href: '/rules/reveal-chess',
    cta: 'Read rules',
    requiresRevealChess: true,
  },
  {
    date: '2026-06-18',
    kind: 'release',
    headline: 'Dark Xiangqi is open for alpha play.',
    body: 'Fog of War on the full 9 by 10 xiangqi board: each side sees only the points its pieces reach. Challenge a friend to a match.',
    href: '/rules/dark-xiangqi',
    cta: 'Read rules',
    requiresDarkXiangqi: true,
  },
  {
    date: '2026-06-17',
    kind: 'release',
    headline: 'Banqi (半棋) is open for alpha play.',
    body: 'Chinese Dark Chess on an 8 by 4 board: all 32 pieces start face-down and flip as you play. Challenge a friend to a match.',
    href: '/rules/banqi',
    cta: 'Read rules',
    requiresBanqi: true,
  },
  {
    date: '2026-06-15',
    kind: 'release',
    headline: 'Jieqi (揭棋) is open for alpha play.',
    body: 'Hidden-identity xiangqi: every non-general piece starts face-down and reveals as it moves. Take on PikaJieQi, our jieqi engine.',
    href: '/rules/jieqi',
    cta: 'Read rules',
    requiresJieqi: true,
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
    requiresDarkMiniXiangqiPublicEntry: true,
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
  return baseAnnouncements.filter(
    (announcement) =>
      (!announcement.requiresDarkMiniXiangqiPublicEntry || darkMiniXiangqiPublicEntryEnabled()) &&
      (!announcement.requiresJieqi || jieqiEnabled()) &&
      (!announcement.requiresBanqi || banqiEnabled()) &&
      (!announcement.requiresDarkXiangqi || darkXiangqiEnabled()) &&
      (!announcement.requiresDarkShogi || darkShogiEnabled()) &&
      (!announcement.requiresRevealChess || revealChessEnabled()),
  );
}
