// Cards shown in the landing-page Announcements panel.
//
// Workflow: when shipping a user-facing change, append a new entry with
// today's date. Newest first. Skip for internal-only changes (engine
// internals, infra, CI, refactors).

export type Announcement = {
  date: string; // ISO YYYY-MM-DD; ignored for pinned entries
  headline: string;
  body?: string;
  href?: string;
  pinned?: boolean;
};

export const announcements: Announcement[] = [
  {
    date: '2026-05-09',
    pinned: true,
    headline: 'Mistboard is in alpha.',
    body: 'Anonymous, link-share, no rated yet. Bug reports and feedback welcome.',
    href: '/contact',
  },
];
