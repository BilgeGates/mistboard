export const SHOW_ENGINE_LAB_LINKS = import.meta.env.VITE_SHOW_ENGINE_LAB_NAV === 'true';

export interface NavItem {
  label: string;
  href: string;
}

export function primaryNavItems(): NavItem[] {
  return [
    { label: 'Watch', href: '/watch' },
    { label: 'Leaderboard', href: '/leaderboard' },
    { label: 'Articles', href: '/articles' },
  ];
}

export function utilityNavItems(): NavItem[] {
  return SHOW_ENGINE_LAB_LINKS ? [{ label: 'Lab', href: '/lab' }] : [];
}
