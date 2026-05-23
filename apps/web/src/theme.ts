type BoardTheme = 'standard' | 'contrast' | 'colorblind' | 'blue' | 'green' | 'mono';
type FogTheme = 'hatched' | 'solid' | 'soft' | 'drift' | 'mistveil' | 'void' | 'invisible';
type PieceSet = 'cburnett' | 'merida' | 'chessnut' | 'fantasy' | 'letter';

const boardStorageKey = 'mistboard.boardTheme';
const fogStorageKey = 'mistboard.fogTheme';
const pieceSetStorageKey = 'mistboard.pieceSet';
const soundVolumeStorageKey = 'mistboard.soundVolume';
const soundMutedStorageKey = 'mistboard.soundMuted';
export const soundSettingsChangedEvent = 'mistboard:sound-settings-changed';
const defaultTheme: BoardTheme = 'green';
const defaultFogTheme: FogTheme = 'solid';
const defaultPieceSet: PieceSet = 'cburnett';
const defaultSoundVolume = 0.7;
let cachedSoundVolume = defaultSoundVolume;
let cachedSoundMuted = false;
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
  { id: 'soft', label: 'Soft' },
  { id: 'hatched', label: 'Hatched' },
  { id: 'drift', label: 'Drift' },
  { id: 'mistveil', label: 'Mistveil' },
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

export function initializeThemeSettings(): void {
  applyBoardTheme(readStoredTheme());
  applyFogTheme(readStoredFogTheme());
  applyPieceSet(readStoredPieceSet());
  mountThemeControls();
  watchForNavChanges();
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
  document
    .querySelectorAll<HTMLElement>('body > [data-theme-control]')
    .forEach((control) => control.remove());
  document.querySelectorAll<HTMLElement>('.site-nav').forEach((nav) => mountThemeControl(nav));
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

  panel.append(boardField, fogField, pieceField, volumeField, muteField);
  control.append(trigger, panel);
  target.prepend(control);
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
  const boardTheme = readStoredTheme();
  const fogTheme = readStoredFogTheme();
  const pieceSet = readStoredPieceSet();
  const soundMuted = readStoredSoundMuted();
  const effectiveVolume = readEffectiveSoundVolume();
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

function syncTileRow(kind: 'board' | 'fog' | 'piece', activeId: string): void {
  document
    .querySelectorAll<HTMLButtonElement>(`button[data-theme-tile="${kind}"]`)
    .forEach((tile) => {
      const isActive = tile.dataset.id === activeId;
      tile.setAttribute('aria-checked', String(isActive));
      tile.classList.toggle('selected', isActive);
    });
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

function normalizeTheme(value: string | null): BoardTheme {
  return themes.some((theme) => theme.id === value) ? (value as BoardTheme) : defaultTheme;
}

function normalizeFogTheme(value: string | null): FogTheme {
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
