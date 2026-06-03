import './account-nav.css';

import { identify, resetIdentity } from './analytics.js';
import { type ConnectionStatus, createConnectionStatus } from './connection-status.js';
import { clearSeatTokenForRoom, liveState } from './live-state.js';
import { readSignedInHint, setResolvedSignedIn, writeSignedInHint } from './signed-in-state.js';
import { buildAppearanceMenu, resetAppearanceMenus } from './theme.js';

// Lucide-style outline icons, matching the nav's existing icon weight. The gear
// mirrors the standalone settings gear (theme.ts); power marks Sign out.
const GEAR_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';
const POWER_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 2v10"/><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/></svg>';

// Each mounted dropdown owns a connection-status footer; we poll only while its
// menu is open. Keyed by the control element so multiple navs stay independent.
const statusByControl = new WeakMap<HTMLElement, ConnectionStatus>();

type AuthUser = {
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

const CACHED_USER_KEY = 'mb_cached_user';

let cachedUser: AuthUser | null | undefined;
let userPromise: Promise<AuthUser | null> | null = null;
let navObserver: MutationObserver | null = null;

export function initializeAccountNav(): void {
  applyPendingSlots();
  void primeAccountNav();
  watchForNavChanges();
}

async function primeAccountNav(): Promise<void> {
  const user = await loadCurrentUser();
  writeSignedInHint(user !== null);
  writeCachedUser(user);
  if (user) mountAccountNavs();
  else revealSignedOutSlots();
}

function watchForNavChanges(): void {
  if (navObserver) return;
  navObserver = new MutationObserver(() => {
    applyPendingSlots();
    if (cachedUser) mountAccountNavs();
    else if (cachedUser === null) revealSignedOutSlots();
  });
  navObserver.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', closeAccountMenusOnOutsideClick);
  document.addEventListener('keydown', closeAccountMenusOnEscape);
}

function mountAccountNavs(): void {
  if (cachedUser === undefined || cachedUser === null) return;
  for (const nav of document.querySelectorAll<HTMLElement>('.site-nav')) {
    mountAccountNav(nav, cachedUser as AuthUser);
  }
}

// Persisted user object. Lets surfaces that need handle/email render the real
// text on first paint instead of a placeholder that swaps post-fetch. Stale
// only on edge cases (sign-out elsewhere, email change in another tab) —
// reconciled by the authoritative /api/auth/me fetch.
function writeCachedUser(user: AuthUser | null): void {
  try {
    if (user) window.localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(CACHED_USER_KEY);
  } catch {
    // localStorage unavailable — fall through.
  }
}

export function readCachedUser(): AuthUser | null {
  try {
    const raw = window.localStorage.getItem(CACHED_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function applyPendingSlots(): void {
  if (cachedUser !== undefined) return;
  if (!readSignedInHint()) return;
  document.querySelectorAll<HTMLElement>('[data-account-slot]').forEach((slot) => {
    if (slot.dataset.accountPending === '1') return;
    if (slot.querySelector('[data-account-nav]')) return;
    slot.dataset.accountPending = '1';
    const placeholder = document.createElement('span');
    placeholder.className = 'account-nav-pending';
    placeholder.setAttribute('aria-hidden', 'true');
    slot.replaceChildren(placeholder);
  });
}

function revealSignedOutSlots(): void {
  document
    .querySelectorAll<HTMLElement>('[data-account-slot][data-account-pending="1"]')
    .forEach((slot) => {
      delete slot.dataset.accountPending;
      const signIn = document.createElement('a');
      signIn.href = '/account?tab=login';
      signIn.className = 'site-nav-link site-nav-link-signin';
      signIn.textContent = 'Sign in';
      const register = document.createElement('a');
      register.href = '/account?tab=register';
      register.className = 'site-nav-link-primary';
      register.textContent = 'Register';
      slot.replaceChildren(signIn, register);
    });
}

function mountAccountNav(nav: HTMLElement, user: AuthUser): void {
  const utilities = nav.querySelector<HTMLElement>('.site-nav-utilities');
  if (!utilities) return;
  if (utilities.querySelector('[data-account-nav]')) return;
  const slot = utilities.querySelector<HTMLElement>('[data-account-slot]');
  if (!slot) return;

  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const wasActive = path === '/account' || path.startsWith('/account/');

  const control = document.createElement('div');
  control.className = 'account-nav';
  control.dataset.accountNav = '';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'account-nav-trigger';
  trigger.textContent = user.handle;
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-label', `Account menu for ${user.handle}`);
  if (wasActive) {
    trigger.classList.add('active');
    trigger.setAttribute('aria-current', 'page');
  }

  const panel = document.createElement('div');
  panel.className = 'account-nav-panel';
  panel.setAttribute('role', 'menu');
  panel.setAttribute('aria-label', 'Account');

  const profile = document.createElement('a');
  profile.className = 'account-nav-item';
  profile.href = `/@/${encodeURIComponent(user.handle)}`;
  profile.setAttribute('role', 'menuitem');
  profile.append(createOnlineDot(), createItemLabel('Profile'));

  const settings = document.createElement('a');
  settings.className = 'account-nav-item';
  settings.href = '/account/settings';
  settings.setAttribute('role', 'menuitem');
  settings.append(createItemIcon(GEAR_ICON), createItemLabel('Preferences'));

  const logout = document.createElement('button');
  logout.type = 'button';
  logout.className = 'account-nav-item account-nav-item-button';
  logout.setAttribute('role', 'menuitem');
  logout.append(createItemIcon(POWER_ICON), createItemLabel('Sign out'));
  logout.addEventListener('click', () => void handleLogout(logout));

  trigger.addEventListener('click', () => {
    const expanded = trigger.getAttribute('aria-expanded') === 'true';
    closeAccountMenus();
    if (!expanded) openAccountMenu(control);
  });

  // Account actions on top, then the appearance drill-in, then the connection
  // footer — the lichess profile-menu order. Appearance folds in here (no
  // standalone gear when signed in); it reuses the menu theme.ts builds.
  const appearance = buildAppearanceMenu();
  const status = createConnectionStatus();
  statusByControl.set(control, status);

  panel.append(
    profile,
    settings,
    logout,
    createAccountDivider(),
    appearance,
    createAccountDivider(),
    status.element,
  );
  control.append(trigger, panel);
  slot.replaceWith(control);

  // Drop any standalone gear theme.ts may have mounted before auth resolved.
  for (const el of nav.querySelectorAll('[data-theme-control]')) el.remove();
}

async function handleLogout(button: HTMLButtonElement): Promise<void> {
  // Seats are account-bound, so signing out abandons any live game this account
  // is seated in: after sign-out the server treats this client as an
  // unauthorized spectator (can't view or rejoin the room), and the dropped
  // socket starts the opponent's forfeit countdown. Confirm first so a player
  // doesn't forfeit by accident.
  const inLiveGame =
    liveState.state?.status.type === 'playing' &&
    (liveState.seat === 'white' || liveState.seat === 'black');
  if (
    inLiveGame &&
    !window.confirm('You have a game in progress. Are you sure you want to sign out?')
  ) {
    return;
  }
  button.disabled = true;
  // Drop the seat token so the reconnect after reload can't reclaim the
  // account-bound seat. Defense-in-depth: the server gate already denies it
  // once the session is gone. The reload below closes the live socket.
  if (liveState.room) clearSeatTokenForRoom(liveState.room);
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch {
    // Reload anyway so the page reflects the attempted sign-out.
  }
  invalidateAccountCache();
  resetIdentity();
  writeSignedInHint(false);
  writeCachedUser(null);
  window.location.reload();
}

function createItemIcon(svg: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'account-nav-item-icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = svg;
  return span;
}

function createOnlineDot(): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'account-nav-item-icon account-nav-online-dot';
  span.setAttribute('aria-hidden', 'true');
  return span;
}

function createItemLabel(text: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'account-nav-item-label';
  span.textContent = text;
  return span;
}

function createAccountDivider(): HTMLDivElement {
  const divider = document.createElement('div');
  divider.className = 'account-nav-divider';
  divider.setAttribute('role', 'separator');
  return divider;
}

function openAccountMenu(control: HTMLElement): void {
  resetAppearanceMenus(control);
  control.classList.add('open');
  control
    .querySelector<HTMLButtonElement>('.account-nav-trigger')
    ?.setAttribute('aria-expanded', 'true');
  statusByControl.get(control)?.start();
}

function closeAccountMenus(): void {
  document.querySelectorAll<HTMLElement>('[data-account-nav]').forEach((control) => {
    control.classList.remove('open');
    control
      .querySelector<HTMLButtonElement>('.account-nav-trigger')
      ?.setAttribute('aria-expanded', 'false');
    statusByControl.get(control)?.stop();
  });
}

function closeAccountMenusOnOutsideClick(event: MouseEvent): void {
  const target = event.target;
  if (target instanceof Element && target.closest('[data-account-nav]')) return;
  closeAccountMenus();
}

function closeAccountMenusOnEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  closeAccountMenus();
}

async function loadCurrentUser(): Promise<AuthUser | null> {
  if (cachedUser !== undefined) return cachedUser;
  if (userPromise) return userPromise;
  userPromise = fetchCurrentUser()
    .then((user) => {
      cachedUser = user;
      setResolvedSignedIn(user !== null);
      // Canonical per-load auth resolution: identify so PostHog persons map to
      // DB accounts. Idempotent for returning users.
      if (user) {
        identify(user.id, {
          handle: user.handle,
          account_role: user.accountRole,
          email_verified: user.emailVerified,
        });
      }
      return user;
    })
    .catch(() => {
      cachedUser = null;
      setResolvedSignedIn(false);
      return null;
    });
  return userPromise;
}

// Exported so other surfaces (e.g. the /contact form) can share the same
// auth-state cache instead of refetching /api/auth/me on mount.
export function loadCachedCurrentUser(): Promise<AuthUser | null> {
  return loadCurrentUser();
}

async function fetchCurrentUser(): Promise<AuthUser | null> {
  const resp = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (!resp.ok) return null;
  const data = (await resp.json()) as { user?: AuthUser | null };
  return data.user ?? null;
}

function invalidateAccountCache(): void {
  cachedUser = undefined;
  setResolvedSignedIn(undefined);
  userPromise = null;
}
