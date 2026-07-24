import type { SerializedNode, SerializedTree } from './review/tree-serialize.js';
import { localizedStudyName } from './study-i18n.js';

export type StudyVisibility = 'private' | 'unlisted' | 'public';

export type StudyControlModel = {
  id: string;
  name: string;
  description: string;
  visibility: StudyVisibility;
  isOwner: boolean;
  featuredAt: string | null;
  canFeature: boolean;
};

export type ChapterControlModel = {
  id: string;
  name: string;
  i18n?: unknown;
  gamebook: boolean;
};

export type StudyRailActions = {
  onSwitch(id: string): void;
  onAdd(): void;
  chapterHref(id: string): string;
  onReorder(ids: string[]): Promise<string | null>;
  onToggleFeatured(featured: boolean): Promise<string | null>;
  onOpenStudySettings(): void;
  onOpenChapterSettings(chapter: ChapterControlModel): void;
};

export function buildStudyRail(
  study: StudyControlModel,
  chapters: ChapterControlModel[],
  activeId: string,
  status: HTMLElement,
  actions: StudyRailActions,
): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'study-chapters';
  panel.setAttribute('aria-label', 'Chapters');

  const head = document.createElement('div');
  head.className = 'study-chapters__head';
  const count = document.createElement('span');
  count.textContent = `${chapters.length} ${chapters.length === 1 ? 'Chapter' : 'Chapters'}`;
  head.append(count);

  const tools = document.createElement('span');
  tools.className = 'study-chapters__tools';
  if (study.isOwner || study.canFeature) {
    status.classList.add('study-chapters__status');
    tools.append(status);
  }
  if (study.canFeature) {
    const renderFeatured = (button: HTMLButtonElement): void => {
      const featured = !!study.featuredAt;
      button.textContent = featured ? '★' : '☆';
      button.title =
        study.visibility !== 'public' && !featured
          ? 'Make this study public before featuring it'
          : featured
            ? 'Remove from Staff picks'
            : 'Feature in Staff picks';
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-pressed', String(featured));
      button.disabled = study.visibility !== 'public' && !featured;
    };
    const featured = iconButton('☆', 'Feature in Staff picks', 'study-chapters__featured');
    renderFeatured(featured);
    featured.addEventListener('click', () => {
      const next = !study.featuredAt;
      featured.disabled = true;
      setRailStatus(status, 'saving', next ? 'Featuring…' : 'Removing…');
      void actions
        .onToggleFeatured(next)
        .then((error) => {
          if (error) {
            setRailStatus(status, 'error', error);
            renderFeatured(featured);
            return;
          }
          study.featuredAt = next ? new Date().toISOString() : null;
          setRailStatus(status, 'saved', next ? 'Featured' : 'Removed');
          renderFeatured(featured);
        })
        .catch(() => {
          setRailStatus(status, 'error', 'Curation failed');
          renderFeatured(featured);
        });
    });
    tools.append(featured);
  }
  if (study.isOwner) {
    const settings = iconButton('☰', 'Study settings', 'study-chapters__settings');
    settings.addEventListener('click', actions.onOpenStudySettings);
    tools.append(settings);
  }
  head.append(tools);
  panel.append(head);

  const list = document.createElement('ol');
  list.className = 'study-chapters__list';
  let draggedId: string | null = null;
  let reorderPending = false;
  const requestReorder = (chapterId: string, offset: number): void => {
    if (reorderPending) return;
    const currentIds = chapters.map((chapter) => chapter.id);
    const currentIndex = currentIds.indexOf(chapterId);
    if (currentIndex < 0) return;
    const nextIds = moveChapterId(currentIds, chapterId, currentIndex + offset);
    if (nextIds.every((id, index) => id === currentIds[index])) return;
    reorderPending = true;
    setRailStatus(status, 'saving', 'Reordering…');
    void actions
      .onReorder(nextIds)
      .then((error) => {
        if (error) {
          reorderPending = false;
          setRailStatus(status, 'error', error);
          return;
        }
        setRailStatus(status, 'saved', 'Saved');
      })
      .catch(() => {
        reorderPending = false;
        setRailStatus(status, 'error', 'Reorder failed');
      });
  };
  const requestDrop = (chapterId: string, targetId: string): void => {
    if (reorderPending || chapterId === targetId) return;
    const currentIds = chapters.map((chapter) => chapter.id);
    const targetIndex = currentIds.indexOf(targetId);
    if (targetIndex < 0) return;
    const nextIds = moveChapterId(currentIds, chapterId, targetIndex);
    if (nextIds.every((id, index) => id === currentIds[index])) return;
    reorderPending = true;
    setRailStatus(status, 'saving', 'Reordering…');
    void actions
      .onReorder(nextIds)
      .then((error) => {
        if (error) {
          reorderPending = false;
          setRailStatus(status, 'error', error);
          return;
        }
        setRailStatus(status, 'saved', 'Saved');
      })
      .catch(() => {
        reorderPending = false;
        setRailStatus(status, 'error', 'Reorder failed');
      });
  };
  chapters.forEach((chapter, index) => {
    const row = document.createElement('li');
    row.className = 'study-chapters__row';
    row.dataset.chapterId = chapter.id;
    if (chapter.id === activeId) row.classList.add('is-active');

    const chapterLabel = localizedStudyName(chapter.name, chapter.i18n);
    if (study.isOwner) {
      const drag = iconButton('⠿', `Reorder ${chapterLabel}`, 'study-chapters__drag');
      drag.draggable = true;
      drag.title = 'Drag to reorder. Use arrow keys for precise movement.';
      drag.addEventListener('dragstart', (event) => {
        draggedId = chapter.id;
        row.classList.add('is-dragging');
        event.dataTransfer?.setData('text/plain', chapter.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      });
      drag.addEventListener('dragend', () => {
        draggedId = null;
        list.querySelectorAll('.is-dragging, .is-drop-target').forEach((element) => {
          element.classList.remove('is-dragging', 'is-drop-target');
        });
      });
      drag.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        requestReorder(chapter.id, event.key === 'ArrowUp' ? -1 : 1);
      });
      row.append(drag);
      row.addEventListener('dragover', (event) => {
        if (!draggedId || draggedId === chapter.id) return;
        event.preventDefault();
        row.classList.add('is-drop-target');
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      });
      row.addEventListener('dragleave', () => row.classList.remove('is-drop-target'));
      row.addEventListener('drop', (event) => {
        event.preventDefault();
        row.classList.remove('is-drop-target');
        const sourceId = draggedId ?? event.dataTransfer?.getData('text/plain');
        if (sourceId) requestDrop(sourceId, chapter.id);
      });
    }

    const link = document.createElement('a');
    link.href = actions.chapterHref(chapter.id);
    link.className = 'study-chapters__link';
    if (chapter.id === activeId) link.setAttribute('aria-current', 'page');
    const num = document.createElement('span');
    num.className = 'study-chapters__num';
    num.textContent = String(index + 1);
    const name = document.createElement('span');
    name.className = 'study-chapters__name';
    name.textContent = chapterLabel;
    name.title = chapterLabel;
    link.append(num, name);
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      actions.onSwitch(chapter.id);
    });
    row.append(link);

    if (study.isOwner) {
      const settings = iconButton('⚙', `Edit ${chapterLabel}`, 'study-chapters__chapter-settings');
      settings.addEventListener('click', () => actions.onOpenChapterSettings(chapter));
      row.append(settings);
    }
    list.append(row);
  });
  panel.append(list);

  if (study.isOwner) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'study-chapters__add';
    add.textContent = '＋ Add a new chapter';
    add.addEventListener('click', actions.onAdd);
    panel.append(add);
  }

  requestAnimationFrame(() => {
    const active = list.querySelector<HTMLElement>('.is-active');
    if (active) list.scrollTop = Math.max(0, active.offsetTop - list.clientHeight / 2);
  });
  return panel;
}

export function moveChapterId(ids: string[], chapterId: string, targetIndex: number): string[] {
  const fromIndex = ids.indexOf(chapterId);
  if (fromIndex < 0 || ids.length < 2) return [...ids];
  const boundedTarget = Math.max(0, Math.min(targetIndex, ids.length - 1));
  if (fromIndex === boundedTarget) return [...ids];
  const next = [...ids];
  next.splice(fromIndex, 1);
  next.splice(boundedTarget, 0, chapterId);
  return next;
}

function setRailStatus(status: HTMLElement, state: string, message: string): void {
  status.dataset.state = state;
  status.textContent = message;
}

export type StudySettingsPatch = {
  name: string;
  description: string;
  visibility: StudyVisibility;
};

export type StudySettingsActions = {
  onSave(patch: StudySettingsPatch): Promise<string | null>;
  onDelete(): Promise<string | null>;
};

export function openStudySettingsDialog(
  study: StudyControlModel,
  actions: StudySettingsActions,
): void {
  closeExistingDialog('study-settings');
  const dialog = baseDialog('study-settings', 'Study settings');
  const form = document.createElement('form');
  form.className = 'study-settings__form';

  const name = textInput(study.name, 100);
  const description = document.createElement('textarea');
  description.className = 'study-create-dialog__control study-settings__description';
  description.rows = 5;
  description.maxLength = 4000;
  description.value = study.description;
  description.placeholder = 'What will readers learn from this study?';
  const visibility = visibilitySelect(study.visibility);
  form.append(
    field('Name', name),
    field('Description', description),
    field('Visibility', visibility),
  );

  const feedback = feedbackLine();
  const footer = document.createElement('div');
  footer.className = 'study-settings__footer';
  const danger = document.createElement('div');
  danger.className = 'study-settings__danger';
  const remove = actionButton('Delete study', 'study-settings__delete');
  armDanger(remove, feedback, 'Delete this study permanently?', async () => {
    setPending(remove, 'Deleting…');
    try {
      const error = await actions.onDelete();
      if (!error) return;
      setFeedback(feedback, error, 'error');
      restoreButton(remove, 'Delete study');
      remove.blur();
    } catch {
      setFeedback(feedback, 'The request failed. Check your connection and try again.', 'error');
      restoreButton(remove, 'Delete study');
      remove.blur();
    }
  });
  danger.append(remove);

  const primary = document.createElement('div');
  primary.className = 'study-create-dialog__actions';
  const cancel = actionButton('Cancel', 'study-create-dialog__cancel');
  cancel.addEventListener('click', () => dialog.close('cancel'));
  const save = actionButton('Save changes', 'study-create-dialog__start', 'submit');
  primary.append(cancel, save);
  footer.append(danger, primary);
  form.append(feedback, footer);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!name.value.trim()) {
      setFeedback(feedback, 'Study name is required.', 'error');
      return;
    }
    setPending(save, 'Saving…');
    void actions
      .onSave({
        name: name.value.trim(),
        description: description.value.trim(),
        visibility: visibility.value as StudyVisibility,
      })
      .then((error) => {
        if (error) {
          setFeedback(feedback, error, 'error');
          restoreButton(save, 'Save changes');
          return;
        }
        dialog.close('saved');
      })
      .catch(() => {
        setFeedback(feedback, 'The request failed. Check your connection and try again.', 'error');
        restoreButton(save, 'Save changes');
      });
  });

  dialog.append(form);
  showDialog(dialog, name);
}

export type ChapterSettingsPatch = {
  name: string;
  gamebook: boolean;
};

export type ChapterSettingsActions = {
  canUseGamebook: boolean;
  canDelete: boolean;
  onSave(patch: ChapterSettingsPatch): Promise<string | null>;
  onDuplicate(): Promise<string | null>;
  onClearAnnotations(): Promise<string | null>;
  onClearVariations(): Promise<string | null>;
  onDelete(): Promise<string | null>;
};

export function openChapterSettingsDialog(
  chapter: ChapterControlModel,
  actions: ChapterSettingsActions,
): void {
  closeExistingDialog('chapter-settings');
  const dialog = baseDialog('chapter-settings', 'Chapter settings');
  const form = document.createElement('form');
  form.className = 'study-settings__form';
  const name = textInput(chapter.name, 80);
  form.append(field('Name', name));

  const gamebook = document.createElement('input');
  gamebook.type = 'checkbox';
  gamebook.checked = chapter.gamebook;
  if (actions.canUseGamebook) form.append(checkField('Interactive lesson', gamebook));

  const feedback = feedbackLine();
  const utilities = document.createElement('div');
  utilities.className = 'study-chapter-dialog__utilities';
  const duplicate = actionButton('Duplicate chapter', 'study-settings__secondary');
  duplicate.addEventListener('click', () => {
    setPending(duplicate, 'Duplicating…');
    void actions
      .onDuplicate()
      .then((error) => {
        if (error) {
          setFeedback(feedback, error, 'error');
          restoreButton(duplicate, 'Duplicate chapter');
          return;
        }
        dialog.close('duplicated');
      })
      .catch(() => {
        setFeedback(feedback, 'The request failed. Check your connection and try again.', 'error');
        restoreButton(duplicate, 'Duplicate chapter');
      });
  });
  utilities.append(duplicate);

  const destructive = document.createElement('div');
  destructive.className = 'study-chapter-dialog__destructive';
  const clearAnnotations = actionButton('Clear annotations', 'study-settings__danger-action');
  armDanger(
    clearAnnotations,
    feedback,
    'Remove every comment, glyph, shape, and lesson hint?',
    () =>
      runDialogAction(dialog, clearAnnotations, feedback, 'Clearing…', actions.onClearAnnotations),
  );
  const clearVariations = actionButton('Clear variations', 'study-settings__danger-action');
  armDanger(clearVariations, feedback, 'Keep only the main line in this chapter?', () =>
    runDialogAction(dialog, clearVariations, feedback, 'Clearing…', actions.onClearVariations),
  );
  destructive.append(clearAnnotations, clearVariations);
  if (actions.canDelete) {
    const remove = actionButton('Delete chapter', 'study-settings__delete');
    armDanger(remove, feedback, 'Delete this chapter permanently?', () =>
      runDialogAction(dialog, remove, feedback, 'Deleting…', actions.onDelete),
    );
    destructive.append(remove);
  }

  const primary = document.createElement('div');
  primary.className = 'study-create-dialog__actions';
  const cancel = actionButton('Cancel', 'study-create-dialog__cancel');
  cancel.addEventListener('click', () => dialog.close('cancel'));
  const save = actionButton('Save chapter', 'study-create-dialog__start', 'submit');
  primary.append(cancel, save);

  form.append(utilities, destructive, feedback, primary);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!name.value.trim()) {
      setFeedback(feedback, 'Chapter name is required.', 'error');
      return;
    }
    setPending(save, 'Saving…');
    void actions
      .onSave({ name: name.value.trim(), gamebook: gamebook.checked })
      .then((error) => {
        if (error) {
          setFeedback(feedback, error, 'error');
          restoreButton(save, 'Save chapter');
          return;
        }
        dialog.close('saved');
      })
      .catch(() => {
        setFeedback(feedback, 'The request failed. Check your connection and try again.', 'error');
        restoreButton(save, 'Save chapter');
      });
  });

  dialog.append(form);
  showDialog(dialog, name);
}

export type StudySaveRecoveryActions = {
  onKeepLocal(): Promise<boolean>;
  onUseServer(): void;
};

export function openStudySaveRecoveryDialog(actions: StudySaveRecoveryActions): void {
  closeExistingDialog('save-recovery');
  const dialog = baseDialog('save-recovery', 'Choose which chapter to keep');

  const body = document.createElement('div');
  body.className = 'study-save-recovery';
  const explanation = document.createElement('p');
  explanation.textContent =
    'This chapter changed in another tab. Your local edits are safe on this device.';
  const guidance = document.createElement('p');
  guidance.className = 'study-save-recovery__guidance';
  guidance.textContent =
    'Keep your draft to replace the newer server copy, or use the server copy to discard this local draft.';
  body.append(explanation, guidance);

  const feedback = feedbackLine();
  const actionsRow = document.createElement('div');
  actionsRow.className = 'study-create-dialog__actions';
  const useServer = actionButton('Use server copy', 'study-settings__danger-action');
  useServer.addEventListener('click', () => {
    actions.onUseServer();
    dialog.close('server');
  });
  const keepLocal = actionButton('Keep my draft', 'study-create-dialog__start');
  keepLocal.addEventListener('click', () => {
    setPending(keepLocal, 'Saving…');
    useServer.disabled = true;
    void actions
      .onKeepLocal()
      .then((saved) => {
        if (saved) {
          dialog.close('local');
          return;
        }
        setFeedback(
          feedback,
          'The draft is still safe locally. Check your connection and retry.',
          'error',
        );
        restoreButton(keepLocal, 'Keep my draft');
        useServer.disabled = false;
      })
      .catch(() => {
        setFeedback(
          feedback,
          'The draft is still safe locally. Check your connection and retry.',
          'error',
        );
        restoreButton(keepLocal, 'Keep my draft');
        useServer.disabled = false;
      });
  });
  actionsRow.append(useServer, keepLocal);
  body.append(feedback, actionsRow);
  dialog.append(body);
  showDialog(dialog, keepLocal);
}

export function clearTreeAnnotations(tree: SerializedTree): SerializedTree {
  return {
    ...tree,
    root: mapNode(tree.root, (node) => {
      const { annotations: _annotations, ...rest } = node;
      return rest;
    }),
  };
}

export function keepTreeMainline(tree: SerializedTree): SerializedTree {
  const keep = (node: SerializedNode): SerializedNode => ({
    ...node,
    children: node.children[0] ? [keep(node.children[0])] : [],
  });
  return { ...tree, root: keep(tree.root) };
}

function mapNode(
  node: SerializedNode,
  transform: (node: SerializedNode) => SerializedNode,
): SerializedNode {
  return transform({ ...node, children: node.children.map((child) => mapNode(child, transform)) });
}

function baseDialog(kind: string, titleText: string): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.dataset.studyDialog = kind;
  dialog.className = 'study-create-dialog study-settings';
  const title = document.createElement('h2');
  title.className = 'study-create-dialog__title';
  title.textContent = titleText;
  dialog.append(title);
  return dialog;
}

function showDialog(dialog: HTMLDialogElement, focus: HTMLElement): void {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close('cancel');
  });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  focus.focus();
  if (focus instanceof HTMLInputElement) focus.select();
}

function closeExistingDialog(kind: string): void {
  document.querySelector<HTMLDialogElement>(`dialog[data-study-dialog="${kind}"]`)?.close();
}

function field(labelText: string, control: HTMLElement): HTMLElement {
  const label = document.createElement('label');
  label.className = 'study-create-dialog__field';
  const text = document.createElement('span');
  text.className = 'study-create-dialog__label';
  text.textContent = labelText;
  label.append(text, control);
  return label;
}

function checkField(labelText: string, control: HTMLInputElement): HTMLElement {
  const label = document.createElement('label');
  label.className = 'study-settings__check';
  const text = document.createElement('span');
  text.textContent = labelText;
  label.append(control, text);
  return label;
}

function textInput(value: string, maxLength: number): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'study-create-dialog__control';
  input.value = value;
  input.maxLength = maxLength;
  return input;
}

function visibilitySelect(selected: StudyVisibility): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'study-create-dialog__control';
  for (const [value, label] of [
    ['private', 'Private'],
    ['unlisted', 'Unlisted'],
    ['public', 'Public'],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = value === selected;
    select.append(option);
  }
  return select;
}

function iconButton(text: string, title: string, className: string): HTMLButtonElement {
  const button = actionButton(text, className);
  button.title = title;
  button.setAttribute('aria-label', title);
  return button;
}

function actionButton(
  text: string,
  className: string,
  type: 'button' | 'submit' = 'button',
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = type;
  button.className = className;
  button.textContent = text;
  button.dataset.defaultLabel = text;
  return button;
}

function feedbackLine(): HTMLParagraphElement {
  const feedback = document.createElement('p');
  feedback.className = 'study-settings__feedback';
  feedback.setAttribute('aria-live', 'polite');
  return feedback;
}

function setFeedback(feedback: HTMLElement, text: string, state: 'confirm' | 'error'): void {
  feedback.textContent = text;
  feedback.dataset.state = state;
}

function armDanger(
  button: HTMLButtonElement,
  feedback: HTMLElement,
  prompt: string,
  action: () => void | Promise<void>,
): void {
  const original = button.textContent ?? '';
  let armed = false;
  button.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      button.textContent = 'Confirm';
      button.classList.add('is-armed');
      setFeedback(feedback, prompt, 'confirm');
      return;
    }
    void action();
  });
  button.addEventListener('blur', () => {
    if (button.disabled) return;
    armed = false;
    button.textContent = original;
    button.classList.remove('is-armed');
  });
}

async function runDialogAction(
  dialog: HTMLDialogElement,
  button: HTMLButtonElement,
  feedback: HTMLElement,
  pendingText: string,
  action: () => Promise<string | null>,
): Promise<void> {
  setPending(button, pendingText);
  try {
    const error = await action();
    if (!error) {
      dialog.close('changed');
      return;
    }
    setFeedback(feedback, error, 'error');
    restoreButton(button, button.dataset.defaultLabel ?? 'Try again');
    button.blur();
  } catch {
    setFeedback(feedback, 'The request failed. Check your connection and try again.', 'error');
    restoreButton(button, button.dataset.defaultLabel ?? 'Try again');
    button.blur();
  }
}

function setPending(button: HTMLButtonElement, text: string): void {
  button.disabled = true;
  button.textContent = text;
}

function restoreButton(button: HTMLButtonElement, text: string): void {
  button.disabled = false;
  button.textContent = text;
  button.classList.remove('is-armed');
}
