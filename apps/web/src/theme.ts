import './theme.css';
import type { GameFamilyId } from '@mistboard/game';
import { isLikelySignedIn } from './account-nav.js';
import { darkMiniXiangqiEnabled, darkXiangqiEnabled } from './feature-flags.js';
import {
  DEFAULT_XIANGQI_PIECE_SET,
  XIANGQI_PIECE_SETS,
  type XiangqiPieceSet,
  xiangqiPreviewGlyph,
} from './xiangqi-piece-sets.js';

type BoardTheme = 'standard' | 'contrast' | 'colorblind' | 'blue' | 'green' | 'mono';
type FogTheme = 'veil' | 'solid' | 'drift' | 'mistveil' | 'void' | 'invisible';
type PieceSet = 'cburnett' | 'merida' | 'chessnut' | 'fantasy' | 'letter';
type XiangqiBoardTheme = 'tournament' | 'blue' | 'mono';
export type SiteTheme = 'system' | 'light' | 'dark';
// The appearance "family" is the GameSpec family (chess-family games share board
// themes + piece sets; likewise for xiangqi). Driven by gameSpecForId(id).family.
export type BoardFamily = GameFamilyId;

const siteThemeStorageKey = 'mistboard.siteTheme';
const boardStorageKey = 'mistboard.boardTheme';
const fogStorageKey = 'mistboard.fogTheme';
const pieceSetStorageKey = 'mistboard.pieceSet';
const xiangqiBoardStorageKey = 'mistboard.xiangqiBoardTheme';
const xiangqiPieceSetStorageKey = 'mistboard.xiangqiPieceSet';
const soundVolumeStorageKey = 'mistboard.soundVolume';
const soundMutedStorageKey = 'mistboard.soundMuted';
export const soundSettingsChangedEvent = 'mistboard:sound-settings-changed';
export const siteThemeChangedEvent = 'mistboard:site-theme-changed';
// Fired when a xiangqi-family appearance setting (board theme or piece set)
// changes. The xiangqi board renders pieces as inline SVG, so unlike the
// CSS-driven chess board it must re-render to pick up a new piece set.
export const xiangqiAppearanceChangedEvent = 'mistboard:xiangqi-appearance-changed';
const defaultSiteTheme: SiteTheme = 'system';
const defaultTheme: BoardTheme = 'green';
const defaultFogTheme: FogTheme = 'solid';
const defaultPieceSet: PieceSet = 'cburnett';
const defaultXiangqiBoardTheme: XiangqiBoardTheme = 'tournament';
const defaultXiangqiPieceSet: XiangqiPieceSet = DEFAULT_XIANGQI_PIECE_SET;
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
const xiangqiBoardThemes: Array<{ id: XiangqiBoardTheme; label: string }> = [
  { id: 'tournament', label: 'Tournament' },
  { id: 'blue', label: 'Blue' },
  { id: 'mono', label: 'Monochrome' },
];
const xiangqiPieceSets = XIANGQI_PIECE_SETS;
const defaultBoardFamily: BoardFamily = 'chess';

// Xiangqi appearance (board themes + piece sets) is shared by full Dark Xiangqi
// and Dark Mini Xiangqi, so either flag surfaces it. Gated so the hidden variants
// don't leak a "Xiangqi" option into Settings on production. Evaluated at panel-
// build time (flags are build-time constants, so this is stable per build).
export function xiangqiAppearanceEnabled(): boolean {
  return darkXiangqiEnabled() || darkMiniXiangqiEnabled();
}

function enabledAppearanceFamilies(): Array<{ id: BoardFamily; label: string }> {
  return [
    { id: 'chess', label: 'Chess' },
    ...(xiangqiAppearanceEnabled() ? [{ id: 'xiangqi' as BoardFamily, label: 'Xiangqi' }] : []),
  ];
}
let navObserver: MutationObserver | null = null;
let systemThemeWatcherBound = false;

export function initializeThemeSettings(): void {
  applySiteTheme(readStoredSiteTheme());
  applyBoardTheme(readStoredTheme());
  applyFogTheme(readStoredFogTheme());
  applyPieceSet(readStoredPieceSet());
  applyXiangqiBoardTheme(readStoredXiangqiBoardTheme());
  applyXiangqiPieceSet(readStoredXiangqiPieceSet());
  if (!document.documentElement.dataset.boardFamily) {
    document.documentElement.dataset.boardFamily = 'chess';
  }
  watchForSystemThemeChanges();
  mountThemeControls();
  watchForNavChanges();
}

// Set by the active route so the settings panel shows the right board/piece
// pickers (chess vs xiangqi). The fog picker is shared across both families.
export function setBoardFamily(family: BoardFamily): void {
  document.documentElement.dataset.boardFamily = family;
  syncBoardFamilyControls();
}

function currentBoardFamily(): BoardFamily {
  const value = document.documentElement.dataset.boardFamily;
  return enabledAppearanceFamilies().some((family) => family.id === value)
    ? (value as BoardFamily)
    : defaultBoardFamily;
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

function applyXiangqiBoardTheme(theme: XiangqiBoardTheme): void {
  document.documentElement.dataset.xiangqiBoardTheme = theme;
}

function applyXiangqiPieceSet(pieceSet: XiangqiPieceSet): void {
  document.documentElement.dataset.xiangqiPieceSet = pieceSet;
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
  // Signed in, the appearance panel folds into the profile dropdown
  // (account-nav.ts), so the standalone gear is not shown — matches lichess.
  if (isLikelySignedIn()) return;

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
  trigger.className = 'theme-control-trigger theme-control-trigger-icon';
  trigger.type = 'button';
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', 'Settings');
  trigger.title = 'Settings';
  // Gear icon (Lucide "settings"), matching the nav's outline-icon style. A
  // standalone "Settings" text item read as a prominent nav link; a discreet
  // gear matches the lichess/pychess preferences pattern.
  trigger.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';

  const panel = document.createElement('div');
  panel.className = 'theme-control-panel';
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Display and sound settings');

  panel.append(buildAppearanceMenu());

  trigger.addEventListener('click', () => {
    const expanded = trigger.getAttribute('aria-expanded') === 'true';
    closeThemeMenus();
    if (!expanded) openThemeMenu(control);
  });

  control.append(trigger, panel);
  // Gear sits at the far right of the nav, after Sign in / Register (lichess order).
  target.append(control);
}

// The appearance controls as a lichess-style drill-in menu: a compact list of
// category rows (Appearance, Fog, Sound, Board, Pieces) that each open a
// sub-panel with that category's controls. Shared by the signed-out gear above
// and the signed-in profile dropdown (account-nav.ts), which embeds it directly
// so there's no standalone gear when logged in.
//
// Board + piece pickers are per game family. When a xiangqi variant is enabled a
// Game selector sits above the Board/Pieces rows and scopes which family's tiles
// the sub-panels show (the family-gating CSS hides the inactive family). On a
// chess-only build there's no selector and the menu mirrors a single-game setup.
export function buildAppearanceMenu(): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'appearance-menu';

  const root = document.createElement('div');
  root.className = 'appearance-menu-root';
  const submenus: HTMLElement[] = [];

  const addCategory = (key: string, label: string, body: HTMLElement[]): void => {
    root.append(createAppearanceRow(key, label));
    submenus.push(createAppearanceSubmenu(key, label, body));
  };

  addCategory('theme', 'Appearance', [createSiteThemeField(false)]);
  addCategory('fog', 'Fog', [
    createTileField(
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
      undefined,
      false,
    ),
  ]);
  addCategory('sound', 'Sound', [createVolumeField(), createMuteField()]);

  // Per-game section. The Game selector only appears when a xiangqi variant is
  // enabled; otherwise Board/Pieces drill straight into the chess tiles.
  if (xiangqiAppearanceEnabled()) {
    root.append(createAppearanceDivider());
    root.append(createBoardFamilyField());
  }

  const boardBody: HTMLElement[] = [
    createTileField(
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
      'chess',
      false,
    ),
  ];
  if (xiangqiAppearanceEnabled()) {
    boardBody.push(
      createTileField(
        'xqboard',
        'Board colors',
        'Xiangqi board color scheme',
        xiangqiBoardThemes,
        readStoredXiangqiBoardTheme(),
        (value) => {
          applyXiangqiBoardTheme(value);
          writeStoredXiangqiBoardTheme(value);
          syncThemeControls();
          dispatchXiangqiAppearanceChanged();
        },
        'xiangqi',
        false,
      ),
    );
  }
  addCategory('board', 'Board', boardBody);

  const pieceBody: HTMLElement[] = [
    createTileField(
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
      'chess',
      false,
    ),
  ];
  if (xiangqiAppearanceEnabled()) {
    pieceBody.push(
      createTileField(
        'xqpiece',
        'Pieces',
        'Xiangqi piece set',
        xiangqiPieceSets,
        readStoredXiangqiPieceSet(),
        (value) => {
          applyXiangqiPieceSet(value);
          writeStoredXiangqiPieceSet(value);
          syncThemeControls();
          dispatchXiangqiAppearanceChanged();
        },
        'xiangqi',
        false,
      ),
    );
  }
  addCategory('pieces', 'Pieces', pieceBody);

  menu.append(root, ...submenus);

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-appearance-target]')) {
    button.addEventListener('click', () =>
      showAppearanceView(menu, button.dataset.appearanceTarget ?? 'root'),
    );
  }
  for (const back of menu.querySelectorAll<HTMLButtonElement>('.appearance-submenu-back')) {
    back.addEventListener('click', () => showAppearanceView(menu, 'root'));
  }
  showAppearanceView(menu, 'root');
  return menu;
}

function createAppearanceRow(key: string, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'appearance-menu-row';
  button.dataset.appearanceTarget = key;
  const text = document.createElement('span');
  text.textContent = label;
  const chevron = document.createElement('span');
  chevron.className = 'appearance-menu-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  button.append(text, chevron);
  return button;
}

function createAppearanceSubmenu(key: string, label: string, body: HTMLElement[]): HTMLDivElement {
  const sub = document.createElement('div');
  sub.className = 'appearance-submenu';
  sub.dataset.key = key;

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'appearance-submenu-back';
  const arrow = document.createElement('span');
  arrow.className = 'appearance-submenu-back-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  const backText = document.createElement('span');
  backText.textContent = label;
  back.append(arrow, backText);

  const bodyWrap = document.createElement('div');
  bodyWrap.className = 'appearance-submenu-body';
  bodyWrap.append(...body);

  sub.append(back, bodyWrap);
  return sub;
}

function createAppearanceDivider(): HTMLDivElement {
  const divider = document.createElement('div');
  divider.className = 'appearance-menu-divider';
  divider.setAttribute('role', 'separator');
  return divider;
}

// Drill state lives in the DOM (data-view + hidden), so multiple mounted menus
// (mobile + desktop nav, gear + dropdown) stay independent.
function showAppearanceView(menu: HTMLElement, view: string): void {
  menu.dataset.view = view;
  const root = menu.querySelector<HTMLElement>('.appearance-menu-root');
  if (root) root.hidden = view !== 'root';
  for (const sub of menu.querySelectorAll<HTMLElement>('.appearance-submenu')) {
    sub.hidden = sub.dataset.key !== view;
  }
}

// Return every mounted appearance menu to its root list. Called when a parent
// dropdown opens so it never reopens mid-drill on a stale sub-panel.
export function resetAppearanceMenus(root: ParentNode = document): void {
  for (const menu of root.querySelectorAll<HTMLElement>('.appearance-menu')) {
    showAppearanceView(menu, 'root');
  }
}

function createSiteThemeField(showLabel = true): HTMLDivElement {
  const field = document.createElement('div');
  field.className = 'theme-control-field';

  const row = document.createElement('div');
  row.className = 'theme-mode-row';
  row.setAttribute('role', 'radiogroup');
  row.setAttribute('aria-label', 'Site appearance');

  for (const option of siteThemeOptions) {
    const button = createSiteThemeButton(option.id, option.label);
    row.append(button);
  }

  if (showLabel) {
    const text = document.createElement('span');
    text.textContent = 'Appearance';
    field.append(text);
  }
  field.append(row);
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

// Picks which game family's board + piece pickers are shown, as a dropdown.
// Defaults to the active page's family (set by the route via setBoardFamily);
// switching it lets you configure another family's appearance.
function createBoardFamilyField(): HTMLDivElement {
  const field = document.createElement('div');
  field.className = 'theme-control-field theme-control-field-inline';
  const text = document.createElement('span');
  text.textContent = 'Game';

  const select = document.createElement('select');
  select.className = 'theme-control-select';
  select.dataset.boardFamilySelect = '';
  select.setAttribute('aria-label', 'Board and piece game family');
  for (const family of enabledAppearanceFamilies()) {
    const option = document.createElement('option');
    option.value = family.id;
    option.textContent = family.label;
    select.append(option);
  }
  select.value = currentBoardFamily();
  select.addEventListener('change', () => setBoardFamily(select.value as BoardFamily));

  field.append(text, select);
  return field;
}

function syncBoardFamilyControls(): void {
  const active = currentBoardFamily();
  document
    .querySelectorAll<HTMLSelectElement>('select[data-board-family-select]')
    .forEach((select) => {
      select.value = active;
    });
}

type TileKind = 'board' | 'fog' | 'piece' | 'xqboard' | 'xqpiece';

function createTileField<T extends string>(
  kind: TileKind,
  label: string,
  ariaLabel: string,
  options: ReadonlyArray<{ id: T; label: string }>,
  value: T,
  onChange: (value: T) => void,
  family?: BoardFamily,
  showLabel = true,
): HTMLDivElement {
  const field = document.createElement('div');
  field.className = 'theme-control-field';
  if (family) field.dataset.appearanceFamily = family;

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
    // Xiangqi piece tiles show a representative glyph; the board tiles use a CSS
    // color swatch like the chess board tiles.
    if (kind === 'xqpiece') {
      preview.textContent = xiangqiPreviewGlyph(option.id as XiangqiPieceSet);
    }
    tile.append(preview);

    tile.addEventListener('click', () => onChange(option.id));
    row.append(tile);
  }

  if (showLabel) {
    const text = document.createElement('span');
    text.textContent = label;
    field.append(text);
  }
  field.append(row);
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
  resetAppearanceMenus(control);
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
  syncBoardFamilyControls();
  syncTileRow('board', boardTheme);
  syncTileRow('xqboard', readStoredXiangqiBoardTheme());
  syncTileRow('fog', fogTheme);
  syncTileRow('piece', pieceSet);
  syncTileRow('xqpiece', readStoredXiangqiPieceSet());
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

function syncTileRow(kind: TileKind, activeId: string): void {
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

function readStoredXiangqiBoardTheme(): XiangqiBoardTheme {
  try {
    return normalizeXiangqiBoardTheme(window.localStorage.getItem(xiangqiBoardStorageKey));
  } catch {
    return defaultXiangqiBoardTheme;
  }
}

function writeStoredXiangqiBoardTheme(theme: XiangqiBoardTheme): void {
  try {
    window.localStorage.setItem(xiangqiBoardStorageKey, theme);
  } catch {
    // The data attribute still updates for the current page.
  }
}

export function readStoredXiangqiPieceSet(): XiangqiPieceSet {
  try {
    return normalizeXiangqiPieceSet(window.localStorage.getItem(xiangqiPieceSetStorageKey));
  } catch {
    return defaultXiangqiPieceSet;
  }
}

function writeStoredXiangqiPieceSet(pieceSet: XiangqiPieceSet): void {
  try {
    window.localStorage.setItem(xiangqiPieceSetStorageKey, pieceSet);
  } catch {
    // The data attribute still updates for the current page.
  }
}

function dispatchXiangqiAppearanceChanged(): void {
  window.dispatchEvent(new Event(xiangqiAppearanceChangedEvent));
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

function normalizeXiangqiBoardTheme(value: string | null): XiangqiBoardTheme {
  return xiangqiBoardThemes.some((theme) => theme.id === value)
    ? (value as XiangqiBoardTheme)
    : defaultXiangqiBoardTheme;
}

function normalizeXiangqiPieceSet(value: string | null): XiangqiPieceSet {
  return xiangqiPieceSets.some((set) => set.id === value)
    ? (value as XiangqiPieceSet)
    : defaultXiangqiPieceSet;
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
