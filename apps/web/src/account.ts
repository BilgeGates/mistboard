// Account auth + settings UI. Extracted from landing.ts.
//
// Owns the /account, /account/settings page mounts and the form builders:
// signed-in account card, login form (email + magic code), account settings
// (display name / handle / email), and the auth-tabs (Sign in / Register).
//
// Shared shell helpers live in site-shell.ts so account pages do not depend on
// landing.ts.

import './account-profile.css';
import { setAccountNavUser } from './account-nav.js';
import { identify, resetIdentity, track } from './analytics.js';
import { requestedAuthReferrer } from './auth-redirect.js';
import {
  DISPLAY_PREFERENCE_DEFINITIONS,
  type DisplayPreferenceId,
  type DisplayPreferenceValue,
  isBooleanDisplayPreference,
  readDisplayPreferences,
  writeDisplayPreference,
} from './display-preferences.js';
import { t } from './i18n/catalog.js';
import { currentLocale, LOCALE_META, type Locale, localizedHref } from './i18n/locale.js';
import { type AuthUser, buildLoadingState, buildNav, fetchCurrentUser } from './site-shell.js';

type AccountSettingsSection =
  | 'profile'
  | 'display'
  | 'game-behavior'
  | 'privacy'
  | 'messaging'
  | 'notifications'
  | 'account'
  | 'security'
  | 'close-account';

const accountSettingsSections: readonly AccountSettingsSection[] = [
  'profile',
  'display',
  'game-behavior',
  'privacy',
  'messaging',
  'notifications',
  'account',
  'security',
  'close-account',
];

const profileVisibilityOptions = ['public', 'unlisted', 'private'] as const;

// ── Page mounts ──────────────────────────────────────────────────────────────

export async function mountAccount(root: HTMLElement): Promise<void> {
  const locale = currentLocale();
  root.replaceChildren();
  root.classList.add('landing-page', 'account-route');
  root.append(buildNav(locale), buildLoadingState(t('account.loading', {}, locale)));

  const shell = document.createElement('main');
  shell.className = 'account-shell';
  root.replaceChildren(buildNav(locale), shell);

  const current = await fetchCurrentUser().catch((err) => {
    console.warn(err);
    return null;
  });
  if (current) {
    window.location.replace(localizedHref('/account/settings', locale));
    return;
  }
  renderAccountShell(shell, current, currentAccountTab(), locale);
}

export async function mountAccountSettings(root: HTMLElement): Promise<void> {
  const locale = currentLocale();
  const section = accountSettingsSectionFromPath();
  root.replaceChildren();
  root.classList.add('landing-page', 'account-route');

  const shell = document.createElement('main');
  shell.className = 'account-shell account-settings-shell';
  root.replaceChildren(buildNav(locale), shell);

  const current = await fetchCurrentUser().catch((err) => {
    console.warn(err);
    return null;
  });
  renderAccountSettingsShell(shell, current, section, locale);
}

// ── Shell renderers ──────────────────────────────────────────────────────────

function renderAccountShell(
  shell: HTMLElement,
  user: AuthUser | null,
  tab: 'login' | 'register' = 'login',
  locale: Locale = currentLocale(),
): void {
  shell.replaceChildren(
    user
      ? buildSignedInAccount(
          user,
          () => renderAccountShell(shell, null, currentAccountTab(), locale),
          locale,
        )
      : buildLoginForm(
          tab,
          (next) => renderAccountShell(shell, next, currentAccountTab(), locale),
          locale,
          { redirectOnSuccess: true },
        ),
  );
}

function renderAccountSettingsShell(
  shell: HTMLElement,
  user: AuthUser | null,
  section: AccountSettingsSection,
  locale: Locale = currentLocale(),
): void {
  document
    .querySelector('.account-route')
    ?.classList.toggle('account-settings-auth-route', user === null);
  shell.classList.toggle('account-settings-shell', user !== null);
  shell.replaceChildren(
    user
      ? buildAccountSettingsPage(user, section, locale)
      : buildLoginForm(
          'login',
          (next) => renderAccountSettingsShell(shell, next, section, locale),
          locale,
          { redirectOnSuccess: false },
        ),
  );
}

// ── Signed-in account card ───────────────────────────────────────────────────

function buildSignedInAccount(
  user: AuthUser,
  onLogout: () => void,
  locale: Locale = currentLocale(),
): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'account-panel';

  const eyebrow = document.createElement('span');
  eyebrow.className = 'account-eyebrow';
  eyebrow.textContent = t('account.signedIn', {}, locale);

  const title = document.createElement('h1');
  title.className = 'site-section-heading';
  title.textContent = `@${user.handle}`;

  const actions = document.createElement('div');
  actions.className = 'account-actions';

  const profile = document.createElement('a');
  profile.className = 'landing-setup-start';
  profile.href = `/@/${encodeURIComponent(user.handle)}`;
  profile.textContent = t('account.viewProfile', {}, locale);

  const settings = document.createElement('a');
  settings.className = 'landing-setup-back';
  settings.href = localizedHref('/account/settings', locale);
  settings.textContent = t('account.settings', {}, locale);

  const logout = document.createElement('button');
  logout.type = 'button';
  logout.className = 'landing-setup-back';
  logout.textContent = t('account.logOut', {}, locale);
  logout.addEventListener('click', async () => {
    logout.disabled = true;
    await fetch('/api/auth/logout', { method: 'POST' });
    resetIdentity();
    setAccountNavUser(null);
    onLogout();
  });

  actions.append(profile, settings, logout);

  // Follow/block lists are self-only surfaces; they render here (and nowhere
  // public) and hydrate after the card paints.
  const relations = document.createElement('div');
  relations.className = 'account-relations';
  void populateRelations(relations, locale);

  panel.append(eyebrow, title, actions, relations);
  return panel;
}

// ── Following / blocked lists ────────────────────────────────────────────────

type RelationEntry = { handle: string; displayName: string; createdAt: string };

async function populateRelations(container: HTMLElement, locale: Locale): Promise<void> {
  const [following, blocked] = await Promise.all([
    fetchRelationEntries('following'),
    fetchRelationEntries('blocks'),
  ]);
  container.replaceChildren();
  // Load failures leave the card unchanged rather than showing an error row:
  // the lists are secondary account furniture, not the page's job.
  if (following === null && blocked === null) return;

  container.append(
    buildRelationGroup(
      t('account.following', {}, locale),
      following ?? [],
      'follow',
      t('account.followingEmpty', {}, locale),
      locale,
    ),
  );
  // An empty blocked list is noise for most players; only render it when
  // there is something to manage.
  if (blocked && blocked.length > 0) {
    container.append(
      buildRelationGroup(t('account.blocked', {}, locale), blocked, 'block', '', locale),
    );
  }
}

async function fetchRelationEntries(kind: 'following' | 'blocks'): Promise<RelationEntry[] | null> {
  try {
    const resp = await fetch(`/api/relations/${kind}`);
    if (!resp.ok) return null;
    const data = (await resp.json()) as { entries: RelationEntry[] };
    return data.entries;
  } catch (err) {
    console.warn(err);
    return null;
  }
}

function buildRelationGroup(
  heading: string,
  entries: RelationEntry[],
  kind: 'follow' | 'block',
  emptyCopy: string,
  locale: Locale,
): HTMLElement {
  const group = document.createElement('section');
  group.className = 'account-relations-group';

  const title = document.createElement('h2');
  title.className = 'account-relations-heading';
  title.textContent = heading;
  group.append(title);

  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'account-copy';
    empty.textContent = emptyCopy;
    group.append(empty);
    return group;
  }

  const list = document.createElement('ul');
  list.className = 'account-relations-list';
  for (const entry of entries) {
    list.append(buildRelationRow(entry, kind, locale));
  }
  group.append(list);
  return group;
}

function buildRelationRow(
  entry: RelationEntry,
  kind: 'follow' | 'block',
  locale: Locale,
): HTMLElement {
  const item = document.createElement('li');
  item.className = 'account-relations-row';

  const link = document.createElement('a');
  link.href = `/@/${encodeURIComponent(entry.handle)}`;
  link.className = 'account-relations-handle';
  link.textContent = `@${entry.handle}`;

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'account-relations-remove';
  remove.textContent =
    kind === 'follow' ? t('profile.unfollow', {}, locale) : t('profile.unblock', {}, locale);
  remove.addEventListener('click', async () => {
    remove.disabled = true;
    try {
      const resp = await fetch(`/api/users/${encodeURIComponent(entry.handle)}/${kind}`, {
        method: 'DELETE',
      });
      if (!resp.ok) throw new Error(`relation delete failed: ${resp.status}`);
      item.remove();
    } catch (err) {
      console.warn(err);
      remove.disabled = false;
    }
  });

  item.append(link, remove);
  return item;
}

// ── Account settings form ────────────────────────────────────────────────────

function buildAccountSettingsPage(
  user: AuthUser,
  section: AccountSettingsSection,
  locale: Locale = currentLocale(),
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  fragment.append(
    buildAccountSettingsRail(section, locale),
    buildAccountSettingsSection(user, section, locale),
  );
  return fragment;
}

function buildAccountSettingsRail(
  active: AccountSettingsSection,
  locale: Locale = currentLocale(),
): HTMLElement {
  const rail = document.createElement('nav');
  rail.className = 'account-settings-rail';
  rail.setAttribute('aria-label', t('account.settingsNav', {}, locale));

  for (const section of accountSettingsSections) {
    const link = document.createElement('a');
    link.href = accountSettingsSectionHref(section, locale);
    link.className = 'account-settings-rail-link';
    link.textContent = accountSettingsSectionLabel(section, locale);
    if (section === active) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
    rail.append(link);
  }
  return rail;
}

function buildAccountSettingsSection(
  user: AuthUser,
  section: AccountSettingsSection,
  locale: Locale = currentLocale(),
): HTMLElement {
  if (section === 'profile') return buildProfileSettings(user, locale);
  if (section === 'display') return buildDisplaySettings(locale);
  if (section === 'privacy') return buildPrivacySettings(user, locale);
  if (section === 'messaging') return buildMessagingSettings(user, locale);
  if (section === 'account') return buildAccountAccessSettings(user, locale);
  return buildDeferredSettings(section, locale);
}

function buildSettingsPanel(
  section: AccountSettingsSection,
  titleText: string,
  copyText: string,
  locale: Locale = currentLocale(),
): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'account-panel account-settings-panel';

  const eyebrow = document.createElement('span');
  eyebrow.className = 'account-eyebrow';
  eyebrow.textContent = t('account.settings', {}, locale);

  const title = document.createElement('h1');
  title.className = 'site-section-heading';
  title.textContent = titleText;

  const copy = document.createElement('p');
  copy.className = 'account-copy';
  copy.textContent = copyText;

  panel.dataset.settingsSection = section;
  panel.append(eyebrow, title, copy);
  return panel;
}

function buildProfileSettings(user: AuthUser, locale: Locale = currentLocale()): HTMLElement {
  const panel = buildSettingsPanel(
    'profile',
    t('account.publicProfile', {}, locale),
    t('account.settingsCopy', {}, locale),
  );

  const form = document.createElement('form');
  form.className = 'account-settings-form';

  const handle = labeledInput(
    t('account.username', {}, locale),
    'handle',
    user.handle,
    'brianhliou',
  );
  handle.input.maxLength = 24;
  handle.input.pattern = '[a-zA-Z0-9][a-zA-Z0-9_-]{1,22}[a-zA-Z0-9]';
  handle.input.required = true;
  handle.help.textContent = handleHelpText(user, locale);

  const email = labeledInput(t('account.email', {}, locale), 'email', user.email, '');
  email.input.disabled = true;
  email.help.textContent = t('account.emailPrivate', {}, locale);

  const status = document.createElement('p');
  status.className = 'account-status';
  status.setAttribute('aria-live', 'polite');

  const actions = document.createElement('div');
  actions.className = 'account-actions';

  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'landing-setup-start';
  save.textContent = t('account.save', {}, locale);

  const account = document.createElement('a');
  account.className = 'landing-setup-back';
  account.href = localizedHref('/account', locale);
  account.textContent = t('account.account', {}, locale);

  const profile = document.createElement('a');
  profile.className = 'landing-setup-back';
  profile.href = `/@/${encodeURIComponent(user.handle)}`;
  profile.textContent = t('account.viewProfile', {}, locale);

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
        throw new Error(accountSettingsErrorMessage(data.error, data.availableAt, locale));
      }
      handle.input.value = data.user.handle;
      handle.help.textContent = handleHelpText(data.user, locale);
      email.input.value = data.user.email;
      profile.href = `/@/${encodeURIComponent(data.user.handle)}`;
      status.textContent = t('account.profileSaved', {}, locale);
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : t('account.saveFailed', {}, locale);
    } finally {
      save.disabled = false;
    }
  });

  panel.append(form);
  return panel;
}

function buildDisplaySettings(locale: Locale = currentLocale()): HTMLElement {
  const panel = buildSettingsPanel(
    'display',
    t('account.settingsDisplay', {}, locale),
    t('account.settingsDisplayCopy', {}, locale),
  );
  const preferences = readDisplayPreferences();
  const list = document.createElement('div');
  list.className = 'account-display-settings';
  for (const definition of DISPLAY_PREFERENCE_DEFINITIONS) {
    if (isBooleanDisplayPreference(definition)) {
      list.append(buildBooleanDisplayPreference(definition.id, preferences[definition.id], locale));
      continue;
    }
    list.append(
      buildSelectDisplayPreference(
        definition.id,
        definition.options,
        preferences[definition.id],
        locale,
      ),
    );
  }
  panel.append(list);
  return panel;
}

function buildBooleanDisplayPreference(
  id: DisplayPreferenceId,
  value: boolean,
  locale: Locale,
): HTMLElement {
  const row = displayPreferenceRow(id, locale);
  const label = document.createElement('label');
  label.className = 'account-preference-switch';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.name = id;
  input.checked = value;
  input.addEventListener('change', () => {
    writeDisplayPreference(id, input.checked as DisplayPreferenceValue<typeof id>);
  });

  const trackEl = document.createElement('span');
  trackEl.className = 'account-preference-switch-track';
  label.append(input, trackEl);
  row.append(label);
  return row;
}

function buildSelectDisplayPreference(
  id: DisplayPreferenceId,
  options: readonly string[],
  value: string,
  locale: Locale,
): HTMLElement {
  const row = displayPreferenceRow(id, locale);
  const select = document.createElement('select');
  select.name = id;
  select.className = 'account-preference-select';
  for (const optionValue of options) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = displayPreferenceOptionLabel(id, optionValue, locale);
    option.selected = optionValue === value;
    select.append(option);
  }
  select.addEventListener('change', () => {
    writeDisplayPreference(id, select.value as DisplayPreferenceValue<typeof id>);
  });
  row.append(select);
  return row;
}

function displayPreferenceRow(id: DisplayPreferenceId, locale: Locale): HTMLElement {
  const row = document.createElement('div');
  row.className = 'account-preference-row';
  const copy = document.createElement('div');
  copy.className = 'account-preference-copy';

  const title = document.createElement('span');
  title.className = 'account-preference-title';
  title.textContent = displayPreferenceLabel(id, locale);
  copy.append(title);

  const helpText = displayPreferenceHelp(id, locale);
  if (helpText) {
    const help = document.createElement('span');
    help.className = 'account-preference-help';
    help.textContent = helpText;
    copy.append(help);
  }

  row.append(copy);
  return row;
}

function buildPrivacySettings(user: AuthUser, locale: Locale = currentLocale()): HTMLElement {
  const panel = buildSettingsPanel(
    'privacy',
    t('account.settingsPrivacy', {}, locale),
    t('account.settingsPrivacyCopy', {}, locale),
  );
  const form = document.createElement('form');
  form.className = 'account-settings-form';
  form.append(buildProfileVisibilityControl(user, locale));
  panel.append(form);
  return panel;
}

function buildMessagingSettings(user: AuthUser, locale: Locale = currentLocale()): HTMLElement {
  const panel = buildSettingsPanel(
    'messaging',
    t('account.settingsMessaging', {}, locale),
    t('account.settingsMessagingCopy', {}, locale),
  );
  const form = document.createElement('form');
  form.className = 'account-settings-form';
  form.append(buildDmPolicyControl(user, locale));
  panel.append(form);
  return panel;
}

function buildAccountAccessSettings(user: AuthUser, locale: Locale = currentLocale()): HTMLElement {
  const panel = buildSettingsPanel(
    'account',
    t('account.settingsAccount', {}, locale),
    t('account.settingsAccountCopy', {}, locale),
  );
  const list = document.createElement('dl');
  list.className = 'account-settings-summary';
  list.append(
    summaryRow(t('account.username', {}, locale), `@${user.handle}`),
    summaryRow(t('account.email', {}, locale), user.email),
  );
  panel.append(list);
  return panel;
}

function buildDeferredSettings(
  section: AccountSettingsSection,
  locale: Locale = currentLocale(),
): HTMLElement {
  const panel = buildSettingsPanel(
    section,
    accountSettingsSectionLabel(section, locale),
    t('account.settingsDeferredCopy', {}, locale),
  );
  const note = document.createElement('p');
  note.className = 'account-settings-deferred';
  note.textContent = t('account.settingsDeferredNote', {}, locale);
  panel.append(note);
  return panel;
}

// DM policy select: saves immediately on change via the preferences PATCH
// (independent of the profile form's save button, like the locale picker).
// Replies in existing threads always deliver; the policy gates new threads.
function buildDmPolicyControl(user: AuthUser, locale: Locale): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'account-field';

  const label = document.createElement('span');
  label.textContent = t('account.dmPolicyLabel', {}, locale);

  const select = document.createElement('select');
  for (const [value, key] of [
    ['always', 'account.dmPolicyAlways'],
    ['friends', 'account.dmPolicyFriends'],
    ['never', 'account.dmPolicyNever'],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t(key, {}, locale);
    option.selected = user.dmPolicy === value;
    select.append(option);
  }

  const help = document.createElement('span');
  help.className = 'account-field-help';
  help.textContent = t('account.dmPolicyHelp', {}, locale);

  select.addEventListener('change', async () => {
    const previous = user.dmPolicy;
    select.disabled = true;
    try {
      const resp = await fetch('/api/account/preferences', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dmPolicy: select.value }),
      });
      if (!resp.ok) throw new Error(`dm policy save failed: ${resp.status}`);
      const data = (await resp.json()) as { user: AuthUser };
      user.dmPolicy = data.user.dmPolicy;
      help.textContent = t('account.dmPolicySaved', {}, locale);
    } catch (err) {
      console.warn(err);
      select.value = previous;
      help.textContent = t('account.saveFailed', {}, locale);
    } finally {
      select.disabled = false;
    }
  });

  wrap.append(label, select, help);
  return wrap;
}

function buildProfileVisibilityControl(user: AuthUser, locale: Locale): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'account-field';

  const label = document.createElement('span');
  label.textContent = t('account.profileVisibilityLabel', {}, locale);

  const select = document.createElement('select');
  select.name = 'profileVisibility';
  for (const value of profileVisibilityOptions) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = profileVisibilityOptionLabel(value, locale);
    option.selected = user.profileVisibility === value;
    select.append(option);
  }

  const help = document.createElement('span');
  help.className = 'account-field-help';
  help.textContent = profileVisibilityHelp(user.profileVisibility, locale);

  select.addEventListener('change', async () => {
    const previous = user.profileVisibility;
    select.disabled = true;
    try {
      const resp = await fetch('/api/account/preferences', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profileVisibility: select.value }),
      });
      if (!resp.ok) throw new Error(`profile visibility save failed: ${resp.status}`);
      const data = (await resp.json()) as { user: AuthUser };
      user.profileVisibility = data.user.profileVisibility;
      help.textContent = t('account.profileVisibilitySaved', {}, locale);
    } catch (err) {
      console.warn(err);
      select.value = previous;
      help.textContent = t('account.saveFailed', {}, locale);
    } finally {
      select.disabled = false;
    }
  });

  wrap.append(label, select, help);
  return wrap;
}

function summaryRow(labelText: string, valueText: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'account-settings-summary-row';
  const dt = document.createElement('dt');
  dt.textContent = labelText;
  const dd = document.createElement('dd');
  dd.textContent = valueText;
  row.append(dt, dd);
  return row;
}

function accountSettingsSectionFromPath(
  pathname = window.location.pathname,
): AccountSettingsSection {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  const raw =
    normalized === '/account/settings'
      ? 'profile'
      : normalized.match(/^\/account\/settings\/([^/]+)$/)?.[1];
  return isAccountSettingsSection(raw) ? raw : 'profile';
}

function isAccountSettingsSection(value: string | undefined): value is AccountSettingsSection {
  return accountSettingsSections.includes(value as AccountSettingsSection);
}

function accountSettingsSectionHref(
  section: AccountSettingsSection,
  locale: Locale = currentLocale(),
): string {
  const path = section === 'profile' ? '/account/settings' : `/account/settings/${section}`;
  return localizedHref(path, locale);
}

function accountSettingsSectionLabel(
  section: AccountSettingsSection,
  locale: Locale = currentLocale(),
): string {
  const keyBySection = {
    profile: 'account.settingsEditProfile',
    display: 'account.settingsDisplay',
    'game-behavior': 'account.settingsGameBehavior',
    privacy: 'account.settingsPrivacy',
    messaging: 'account.settingsMessaging',
    notifications: 'account.settingsNotifications',
    account: 'account.settingsAccount',
    security: 'account.settingsSecurity',
    'close-account': 'account.settingsCloseAccount',
  } as const;
  return t(keyBySection[section], {}, locale);
}

function displayPreferenceLabel(id: DisplayPreferenceId, locale: Locale): string {
  const keyByPreference = {
    pieceAnimation: 'account.displayPieceAnimation',
    materialDifference: 'account.displayMaterialDifference',
    boardHighlights: 'account.displayBoardHighlights',
    pieceDestinations: 'account.displayPieceDestinations',
    boardCoordinates: 'account.displayBoardCoordinates',
    moveListWhilePlaying: 'account.displayMoveListWhilePlaying',
    moveNotation: 'account.displayMoveNotation',
    zenMode: 'account.displayZenMode',
    boardResizeHandle: 'account.displayBoardResizeHandle',
    playerRatings: 'account.displayPlayerRatings',
    playerFlairs: 'account.displayPlayerFlairs',
  } as const;
  return t(keyByPreference[id], {}, locale);
}

function displayPreferenceHelp(id: DisplayPreferenceId, locale: Locale): string {
  if (id === 'playerRatings') return t('account.displayPlayerRatingsHelp', {}, locale);
  return '';
}

function displayPreferenceOptionLabel(
  id: DisplayPreferenceId,
  value: string,
  locale: Locale,
): string {
  const keys = {
    pieceAnimation: {
      none: 'account.displayOption.pieceAnimation.none',
      fast: 'account.displayOption.pieceAnimation.fast',
      normal: 'account.displayOption.pieceAnimation.normal',
      slow: 'account.displayOption.pieceAnimation.slow',
    },
    boardCoordinates: {
      inside: 'account.displayOption.boardCoordinates.inside',
      outside: 'account.displayOption.boardCoordinates.outside',
      none: 'account.displayOption.boardCoordinates.none',
    },
    moveNotation: {
      symbols: 'account.displayOption.moveNotation.symbols',
      letters: 'account.displayOption.moveNotation.letters',
      coordinates: 'account.displayOption.moveNotation.coordinates',
    },
  } as const;
  if (id !== 'pieceAnimation' && id !== 'boardCoordinates' && id !== 'moveNotation') {
    return value;
  }
  const key = keys[id][value as keyof (typeof keys)[typeof id]];
  return key ? t(key, {}, locale) : value;
}

function profileVisibilityOptionLabel(
  visibility: AuthUser['profileVisibility'],
  locale: Locale,
): string {
  if (visibility === 'public') return t('account.profileVisibilityPublic', {}, locale);
  if (visibility === 'unlisted') return t('account.profileVisibilityUnlisted', {}, locale);
  return t('account.profileVisibilityPrivate', {}, locale);
}

function profileVisibilityHelp(visibility: AuthUser['profileVisibility'], locale: Locale): string {
  if (visibility === 'public') return t('account.profileVisibilityPublicHelp', {}, locale);
  if (visibility === 'unlisted') return t('account.profileVisibilityUnlistedHelp', {}, locale);
  return t('account.profileVisibilityPrivateHelp', {}, locale);
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
  locale: Locale = currentLocale(),
): string {
  if (error === 'invalid_handle') return t('account.invalidHandle', {}, locale);
  if (error === 'handle_taken') return t('account.handleTaken', {}, locale);
  if (error === 'handle_change_cooldown') {
    const date = availableAt ? new Date(availableAt) : null;
    return date && Number.isFinite(date.getTime())
      ? t('account.handleCooldownDate', { date: formatAccountDate(date, locale) }, locale)
      : t('account.handleCooldownUnknown', {}, locale);
  }
  if (error === 'not_signed_in') return t('account.notSignedInEdit', {}, locale);
  return t('account.saveFailed', {}, locale);
}

function handleHelpText(user: AuthUser, locale: Locale = currentLocale()): string {
  if (!user.handleChangedAt) {
    return t('account.handleHelpFirst', {}, locale);
  }
  const nextChangeAt = new Date(
    new Date(user.handleChangedAt).getTime() + 30 * 24 * 60 * 60 * 1000,
  );
  if (!Number.isFinite(nextChangeAt.getTime())) {
    return t('account.handleHelpLater', {}, locale);
  }
  return t('account.handleHelpNext', { date: formatAccountDate(nextChangeAt, locale) }, locale);
}

function formatAccountDate(date: Date, locale: Locale): string {
  return date.toLocaleDateString(LOCALE_META[locale].dateLocale);
}

// ── Login / register form ────────────────────────────────────────────────────

function buildAccountAuthTabs(
  active: 'login' | 'register',
  locale: Locale = currentLocale(),
): HTMLElement {
  const tabs = document.createElement('div');
  tabs.className = 'account-auth-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', t('account.access', {}, locale));

  const signIn = buildAccountAuthTab(
    t('nav.signIn', {}, locale),
    localizedHref('/account?tab=login', locale),
    active === 'login',
  );
  const register = buildAccountAuthTab(
    t('nav.register', {}, locale),
    localizedHref('/account?tab=register', locale),
    active === 'register',
  );

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

function buildLoginForm(
  tab: 'login' | 'register' = 'login',
  onAuth: (user: AuthUser) => void = () => undefined,
  locale: Locale = currentLocale(),
  options: { redirectOnSuccess: boolean } = { redirectOnSuccess: true },
): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'account-panel account-auth-panel';

  panel.append(buildAccountAuthTabs(tab, locale));

  const eyebrow = document.createElement('span');
  eyebrow.className = 'account-eyebrow';
  eyebrow.textContent = t('account.account', {}, locale);

  const title = document.createElement('h1');
  title.className = 'site-section-heading';
  title.textContent =
    tab === 'register' ? t('account.createAccountTitle', {}, locale) : t('nav.signIn', {}, locale);

  const copy = document.createElement('p');
  copy.className = 'account-copy';
  copy.textContent =
    tab === 'register' ? t('account.registerCopy', {}, locale) : t('account.loginCopy', {}, locale);

  const form = document.createElement('form');
  form.className = 'account-form';

  const email = document.createElement('input');
  email.type = 'email';
  email.name = 'email';
  email.autocomplete = 'email';
  email.placeholder = t('account.emailAddress', {}, locale);
  email.required = true;

  const code = document.createElement('input');
  code.type = 'text';
  code.name = 'code';
  code.inputMode = 'numeric';
  code.autocomplete = 'one-time-code';
  code.placeholder = t('account.loginCode', {}, locale);
  code.hidden = true;

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'landing-setup-start';
  submit.textContent = t('account.sendCode', {}, locale);

  const status = document.createElement('p');
  status.className = 'account-status';
  status.setAttribute('aria-live', 'polite');

  let loginId: string | null = null;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      if (!loginId) {
        const { data, resp } = await fetchAuthJson<{
          loginId?: string;
          devCode?: string;
          error?: string;
        }>('/api/auth/email/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: email.value }),
        });
        if (!resp.ok || !data.loginId)
          throw new Error(data.error ?? `start failed: ${resp.status}`);
        loginId = data.loginId;
        code.hidden = false;
        code.required = true;
        if (data.devCode) code.value = data.devCode;
        submit.textContent = t('account.confirm', {}, locale);
        status.textContent = data.devCode
          ? t('account.devCodeFilled', {}, locale)
          : t('account.checkEmail', {}, locale);
        code.focus();
      } else {
        const { data, resp } = await fetchAuthJson<{
          user?: AuthUser;
          isNewUser?: boolean;
          error?: string;
        }>('/api/auth/email/confirm', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ loginId, code: code.value }),
        });
        if (!resp.ok || !data.user) throw new Error(data.error ?? `confirm failed: ${resp.status}`);
        // Identify immediately; the shared account-nav cache is updated below,
        // so there may be no full page reload before the next pageview.
        identify(data.user.id, {
          handle: data.user.handle,
          account_role: data.user.accountRole,
          email_verified: data.user.emailVerified,
        });
        if (data.isNewUser) track('signup_completed');
        setAccountNavUser(data.user);
        if (options.redirectOnSuccess) {
          window.location.href = requestedAuthReferrer() ?? localizedHref('/', locale);
          return;
        }
        onAuth(data.user);
      }
    } catch (err) {
      status.textContent =
        err instanceof Error
          ? authErrorMessage(err.message, locale)
          : t('account.signInFailed', {}, locale);
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
    termsLink.href = localizedHref('/terms', locale);
    termsLink.textContent = t('footer.terms', {}, locale);
    const privacyLink = document.createElement('a');
    privacyLink.href = localizedHref('/privacy', locale);
    privacyLink.textContent = t('footer.privacy', {}, locale);
    legal.append(
      t('account.legalPrefix', {}, locale),
      termsLink,
      t('account.legalAnd', {}, locale),
      privacyLink,
      t('account.legalSuffix', {}, locale),
    );
    form.append(legal);
  }

  panel.append(eyebrow, title, copy, form);
  return panel;
}

async function fetchAuthJson<T>(
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<{ data: T; resp: Response }> {
  let resp: Response;
  try {
    resp = await fetch(input, init);
  } catch {
    throw new Error('auth_request_failed');
  }
  try {
    return { data: (await resp.json()) as T, resp };
  } catch {
    throw new Error(resp.ok ? 'auth_bad_response' : `auth_http_${resp.status}`);
  }
}

function authErrorMessage(value: string, locale: Locale = currentLocale()): string {
  if (value === 'auth_request_failed') return t('account.authRequestFailed', {}, locale);
  if (value === 'auth_bad_response') return t('account.authBadResponse', {}, locale);
  if (value.startsWith('auth_http_')) return t('account.authHttpFailed', {}, locale);
  if (value === 'email_delivery_not_configured') return t('account.emailNotConfigured', {}, locale);
  if (value === 'email_delivery_failed') return t('account.emailDeliveryFailed', {}, locale);
  if (value === 'persistence_disabled') return t('account.persistenceDisabled', {}, locale);
  if (value === 'invalid_login_code') return t('account.invalidLoginCode', {}, locale);
  if (value === 'invalid_email') return t('account.invalidEmail', {}, locale);
  return t('account.signInFailed', {}, locale);
}

// ── Misc ─────────────────────────────────────────────────────────────────────

export function currentAccountTab(): 'login' | 'register' {
  const params = new URLSearchParams(window.location.search);
  return params.get('tab') === 'register' ? 'register' : 'login';
}
