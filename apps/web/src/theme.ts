type BoardTheme = 'standard' | 'contrast' | 'colorblind';

const storageKey = 'mistboard.boardTheme';
const defaultTheme: BoardTheme = 'standard';
const themes: Array<{ id: BoardTheme; label: string }> = [
  { id: 'standard', label: 'Standard' },
  { id: 'contrast', label: 'High contrast' },
  { id: 'colorblind', label: 'Colorblind' },
];

export function initializeThemeSettings(): void {
  applyBoardTheme(readStoredTheme());
  mountThemeControl();
}

function applyBoardTheme(theme: BoardTheme): void {
  document.documentElement.dataset.boardTheme = theme;
}

function mountThemeControl(): void {
  document.querySelector('[data-theme-control]')?.remove();

  const control = document.createElement('label');
  control.className = 'theme-control';
  control.dataset.themeControl = '';

  const text = document.createElement('span');
  text.textContent = 'Board colors';

  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Board color scheme');
  for (const theme of themes) {
    const option = document.createElement('option');
    option.value = theme.id;
    option.textContent = theme.label;
    select.append(option);
  }
  select.value = readStoredTheme();
  select.addEventListener('change', () => {
    const nextTheme = normalizeTheme(select.value);
    applyBoardTheme(nextTheme);
    writeStoredTheme(nextTheme);
  });

  control.append(text, select);
  document.body.append(control);
}

function readStoredTheme(): BoardTheme {
  try {
    return normalizeTheme(window.localStorage.getItem(storageKey));
  } catch {
    return defaultTheme;
  }
}

function writeStoredTheme(theme: BoardTheme): void {
  try {
    window.localStorage.setItem(storageKey, theme);
  } catch {
    // The data attribute still updates for the current page.
  }
}

function normalizeTheme(value: string | null): BoardTheme {
  return themes.some((theme) => theme.id === value) ? (value as BoardTheme) : defaultTheme;
}
