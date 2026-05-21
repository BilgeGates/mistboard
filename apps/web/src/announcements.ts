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
    body: 'Anonymous, link-share, no rated yet. Bug reports and feedback welcome.',
    href: 'https://github.com/brianhliou/mistboard/issues',
  },
  {
    date: '2026-05-19',
    headline: 'Pause and resume.',
    body: 'Games survive deploys. Pick up where you left off.',
  },
  {
    date: '2026-05-16',
    headline: 'Engine v0.9.5.',
    body: 'Tier-1 PvE is live. Beat it and tell us how.',
  },
  {
    date: '2026-05-15',
    headline: 'Inside Draft960.',
    body: 'New article on the 69-position pregame.',
    href: '/articles',
  },
];
