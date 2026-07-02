import './site-shell.css';
import { type I18nKey, t } from './i18n/catalog.js';
import { currentLocale, type Locale, localizedHref, stripLocalePrefix } from './i18n/locale.js';
import {
  communityNavItems,
  learnNavItems,
  type NavItem,
  primaryNavItems,
  toolsNavItems,
} from './nav-items.js';

export const GITHUB_URL = 'https://github.com/brianhliou/mistboard';

export type AuthUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  handle: string;
  handleChangedAt: string | null;
  displayName: string;
  displayNameChangedAt: string | null;
  profileVisibility: 'private' | 'unlisted' | 'public';
  accountRole: 'player' | 'admin';
  locale: Locale | null;
  dmPolicy: 'never' | 'friends' | 'always';
};

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const resp = await fetch('/api/auth/me');
  if (!resp.ok) throw new Error(`failed to load account: ${resp.status}`);
  const data = (await resp.json()) as { user: AuthUser | null };
  return data.user;
}

export function buildNav(locale: Locale = currentLocale()): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'site-nav';
  nav.setAttribute('aria-label', t('nav.primary', {}, locale));

  const brand = document.createElement('a');
  brand.className = 'site-nav-brand';
  brand.href = '/';
  const brandLogo = document.createElement('img');
  brandLogo.className = 'site-nav-logo';
  brandLogo.src = '/logo.svg';
  brandLogo.alt = '';
  brandLogo.width = 28;
  brandLogo.height = 28;

  // Wordmark styled like lichess's: full name in --site-text, the TLD suffix
  // dimmed to --site-muted. Nested spans keep the mobile `.site-nav-brand span`
  // logo-only collapse working (both spans hide together).
  const brandText = document.createElement('span');
  brandText.className = 'site-nav-brand-name';
  brandText.append('mistboard');
  const brandSuffix = document.createElement('span');
  brandSuffix.className = 'site-nav-brand-suffix';
  brandSuffix.textContent = '.com';
  brandText.append(brandSuffix);
  brand.append(brandLogo, brandText);

  const links = document.createElement('div');
  links.className = 'site-nav-links';

  const [play, puzzles, watch] = primaryNavItems();
  if (play) links.append(navLink(play, locale));
  if (puzzles) links.append(navLink(puzzles, locale));
  links.append(navMenu('nav.learn', learnNavItems(), locale));
  if (watch) links.append(navLink(watch, locale));
  links.append(navMenu('nav.community', communityNavItems(), locale));
  const tools = toolsNavItems();
  if (tools.length > 0) links.append(navMenu('nav.tools', tools, locale));

  const utilities = document.createElement('div');
  utilities.className = 'site-nav-utilities';

  utilities.append(buildSignedOutAccountLinks(locale));

  // Mobile menu toggle. On desktop `.site-nav-collapse` is `display: contents`,
  // so links + utilities lay out exactly as before; on mobile the toggle reveals
  // them as a dropdown panel. theme.ts / account-nav.ts still find
  // `.site-nav-utilities` via descendant query, so injection is unaffected.
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'site-nav-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', t('nav.menu', {}, locale));
  for (let i = 0; i < 3; i++) toggle.append(document.createElement('span'));
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  const collapse = document.createElement('div');
  collapse.className = 'site-nav-collapse';
  collapse.append(links, utilities);

  ensureNavDismiss();
  nav.append(brand, toggle, collapse);
  return nav;
}

let navDismissBound = false;
function ensureNavDismiss(): void {
  if (navDismissBound) return;
  navDismissBound = true;
  const closeAll = () => {
    for (const nav of document.querySelectorAll<HTMLElement>('.site-nav.nav-open')) {
      nav.classList.remove('nav-open');
      nav.querySelector('.site-nav-toggle')?.setAttribute('aria-expanded', 'false');
    }
  };
  document.addEventListener('click', (event) => {
    const target = event.target as Node;
    for (const nav of document.querySelectorAll<HTMLElement>('.site-nav.nav-open')) {
      if (!nav.contains(target)) {
        nav.classList.remove('nav-open');
        nav.querySelector('.site-nav-toggle')?.setAttribute('aria-expanded', 'false');
      }
    }
    for (const menu of document.querySelectorAll<HTMLElement>(
      '.site-nav-menu.site-nav-menu-open',
    )) {
      if (!menu.contains(target)) closeNavMenu(menu);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAll();
      for (const menu of document.querySelectorAll<HTMLElement>('.site-nav-menu-open')) {
        closeNavMenu(menu);
      }
    }
  });
}

function buildSignedOutAccountLinks(locale: Locale = currentLocale()): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'site-nav-auth';
  wrap.dataset.accountSlot = '';

  const path = currentPath();
  const tab: 'login' | 'register' =
    new URLSearchParams(window.location.search).get('tab') === 'register' ? 'register' : 'login';

  const signIn = document.createElement('a');
  signIn.href = localizedHref('/account?tab=login', locale);
  signIn.className = 'site-nav-link site-nav-link-signin';
  signIn.textContent = t('nav.signIn', {}, locale);
  if (path === '/account' && tab === 'login') {
    signIn.classList.add('active');
    signIn.setAttribute('aria-current', 'page');
  }

  const register = document.createElement('a');
  register.href = localizedHref('/account?tab=register', locale);
  register.className = 'site-nav-link site-nav-link-register';
  register.textContent = t('nav.register', {}, locale);
  if (path === '/account' && tab === 'register') {
    register.classList.add('active');
    register.setAttribute('aria-current', 'page');
  }

  wrap.append(signIn, register);
  return wrap;
}

function navLink(item: NavItem, locale: Locale): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = localizedHref(item.href, locale);
  link.textContent = t(item.labelKey, {}, locale);
  link.className = 'site-nav-link';
  const path = currentPath();
  if (pathMatchesNavItem(path, item.href)) {
    link.classList.add('active');
    link.setAttribute('aria-current', 'page');
  }
  return link;
}

function navMenu(labelKey: NavItem['labelKey'], items: NavItem[], locale: Locale): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'site-nav-menu';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'site-nav-link site-nav-menu-toggle';
  button.setAttribute('aria-expanded', 'false');
  button.textContent = t(labelKey, {}, locale);

  const panel = document.createElement('div');
  panel.className = 'site-nav-menu-panel';
  for (const item of items) {
    const link = navLink(item, locale);
    panel.append(link);
  }

  if (items.some((item) => pathMatchesNavItem(currentPath(), item.href))) {
    button.classList.add('active');
  }

  button.addEventListener('click', () => {
    const open = !menu.classList.contains('site-nav-menu-open');
    for (const other of document.querySelectorAll<HTMLElement>('.site-nav-menu-open')) {
      if (other !== menu) closeNavMenu(other);
    }
    menu.classList.toggle('site-nav-menu-open', open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  menu.append(button, panel);
  return menu;
}

function closeNavMenu(menu: HTMLElement): void {
  menu.classList.remove('site-nav-menu-open');
  menu.querySelector('.site-nav-menu-toggle')?.setAttribute('aria-expanded', 'false');
}

function pathMatchesNavItem(path: string, href: string): boolean {
  const normalizedPath = stripLocalePrefix(path);
  return (
    normalizedPath === href ||
    (href === '/puzzles' && normalizedPath.startsWith('/puzzles/')) ||
    (href === '/account' && normalizedPath.startsWith('/account/')) ||
    (href === '/bots' && normalizedPath.startsWith('/bot/')) ||
    (href === '/forum' && normalizedPath.startsWith('/forum/')) ||
    (href === '/rules' && normalizedPath.startsWith('/rules/')) ||
    (href === '/articles' && normalizedPath.startsWith('/articles/'))
  );
}

function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

export function buildLoadingState(label: string): HTMLElement {
  const section = document.createElement('main');
  section.className = 'site-loading';
  section.setAttribute('aria-live', 'polite');

  const mark = document.createElement('div');
  mark.className = 'site-loading-mark';
  mark.setAttribute('aria-hidden', 'true');

  const text = document.createElement('p');
  text.textContent = label;

  section.append(mark, text);
  return section;
}

export function buildNotice(titleText: string, bodyText: string): HTMLElement {
  const notice = document.createElement('section');
  notice.className = 'site-section game-notice';
  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = titleText;
  const body = document.createElement('p');
  body.textContent = bodyText;
  notice.append(heading, body);
  return notice;
}

// Homepage-only footer. Rendered blended into the bottom of the landing stage
// (no `.site-footer` bar chrome). Static info pages carry their own side rail,
// and the register form independently surfaces Terms + Privacy so signup still
// has an assent surface. One quiet row, deliberately NOT a lichess-style grouped
// fat footer: with our route count the columns read busier than the site is
// (Brian, 2026-06-10).
const HOME_FOOTER_LINKS: ReadonlyArray<{
  href: string;
  labelKey: I18nKey;
  external?: boolean;
}> = [
  { href: '/about', labelKey: 'footer.about' },
  { href: '/faq', labelKey: 'footer.faq' },
  { href: '/contact', labelKey: 'footer.contact' },
  { href: '/source', labelKey: 'footer.source' },
  { href: GITHUB_URL, labelKey: 'footer.github', external: true },
  { href: '/terms', labelKey: 'footer.terms' },
  { href: '/privacy', labelKey: 'footer.privacy' },
];

export function buildHomeFooter(locale: Locale = currentLocale()): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'landing-footer';

  const links = document.createElement('div');
  links.className = 'landing-footer-links';
  for (const link of HOME_FOOTER_LINKS) {
    const anchor = document.createElement('a');
    anchor.href = link.external ? link.href : localizedHref(link.href, locale);
    anchor.textContent = t(link.labelKey, {}, locale);
    if (link.external) {
      anchor.target = '_blank';
      anchor.rel = 'noreferrer noopener';
    }
    links.append(anchor);
  }

  const identity = document.createElement('span');
  identity.className = 'landing-footer-identity';
  identity.textContent = '© 2026 Mistboard · AGPL-3.0';

  links.append(identity);
  footer.append(links);
  return footer;
}
