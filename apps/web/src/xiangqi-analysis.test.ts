import { beforeEach, describe, expect, it } from 'vitest';
import { mountXiangqiAnalysis } from './xiangqi-analysis.js';
import { mountXiangqiAnalysisPage } from './xiangqi-analysis-page.js';

// DOM coverage for the imported-game analysis surface (everything except the WASM
// engine, which happy-dom can't run — cevalSupported() is false here, so the
// engine panel mounts disabled and never touches SharedArrayBuffer).

const OPENING = [
  { from: 'h3', to: 'e3' } as const,
  { from: 'h8', to: 'e8' } as const,
  { from: 'h1', to: 'g3' } as const,
];

function freshRoot(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  return root;
}

describe('mountXiangqiAnalysis', () => {
  it('renders the board, engine panel, move list, and scrubber from a move list', () => {
    const root = freshRoot();
    mountXiangqiAnalysis(root, [...OPENING]);
    expect(root.querySelector('.xiangqi-live-board')).not.toBeNull();
    expect(root.querySelector('.engine-panel')).not.toBeNull();
    const text = root.textContent ?? '';
    expect(text).toContain('h3-e3');
    expect(text).toContain('h1-g3');
    expect(root.querySelector('.review-scrubber__status')?.textContent).toContain('3 of 3');
    // whole-game analysis entry point (the client ceval sweep is click-gated, so
    // no engine loads here — only the request button renders)
    expect(root.textContent).toContain('Analyse the whole game');
    root.remove();
  });

  it('surfaces a truncation notice when the move list goes illegal', () => {
    const root = freshRoot();
    mountXiangqiAnalysis(root, [{ from: 'b1', to: 'b2' }]); // illegal horse move → legal prefix is empty
    expect(root.textContent).toMatch(/Truncated import/i);
    root.remove();
  });
});

describe('mountXiangqiAnalysisPage', () => {
  // The page reads window.location.search; a prior test's Analyse click pushes
  // ?moves=..., which would otherwise leak into the next test's URL.
  beforeEach(() => {
    window.history.pushState({}, '', '/analysis/xiangqi');
  });

  function analyseButton(root: HTMLElement): HTMLButtonElement {
    const button = [...root.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === 'Analyse',
    );
    if (!button) throw new Error('Analyse button not found');
    return button as HTMLButtonElement;
  }

  it('shows the paste form when the URL carries no moves', () => {
    const root = freshRoot();
    mountXiangqiAnalysisPage(root);
    expect(root.querySelector('.xiangqi-analysis-form__input')).not.toBeNull();
    expect(analyseButton(root)).toBeTruthy();
    root.remove();
  });

  it('imports a pasted Chinese game and mounts the board', () => {
    const root = freshRoot();
    mountXiangqiAnalysisPage(root);
    const input = root.querySelector('.xiangqi-analysis-form__input') as HTMLTextAreaElement;
    input.value = '炮二平五 炮8平5 马二进三';
    analyseButton(root).click();
    expect(root.querySelector('.xiangqi-live-board')).not.toBeNull();
    expect(root.textContent).toContain('h3-e3');
    root.remove();
  });

  it('shows an error and does not mount for an unparseable paste', () => {
    const root = freshRoot();
    mountXiangqiAnalysisPage(root);
    const input = root.querySelector('.xiangqi-analysis-form__input') as HTMLTextAreaElement;
    input.value = 'not a game';
    analyseButton(root).click();
    expect(root.querySelector('.xiangqi-analysis-form__error')?.textContent).toBeTruthy();
    expect(root.querySelector('.xiangqi-live-board')).toBeNull();
    root.remove();
  });
});
