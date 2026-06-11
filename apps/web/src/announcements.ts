import { darkMiniXiangqiPublicEntryEnabled } from './feature-flags.js';

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
};

const baseAnnouncements: Announcement[] = [
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
  },
];

export function announcements(): Announcement[] {
  return baseAnnouncements.filter(
    (announcement) =>
      !announcement.requiresDarkMiniXiangqiPublicEntry || darkMiniXiangqiPublicEntryEnabled(),
  );
}
