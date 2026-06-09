import { darkMiniXiangqiPublicEntryEnabled } from './feature-flags.js';

// Cards shown in the landing-page Announcements panel.
//
// Workflow: when shipping a user-facing change, append a new entry with
// today's date. Newest first. Skip for internal-only changes (engine
// internals, infra, CI, refactors).

export type AnnouncementKind = 'status' | 'article' | 'release' | 'update';

export type Announcement = {
  date: string; // ISO YYYY-MM-DD; ignored for pinned entries
  kind: AnnouncementKind;
  headline: string;
  body?: string;
  href?: string;
  cta?: string; // optional override; otherwise derived from kind
  pinned?: boolean;
  requiresDarkMiniXiangqiPublicEntry?: boolean;
};

const baseAnnouncements: Announcement[] = [
  {
    date: '2026-05-09',
    pinned: true,
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
