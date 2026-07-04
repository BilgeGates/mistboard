// Community sub-navigation rail (Leaderboard / Online bots): the leaderboard
// section's sub-nav, in the playstrategy/lichess idiom. Pages wrap their content
// with buildCommunityLayout so the rail + column grid stay consistent across
// community surfaces. Distinct from the top-nav Community dropdown
// (communityNavItems): the rail is narrower and Forum lives only in the dropdown.

import './community-rail.css';
import { t } from './i18n/catalog.js';
import { currentLocale, type Locale, localizedHref } from './i18n/locale.js';
import { communityRailItems } from './nav-items.js';

export function buildCommunityRail(
  activeHref: string,
  locale: Locale = currentLocale(),
): HTMLElement {
  const rail = document.createElement('nav');
  rail.className = 'community-rail';
  rail.setAttribute('aria-label', t('nav.community', {}, locale));
  for (const item of communityRailItems()) {
    const link = document.createElement('a');
    link.href = localizedHref(item.href, locale);
    link.textContent = t(item.labelKey, {}, locale);
    if (item.href === activeHref) {
      link.classList.add('community-rail-active');
      link.setAttribute('aria-current', 'page');
    }
    rail.append(link);
  }
  return rail;
}

export function buildCommunityLayout(
  activeHref: string,
  content: HTMLElement,
  locale: Locale = currentLocale(),
): HTMLElement {
  const layout = document.createElement('div');
  layout.className = 'community-layout';
  layout.append(buildCommunityRail(activeHref, locale), content);
  return layout;
}
