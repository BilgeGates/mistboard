export const SHOW_ENGINE_LAB_LINKS = import.meta.env.VITE_SHOW_ENGINE_LAB_NAV === 'true';

export interface NavItem {
  label: string;
  href: string;
}

export function primaryNavItems(): NavItem[] {
  return [
    { label: 'Play', href: '/' },
    { label: 'Puzzles', href: '/puzzles' },
    { label: 'Watch', href: '/watch' },
  ];
}

export function communityNavItems(): NavItem[] {
  return [
    { label: 'Forum', href: '/forum' },
    { label: 'Leaderboard', href: '/leaderboard' },
    { label: 'Bots', href: '/bots' },
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
  return items;
}

export function toolsNavItems(): NavItem[] {
  return utilityNavItems();
}
