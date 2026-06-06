// Account auth + settings UI. Extracted from landing.ts.
//
// Owns the /account, /account/settings page mounts and the form builders:
// signed-in account card, login form (email + magic code), account settings
// (display name / handle / email), and the auth-tabs (Sign in / Register).
//
// Shared shell helpers live in site-shell.ts so account pages do not depend on
// landing.ts.

import './account-profile.css';
import { identify, resetIdentity, track } from './analytics.js';
import {
  type AuthUser,
  buildLoadingState,
  buildNav,
  fetchCurrentUser,
} from './site-shell.js';

// ── Page mounts ──────────────────────────────────────────────────────────────

export async function mountAccount(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'account-route');
  root.append(buildNav(), buildLoadingState('Loading account'));

  const shell = document.createElement('main');
  shell.className = 'account-shell';
  root.replaceChildren(buildNav(), shell);

  const current = await fetchCurrentUser().catch((err) => {
    console.warn(err);
    return null;
  });
  renderAccountShell(shell, current, currentAccountTab());
}

export async function mountAccountSettings(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'account-route');

  const shell = document.createElement('main');
  shell.className = 'account-shell account-settings-shell';
  root.replaceChildren(buildNav(), shell);

  const current = await fetchCurrentUser().catch((err) => {
    console.warn(err);
    return null;
  });
  renderAccountSettingsShell(shell, current);
}

// ── Shell renderers ──────────────────────────────────────────────────────────

function renderAccountShell(
  shell: HTMLElement,
  user: AuthUser | null,
  tab: 'login' | 'register' = 'login',
): void {
  shell.replaceChildren(user ? buildSignedInAccount(user) : buildLoginForm(tab));
}

function renderAccountSettingsShell(shell: HTMLElement, user: AuthUser | null): void {
  shell.replaceChildren(user ? buildAccountSettingsPage(user, shell) : buildLoginForm());
}

// ── Signed-in account card ───────────────────────────────────────────────────

function buildSignedInAccount(user: AuthUser): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'account-panel';

  const eyebrow = document.createElement('span');
  eyebrow.className = 'account-eyebrow';
  eyebrow.textContent = 'Signed in';

  const title = document.createElement('h1');
  title.className = 'site-section-heading';
  title.textContent = `@${user.handle}`;

  const actions = document.createElement('div');
  actions.className = 'account-actions';

  const profile = document.createElement('a');
  profile.className = 'landing-setup-start';
  profile.href = `/@/${encodeURIComponent(user.handle)}`;
  profile.textContent = 'View profile';

  const settings = document.createElement('a');
  settings.className = 'landing-setup-back';
  settings.href = '/account/settings';
  settings.textContent = 'Settings';

  const logout = document.createElement('button');
  logout.type = 'button';
  logout.className = 'landing-setup-back';
  logout.textContent = 'Log out';
  logout.addEventListener('click', async () => {
    logout.disabled = true;
    await fetch('/api/auth/logout', { method: 'POST' });
    resetIdentity();
    try {
      window.localStorage.removeItem('mb_signed_in');
    } catch {
      /* ignore */
    }
    // Reload so the top-right nav reverts to Sign in / Register. The nav (owned
    // by account-nav.ts) resolves auth once at load, so an in-page render alone
    // leaves it showing the stale account menu. Mirrors account-nav's own logout.
    window.location.reload();
  });

  actions.append(profile, settings, logout);
  panel.append(eyebrow, title, actions);
  return panel;
}

// ── Account settings form ────────────────────────────────────────────────────

function buildAccountSettingsPage(user: AuthUser, shell: HTMLElement): DocumentFragment {
  const fragment = document.createDocumentFragment();
  fragment.append(buildAccountSettings(user, shell));
  return fragment;
}

function buildAccountSettings(user: AuthUser, shell: HTMLElement): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'account-panel account-settings-panel';

  const eyebrow = document.createElement('span');
  eyebrow.className = 'account-eyebrow';
  eyebrow.textContent = 'Settings';

  const title = document.createElement('h1');
  title.className = 'site-section-heading';
  title.textContent = 'Public profile';

  const copy = document.createElement('p');
  copy.className = 'account-copy';
  copy.textContent = 'Email signs you in. Your username is public.';

  const form = document.createElement('form');
  form.className = 'account-settings-form';

  const handle = labeledInput('Username', 'handle', user.handle, 'brianhliou');
  handle.input.maxLength = 24;
  handle.input.pattern = '[a-zA-Z0-9][a-zA-Z0-9_-]{1,22}[a-zA-Z0-9]';
  handle.input.required = true;
  handle.help.textContent = handleHelpText(user);

  const email = labeledInput('Email', 'email', user.email, '');
  email.input.disabled = true;
  email.help.textContent = 'Private login address. Not shown on your public profile.';

  const status = document.createElement('p');
  status.className = 'account-status';
  status.setAttribute('aria-live', 'polite');

  const actions = document.createElement('div');
  actions.className = 'account-actions';

  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'landing-setup-start';
  save.textContent = 'Save';

  const account = document.createElement('a');
  account.className = 'landing-setup-back';
  account.href = '/account';
  account.textContent = 'Account';

  const profile = document.createElement('a');
  profile.className = 'landing-setup-back';
  profile.href = `/@/${encodeURIComponent(user.handle)}`;
  profile.textContent = 'View profile';

  actions.append(save, profile, account);
  form.append(handle.wrap, email.wrap, actions, status);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    save.disabled = true;
    try {
      const resp = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          handle: handle.input.value,
        }),
      });
      const data = (await resp.json()) as { user?: AuthUser; error?: string; availableAt?: string };
      if (!resp.ok || !data.user) {
        throw new Error(accountSettingsErrorMessage(data.error, data.availableAt));
      }
      handle.input.value = data.user.handle;
      handle.help.textContent = handleHelpText(data.user);
      email.input.value = data.user.email;
      profile.href = `/@/${encodeURIComponent(data.user.handle)}`;
      status.textContent = 'Profile saved.';
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : 'Could not save profile.';
    } finally {
      save.disabled = false;
    }
  });
  // shell unused at submit time but retained for symmetry with buildSignedInAccount.
  void shell;

  panel.append(eyebrow, title, copy, form);
  return panel;
}

function labeledInput(
  labelText: string,
  name: string,
  value: string,
  placeholder: string,
): { help: HTMLSpanElement; input: HTMLInputElement; wrap: HTMLLabelElement } {
  const wrap = document.createElement('label');
  wrap.className = 'account-field';
  const label = document.createElement('span');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.name = name;
  input.value = value;
  input.placeholder = placeholder;
  const help = document.createElement('span');
  help.className = 'account-field-help';
  wrap.append(label, input, help);
  return { help, input, wrap };
}

function accountSettingsErrorMessage(
  error: string | undefined,
  availableAt: string | undefined,
): string {
  if (error === 'invalid_handle') return 'Use 3-24 letters, numbers, underscores, or dashes.';
  if (error === 'handle_taken') return 'That username is not available.';
  if (error === 'handle_change_cooldown') {
    const date = availableAt ? new Date(availableAt) : null;
    return date && Number.isFinite(date.getTime())
      ? `Username can be changed again on ${date.toLocaleDateString()}.`
      : 'Username cannot be changed again yet.';
  }
  if (error === 'not_signed_in') return 'Sign in before editing your profile.';
  return 'Could not save profile.';
}

function handleHelpText(user: AuthUser): string {
  if (!user.handleChangedAt) {
    return 'Used in your profile URL. Your first username change is available now.';
  }
  const nextChangeAt = new Date(
    new Date(user.handleChangedAt).getTime() + 30 * 24 * 60 * 60 * 1000,
  );
  if (!Number.isFinite(nextChangeAt.getTime())) {
    return 'Used in your profile URL. Later username changes are limited.';
  }
  return `Used in your profile URL. Next username change: ${nextChangeAt.toLocaleDateString()}.`;
}

// ── Login / register form ────────────────────────────────────────────────────

function buildAccountAuthTabs(active: 'login' | 'register'): HTMLElement {
  const tabs = document.createElement('div');
  tabs.className = 'account-auth-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Account access');

  const signIn = buildAccountAuthTab('Sign in', '/account?tab=login', active === 'login');
  const register = buildAccountAuthTab('Register', '/account?tab=register', active === 'register');

  tabs.append(signIn, register);
  return tabs;
}

function buildAccountAuthTab(label: string, href: string, isActive: boolean): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  link.className = isActive ? 'account-auth-tab active' : 'account-auth-tab';
  link.setAttribute('role', 'tab');
  link.setAttribute('aria-selected', isActive ? 'true' : 'false');
  return link;
}

function buildLoginForm(tab: 'login' | 'register' = 'login'): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'account-panel';

  panel.append(buildAccountAuthTabs(tab));

  const eyebrow = document.createElement('span');
  eyebrow.className = 'account-eyebrow';
  eyebrow.textContent = 'Account';

  const title = document.createElement('h1');
  title.className = 'site-section-heading';
  title.textContent = tab === 'register' ? 'Create your account' : 'Sign in';

  const copy = document.createElement('p');
  copy.className = 'account-copy';
  copy.textContent =
    tab === 'register'
      ? 'Enter your email. We’ll send a code—no password needed.'
      : 'One email code. No password.';

  const form = document.createElement('form');
  form.className = 'account-form';

  const email = document.createElement('input');
  email.type = 'email';
  email.name = 'email';
  email.autocomplete = 'email';
  email.placeholder = 'Email address';
  email.required = true;

  const code = document.createElement('input');
  code.type = 'text';
  code.name = 'code';
  code.inputMode = 'numeric';
  code.autocomplete = 'one-time-code';
  code.placeholder = 'Login code';
  code.hidden = true;

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'landing-setup-start';
  submit.textContent = 'Send code';

  const status = document.createElement('p');
  status.className = 'account-status';
  status.setAttribute('aria-live', 'polite');

  let loginId: string | null = null;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      if (!loginId) {
        const resp = await fetch('/api/auth/email/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: email.value }),
        });
        const data = (await resp.json()) as { loginId?: string; devCode?: string; error?: string };
        if (!resp.ok || !data.loginId)
          throw new Error(data.error ?? `start failed: ${resp.status}`);
        loginId = data.loginId;
        code.hidden = false;
        code.required = true;
        if (data.devCode) code.value = data.devCode;
        submit.textContent = 'Confirm';
        status.textContent = data.devCode
          ? 'Development code filled in.'
          : 'Check your email for the login code.';
        code.focus();
      } else {
        const resp = await fetch('/api/auth/email/confirm', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ loginId, code: code.value }),
        });
        const data = (await resp.json()) as {
          user?: AuthUser;
          isNewUser?: boolean;
          error?: string;
        };
        if (!resp.ok || !data.user) throw new Error(data.error ?? `confirm failed: ${resp.status}`);
        // Identify and fire the signup event before the reload below, so they are
        // attributed now (account-nav re-identifies on the next boot anyway).
        identify(data.user.id, {
          handle: data.user.handle,
          account_role: data.user.accountRole,
          email_verified: data.user.emailVerified,
        });
        if (data.isNewUser) track('signup_completed');
        // Set the signed-in hint first so the post-reload first paint shows the
        // account placeholder instead of flashing Sign in / Register.
        try {
          window.localStorage.setItem('mb_signed_in', '1');
        } catch {
          /* ignore */
        }
        // Reload so the top-right nav (account-nav.ts, resolved once at load)
        // picks up the new session. An in-page render alone leaves the nav stale.
        window.location.reload();
      }
    } catch (err) {
      status.textContent = err instanceof Error ? authErrorMessage(err.message) : 'Sign in failed.';
    } finally {
      submit.disabled = false;
    }
  });

  form.append(email, code, submit, status);

  // Terms/Privacy assent at the point of account creation. The footer is now
  // homepage-only, so the register form is the surface that surfaces these.
  if (tab === 'register') {
    const legal = document.createElement('p');
    legal.className = 'account-legal';
    const termsLink = document.createElement('a');
    termsLink.href = '/terms';
    termsLink.textContent = 'Terms';
    const privacyLink = document.createElement('a');
    privacyLink.href = '/privacy';
    privacyLink.textContent = 'Privacy';
    legal.append('By creating an account you agree to our ', termsLink, ' and ', privacyLink, '.');
    form.append(legal);
  }

  panel.append(eyebrow, title, copy, form);
  return panel;
}

function authErrorMessage(value: string): string {
  if (value === 'email_delivery_not_configured')
    return 'Email login is not configured in this runtime.';
  if (value === 'email_delivery_failed') return 'Email delivery failed. Try again in a moment.';
  if (value === 'persistence_disabled') return 'Accounts require the persistent server.';
  if (value === 'invalid_login_code') return 'The login code was invalid or expired.';
  if (value === 'invalid_email') return 'Enter a valid email address.';
  return 'Sign in failed.';
}

// ── Misc ─────────────────────────────────────────────────────────────────────

export function currentAccountTab(): 'login' | 'register' {
  const params = new URLSearchParams(window.location.search);
  return params.get('tab') === 'register' ? 'register' : 'login';
}
