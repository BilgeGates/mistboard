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
};

export const announcements: Announcement[] = [
  {
    date: '2026-05-09',
    pinned: true,
    kind: 'status',
    headline: 'Mistboard is in alpha.',
    body: 'Casual dark chess is open. Rated beta windows are coming.',
    href: '/contact',
    cta: 'Send feedback',
  },
  {
    date: '2026-05-21',
    kind: 'article',
    headline: 'Dark chess: the canonical reference.',
    body: 'How visibility works, what counts as a win, and the rule quirks (castling, en passant) you will actually run into.',
    href: '/articles/dark-chess-rules',
  },
];
