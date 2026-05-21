type AuthUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  handle: string;
  handleChangedAt: string | null;
  displayName: string;
  displayNameChangedAt: string | null;
  profileVisibility: 'private' | 'unlisted' | 'public';
  accountRole: 'player' | 'test' | 'admin';
};

const SIGNED_IN_HINT_KEY = 'mb_signed_in';

let cachedUser: AuthUser | null | undefined = undefined;
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
  document.querySelectorAll<HTMLElement>('.site-nav').forEach((nav) => mountAccountNav(nav, cachedUser as AuthUser));
}

function readSignedInHint(): boolean {
  try {
    return window.localStorage.getItem(SIGNED_IN_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSignedInHint(value: boolean): void {
  try {
    if (value) window.localStorage.setItem(SIGNED_IN_HINT_KEY, '1');
    else window.localStorage.removeItem(SIGNED_IN_HINT_KEY);
  } catch {
    // localStorage unavailable (private mode etc.) — fall through.
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
  document.querySelectorAll<HTMLElement>('[data-account-slot][data-account-pending="1"]').forEach((slot) => {
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
  profile.textContent = 'Profile';
  profile.setAttribute('role', 'menuitem');

  const settings = document.createElement('a');
  settings.className = 'account-nav-item';
  settings.href = '/account/settings';
  settings.textContent = 'Preferences';
  settings.setAttribute('role', 'menuitem');

  const divider = document.createElement('div');
  divider.className = 'account-nav-divider';
  divider.setAttribute('role', 'separator');

  const logout = document.createElement('button');
  logout.type = 'button';
  logout.className = 'account-nav-item account-nav-item-button';
  logout.textContent = 'Sign out';
  logout.setAttribute('role', 'menuitem');
  logout.addEventListener('click', () => void handleLogout(logout));

  trigger.addEventListener('click', () => {
    const expanded = trigger.getAttribute('aria-expanded') === 'true';
    closeAccountMenus();
    if (!expanded) openAccountMenu(control);
  });

  panel.append(profile, settings, divider, logout);
  control.append(trigger, panel);
  slot.replaceWith(control);
}

async function handleLogout(button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch {
    // Reload anyway so the page reflects the attempted sign-out.
  }
  invalidateAccountCache();
  writeSignedInHint(false);
  window.location.reload();
}

function openAccountMenu(control: HTMLElement): void {
  control.classList.add('open');
  control.querySelector<HTMLButtonElement>('.account-nav-trigger')?.setAttribute('aria-expanded', 'true');
}

function closeAccountMenus(): void {
  document.querySelectorAll<HTMLElement>('[data-account-nav]').forEach((control) => {
    control.classList.remove('open');
    control.querySelector<HTMLButtonElement>('.account-nav-trigger')?.setAttribute('aria-expanded', 'false');
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
      return user;
    })
    .catch(() => {
      cachedUser = null;
      return null;
    });
  return userPromise;
}

// Exported so other surfaces (e.g. the /contact form) can share the same
// auth-state cache instead of refetching /api/auth/me on mount.
export function loadCachedCurrentUser(): Promise<AuthUser | null> {
  return loadCurrentUser();
}

// Synchronous "best guess" hint persisted from a prior signed-in load.
// Used to pick the right initial render shape before the auth fetch resolves.
// Stale only in edge cases (sign-out from another tab), reconciled by
// awaiting loadCachedCurrentUser.
export function isLikelySignedIn(): boolean {
  if (cachedUser !== undefined) return cachedUser !== null;
  return readSignedInHint();
}

async function fetchCurrentUser(): Promise<AuthUser | null> {
  const resp = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (!resp.ok) return null;
  const data = (await resp.json()) as { user?: AuthUser | null };
  return data.user ?? null;
}

function invalidateAccountCache(): void {
  cachedUser = undefined;
  userPromise = null;
}
