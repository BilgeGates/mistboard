import { afterEach, describe, expect, it } from 'vitest';
import { mountLuzhanqiPreview } from './luzhanqi-preview.js';

describe('Luzhanqi preview', () => {
  afterEach(() => {
    document.body.replaceChildren();
    window.history.replaceState(null, '', '/');
  });

  it('uses the URL seed and replays a submitted seed', () => {
    window.history.replaceState(null, '', '/luzhanqi-preview?seed=1234');
    const root = document.createElement('div');
    mountLuzhanqiPreview(root);

    const input = seedInput(root);
    expect(input.value).toBe('1234');
    expect(root.querySelector('.luzhanqi-preview__stats')?.textContent).toContain('1234');

    clickButton(root, 'Next');
    expect(root.querySelector('.luzhanqi-preview__status')?.textContent).not.toContain(' 0/');

    input.value = '777';
    seedForm(root).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(input.value).toBe('777');
    expect(window.location.search).toBe('?seed=777');
    expect(root.querySelector('.luzhanqi-preview__status')?.textContent).toContain(' 0/');
    expect(root.querySelector('.luzhanqi-preview__stats')?.textContent).toContain('777');
  });

  it('produces the same first move for the same seed', () => {
    const first = firstMoveTextForSeed(42);
    const second = firstMoveTextForSeed(42);

    expect(first).toBeTruthy();
    expect(first).toBe(second);
  });
});

function firstMoveTextForSeed(seed: number): string | null | undefined {
  window.history.replaceState(null, '', `/luzhanqi-preview?seed=${seed}`);
  const root = document.createElement('div');
  mountLuzhanqiPreview(root);
  clickButton(root, 'Next');
  return root.querySelector('.luzhanqi-preview__last p')?.textContent;
}

function seedForm(root: HTMLElement): HTMLFormElement {
  const form = root.querySelector<HTMLFormElement>('.luzhanqi-preview__seed');
  if (!form) throw new Error('missing seed form');
  return form;
}

function seedInput(root: HTMLElement): HTMLInputElement {
  const input = root.querySelector<HTMLInputElement>('.luzhanqi-preview__seed input');
  if (!input) throw new Error('missing seed input');
  return input;
}

function clickButton(root: HTMLElement, label: string): void {
  const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent === label,
  );
  if (!button) throw new Error(`missing ${label} button`);
  button.click();
}
