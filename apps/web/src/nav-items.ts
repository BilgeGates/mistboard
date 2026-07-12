import type { I18nKey } from './i18n/catalog.js';

export const SHOW_ENGINE_LAB_LINKS = import.meta.env.VITE_SHOW_ENGINE_LAB_NAV === 'true';

export interface NavItem {
  label: string;
  labelKey: I18nKey;
  href: string;
  // Rendered hidden for signed-out visitors. The nav builds before auth
  // resolves, so site-shell picks the initial visibility from the persisted
  // signed-in hint and account-nav reconciles it once /api/auth/me settles.
  signedInOnly?: boolean;
}

export function primaryNavItems(): NavItem[] {
  return [
    { label: 'Play', labelKey: 'nav.play', href: '/' },
    { label: 'Puzzles', labelKey: 'nav.puzzles', href: '/puzzles' },
    { label: 'Watch', labelKey: 'nav.watch', href: '/watch' },
  ];
}

// Top-nav Community dropdown (lichess-aligned order): Players (the leaderboard),
// Coaches (the verified-coach directory), Friends (your following list), Forum,
// Blog (the articles surface). Teams is deliberately deferred. Kept distinct
// from communityRailItems(): the dropdown is the wide social entry, the rail is
// the leaderboard/bots sub-nav.
export function communityNavItems(): NavItem[] {
  return [
    { label: 'Players', labelKey: 'nav.players', href: '/player' },
    { label: 'Coaches', labelKey: 'nav.coaches', href: '/coach' },
    { label: 'Friends', labelKey: 'nav.friends', href: '/following', signedInOnly: true },
    { label: 'Forum', labelKey: 'nav.forum', href: '/forum' },
    { label: 'Blog', labelKey: 'nav.blog', href: '/blog' },
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

// Learn dropdown: the interactive xiangqi course (the bet's flagship learn
// surface) leads, Rules follows. The title itself links to /learn/xiangqi.
export function learnNavItems(): NavItem[] {
  return [
    { label: 'Xiangqi Basics', labelKey: 'nav.learnXiangqi', href: '/learn/xiangqi' },
    { label: 'Rules', labelKey: 'nav.rules', href: '/rules' },
  ];
}

// Watch dropdown (lichess parity): the title links to Mistboard TV (/watch), and
// the panel lists Mistboard TV explicitly alongside tournament Broadcasts. The
// explicit TV item matters on touch / no-hover devices, where tapping the title
// opens the panel instead of navigating — without it there'd be no way to reach
// /watch from this menu. Kept minimal until there are more watch surfaces
// (streamers, video) to list.
export function watchNavItems(): NavItem[] {
  return [
    { label: 'Mistboard TV', labelKey: 'nav.tv', href: '/watch' },
    { label: 'Broadcasts', labelKey: 'nav.broadcasts', href: '/broadcast/xiangqi' },
    { label: 'Video library', labelKey: 'nav.videoLibrary', href: '/videos' },
  ];
}

export function utilityNavItems(): NavItem[] {
  const items: NavItem[] = [];
  if (SHOW_ENGINE_LAB_LINKS) items.push({ label: 'Lab', labelKey: 'nav.lab', href: '/lab' });
  return items;
}

// Tools dropdown (lichess parity): the analysis board is the anchor tool; the
// engine Lab link folds in after it when enabled. Board editor / import / search
// are deferred until those surfaces exist.
export function toolsNavItems(): NavItem[] {
  return [
    { label: 'Analysis board', labelKey: 'nav.analysis', href: '/analysis/xiangqi' },
    { label: 'Studies', labelKey: 'nav.studies', href: '/study' },
    ...utilityNavItems(),
  ];
}
