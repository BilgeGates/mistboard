import { dualChessEnabled } from './feature-flags.js';

export const SHOW_ENGINE_LAB_LINKS = import.meta.env.VITE_SHOW_ENGINE_LAB_NAV === 'true';

export interface NavItem {
  label: string;
  href: string;
}

export function primaryNavItems(): NavItem[] {
  return [
    { label: 'Watch', href: '/watch' },
    { label: 'Leaderboard', href: '/leaderboard' },
  ];
}

export function learnNavItems(): NavItem[] {
  return [
    { label: 'Rules', href: '/rules' },
    { label: 'Articles', href: '/articles' },
  ];
}

export function utilityNavItems(): NavItem[] {
  const items: NavItem[] = [];
  if (SHOW_ENGINE_LAB_LINKS) items.push({ label: 'Lab', href: '/lab' });
  // Flagged prelaunch surface; discoverable in the nav only when enabled.
  if (dualChessEnabled()) items.push({ label: 'Dual Chess', href: '/dual-chess-play' });
  return items;
}
