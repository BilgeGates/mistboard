import {
  type Annotation,
  type AnnotationContext,
  deleteAnnotation,
  formatAnnotationLine,
} from './annotations.js';

export type AnnotationConfig = {
  manifestUrl: string;
  /** Maps a sampleId (e.g. "games/game-0011-W-tier1-black.jsonl") to its game index in the manifest. */
  gameIndexForSampleId: (sampleId: string) => number | null;
  /** Maps a sampleId to the reviewed engine color in that game. */
  tier1ColorForSampleId: (sampleId: string) => 'white' | 'black' | null;
  /** Called after a save so the caller can refresh sidebar badges. */
  onSaved?: () => void;
};

export type AnnotFormValues = {
  severity: 'major' | 'minor' | 'good' | 'neutral';
  better: string;
  note: string;
};

export type AnnotFormHandle = {
  el: HTMLElement;
  setContext: (ctx: AnnotationContext | null) => void;
  loadForEdit: (a: Annotation) => void;
  focus: () => void;
  clearAfterSave: () => void;
  appendPickedSquare: (sq: string) => void;
};

export type AnnotationPanelHandle = {
  el: HTMLDivElement;
  form: AnnotFormHandle;
  listEl: HTMLDivElement;
};

export function createAnnotationPanel(opts: {
  onSave: (values: AnnotFormValues, editing: Annotation | null) => Promise<void>;
}): AnnotationPanelHandle {
  const el = document.createElement('div');
  el.className = 'annot-panel';

  const form = createAnnotForm(opts);
  el.append(form.el);

  const listEl = document.createElement('div');
  listEl.className = 'annot-panel-list-wrapper';
  el.append(listEl);

  return { el, form, listEl };
}

export function renderAnnotationPanel(
  panel: AnnotationPanelHandle | null,
  opts: {
    annotations: Annotation[];
    context: AnnotationContext | null;
    currentPly: number;
    onDeleted: (annotation: Annotation) => void;
    onEdit: (annotation: Annotation, form: AnnotFormHandle) => void;
    onJump: (ply: number) => void;
  },
): void {
  if (!panel) return;

  panel.form.setContext(opts.context);

  panel.listEl.replaceChildren();
  const heading = document.createElement('div');
  heading.className = 'annot-panel-list-heading';
  heading.textContent = `Notes (${opts.annotations.length})`;
  panel.listEl.append(heading);

  if (opts.annotations.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'annot-panel-empty';
    empty.textContent = 'No notes for this game yet.';
    panel.listEl.append(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'annot-panel-list';
  const sorted = [...opts.annotations].sort((a, b) => a.ply - b.ply);
  for (const a of sorted) {
    const row = document.createElement('div');
    row.className = `annot-panel-item annot-${a.severity}${a.ply === opts.currentPly ? ' active' : ''}`;

    const jumpBtn = document.createElement('button');
    jumpBtn.type = 'button';
    jumpBtn.className = 'annot-panel-item-jump';
    jumpBtn.textContent = formatAnnotationLine(a);
    jumpBtn.title = 'Jump to this ply';
    jumpBtn.addEventListener('click', () => {
      opts.onJump(a.ply);
    });

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'annot-panel-item-edit';
    editBtn.textContent = '✎';
    editBtn.title = 'Edit this note';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onEdit(a, panel.form);
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'annot-panel-item-del';
    delBtn.textContent = '🗑';
    delBtn.title = 'Delete this note';
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const summary = `ply ${a.ply} ${a.move_played_uci}${a.note ? ` — ${a.note.slice(0, 60)}` : ''}`;
      if (!window.confirm(`Delete annotation?\n\n${summary}`)) return;
      try {
        await deleteAnnotation(a.id);
      } catch (err) {
        window.alert(`Delete failed: ${(err as Error).message}`);
        return;
      }
      opts.onDeleted(a);
    });

    row.append(jumpBtn, editBtn, delBtn);
    list.append(row);
  }
  panel.listEl.append(list);
}

function createAnnotForm(opts: {
  onSave: (values: AnnotFormValues, editing: Annotation | null) => Promise<void>;
}): AnnotFormHandle {
  const el = document.createElement('div');
  el.className = 'annot-form';
  el.innerHTML = `
    <div class="annot-form-header">
      <span class="annot-form-title">Annotate</span>
      <span class="annot-form-context">— scrub to a ply to begin</span>
      <button type="button" class="annot-form-cancel-edit" hidden>✕ cancel edit</button>
    </div>
    <div class="annot-form-row">
      <label class="annot-form-label">Severity</label>
      <div class="annot-form-radios">
        <label class="annot-form-radio annot-form-radio-major"><input type="radio" name="annot-severity" value="major" checked> Major</label>
        <label class="annot-form-radio annot-form-radio-minor"><input type="radio" name="annot-severity" value="minor"> Minor</label>
        <label class="annot-form-radio annot-form-radio-neutral"><input type="radio" name="annot-severity" value="neutral"> Neutral</label>
        <label class="annot-form-radio annot-form-radio-good"><input type="radio" name="annot-severity" value="good"> Good</label>
      </div>
      <label class="annot-form-label" for="annot-better">Better</label>
      <input type="text" id="annot-better" class="annot-form-input annot-form-input-better" placeholder="click 2 squares on Truth, or type UCI" autocomplete="off">
      <button type="button" class="annot-form-better-clear" title="Clear the picked move">×</button>
    </div>
    <div class="annot-form-row annot-form-row-note">
      <textarea id="annot-note" class="annot-form-note" rows="2" placeholder="What stood out — mistake, better idea, or strong move and why? (⌘/Ctrl+Enter saves)"></textarea>
      <button type="button" class="annot-form-save">Save</button>
    </div>
    <div class="annot-form-status"></div>
  `;

  const titleEl = el.querySelector('.annot-form-title') as HTMLSpanElement;
  const contextEl = el.querySelector('.annot-form-context') as HTMLSpanElement;
  const noteEl = el.querySelector('#annot-note') as HTMLTextAreaElement;
  const betterEl = el.querySelector('#annot-better') as HTMLInputElement;
  const betterClearBtn = el.querySelector('.annot-form-better-clear') as HTMLButtonElement;
  const cancelEditBtn = el.querySelector('.annot-form-cancel-edit') as HTMLButtonElement;
  const saveBtn = el.querySelector('.annot-form-save') as HTMLButtonElement;
  const statusEl = el.querySelector('.annot-form-status') as HTMLDivElement;

  let editingAnnotation: Annotation | null = null;
  let lastContext: AnnotationContext | null = null;

  function exitEditMode(): void {
    editingAnnotation = null;
    cancelEditBtn.hidden = true;
    el.classList.remove('annot-form-editing');
    titleEl.textContent = 'Annotate';
    saveBtn.textContent = 'Save';
    applyContextHeader(lastContext);
    noteEl.value = '';
    betterEl.value = '';
  }

  function applyContextHeader(ctx: AnnotationContext | null): void {
    if (!ctx) {
      contextEl.textContent = '— scrub to a ply to begin';
      return;
    }
    const tier1Marker = ctx.isTier1Move ? 'tier1' : 'random';
    contextEl.innerHTML = `— ply <strong>${ctx.ply}</strong> · played <span class="annot-form-move">${ctx.movePlayedUci}</span> <span class="annot-form-meta">(${ctx.movePlayedColor}, ${tier1Marker})</span>`;
  }

  betterClearBtn.addEventListener('click', () => {
    betterEl.value = '';
    betterEl.focus();
  });

  cancelEditBtn.addEventListener('click', () => {
    exitEditMode();
  });

  // Clicks on the truth board push squares into the better-move input.
  // Two clicks fill in a UCI; a third click starts over.
  function appendPickedSquare(sq: string): void {
    const cur = betterEl.value.trim();
    if (cur.length === 0 || cur.length >= 4) {
      betterEl.value = sq;
    } else if (cur.length === 2) {
      betterEl.value = cur + sq;
    } else {
      // Mid-typed weird state — replace with this square as the new "from".
      betterEl.value = sq;
    }
  }

  let ready = false;

  function isReady(): boolean {
    return ready || editingAnnotation !== null;
  }

  function severityValue(): 'major' | 'minor' | 'good' | 'neutral' {
    const checked = el.querySelector(
      'input[name=annot-severity]:checked',
    ) as HTMLInputElement | null;
    const v = checked?.value ?? 'major';
    return (v === 'minor' || v === 'good' || v === 'neutral' ? v : 'major') as
      | 'major'
      | 'minor'
      | 'good'
      | 'neutral';
  }

  async function tryToSave(): Promise<void> {
    if (!isReady()) {
      statusEl.textContent = 'No move at current ply.';
      statusEl.className = 'annot-form-status annot-form-status-warn';
      return;
    }
    saveBtn.disabled = true;
    statusEl.textContent = editingAnnotation ? 'Updating…' : 'Saving…';
    statusEl.className = 'annot-form-status';
    try {
      await opts.onSave(
        {
          severity: severityValue(),
          better: betterEl.value,
          note: noteEl.value,
        },
        editingAnnotation,
      );
      statusEl.textContent = editingAnnotation ? 'Updated.' : 'Saved.';
      statusEl.className = 'annot-form-status annot-form-status-ok';
    } catch (err) {
      statusEl.textContent = `Save failed: ${(err as Error).message}`;
      statusEl.className = 'annot-form-status annot-form-status-err';
    } finally {
      saveBtn.disabled = false;
    }
  }

  saveBtn.addEventListener('click', () => void tryToSave());
  el.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      void tryToSave();
    }
  });

  return {
    el,
    setContext(ctx) {
      ready = ctx !== null;
      lastContext = ctx;
      // Don't blow away the editing context header while editing.
      if (!editingAnnotation) {
        applyContextHeader(ctx);
      }
    },
    loadForEdit(a) {
      editingAnnotation = a;
      // Defensive: explicitly uncheck all radios before setting the
      // target. Auto-uncheck-via-radio-group can fail if the inputs are
      // outside a <form> ancestor in some browsers, causing a stale
      // "major" checked state to override the loaded annotation's sev.
      el.querySelectorAll('input[name=annot-severity]').forEach((r) => {
        (r as HTMLInputElement).checked = false;
      });
      const sevInput = el.querySelector(
        `input[name=annot-severity][value="${a.severity}"]`,
      ) as HTMLInputElement | null;
      if (sevInput) sevInput.checked = true;
      betterEl.value = a.suggested_move_uci ?? '';
      noteEl.value = a.note;
      titleEl.textContent = `Editing note (${a.severity})`;
      saveBtn.textContent = 'Update';
      cancelEditBtn.hidden = false;
      el.classList.add('annot-form-editing');
      contextEl.innerHTML = `— ply <strong>${a.ply}</strong> · played <span class="annot-form-move">${a.move_played_uci}</span> <span class="annot-form-meta">(${a.move_played_color}, editing)</span>`;
      noteEl.focus();
    },
    focus() {
      noteEl.focus();
    },
    clearAfterSave() {
      if (editingAnnotation) {
        exitEditMode();
        return;
      }
      noteEl.value = '';
      betterEl.value = '';
      // keep severity at last selection — user is likely classifying a streak of similar issues
    },
    appendPickedSquare,
  };
}
