import './theme.css';

type BoardTheme = 'standard' | 'contrast' | 'colorblind' | 'blue' | 'green' | 'mono';
type FogTheme = 'veil' | 'solid' | 'drift' | 'mistveil' | 'void' | 'invisible';
type PieceSet = 'cburnett' | 'merida' | 'chessnut' | 'fantasy' | 'letter';
export type SiteTheme = 'system' | 'light' | 'dark';

const siteThemeStorageKey = 'mistboard.siteTheme';
const boardStorageKey = 'mistboard.boardTheme';
const fogStorageKey = 'mistboard.fogTheme';
const pieceSetStorageKey = 'mistboard.pieceSet';
const soundVolumeStorageKey = 'mistboard.soundVolume';
const soundMutedStorageKey = 'mistboard.soundMuted';
export const soundSettingsChangedEvent = 'mistboard:sound-settings-changed';
export const siteThemeChangedEvent = 'mistboard:site-theme-changed';
const defaultSiteTheme: SiteTheme = 'system';
const defaultTheme: BoardTheme = 'green';
const defaultFogTheme: FogTheme = 'solid';
const defaultPieceSet: PieceSet = 'cburnett';
const defaultSoundVolume = 0.7;
let cachedSoundVolume = defaultSoundVolume;
let cachedSoundMuted = false;
export const siteThemeOptions: Array<{ id: SiteTheme; label: string }> = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];
const themes: Array<{ id: BoardTheme; label: string }> = [
  { id: 'green', label: 'Tournament' },
  { id: 'standard', label: 'Classic' },
  { id: 'blue', label: 'Blue' },
  { id: 'mono', label: 'Monochrome' },
  { id: 'contrast', label: 'High contrast' },
  { id: 'colorblind', label: 'Colorblind' },
];
const fogThemes: Array<{ id: FogTheme; label: string }> = [
  { id: 'solid', label: 'Solid' },
  { id: 'veil', label: 'Veil' },
  { id: 'mistveil', label: 'Mistveil' },
  { id: 'drift', label: 'Puff' },
  { id: 'void', label: 'Void' },
  { id: 'invisible', label: 'None' },
];
const pieceSets: Array<{ id: PieceSet; label: string }> = [
  { id: 'cburnett', label: 'Cburnett' },
  { id: 'merida', label: 'Merida' },
  { id: 'chessnut', label: 'Chessnut' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'letter', label: 'Letter' },
];
let navObserver: MutationObserver | null = null;
let systemThemeWatcherBound = false;

export function initializeThemeSettings(): void {
  applySiteTheme(readStoredSiteTheme());
  applyBoardTheme(readStoredTheme());
  applyFogTheme(readStoredFogTheme());
  applyPieceSet(readStoredPieceSet());
  watchForSystemThemeChanges();
  mountThemeControls();
  watchForNavChanges();
}

function applySiteTheme(theme: SiteTheme): void {
  const resolved = resolveSiteTheme(theme);
  document.documentElement.dataset.siteTheme = theme;
  document.documentElement.dataset.effectiveTheme = resolved;
  document.documentElement.style.colorScheme = resolved;
  updateThemeColorMeta(resolved);
}

function applyBoardTheme(theme: BoardTheme): void {
  document.documentElement.dataset.boardTheme = theme;
}

function applyFogTheme(theme: FogTheme): void {
  document.documentElement.dataset.fogTheme = theme;
}

function applyPieceSet(pieceSet: PieceSet): void {
  document.documentElement.dataset.pieceSet = pieceSet;
}

function mountThemeControls(): void {
  for (const control of document.querySelectorAll<HTMLElement>('body > [data-theme-control]')) {
    control.remove();
  }
  for (const nav of document.querySelectorAll<HTMLElement>('.site-nav')) {
    mountThemeControl(nav);
  }
}

function watchForNavChanges(): void {
  if (navObserver) return;
  navObserver = new MutationObserver(() => mountThemeControls());
  navObserver.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', closeThemeMenusOnOutsideClick);
  document.addEventListener('keydown', closeThemeMenusOnEscape);
}

function mountThemeControl(nav: HTMLElement): void {
  const target =
    nav.querySelector<HTMLElement>('.site-nav-utilities') ??
    nav.querySelector<HTMLElement>('.site-nav-links');
  if (!target) return;
  if (target.querySelector('[data-theme-control]')) return;

  const control = document.createElement('div');
  control.className = 'theme-control';
  control.dataset.themeControl = '';
  control.setAttribute('aria-label', 'Display and sound settings');

  const trigger = document.createElement('button');
  trigger.className = 'theme-control-trigger';
  trigger.type = 'button';
  trigger.setAttribute('aria-expanded', 'false');
  trigger.textContent = 'Settings';

  const panel = document.createElement('div');
  panel.className = 'theme-control-panel';
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Display and sound settings');

  const siteThemeField = createSiteThemeField();
  const boardField = createTileField(
    'board',
    'Board colors',
    'Board color scheme',
    themes,
    readStoredTheme(),
    (value) => {
      applyBoardTheme(value);
      writeStoredTheme(value);
      syncThemeControls();
    },
  );
  const fogField = createTileField(
    'fog',
    'Fog',
    'Fog shading style',
    fogThemes,
    readStoredFogTheme(),
    (value) => {
      applyFogTheme(value);
      writeStoredFogTheme(value);
      syncThemeControls();
    },
  );
  const pieceField = createTileField(
    'piece',
    'Pieces',
    'Piece set',
    pieceSets,
    readStoredPieceSet(),
    (value) => {
      applyPieceSet(value);
      writeStoredPieceSet(value);
      syncThemeControls();
    },
  );
  const volumeField = createVolumeField();
  const muteField = createMuteField();

  trigger.addEventListener('click', () => {
    const expanded = trigger.getAttribute('aria-expanded') === 'true';
    closeThemeMenus();
    if (!expanded) openThemeMenu(control);
  });

  panel.append(siteThemeField, boardField, fogField, pieceField, volumeField, muteField);
  control.append(trigger, panel);
  target.prepend(control);
}

function createSiteThemeField(): HTMLDivElement {
  const field = document.createElement('div');
  field.className = 'theme-control-field';
  const text = document.createElement('span');
  text.textContent = 'Appearance';

  const row = document.createElement('div');
  row.className = 'theme-mode-row';
  row.setAttribute('role', 'radiogroup');
  row.setAttribute('aria-label', 'Site appearance');

  for (const option of siteThemeOptions) {
    const button = createSiteThemeButton(option.id, option.label);
    row.append(button);
  }

  field.append(text, row);
  return field;
}

export function createSiteThemeButton(theme: SiteTheme, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'theme-mode-option';
  button.dataset.siteThemeOption = theme;
  button.setAttribute('role', 'radio');
  button.setAttribute('aria-checked', String(readStoredSiteTheme() === theme));
  button.textContent = label;
  if (readStoredSiteTheme() === theme) button.classList.add('selected');
  button.addEventListener('click', () => setSiteThemePreference(theme));
  return button;
}

function createTileField<T extends string>(
  kind: 'board' | 'fog' | 'piece',
  label: string,
  ariaLabel: string,
  options: Array<{ id: T; label: string }>,
  value: T,
  onChange: (value: T) => void,
): HTMLDivElement {
  const field = document.createElement('div');
  field.className = 'theme-control-field';
  const text = document.createElement('span');
  text.textContent = label;

  const row = document.createElement('div');
  row.className = 'theme-tile-row';
  row.dataset.themeTileRow = kind;
  row.setAttribute('role', 'radiogroup');
  row.setAttribute('aria-label', ariaLabel);

  for (const option of options) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'theme-tile';
    tile.dataset.themeTile = kind;
    tile.dataset.id = option.id;
    tile.setAttribute('role', 'radio');
    tile.setAttribute('aria-checked', String(option.id === value));
    tile.setAttribute('aria-label', option.label);
    tile.title = option.label;
    if (option.id === value) tile.classList.add('selected');

    const preview = document.createElement('span');
    preview.className = `theme-tile-preview theme-tile-preview-${kind}`;
    preview.dataset.id = option.id;
    tile.append(preview);

    tile.addEventListener('click', () => onChange(option.id));
    row.append(tile);
  }

  field.append(text, row);
  return field;
}

function createVolumeField(): HTMLLabelElement {
  const field = document.createElement('label');
  field.className = 'theme-control-field theme-control-volume-field';
  const row = document.createElement('span');
  row.className = 'theme-control-field-row';
  const label = document.createElement('span');
  label.textContent = 'Volume';
  const value = document.createElement('output');
  value.dataset.soundVolumeValue = '';
  value.textContent = readStoredSoundMuted() ? 'Muted' : formatVolume(readEffectiveSoundVolume());
  row.append(label, value);

  if (readStoredSoundMuted()) field.classList.add('muted');

  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '100';
  input.step = '5';
  input.value = String(Math.round(readEffectiveSoundVolume() * 100));
  input.dataset.soundVolume = '';
  input.setAttribute('aria-label', 'Sound volume');
  input.addEventListener('input', () => {
    const nextVolume = normalizeVolume(Number(input.value) / 100);
    writeStoredSoundVolume(nextVolume);
    if (nextVolume > 0 && readStoredSoundMuted()) {
      writeStoredSoundMuted(false);
    }
    dispatchSoundSettingsChanged();
    syncThemeControls();
  });

  field.append(row, input);
  return field;
}

function createMuteField(): HTMLLabelElement {
  const field = document.createElement('label');
  field.className = 'theme-control-check-field';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.dataset.soundMuted = '';
  input.checked = readStoredSoundMuted();
  input.addEventListener('change', () => {
    writeStoredSoundMuted(input.checked);
    dispatchSoundSettingsChanged();
    syncThemeControls();
  });

  const text = document.createElement('span');
  text.textContent = 'Mute sounds';

  field.append(input, text);
  return field;
}

function openThemeMenu(control: HTMLElement): void {
  control.classList.add('open');
  control
    .querySelector<HTMLButtonElement>('.theme-control-trigger')
    ?.setAttribute('aria-expanded', 'true');
}

function closeThemeMenus(): void {
  document.querySelectorAll<HTMLElement>('[data-theme-control]').forEach((control) => {
    control.classList.remove('open');
    control
      .querySelector<HTMLButtonElement>('.theme-control-trigger')
      ?.setAttribute('aria-expanded', 'false');
  });
}

function closeThemeMenusOnOutsideClick(event: MouseEvent): void {
  const target = event.target;
  if (target instanceof Element && target.closest('[data-theme-control]')) return;
  closeThemeMenus();
}

function closeThemeMenusOnEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  closeThemeMenus();
}

function syncThemeControls(): void {
  const siteTheme = readStoredSiteTheme();
  const boardTheme = readStoredTheme();
  const fogTheme = readStoredFogTheme();
  const pieceSet = readStoredPieceSet();
  const soundMuted = readStoredSoundMuted();
  const effectiveVolume = readEffectiveSoundVolume();
  syncSiteThemeControls(siteTheme);
  syncTileRow('board', boardTheme);
  syncTileRow('fog', fogTheme);
  syncTileRow('piece', pieceSet);
  document.querySelectorAll<HTMLInputElement>('input[data-sound-volume]').forEach((input) => {
    input.value = String(Math.round(effectiveVolume * 100));
  });
  document
    .querySelectorAll<HTMLOutputElement>('output[data-sound-volume-value]')
    .forEach((output) => {
      output.textContent = soundMuted ? 'Muted' : formatVolume(effectiveVolume);
    });
  document.querySelectorAll<HTMLInputElement>('input[data-sound-muted]').forEach((input) => {
    input.checked = soundMuted;
  });
  document.querySelectorAll<HTMLElement>('.theme-control-volume-field').forEach((field) => {
    field.classList.toggle('muted', soundMuted);
  });
}

function syncSiteThemeControls(activeTheme: SiteTheme): void {
  document
    .querySelectorAll<HTMLButtonElement>('button[data-site-theme-option]')
    .forEach((button) => {
      const isActive = button.dataset.siteThemeOption === activeTheme;
      button.setAttribute('aria-checked', String(isActive));
      button.classList.toggle('selected', isActive);
    });
}

function syncTileRow(kind: 'board' | 'fog' | 'piece', activeId: string): void {
  document
    .querySelectorAll<HTMLButtonElement>(`button[data-theme-tile="${kind}"]`)
    .forEach((tile) => {
      const isActive = tile.dataset.id === activeId;
      tile.setAttribute('aria-checked', String(isActive));
      tile.classList.toggle('selected', isActive);
    });
}

export function setSiteThemePreference(theme: SiteTheme): void {
  const normalized = normalizeSiteTheme(theme);
  applySiteTheme(normalized);
  writeStoredSiteTheme(normalized);
  syncThemeControls();
  window.dispatchEvent(new Event(siteThemeChangedEvent));
}

export function readStoredSiteTheme(): SiteTheme {
  try {
    return normalizeSiteTheme(window.localStorage.getItem(siteThemeStorageKey));
  } catch {
    return defaultSiteTheme;
  }
}

function writeStoredSiteTheme(theme: SiteTheme): void {
  try {
    window.localStorage.setItem(siteThemeStorageKey, theme);
  } catch {
    // The data attribute still updates for the current page.
  }
}

function readStoredTheme(): BoardTheme {
  try {
    return normalizeTheme(window.localStorage.getItem(boardStorageKey));
  } catch {
    return defaultTheme;
  }
}

function writeStoredTheme(theme: BoardTheme): void {
  try {
    window.localStorage.setItem(boardStorageKey, theme);
  } catch {
    // The data attribute still updates for the current page.
  }
}

function readStoredFogTheme(): FogTheme {
  try {
    return normalizeFogTheme(window.localStorage.getItem(fogStorageKey));
  } catch {
    return defaultFogTheme;
  }
}

function writeStoredFogTheme(theme: FogTheme): void {
  try {
    window.localStorage.setItem(fogStorageKey, theme);
  } catch {
    // The data attribute still updates for the current page.
  }
}

function readStoredPieceSet(): PieceSet {
  try {
    return normalizePieceSet(window.localStorage.getItem(pieceSetStorageKey));
  } catch {
    return defaultPieceSet;
  }
}

function writeStoredPieceSet(pieceSet: PieceSet): void {
  try {
    window.localStorage.setItem(pieceSetStorageKey, pieceSet);
  } catch {
    // The data attribute still updates for the current page.
  }
}

export function readEffectiveSoundVolume(): number {
  return readStoredSoundMuted() ? 0 : readStoredSoundVolume();
}

function readStoredSoundVolume(): number {
  try {
    cachedSoundVolume = normalizeVolume(window.localStorage.getItem(soundVolumeStorageKey));
    return cachedSoundVolume;
  } catch {
    return cachedSoundVolume;
  }
}

function writeStoredSoundVolume(volume: number): void {
  cachedSoundVolume = normalizeVolume(volume);
  try {
    window.localStorage.setItem(soundVolumeStorageKey, String(cachedSoundVolume));
  } catch {
    // Sound settings still update for the current page.
  }
}

function readStoredSoundMuted(): boolean {
  try {
    cachedSoundMuted = window.localStorage.getItem(soundMutedStorageKey) === 'true';
    return cachedSoundMuted;
  } catch {
    return cachedSoundMuted;
  }
}

function writeStoredSoundMuted(muted: boolean): void {
  cachedSoundMuted = muted;
  try {
    window.localStorage.setItem(soundMutedStorageKey, muted ? 'true' : 'false');
  } catch {
    // Sound settings still update for the current page.
  }
}

function dispatchSoundSettingsChanged(): void {
  window.dispatchEvent(new Event(soundSettingsChangedEvent));
}

function watchForSystemThemeChanges(): void {
  if (systemThemeWatcherBound || !window.matchMedia) return;
  systemThemeWatcherBound = true;
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  query.addEventListener('change', () => {
    if (readStoredSiteTheme() !== 'system') return;
    applySiteTheme('system');
    syncThemeControls();
    window.dispatchEvent(new Event(siteThemeChangedEvent));
  });
}

function resolveSiteTheme(theme: SiteTheme): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') return theme;
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function updateThemeColorMeta(theme: 'light' | 'dark'): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  meta.content = theme === 'dark' ? '#101512' : '#f4f1ea';
}

function normalizeSiteTheme(value: string | null): SiteTheme {
  return siteThemeOptions.some((theme) => theme.id === value)
    ? (value as SiteTheme)
    : defaultSiteTheme;
}

function normalizeTheme(value: string | null): BoardTheme {
  return themes.some((theme) => theme.id === value) ? (value as BoardTheme) : defaultTheme;
}

function normalizeFogTheme(value: string | null): FogTheme {
  if (value === 'soft' || value === 'hatched') return 'solid';
  return fogThemes.some((theme) => theme.id === value) ? (value as FogTheme) : defaultFogTheme;
}

function normalizePieceSet(value: string | null): PieceSet {
  return pieceSets.some((set) => set.id === value) ? (value as PieceSet) : defaultPieceSet;
}

function normalizeVolume(value: string | number | null): number {
  if (value === null) return defaultSoundVolume;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return defaultSoundVolume;
  return Math.min(1, Math.max(0, parsed));
}

function formatVolume(volume: number): string {
  return `${Math.round(normalizeVolume(volume) * 100)}%`;
}
