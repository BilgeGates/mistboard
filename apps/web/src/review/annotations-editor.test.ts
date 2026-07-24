import { describe, expect, it, vi } from 'vitest';
import { createAnnotationEditor } from './annotations-editor.js';
import { underboardPanel } from './underboard-tabs.js';

describe('study authoring dock', () => {
  it('exposes comments, glyphs, and lesson controls as under-board tabs', () => {
    const onGlyph = vi.fn();
    const onComment = vi.fn();
    const lessonControls = document.createElement('button');
    lessonControls.textContent = 'Enable lesson';
    const editor = createAnnotationEditor({
      onGlyph,
      onComment,
      onClearShapes: vi.fn(),
      lessonControls,
    });
    const panel = underboardPanel(document.createElement('div'), {
      about: { label: 'About', body: document.createElement('div') },
      tools: editor.tabs,
      shareFenInput: document.createElement('input'),
      shareMovesInput: document.createElement('textarea'),
      gameUrl: 'https://mistboard.test/study/example',
    });

    const tabs = [...panel.querySelectorAll<HTMLButtonElement>('.review-underboard-tab')];
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'About',
      'Comment',
      'Glyphs',
      'Lesson',
      'Share & export',
    ]);

    tabs[1]?.click();
    const comment = panel.querySelector<HTMLTextAreaElement>('.annotation-editor__comment');
    expect(comment?.hidden).toBe(false);
    comment!.value = 'Control the open file.';
    comment!.dispatchEvent(new Event('input'));
    expect(onComment).toHaveBeenCalledWith('Control the open file.');

    tabs[2]?.click();
    panel.querySelector<HTMLButtonElement>('.annotation-editor__glyph')?.click();
    expect(onGlyph).toHaveBeenCalledWith(1);
    expect(comment?.closest<HTMLElement>('.review-underboard-panel__body')?.hidden).toBe(true);
  });

  it('loads the active move annotations into dock controls', () => {
    const editor = createAnnotationEditor({
      onGlyph: vi.fn(),
      onComment: vi.fn(),
      onClearShapes: vi.fn(),
      gamebook: true,
    });

    editor.setAnnotations({
      comments: [{ text: 'A forcing reply.' }],
      glyphs: [3],
      gamebook: { hint: 'Look at the general.', deviation: 'The attack loses its force.' },
    });

    expect(
      editor.tabs
        .find((tab) => tab.id === 'comment')
        ?.body.querySelector<HTMLTextAreaElement>('.annotation-editor__comment')?.value,
    ).toBe('A forcing reply.');
    expect(
      editor.tabs
        .find((tab) => tab.id === 'glyphs')
        ?.body.querySelector('.annotation-editor__glyph--active')?.textContent,
    ).toBe('!!');
    const lessonFields = editor.tabs
      .find((tab) => tab.id === 'lesson')
      ?.body.querySelectorAll<HTMLTextAreaElement>('.annotation-editor__gamebook-field');
    expect(
      [...((lessonFields ?? []) as NodeListOf<HTMLTextAreaElement>)].map((field) => field.value),
    ).toEqual(['Look at the general.', 'The attack loses its force.']);
  });
});
