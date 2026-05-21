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
    date: '',
    pinned: true,
    headline: 'Mistboard is in alpha.',
    body: 'Live since May 9, 2026. Anonymous, link-share, no rated yet. Bug reports and feedback welcome.',
    href: '/contact',
  },
];
