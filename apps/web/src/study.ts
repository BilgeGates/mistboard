// Study viewer/editor (/study/:id). Fetches a persisted study, rebuilds each
// chapter's tree from its serialized blob, and mounts that chapter variant's
// review surface (review/study-review.ts owns the board dispatch — a study is
// mixed-variant capable: `variant` is a per-CHAPTER column, not a study one).
// Chapters list in a compact scrolling left-rail panel (lichess study anatomy)
// with a per-study chat room beneath; switching re-mounts the review for that
// chapter. For the owner, tree edits autosave (debounced) through the
// version-guarded chapter PATCH, and the owner can add/delete chapters.
// Non-owners get a read/explore view.

import './game-shell.css';
import './live-xiangqi.css';
import './xiangqi-postgame.css';
import './study.css';
import './study-index.css';
import { parseStandardXiangqiFen, standardXiangqiFen } from '@mistboard/game';
import { buildStudyChat } from './review/spectator-chat.js';
import { mountStudyReview } from './review/study-review.js';
import type { TreeReviewHandle } from './review/tree-review.js';
import type { SerializedTree } from './review/tree-serialize.js';
import { mountXiangqiGamebook } from './review/xiangqi-gamebook.js';
import { buildNav } from './site-shell.js';
import {
  DEFAULT_STUDY_VARIANT,
  isStudyVariantId,
  type StudyVariantId,
  studyVariantLabel,
  studyVariantSupportsComposition,
  studyVariantSupportsGamebook,
} from './study-catalog.js';

type StudyVisibility = 'private' | 'unlisted' | 'public';

type StudyDto = {
  id: string;
  name: string;
  description: string;
  visibility: StudyVisibility;
  isOwner: boolean;
  likeCount: number;
  likedByViewer: boolean;
};

type ChapterDto = {
  id: string;
  name: string;
  variant: string;
  orientation: string;
  root: SerializedTree;
  version: number;
  gamebook: boolean;
};

type LoadResult =
  | { ok: true; study: StudyDto; chapters: ChapterDto[] }
  | { ok: false; status: number };

const EMPTY_TREE: SerializedTree = { version: 1, root: { children: [] } };

export function mountStudy(root: HTMLElement, studyId: string): void {
  root.classList.add('landing-page', 'xiangqi-postgame-route');
  root.replaceChildren(buildNav(), notice('Loading study'));
  void loadStudy(studyId)
    .then((result) => {
      if (result.ok) renderStudy(root, result.study, result.chapters);
      else renderError(root, result.status);
    })
    .catch(() => renderError(root, 0));
}

async function loadStudy(studyId: string): Promise<LoadResult> {
  const response = await fetch(`/api/studies/${encodeURIComponent(studyId)}`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) return { ok: false, status: response.status };
  const body = (await response.json()) as { study: StudyDto; chapters: ChapterDto[] };
  return { ok: true, study: body.study, chapters: body.chapters };
}

function renderStudy(root: HTMLElement, study: StudyDto, chapters: ChapterDto[]): void {
  if (chapters.length === 0) {
    renderError(root, 415);
    return;
  }
  let activeId = chapters[0]!.id;
  // Bumped on every render so an in-flight async board mount knows it is stale.
  let mountSeq = 0;

  const switchTo = (id: string): void => {
    // No-op when already active — otherwise a double-click (two clicks) would
    // re-render and detach the tab label before its dblclick-to-rename fires.
    if (id === activeId) return;
    activeId = id;
    renderActive();
  };

  // A study is single-variant: chapters inherit the variant chosen at create
  // time, so no chapter request carries one (the server refuses a mismatch).
  const studyVariant = (): StudyVariantId => {
    const first = chapters[0];
    return first && isStudyVariantId(first.variant) ? first.variant : DEFAULT_STUDY_VARIANT;
  };

  const createChapter = async (name: string, rootFen?: string): Promise<void> => {
    // rootFen rides inside the tree blob (SerializedTree.rootFen) — a
    // composition chapter needs no dedicated column or route change.
    const root: SerializedTree = rootFen ? { ...EMPTY_TREE, rootFen } : EMPTY_TREE;
    const response = await fetch(`/api/studies/${study.id}/chapters`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: name || `Chapter ${chapters.length + 1}`,
        root,
      }),
    });
    if (!response.ok) return;
    const { chapter } = (await response.json()) as { chapter: ChapterDto };
    chapters.push(chapter);
    switchTo(chapter.id);
  };

  const addChapter = (): void =>
    openAddChapterDialog(`Chapter ${chapters.length + 1}`, studyVariant(), (name, rootFen) => {
      void createChapter(name, rootFen);
    });

  const removeChapter = async (id: string): Promise<void> => {
    const response = await fetch(`/api/studies/${study.id}/chapters/${id}`, { method: 'DELETE' });
    if (!response.ok) return; // 409 last_chapter is silently a no-op (button is hidden anyway)
    const index = chapters.findIndex((chapter) => chapter.id === id);
    if (index >= 0) chapters.splice(index, 1);
    if (activeId === id) activeId = chapters[0]?.id ?? activeId;
    renderActive();
  };

  // Owner-only: whether the owner is previewing (test-playing) the active gamebook
  // chapter instead of authoring it.
  let previewMode = false;

  const setGamebook = async (chapterId: string, on: boolean): Promise<void> => {
    const chapter = chapters.find((entry) => entry.id === chapterId);
    if (!chapter) return;
    const response = await fetch(`/api/studies/${study.id}/chapters/${chapterId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gamebook: on }),
    });
    if (!response.ok) return;
    chapter.gamebook = on;
    if (!on) previewMode = false;
    renderActive();
  };

  const setPreview = (on: boolean): void => {
    previewMode = on;
    renderActive();
  };

  const renameStudy = async (name: string): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === study.name) return;
    const response = await fetch(`/api/studies/${study.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    });
    if (response.ok) {
      study.name = trimmed;
      renderActive();
    }
  };

  const renameChapter = async (id: string, name: string): Promise<void> => {
    const trimmed = name.trim();
    const chapter = chapters.find((entry) => entry.id === id);
    if (chapter && trimmed && trimmed !== chapter.name) {
      const response = await fetch(`/api/studies/${study.id}/chapters/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (response.ok) chapter.name = trimmed;
    }
    // Always re-render so an in-tab edit input is restored (commit or cancel).
    renderActive();
  };

  function renderActive(): void {
    const chapter = chapters.find((entry) => entry.id === activeId) ?? chapters[0];
    // Fail-closed: a chapter whose variant has no board on this client (an older
    // client, or a variant retired from the study catalog) reports unsupported
    // rather than rendering some other variant's board.
    if (!chapter || !isStudyVariantId(chapter.variant)) {
      renderError(root, 415);
      return;
    }
    const variant = chapter.variant;
    activeId = chapter.id;

    const chapterActions: ChapterActions = {
      onSwitch: switchTo,
      onAdd: addChapter,
      onRemove: removeChapter,
      onRename: study.isOwner ? (id, name) => void renameChapter(id, name) : undefined,
    };
    const gamebookable = studyVariantSupportsGamebook(variant);
    const owner: OwnerControls | undefined = study.isOwner
      ? {
          // The lesson toggle only appears where a gamebook player exists; the
          // flag stays whatever it was for variants that cannot use it.
          gamebook: gamebookable ? chapter.gamebook : null,
          preview: previewMode,
          onToggleGamebook: (on) => void setGamebook(chapter.id, on),
          onTogglePreview: setPreview,
          onRenameStudy: (name) => void renameStudy(name),
        }
      : undefined;

    root.replaceChildren(buildNav());

    // A gamebook chapter is played (guess-the-move) by viewers and by the owner in
    // preview; the owner authors it in the review board otherwise.
    if (gamebookable && chapter.gamebook && (!study.isOwner || previewMode)) {
      const aside = document.createElement('div');
      aside.className = 'study-aside';
      aside.append(
        buildActions(study, chapters, activeId, statusSpan(), chapterActions, owner),
        buildStudyChat(study.id),
      );
      mountXiangqiGamebook(root, {
        tree: chapter.root,
        orientation: chapter.orientation === 'black' ? 'black' : 'red',
        title: study.name,
        summary: chapter.name,
        aside,
      });
      return;
    }

    let version = chapter.version;
    let handle: TreeReviewHandle | null = null;
    const status = statusSpan();

    const save = debounce(() => {
      if (!handle) return;
      status.textContent = 'Saving…';
      status.dataset.state = 'saving';
      const tree = handle.serialize();
      void fetch(`/api/studies/${study.id}/chapters/${chapter.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ root: tree, baseVersion: version }),
      })
        .then(async (response) => {
          if (response.ok) {
            const body = (await response.json()) as { chapter: { version: number } };
            version = body.chapter.version;
            chapter.version = version;
            setStatus(status, 'saved', 'Saved');
            return;
          }
          if (response.status === 409) {
            setStatus(status, 'conflict', 'Edited in another tab, reload to continue');
            return;
          }
          setStatus(status, 'error', 'Save failed');
        })
        .catch(() => setStatus(status, 'error', 'Save failed'));
    }, 700);

    // The board stacks are code-split per variant, so the mount is async: the
    // page renders its nav, then the board lands. A stale mount (the reader
    // switched chapters while the chunk loaded) is dropped on arrival.
    const mountToken = ++mountSeq;
    void mountStudyReview(variant, root, {
      pageClassName: `${variant}-review study-review`,
      ariaLabel: 'Study',
      // Empty eyebrow: the info card leads with the study name itself.
      eyebrow: '',
      title: study.name,
      summary:
        study.description || (study.isOwner ? 'Draw, comment, and branch. Edits autosave.' : ''),
      boardAriaLabel: `${studyVariantLabel(variant)} board`,
      actions: buildActions(study, chapters, activeId, status, chapterActions, owner),
      details: buildStudyChat(study.id),
      gamebookEditing: gamebookable && chapter.gamebook && study.isOwner,
      annotationEditing: study.isOwner,
      initialTree: chapter.root,
      // A composition chapter (SerializedTree.rootFen) roots the board at its
      // hand-set position; an invalid FEN degrades to the standard start, same
      // posture as a corrupt blob.
      rootFen: chapter.root.rootFen,
      onChange: study.isOwner
        ? () => {
            // Keep the in-memory chapter tree fresh so switching tabs never drops an
            // edit that has not been flushed to the server yet.
            if (handle) chapter.root = handle.serialize();
            status.textContent = 'Editing…';
            status.dataset.state = 'dirty';
            save();
          }
        : undefined,
    })
      .then((mounted) => {
        if (mountToken !== mountSeq) return;
        handle = mounted;
        clampSummary(root);
      })
      .catch(() => renderError(root, 415));
  }

  renderActive();
}

/** Clamp a long study description to a few lines (with a more/less toggle) so
 * the chapter list and chat keep most of the left rail. */
function clampSummary(root: HTMLElement): void {
  const summary = root.querySelector<HTMLElement>('.review-info-card__summary');
  if (!summary?.textContent) return;
  summary.classList.add('study-summary');
  requestAnimationFrame(() => {
    if (summary.scrollHeight <= summary.clientHeight + 1) return;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'study-summary__toggle';
    toggle.textContent = 'more';
    toggle.addEventListener('click', () => {
      const open = summary.classList.toggle('is-open');
      toggle.textContent = open ? 'less' : 'more';
    });
    summary.after(toggle);
  });
}

type ChapterActions = {
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  /** Owner-only: double-click a tab to rename it. Absent for viewers. */
  onRename?: (id: string, name: string) => void;
};

type OwnerControls = {
  /** null = this chapter's variant has no gamebook player, so the row is hidden. */
  gamebook: boolean | null;
  preview: boolean;
  onToggleGamebook: (on: boolean) => void;
  onTogglePreview: (on: boolean) => void;
  onRenameStudy: (name: string) => void;
};

function statusSpan(): HTMLElement {
  const status = document.createElement('span');
  status.className = 'study-actions__status';
  return status;
}

function buildActions(
  study: StudyDto,
  chapters: ChapterDto[],
  activeId: string,
  status: HTMLElement,
  chapterActions: ChapterActions,
  owner?: OwnerControls,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'study-actions';

  wrap.append(chapterPanel(study, chapters, activeId, chapterActions));

  if (owner) {
    wrap.append(studyNameControl(study, owner.onRenameStudy));
    const active = chapters.find((entry) => entry.id === activeId);
    if (active && chapterActions.onRename) {
      wrap.append(chapterNameControl(active, chapterActions.onRename));
    }
    if (owner.gamebook !== null) wrap.append(lessonControls(owner));
    wrap.append(visibilityControl(study));
    wrap.append(status);
  }
  if (study.visibility === 'public') wrap.append(likeButton(study));
  return wrap;
}

function likeButton(study: StudyDto): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'study-actions__like';
  const render = (): void => {
    button.classList.toggle('is-liked', study.likedByViewer);
    button.textContent = `${study.likedByViewer ? '♥' : '♡'} ${study.likeCount}`;
    button.setAttribute('aria-pressed', String(study.likedByViewer));
    button.setAttribute('aria-label', `${study.likedByViewer ? 'Unlike' : 'Like'} this study`);
  };
  render();
  button.addEventListener('click', () => {
    button.disabled = true;
    void fetch(`/api/studies/${encodeURIComponent(study.id)}/like`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ liked: !study.likedByViewer }),
    })
      .then(async (response) => {
        if (response.status === 401) {
          button.title = 'Sign in to like studies';
          return;
        }
        if (!response.ok) return;
        const state = (await response.json()) as { likeCount: number; likedByViewer: boolean };
        study.likeCount = state.likeCount;
        study.likedByViewer = state.likedByViewer;
        render();
      })
      .finally(() => {
        button.disabled = false;
      });
  });
  return button;
}

function studyNameControl(study: StudyDto, onRename: (name: string) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'study-actions__row';
  const label = document.createElement('span');
  label.className = 'study-actions__label';
  label.textContent = 'Name';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'study-actions__name';
  input.value = study.name;
  input.maxLength = 100;
  input.setAttribute('aria-label', 'Study name');
  input.addEventListener('change', () => onRename(input.value));
  row.append(label, input);
  return row;
}

function lessonControls(owner: OwnerControls): HTMLElement {
  const row = document.createElement('div');
  row.className = 'study-actions__row';
  const label = document.createElement('span');
  label.className = 'study-actions__label';
  label.textContent = 'Lesson';
  // Only reached when the variant has a gamebook player (buildActions guards on
  // null), so the flag reads as a plain boolean here.
  const on = owner.gamebook === true;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = on ? 'study-actions__vis study-actions__vis--active' : 'study-actions__vis';
  toggle.textContent = on ? 'On' : 'Off';
  toggle.addEventListener('click', () => owner.onToggleGamebook(!on));
  row.append(label, toggle);
  if (on) {
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'study-actions__copy';
    preview.textContent = owner.preview ? 'Back to editing' : 'Preview';
    preview.addEventListener('click', () => owner.onTogglePreview(!owner.preview));
    row.append(preview);
  }
  return row;
}

// Compact scrolling chapter panel (lichess study anatomy): a numbered list in
// small text with the active chapter highlighted, capped in height so long
// studies scroll instead of swallowing the rail.
function chapterPanel(
  study: StudyDto,
  chapters: ChapterDto[],
  activeId: string,
  actions: ChapterActions,
): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'study-chapters';
  panel.setAttribute('aria-label', 'Chapters');

  const head = document.createElement('div');
  head.className = 'study-chapters__head';
  head.textContent = `${chapters.length} ${chapters.length === 1 ? 'Chapter' : 'Chapters'}`;
  // The variant is a study-level fact now, so it is named once here rather than
  // repeated per chapter row.
  const first = chapters[0];
  if (first && isStudyVariantId(first.variant)) {
    const variant = document.createElement('span');
    variant.className = 'study-chapters__variant';
    variant.textContent = studyVariantLabel(first.variant);
    head.append(variant);
  }
  panel.append(head);

  const list = document.createElement('ol');
  list.className = 'study-chapters__list';
  chapters.forEach((chapter, index) => {
    const row = document.createElement('li');
    row.className = 'study-chapters__row';
    if (chapter.id === activeId) row.classList.add('is-active');
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'study-chapters__link';
    const num = document.createElement('span');
    num.className = 'study-chapters__num';
    num.textContent = String(index + 1);
    const name = document.createElement('span');
    name.className = 'study-chapters__name';
    name.textContent = chapter.name;
    name.title = chapter.name;
    link.append(num, name);
    link.addEventListener('click', () => actions.onSwitch(chapter.id));
    row.append(link);
    // Owners can delete any chapter but the last (server enforces; hide when one).
    if (study.isOwner && chapters.length > 1) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'study-chapters__del';
      del.textContent = '×';
      del.title = 'Delete chapter';
      del.addEventListener('click', () => actions.onRemove(chapter.id));
      row.append(del);
    }
    list.append(row);
  });
  panel.append(list);

  if (study.isOwner) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'study-chapters__add';
    add.textContent = '+ New chapter';
    add.addEventListener('click', () => actions.onAdd());
    panel.append(add);
  }

  // Keep the active chapter in view once the panel is laid out. Scroll the list
  // itself (not scrollIntoView, which would also jolt the page's own scroll).
  requestAnimationFrame(() => {
    const active = list.querySelector<HTMLElement>('.is-active');
    if (active) list.scrollTop = Math.max(0, active.offsetTop - list.clientHeight / 2);
  });

  return panel;
}

function chapterNameControl(
  chapter: ChapterDto,
  onRename: (id: string, name: string) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'study-actions__row';
  const label = document.createElement('span');
  label.className = 'study-actions__label';
  label.textContent = 'Chapter';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'study-actions__name';
  input.value = chapter.name;
  input.maxLength = 80;
  input.setAttribute('aria-label', 'Chapter name');
  input.addEventListener('change', () => onRename(chapter.id, input.value));
  row.append(label, input);
  return row;
}

function visibilityControl(study: StudyDto): HTMLElement {
  const visibility = document.createElement('div');
  visibility.className = 'study-actions__visibility';
  let current = study.visibility;
  const options: StudyVisibility[] = ['private', 'unlisted', 'public'];
  const buttons = new Map<StudyVisibility, HTMLButtonElement>();
  const paint = (): void => {
    for (const [value, button] of buttons) {
      button.classList.toggle('study-actions__vis--active', value === current);
    }
  };
  for (const value of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'study-actions__vis';
    button.textContent = value;
    button.addEventListener('click', () => {
      const previous = current;
      current = value;
      study.visibility = value;
      paint();
      void fetch(`/api/studies/${study.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visibility: value }),
      }).then((response) => {
        if (!response.ok) {
          current = previous;
          study.visibility = previous;
          paint();
        }
      });
    });
    buttons.set(value, button);
    visibility.append(button);
  }
  paint();
  return labelled('Visibility', visibility);
}

function labelled(label: string, control: HTMLElement): HTMLElement {
  const row = document.createElement('div');
  row.className = 'study-actions__row';
  const span = document.createElement('span');
  span.className = 'study-actions__label';
  span.textContent = label;
  row.append(span, control);
  return row;
}

function setStatus(el: HTMLElement, state: string, text: string): void {
  el.dataset.state = state;
  el.textContent = text;
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

function notice(text: string): HTMLElement {
  const shell = document.createElement('main');
  shell.className = 'dxq-postgame__notice';
  const heading = document.createElement('h1');
  heading.textContent = text;
  shell.append(heading);
  return shell;
}

// Add-chapter dialog: name + optional hand-set start position (a composition /
// endgame chapter). Mirrors the create-study dialog on /study (same classes,
// study-index.css). No variant picker: the study's variant is fixed at create
// time. The FEN field only shows for variants that can parse one back
// (studyVariantSupportsComposition) — offering the box where the FEN would be
// silently dropped is worse than not offering it.
function openAddChapterDialog(
  defaultName: string,
  studyVariant: StudyVariantId,
  onCreate: (name: string, rootFen?: string) => void,
): void {
  document.querySelector<HTMLDialogElement>('dialog[data-add-chapter]')?.remove();

  const dialog = document.createElement('dialog');
  dialog.dataset.addChapter = '';
  dialog.className = 'study-create-dialog';

  const heading = document.createElement('h2');
  heading.className = 'study-create-dialog__title';
  heading.textContent = 'New chapter';

  const form = document.createElement('form');
  form.className = 'study-create-dialog__form';

  const nameField = document.createElement('label');
  nameField.className = 'study-create-dialog__field';
  const nameLabel = document.createElement('span');
  nameLabel.className = 'study-create-dialog__label';
  nameLabel.textContent = 'Name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'study-create-dialog__control';
  nameInput.maxLength = 80;
  nameInput.value = defaultName;
  nameInput.setAttribute('aria-label', 'Chapter name');
  nameField.append(nameLabel, nameInput);

  const fenField = document.createElement('label');
  fenField.className = 'study-create-dialog__field';
  const fenLabel = document.createElement('span');
  fenLabel.className = 'study-create-dialog__label';
  fenLabel.textContent = 'Start position (FEN, optional)';
  const fenInput = document.createElement('input');
  fenInput.type = 'text';
  fenInput.className = 'study-create-dialog__control';
  fenInput.placeholder = 'Standard start';
  fenInput.setAttribute('aria-label', 'Start position FEN');
  fenField.append(fenLabel, fenInput);
  const fenError = document.createElement('p');
  fenError.className = 'study-create-dialog__error';

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
  start.textContent = 'Add';
  actions.append(cancel, start);

  // The chapter inherits the study's variant, so the only variant-dependent part
  // left here is whether a start FEN can be parsed back.
  const composable = studyVariantSupportsComposition(studyVariant);
  fenField.hidden = !composable;

  form.append(nameField, fenField, fenError, actions);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    fenError.textContent = '';
    let rootFen: string | undefined;
    const fenRaw = composable ? fenInput.value.trim() : '';
    if (fenRaw) {
      const parsed = parseStandardXiangqiFen(fenRaw);
      if (!parsed.ok) {
        fenError.textContent = parsed.error;
        return;
      }
      rootFen = standardXiangqiFen(parsed.state);
    }
    dialog.close('create');
    onCreate(nameInput.value.trim(), rootFen);
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

function renderError(root: HTMLElement, status: number): void {
  const shell = document.createElement('main');
  shell.className = 'dxq-postgame__error';
  const title = document.createElement('h1');
  title.textContent = status === 404 ? 'Study not found' : 'Study unavailable';
  const body = document.createElement('p');
  body.textContent =
    status === 404
      ? 'This study is private or does not exist.'
      : status === 415
        ? 'This study uses a variant that is not supported yet.'
        : 'The study could not be loaded.';
  shell.append(title, body);
  root.replaceChildren(buildNav(), shell);
}
