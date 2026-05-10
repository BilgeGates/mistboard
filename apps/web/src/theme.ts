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
let navObserver: MutationObserver | null = null;

export function initializeThemeSettings(): void {
  applyBoardTheme(readStoredTheme());
  applyFogTheme(readStoredFogTheme());
  mountThemeControls();
  watchForNavChanges();
}

function applyBoardTheme(theme: BoardTheme): void {
  document.documentElement.dataset.boardTheme = theme;
}

function applyFogTheme(theme: FogTheme): void {
  document.documentElement.dataset.fogTheme = theme;
}

function mountThemeControls(): void {
  document.querySelectorAll<HTMLElement>('body > [data-theme-control]').forEach((control) => control.remove());
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
  const links = nav.querySelector<HTMLElement>('.site-nav-links');
  if (!links) return;
  if (links.querySelector('[data-theme-control]')) return;

  const control = document.createElement('div');
  control.className = 'theme-control';
  control.dataset.themeControl = '';
  control.setAttribute('aria-label', 'Display settings');

  const trigger = document.createElement('button');
  trigger.className = 'theme-control-trigger';
  trigger.type = 'button';
  trigger.setAttribute('aria-expanded', 'false');
  trigger.textContent = 'Display';

  const panel = document.createElement('div');
  panel.className = 'theme-control-panel';
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Board display settings');

  const boardField = createSelectField('board', 'Board colors', 'Board color scheme', themes, readStoredTheme(), (value) => {
    const nextTheme = normalizeTheme(value);
    applyBoardTheme(nextTheme);
    writeStoredTheme(nextTheme);
    syncThemeControls();
  });
  const fogField = createSelectField('fog', 'Fog', 'Fog shading style', fogThemes, readStoredFogTheme(), (value) => {
    const nextTheme = normalizeFogTheme(value);
    applyFogTheme(nextTheme);
    writeStoredFogTheme(nextTheme);
    syncThemeControls();
  });

  trigger.addEventListener('click', () => {
    const expanded = trigger.getAttribute('aria-expanded') === 'true';
    closeThemeMenus();
    if (!expanded) openThemeMenu(control);
  });

  panel.append(boardField, fogField);
  control.append(trigger, panel);
  links.append(control);
}

function createSelectField<T extends string>(
  kind: 'board' | 'fog',
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
  select.dataset.themeSelect = kind;
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

function openThemeMenu(control: HTMLElement): void {
  control.classList.add('open');
  control.querySelector<HTMLButtonElement>('.theme-control-trigger')?.setAttribute('aria-expanded', 'true');
}

function closeThemeMenus(): void {
  document.querySelectorAll<HTMLElement>('[data-theme-control]').forEach((control) => {
    control.classList.remove('open');
    control.querySelector<HTMLButtonElement>('.theme-control-trigger')?.setAttribute('aria-expanded', 'false');
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
  document.querySelectorAll<HTMLSelectElement>('select[data-theme-select="board"]').forEach((select) => {
    select.value = boardTheme;
  });
  document.querySelectorAll<HTMLSelectElement>('select[data-theme-select="fog"]').forEach((select) => {
    select.value = fogTheme;
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

function normalizeTheme(value: string | null): BoardTheme {
  return themes.some((theme) => theme.id === value) ? (value as BoardTheme) : defaultTheme;
}

function normalizeFogTheme(value: string | null): FogTheme {
  return fogThemes.some((theme) => theme.id === value) ? (value as FogTheme) : defaultFogTheme;
}
