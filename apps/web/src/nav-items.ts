import type { I18nKey } from './i18n/catalog.js';

export const SHOW_ENGINE_LAB_LINKS = import.meta.env.VITE_SHOW_ENGINE_LAB_NAV === 'true';

export interface NavItem {
  label: string;
  labelKey: I18nKey;
  href: string;
}

export function primaryNavItems(): NavItem[] {
  return [
    { label: 'Play', labelKey: 'nav.play', href: '/' },
    { label: 'Puzzles', labelKey: 'nav.puzzles', href: '/puzzles' },
    { label: 'Watch', labelKey: 'nav.watch', href: '/watch' },
  ];
}

export function communityNavItems(): NavItem[] {
  return [
    { label: 'Forum', labelKey: 'nav.forum', href: '/forum' },
    { label: 'Leaderboard', labelKey: 'nav.leaderboard', href: '/leaderboard' },
    { label: 'Bots', labelKey: 'nav.bots', href: '/bots' },
  ];
}

export function learnNavItems(): NavItem[] {
  return [
    { label: 'Rules', labelKey: 'nav.rules', href: '/rules' },
    { label: 'Articles', labelKey: 'nav.articles', href: '/articles' },
  ];
}

export function utilityNavItems(): NavItem[] {
  const items: NavItem[] = [];
  if (SHOW_ENGINE_LAB_LINKS) items.push({ label: 'Lab', labelKey: 'nav.lab', href: '/lab' });
  return items;
}

export function toolsNavItems(): NavItem[] {
  return utilityNavItems();
}
