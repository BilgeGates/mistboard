import './site-shell.css';
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
};

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const resp = await fetch('/api/auth/me');
  if (!resp.ok) throw new Error(`failed to load account: ${resp.status}`);
  const data = (await resp.json()) as { user: AuthUser | null };
  return data.user;
}

export function buildNav(): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'site-nav';
  nav.setAttribute('aria-label', 'Primary');

  const brand = document.createElement('a');
  brand.className = 'site-nav-brand';
  brand.href = '/';
  const brandLogo = document.createElement('img');
  brandLogo.className = 'site-nav-logo';
  brandLogo.src = '/logo.svg';
  brandLogo.alt = '';
  brandLogo.width = 28;
  brandLogo.height = 28;

  const brandText = document.createElement('span');
  brandText.textContent = 'Mistboard';
  brand.append(brandLogo, brandText);

  const links = document.createElement('div');
  links.className = 'site-nav-links';

  const [play, puzzles, watch] = primaryNavItems();
  if (play) links.append(navLink(play.label, play.href));
  if (puzzles) links.append(navLink(puzzles.label, puzzles.href));
  links.append(navMenu('Learn', learnNavItems()));
  if (watch) links.append(navLink(watch.label, watch.href));
  links.append(navMenu('Community', communityNavItems()));
  const tools = toolsNavItems();
  if (tools.length > 0) links.append(navMenu('Tools', tools));

  const utilities = document.createElement('div');
  utilities.className = 'site-nav-utilities';

  utilities.append(buildSignedOutAccountLinks());

  // Mobile menu toggle. On desktop `.site-nav-collapse` is `display: contents`,
  // so links + utilities lay out exactly as before; on mobile the toggle reveals
  // them as a dropdown panel. theme.ts / account-nav.ts still find
  // `.site-nav-utilities` via descendant query, so injection is unaffected.
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'site-nav-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Menu');
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

function buildSignedOutAccountLinks(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'site-nav-auth';
  wrap.dataset.accountSlot = '';

  const path = currentPath();
  const tab: 'login' | 'register' =
    new URLSearchParams(window.location.search).get('tab') === 'register' ? 'register' : 'login';

  const signIn = document.createElement('a');
  signIn.href = '/account?tab=login';
  signIn.className = 'site-nav-link site-nav-link-signin';
  signIn.textContent = 'Sign in';
  if (path === '/account' && tab === 'login') {
    signIn.classList.add('active');
    signIn.setAttribute('aria-current', 'page');
  }

  const register = document.createElement('a');
  register.href = '/account?tab=register';
  register.className = 'site-nav-link site-nav-link-register';
  register.textContent = 'Register';
  if (path === '/account' && tab === 'register') {
    register.classList.add('active');
    register.setAttribute('aria-current', 'page');
  }

  wrap.append(signIn, register);
  return wrap;
}

function navLink(label: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  link.className = 'site-nav-link';
  const path = currentPath();
  if (pathMatchesNavItem(path, href)) {
    link.classList.add('active');
    link.setAttribute('aria-current', 'page');
  }
  return link;
}

function navMenu(label: string, items: NavItem[]): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'site-nav-menu';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'site-nav-link site-nav-menu-toggle';
  button.setAttribute('aria-expanded', 'false');
  button.textContent = label;
  const caret = document.createElement('span');
  caret.className = 'site-nav-menu-caret';
  caret.setAttribute('aria-hidden', 'true');
  button.append(caret);

  const panel = document.createElement('div');
  panel.className = 'site-nav-menu-panel';
  for (const item of items) {
    const link = navLink(item.label, item.href);
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
  return (
    path === href ||
    (href === '/puzzles' && path.startsWith('/puzzles/')) ||
    (href === '/account' && path.startsWith('/account/')) ||
    (href === '/bots' && path.startsWith('/bot/')) ||
    (href === '/forum' && path.startsWith('/forum/')) ||
    (href === '/rules' && (path === '/zh-hans/rules' || path === '/zh-hant/rules')) ||
    (href === '/articles' &&
      (path === '/zh-hans/articles' ||
        path === '/zh-hant/articles' ||
        path.startsWith('/articles/') ||
        path.includes('/articles/')))
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
// (no `.site-footer` bar chrome) — interior routes no longer carry a footer, so
// these links live only here. The register form independently surfaces Terms +
// Privacy so signup still has an assent surface. One quiet row, deliberately
// NOT a lichess-style grouped fat footer: with our route count the columns
// read busier than the site is (Brian, 2026-06-10). The content routes the
// top nav omits (Rules, Articles, News) lead the row.
const HOME_FOOTER_LINKS: ReadonlyArray<{ href: string; label: string; external?: boolean }> = [
  { href: '/rules', label: 'Rules' },
  { href: '/articles', label: 'Articles' },
  { href: '/news', label: 'News' },
  { href: '/about', label: 'About' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
  { href: '/source', label: 'Source' },
  { href: GITHUB_URL, label: 'GitHub', external: true },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
];

export function buildHomeFooter(): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'landing-footer';

  const links = document.createElement('div');
  links.className = 'landing-footer-links';
  for (const link of HOME_FOOTER_LINKS) {
    const anchor = document.createElement('a');
    anchor.href = link.href;
    anchor.textContent = link.label;
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
