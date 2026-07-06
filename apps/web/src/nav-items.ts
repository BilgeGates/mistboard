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

// Top-nav Community dropdown (lichess-aligned order): Players (the leaderboard),
// Friends (your following list), Forum, Blog (the articles surface). Teams is
// deliberately deferred. Kept distinct from communityRailItems(): the dropdown
// is the wide social entry, the rail is the leaderboard/bots sub-nav.
export function communityNavItems(): NavItem[] {
  return [
    { label: 'Players', labelKey: 'nav.players', href: '/player' },
    { label: 'Friends', labelKey: 'nav.friends', href: '/account' },
    { label: 'Forum', labelKey: 'nav.forum', href: '/forum' },
    { label: 'Blog', labelKey: 'nav.blog', href: '/articles' },
  ];
}

// Community sub-navigation rail (lichess parity): Leaderboard + Online bots for
// now. Forum lives in the top-nav dropdown, not the rail.
export function communityRailItems(): NavItem[] {
  return [
    { label: 'Leaderboard', labelKey: 'nav.leaderboard', href: '/player' },
    { label: 'Rating stats', labelKey: 'nav.ratingStats', href: '/player/rating-stats' },
    { label: 'Online bots', labelKey: 'nav.onlineBots', href: '/bots' },
  ];
}

export function learnNavItems(): NavItem[] {
  return [{ label: 'Rules', labelKey: 'nav.rules', href: '/rules' }];
}

export function utilityNavItems(): NavItem[] {
  const items: NavItem[] = [];
  if (SHOW_ENGINE_LAB_LINKS) items.push({ label: 'Lab', labelKey: 'nav.lab', href: '/lab' });
  return items;
}

export function toolsNavItems(): NavItem[] {
  return utilityNavItems();
}
