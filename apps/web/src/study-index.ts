// Study browse page (/study). Four focused lists:
//   • All studies (default) — the public studies index (/api/studies/public)
//   • My studies (?tab=mine) — the signed-in owner's studies (/api/studies/mine)
//   • Favorites (?tab=favorites) — public studies liked by the signed-in viewer
//   • Staff picks (?tab=staff) — Mistboard-curated public studies
// New studies are created through a metadata dialog (name + visibility) that then
// opens the fresh study.

import './game-shell.css';
import { localizedStudyName } from './study-i18n.js';
import './study.css';
import './study-index.css';
import { normalizeStartFen } from '@mistboard/game';
import { buildNav } from './site-shell.js';
import {
  buildStudyVariantSelect,
  DEFAULT_STUDY_VARIANT,
  type StudyVariantId,
  selectedStudyVariant,
  studyVariantSupportsComposition,
} from './study-catalog.js';
import { buildStudyThumbnail } from './study-thumbnails.js';

// A fresh study starts with one blank chapter at the standard start position.
const EMPTY_TREE = { version: 1, root: { children: [] } };

type StudyVisibility = 'private' | 'unlisted' | 'public';

type StudyOwner = { handle: string; displayName: string };

type StudySummary = {
  id: string;
  name: string;
  description: string;
  /** Per-locale overrides for `name`. */
  i18n?: unknown;
  visibility: StudyVisibility;
  chapterCount: number;
  // Preview slice of the first few chapter names (older servers may omit it).
  chapterNames?: string[];
  updatedAt: string;
  featuredAt?: string | null;
  // Present on public listings only (the /api/studies/public shape).
  owner?: StudyOwner;
  likeCount?: number;
};

type StudyTab = 'all' | 'mine' | 'favorites' | 'staff';

// The left rail mirrors lichess /study. Every tab is backed by a real query.
const RAIL_TABS: { label: string; tab: StudyTab }[] = [
  { label: 'All studies', tab: 'all' },
  { label: 'My studies', tab: 'mine' },
  { label: 'Favorites', tab: 'favorites' },
  { label: 'Staff picks', tab: 'staff' },
];

const TAB_NEEDS_AUTH: Record<StudyTab, boolean> = {
  all: false,
  mine: true,
  favorites: true,
  staff: false,
};

function activeTab(): StudyTab {
  const tab = new URLSearchParams(window.location.search).get('tab');
  return tab === 'mine' || tab === 'favorites' || tab === 'staff' ? tab : 'all';
}

function searchQuery(): string {
  return (new URLSearchParams(window.location.search).get('q') ?? '').trim();
}

function endpointFor(tab: StudyTab, q: string): string {
  const params = new URLSearchParams();
  if (tab !== 'mine') params.set('limit', '30');
  if (q) params.set('q', q);
  const base =
    tab === 'mine'
      ? '/api/studies/mine'
      : tab === 'favorites'
        ? '/api/studies/favorites'
        : tab === 'staff'
          ? '/api/studies/staff'
          : '/api/studies/public';
  const suffix = params.toString();
  return suffix ? `${base}?${suffix}` : base;
}

export function mountStudyIndex(root: HTMLElement): void {
  root.classList.add('landing-page');
  const tab = activeTab();
  const q = searchQuery();
  root.replaceChildren(buildNav(), notice('Loading studies'));
  void fetch(endpointFor(tab, q), { headers: { accept: 'application/json' } })
    .then(async (response) => {
      if (TAB_NEEDS_AUTH[tab] && response.status === 401) {
        renderMessage(
          root,
          tab === 'favorites' ? 'Sign in to see your favorites' : 'Sign in to see your studies',
          'This list is tied to your account.',
        );
        return;
      }
      if (!response.ok) {
        renderMessage(root, 'Studies unavailable', 'Studies could not be loaded.');
        return;
      }
      const body = (await response.json()) as { studies: StudySummary[] };
      renderList(root, tab, q, body.studies);
    })
    .catch(() => renderMessage(root, 'Studies unavailable', 'Studies could not be loaded.'));
}

const TAB_TITLES: Record<StudyTab, string> = {
  all: 'All studies',
  mine: 'My studies',
  favorites: 'Favorites',
  staff: 'Staff picks',
};

function renderList(root: HTMLElement, tab: StudyTab, q: string, studies: StudySummary[]): void {
  const main = document.createElement('main');
  main.className = 'study-index';

  main.append(buildRail(tab), buildContent(tab, q, studies));
  root.replaceChildren(buildNav(), main);
}

// Switching tabs starts a fresh browse (drops any active search query).
function tabHref(tab: StudyTab): string {
  return tab === 'all' ? '/study' : `/study?tab=${tab}`;
}

function buildRail(active: StudyTab): HTMLElement {
  const rail = document.createElement('aside');
  rail.className = 'study-index__rail';

  const list = document.createElement('ul');
  list.className = 'study-index__rail-list';
  for (const tab of RAIL_TABS) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.className = 'study-index__rail-tab';
    link.textContent = tab.label;
    link.href = tabHref(tab.tab);
    if (tab.tab === active) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    }
    item.append(link);
    list.append(item);
  }
  rail.append(list);

  return rail;
}

function buildContent(tab: StudyTab, q: string, studies: StudySummary[]): HTMLElement {
  const content = document.createElement('section');
  content.className = 'study-index__content';

  // One header row (lichess grammar): search box (its placeholder names the active
  // list) + the green create button. Sort control (Hot/New) is deferred.
  const toolbar = document.createElement('header');
  toolbar.className = 'study-index__toolbar';
  toolbar.append(searchForm(tab, q), newStudyButton());
  content.append(toolbar);
  if (tab === 'staff') content.append(staffPicksIntro());

  if (studies.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'study-index__empty';
    empty.textContent = emptyMessage(tab, q);
    content.append(empty);
  } else {
    const grid = document.createElement('ul');
    grid.className = 'study-index__grid';
    for (const study of studies) grid.append(studyCard(study));
    content.append(grid);
  }

  return content;
}

function emptyMessage(tab: StudyTab, q: string): string {
  if (q) return `No studies match “${q}”.`;
  if (tab === 'mine') {
    return 'No studies yet. Create one to get started.';
  }
  if (tab === 'favorites') return 'No favorites yet. Like a public study to save it here.';
  if (tab === 'staff') return 'No staff picks yet.';
  return 'No public studies yet.';
}

function staffPicksIntro(): HTMLElement {
  const intro = document.createElement('div');
  intro.className = 'study-index__staff-intro';
  const title = document.createElement('strong');
  title.textContent = 'Curated by Mistboard';
  const copy = document.createElement('span');
  copy.textContent =
    'Annotated classics, archival transcriptions, and studies chosen for careful learning.';
  intro.append(title, copy);
  return intro;
}

// Search by study name. Submitting navigates with ?q= (scoped to the current tab);
// an empty term clears the search. The placeholder names the active list, lichess-
// style, standing in for a panel heading.
const SEARCH_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
  '<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/>' +
  '<line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
  '</svg>';

function searchForm(tab: StudyTab, q: string): HTMLElement {
  const form = document.createElement('form');
  form.className = 'study-index__search';
  form.setAttribute('role', 'search');

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'study-index__search-input';
  input.placeholder = TAB_TITLES[tab];
  input.value = q;
  input.setAttribute('aria-label', 'Search studies by name');

  const button = document.createElement('button');
  button.type = 'submit';
  button.className = 'study-index__search-button';
  button.setAttribute('aria-label', 'Search');
  // Static markup (no interpolation) — safe innerHTML for the inline icon.
  button.innerHTML = SEARCH_ICON;

  form.append(input, button);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (tab !== 'all') params.set('tab', tab);
    const term = input.value.trim();
    if (term) params.set('q', term);
    const query = params.toString();
    window.location.href = query ? `/study?${query}` : '/study';
  });
  return form;
}

// A single green button (lichess grammar) opens the create-study dialog rather
// than an always-visible name field.
function newStudyButton(): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'study-index__create';
  button.textContent = 'New study';
  button.addEventListener('click', () => openCreateStudyDialog());
  return button;
}

// Create-study dialog: name + visibility, then create and open the study. Our
// study model has no chat/analysis/cloning/sync/member controls (single-author),
// so the dialog is the two fields the backend actually supports.
function openCreateStudyDialog(): void {
  document.querySelector<HTMLDialogElement>('dialog[data-create-study]')?.remove();

  const dialog = document.createElement('dialog');
  dialog.dataset.createStudy = '';
  dialog.className = 'study-create-dialog';

  const heading = document.createElement('h2');
  heading.className = 'study-create-dialog__title';
  heading.textContent = 'Create study';

  const form = document.createElement('form');
  form.className = 'study-create-dialog__form';

  const nameField = dialogField('Name');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'study-create-dialog__control';
  nameInput.maxLength = 100;
  nameInput.value = 'Untitled study';
  nameInput.setAttribute('aria-label', 'Study name');
  nameField.append(nameInput);

  const visField = dialogField('Visibility');
  const visSelect = document.createElement('select');
  visSelect.className = 'study-create-dialog__control';
  visSelect.setAttribute('aria-label', 'Study visibility');
  for (const [value, label] of [
    ['private', 'Private'],
    ['unlisted', 'Unlisted'],
    ['public', 'Public'],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    visSelect.append(option);
  }
  visSelect.value = 'private';
  visField.append(visSelect);

  // The study's variant, chosen once here: every chapter inherits it (the server
  // refuses a chapter that names a different one).
  const variantField = dialogField('Variant');
  const variantSelect = buildStudyVariantSelect('Study variant', DEFAULT_STUDY_VARIANT);
  variantField.append(variantSelect);

  // Optional hand-set start position (a composition / endgame study). Left
  // empty, the chapter opens at the standard start. Only shown for variants that
  // can parse a FEN back into a position.
  const fenField = dialogField('Start position (FEN, optional)');
  const fenInput = document.createElement('input');
  fenInput.type = 'text';
  fenInput.className = 'study-create-dialog__control';
  fenInput.placeholder = 'Standard start';
  fenInput.setAttribute('aria-label', 'Start position FEN');
  fenField.append(fenInput);
  const fenError = document.createElement('p');
  fenError.className = 'study-create-dialog__error';

  const grid = document.createElement('div');
  grid.className = 'study-create-dialog__grid';
  grid.append(nameField, visField, variantField);

  const actions = document.createElement('div');
  actions.className = 'study-create-dialog__actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'study-create-dialog__cancel';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => dialog.close('cancel'));
  const start = document.createElement('button');
  start.type = 'submit';
  start.className = 'study-create-dialog__start';
  start.textContent = 'Start';
  actions.append(cancel, start);

  const syncFenField = (): void => {
    fenField.hidden = !studyVariantSupportsComposition(selectedStudyVariant(variantSelect));
    // A FEN is variant-specific, so switching variants drops whatever was typed
    // rather than carrying a string the new board would reject.
    fenInput.value = '';
    fenError.textContent = '';
  };
  variantSelect.addEventListener('change', syncFenField);
  syncFenField();

  form.append(grid, fenField, fenError, actions);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    fenError.textContent = '';
    const variant = selectedStudyVariant(variantSelect);
    let rootFen: string | undefined;
    const fenRaw = studyVariantSupportsComposition(variant) ? fenInput.value.trim() : '';
    if (fenRaw) {
      // Store the CANONICAL spelling, not what was pasted: the board replays the
      // stored string, so one position must have exactly one stored form.
      const parsed = normalizeStartFen(variant, fenRaw);
      if (!parsed.ok) {
        fenError.textContent = parsed.error;
        return;
      }
      rootFen = parsed.fen;
    }
    start.disabled = true;
    start.textContent = 'Creating…';
    void createStudy(
      nameInput.value.trim() || 'Untitled study',
      visSelect.value as StudyVisibility,
      variant,
      rootFen,
    ).catch(() => {
      start.disabled = false;
      start.textContent = 'Sign in to create';
    });
  });

  dialog.append(heading, form);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close('cancel');
  });
  dialog.addEventListener('close', () => dialog.remove());

  document.body.append(dialog);
  dialog.showModal();
  nameInput.focus();
  nameInput.select();
}

function dialogField(labelText: string): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'study-create-dialog__field';
  const label = document.createElement('span');
  label.className = 'study-create-dialog__label';
  label.textContent = labelText;
  wrap.append(label);
  return wrap;
}

async function createStudy(
  name: string,
  visibility: StudyVisibility,
  variant: StudyVariantId,
  rootFen?: string,
): Promise<void> {
  // rootFen rides inside the serialized tree blob (SerializedTree.rootFen), so a
  // composition chapter needs no dedicated column or route change.
  const root = rootFen ? { ...EMPTY_TREE, rootFen } : EMPTY_TREE;
  const response = await fetch('/api/studies', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name,
      visibility,
      chapter: { name: 'Chapter 1', variant, root },
    }),
  });
  if (!response.ok) throw new Error(`create failed: ${response.status}`);
  const body = (await response.json()) as { study: { id: string } };
  window.location.href = `/study/${body.study.id}`;
}

// Cards mirror the lichess /study anatomy: a header (title + meta) over a
// preview list of the first few chapters, with a "+N more" tail when the study
// has more chapters than the preview slice. Flair emoji were dropped 2026-07-21
// (derived glyphs read as noise); restore only as a user-picked field.
const CHAPTER_PREVIEW_MAX = 4;

function studyCard(study: StudySummary): HTMLElement {
  const item = document.createElement('li');
  const link = document.createElement('a');
  link.className = 'study-index__card';
  link.href = `/study/${study.id}`;

  link.append(cardHead(study), chapterPreview(study));
  item.append(link);
  return item;
}

function cardHead(study: StudySummary): HTMLElement {
  const head = document.createElement('div');
  head.className = 'study-index__card-head';
  const thumbnail = buildStudyThumbnail(study.id, 'study-index__thumbnail');

  const heading = document.createElement('div');
  heading.className = 'study-index__heading';

  const name = document.createElement('span');
  name.className = 'study-index__name';
  name.textContent = localizedStudyName(study.name, study.i18n);

  const meta = document.createElement('span');
  meta.className = 'study-index__meta';
  meta.textContent = metaLine(study);

  heading.append(name, meta);
  head.append(...(thumbnail ? [thumbnail] : []), heading);
  return head;
}

// Public cards read like lichess: likes · author · date. Own-studies cards, where
// author + likes aren't shown, fall back to chapter count · visibility · date.
function metaLine(study: StudySummary): string {
  const when = timeAgo(study.updatedAt);
  if (study.owner) {
    return `♥ ${study.likeCount ?? 0} · ${study.owner.displayName} · ${when}`;
  }
  const chapters = `${study.chapterCount} ${study.chapterCount === 1 ? 'chapter' : 'chapters'}`;
  const visibility = study.visibility[0]!.toUpperCase() + study.visibility.slice(1);
  return `${chapters} · ${visibility} · ${when}`;
}

function chapterPreview(study: StudySummary): HTMLElement {
  const list = document.createElement('ol');
  list.className = 'study-index__chapters';

  const names = study.chapterNames ?? [];
  for (const chapterName of names.slice(0, CHAPTER_PREVIEW_MAX)) {
    const row = document.createElement('li');
    row.className = 'study-index__chapter';
    row.textContent = chapterName;
    list.append(row);
  }

  // "+N more" when the study has more chapters than we previewed. Fall back to the
  // count alone when an older server sent no names at all.
  const shown = Math.min(names.length, CHAPTER_PREVIEW_MAX);
  const remaining = study.chapterCount - shown;
  if (remaining > 0) {
    const more = document.createElement('li');
    more.className = 'study-index__chapter study-index__chapter--more';
    more.textContent = `+${remaining} more`;
    list.append(more);
  }

  return list;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function notice(text: string): HTMLElement {
  const shell = document.createElement('main');
  shell.className = 'dxq-postgame__notice';
  const heading = document.createElement('h1');
  heading.textContent = text;
  shell.append(heading);
  return shell;
}

function renderMessage(root: HTMLElement, titleText: string, bodyText: string): void {
  const shell = document.createElement('main');
  shell.className = 'dxq-postgame__error';
  const title = document.createElement('h1');
  title.textContent = titleText;
  const body = document.createElement('p');
  body.textContent = bodyText;
  shell.append(title, body);
  root.replaceChildren(buildNav(), shell);
}
