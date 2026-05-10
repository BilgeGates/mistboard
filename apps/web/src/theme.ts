type BoardTheme = 'standard' | 'contrast' | 'colorblind';
type FogTheme = 'hatched' | 'solid' | 'soft';

const boardStorageKey = 'mistboard.boardTheme';
const fogStorageKey = 'mistboard.fogTheme';
const defaultTheme: BoardTheme = 'standard';
const defaultFogTheme: FogTheme = 'hatched';
const themes: Array<{ id: BoardTheme; label: string }> = [
  { id: 'standard', label: 'Standard' },
  { id: 'contrast', label: 'High contrast' },
  { id: 'colorblind', label: 'Colorblind' },
];
const fogThemes: Array<{ id: FogTheme; label: string }> = [
  { id: 'hatched', label: 'Hatched' },
  { id: 'solid', label: 'Solid' },
  { id: 'soft', label: 'Soft' },
];

export function initializeThemeSettings(): void {
  applyBoardTheme(readStoredTheme());
  applyFogTheme(readStoredFogTheme());
  mountThemeControl();
}

function applyBoardTheme(theme: BoardTheme): void {
  document.documentElement.dataset.boardTheme = theme;
}

function applyFogTheme(theme: FogTheme): void {
  document.documentElement.dataset.fogTheme = theme;
}

function mountThemeControl(): void {
  document.querySelector('[data-theme-control]')?.remove();

  const control = document.createElement('div');
  control.className = 'theme-control';
  control.dataset.themeControl = '';
  control.setAttribute('role', 'group');
  control.setAttribute('aria-label', 'Board display settings');

  const boardField = createSelectField('Board colors', 'Board color scheme', themes, readStoredTheme(), (value) => {
    const nextTheme = normalizeTheme(value);
    applyBoardTheme(nextTheme);
    writeStoredTheme(nextTheme);
  });
  const fogField = createSelectField('Fog', 'Fog shading style', fogThemes, readStoredFogTheme(), (value) => {
    const nextTheme = normalizeFogTheme(value);
    applyFogTheme(nextTheme);
    writeStoredFogTheme(nextTheme);
  });

  control.append(boardField, fogField);
  document.body.append(control);
}

function createSelectField<T extends string>(
  label: string,
  ariaLabel: string,
  options: Array<{ id: T; label: string }>,
  value: T,
  onChange: (value: string) => void,
): HTMLLabelElement {
  const field = document.createElement('label');
  field.className = 'theme-control-field';
  const text = document.createElement('span');
  text.textContent = label;

  const select = document.createElement('select');
  select.setAttribute('aria-label', ariaLabel);
  for (const theme of options) {
    const option = document.createElement('option');
    option.value = theme.id;
    option.textContent = theme.label;
    select.append(option);
  }
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));

  field.append(text, select);
  return field;
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

function normalizeTheme(value: string | null): BoardTheme {
  return themes.some((theme) => theme.id === value) ? (value as BoardTheme) : defaultTheme;
}

function normalizeFogTheme(value: string | null): FogTheme {
  return fogThemes.some((theme) => theme.id === value) ? (value as FogTheme) : defaultFogTheme;
}
