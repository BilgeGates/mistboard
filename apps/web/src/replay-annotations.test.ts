import { describe, expect, it, vi } from 'vitest';
import type { Annotation, AnnotationContext } from './annotations.js';
import {
  type AnnotFormValues,
  createAnnotationPanel,
  renderAnnotationPanel,
} from './replay-annotations.js';

const context: AnnotationContext = {
  boardFenAfter: '8/8/8/8/8/8/8/8 w - - 0 1',
  gameIndex: 7,
  gamePath: 'games/sample.jsonl',
  isTier1Move: true,
  manifestUrl: '/manifest.json',
  movePlayedColor: 'white',
  movePlayedUci: 'e2e4',
  ply: 3,
};

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    board_fen_after: context.boardFenAfter,
    created_at: '2026-05-26T00:00:00.000Z',
    game_index: context.gameIndex,
    game_path: context.gamePath,
    id: overrides.id ?? 'annot-1',
    is_tier1_move: context.isTier1Move,
    manifest_url: context.manifestUrl,
    move_played_color: context.movePlayedColor,
    move_played_uci: overrides.move_played_uci ?? context.movePlayedUci,
    note: overrides.note ?? 'note',
    ply: overrides.ply ?? context.ply,
    severity: overrides.severity ?? 'major',
    suggested_move_uci: overrides.suggested_move_uci ?? null,
    tags: overrides.tags ?? [],
    ...overrides,
  };
}

describe('createAnnotationPanel', () => {
  it('submits form values for the active annotation context', async () => {
    const saved: Array<{ values: AnnotFormValues; editing: Annotation | null }> = [];
    const panel = createAnnotationPanel({
      async onSave(values, editing) {
        saved.push({ values, editing });
      },
    });

    panel.form.setContext(context);
    panel.form.appendPickedSquare('e2');
    panel.form.appendPickedSquare('e4');
    panel.el.querySelector<HTMLTextAreaElement>('#annot-note')!.value = 'missed tactic';
    panel.el.querySelector<HTMLInputElement>('input[value="good"]')!.checked = true;
    panel.el.querySelector<HTMLButtonElement>('.annot-form-save')!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(saved).toEqual([
      {
        editing: null,
        values: {
          better: 'e2e4',
          note: 'missed tactic',
          severity: 'good',
        },
      },
    ]);
    expect(panel.el.querySelector('.annot-form-status')?.textContent).toBe('Saved.');
  });

  it('loads an existing annotation for editing before saving', async () => {
    const existing = annotation({
      note: 'old note',
      severity: 'minor',
      suggested_move_uci: 'g1f3',
    });
    const saved: Array<{ values: AnnotFormValues; editing: Annotation | null }> = [];
    const panel = createAnnotationPanel({
      async onSave(values, editing) {
        saved.push({ values, editing });
      },
    });

    panel.form.loadForEdit(existing);
    panel.el.querySelector<HTMLTextAreaElement>('#annot-note')!.value = 'updated note';
    panel.el.querySelector<HTMLButtonElement>('.annot-form-save')!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(saved[0]).toEqual({
      editing: existing,
      values: {
        better: 'g1f3',
        note: 'updated note',
        severity: 'minor',
      },
    });
    expect(panel.form.el.classList.contains('annot-form-editing')).toBe(true);
  });
});

describe('renderAnnotationPanel', () => {
  it('renders sorted annotations and wires jump/edit callbacks', () => {
    const panel = createAnnotationPanel({ onSave: async () => {} });
    const onJump = vi.fn();
    const onEdit = vi.fn();

    renderAnnotationPanel(panel, {
      annotations: [
        annotation({ id: 'b', move_played_uci: 'd7d5', ply: 4, severity: 'good' }),
        annotation({ id: 'a', move_played_uci: 'e2e4', ply: 2, severity: 'major' }),
      ],
      context,
      currentPly: 2,
      onDeleted: vi.fn(),
      onEdit,
      onJump,
    });

    const rows = [...panel.listEl.querySelectorAll('.annot-panel-item')];
    expect(panel.listEl.querySelector('.annot-panel-list-heading')?.textContent).toBe('Notes (2)');
    expect(rows.map((row) => row.textContent)).toEqual([
      '● ply 2 e2e4 note✎🗑',
      '★ ply 4 d7d5 note✎🗑',
    ]);
    expect(rows[0]?.classList.contains('active')).toBe(true);

    panel.listEl.querySelector<HTMLButtonElement>('.annot-panel-item-jump')!.click();
    expect(onJump).toHaveBeenCalledWith(2);

    panel.listEl.querySelector<HTMLButtonElement>('.annot-panel-item-edit')!.click();
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), panel.form);
  });

  it('renders the empty state', () => {
    const panel = createAnnotationPanel({ onSave: async () => {} });

    renderAnnotationPanel(panel, {
      annotations: [],
      context: null,
      currentPly: 0,
      onDeleted: vi.fn(),
      onEdit: vi.fn(),
      onJump: vi.fn(),
    });

    expect(panel.listEl.querySelector('.annot-panel-empty')?.textContent).toBe(
      'No notes for this game yet.',
    );
  });
});
