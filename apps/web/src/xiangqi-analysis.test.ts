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
  it('renders the board, engine panel, move tree, and navigation from a move list', () => {
    const root = freshRoot();
    mountXiangqiAnalysis(root, [...OPENING]);
    expect(root.querySelector('.xiangqi-live-board')).not.toBeNull();
    expect(root.querySelector('.engine-panel')).not.toBeNull();
    const text = root.textContent ?? '';
    expect(text).toContain('h3-e3');
    expect(text).toContain('h1-g3');
    // Interactive tree UI: a move tree + the shared scaffold nav bar.
    expect(root.querySelector('.move-tree')).not.toBeNull();
    expect(root.querySelector('.review-scrubber')).not.toBeNull();
    // The last seeded move is the current node on mount.
    expect(root.querySelector('.review-move-list__move--current')?.textContent).toContain('h1-g3');
    // whole-game analysis entry point (the client ceval sweep is click-gated, so
    // no engine loads here — only the request button renders)
    expect(root.textContent).toContain('Analyse the whole game');
    // Meta card carries the finalized xiangqi variant marker (site-wide icon
    // language), not just the text glyph.
    expect(
      root.querySelector('.game-meta-card__icon [data-variant-marker-id="xiangqi"]'),
    ).not.toBeNull();
    // The engine-arrow overlay layer mounts empty (engine off).
    expect(root.querySelector('.xq-live-arrows')).not.toBeNull();
    expect(root.querySelectorAll('.xq-live-arrows .xq-arrow')).toHaveLength(0);
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
  // The page reads window.location.search; a prior test's import pushes ?moves=...,
  // which would otherwise leak into the next test's URL.
  beforeEach(() => {
    window.history.pushState({}, '', '/analysis/xiangqi');
  });

  function buttonByText(host: ParentNode, text: string): HTMLButtonElement {
    const button = [...host.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === text,
    );
    if (!button) throw new Error(`button "${text}" not found`);
    return button as HTMLButtonElement;
  }

  it('opens the empty board at the start position when the URL carries no moves', () => {
    const root = freshRoot();
    mountXiangqiAnalysisPage(root);
    // Lichess-style: the interactive board opens directly (no paste-form gate).
    expect(root.querySelector('.xiangqi-live-board')).not.toBeNull();
    expect(root.querySelector('.move-tree')).not.toBeNull();
    expect(buttonByText(root, 'Import game')).toBeTruthy();
    root.remove();
  });

  it('seeds the board from a ?moves= link', () => {
    window.history.pushState({}, '', '/analysis/xiangqi?moves=h3e3,h8e8');
    const root = freshRoot();
    mountXiangqiAnalysisPage(root);
    expect(root.querySelector('.xiangqi-live-board')).not.toBeNull();
    expect(root.textContent).toContain('h3-e3');
    root.remove();
  });

  it('imports a pasted Chinese game through the dialog', () => {
    const root = freshRoot();
    mountXiangqiAnalysisPage(root);
    buttonByText(root, 'Import game').click();
    const dialog = document.querySelector('.xqa-import-dialog') as HTMLElement;
    expect(dialog).not.toBeNull();
    const input = dialog.querySelector('.xqa-import-dialog__input') as HTMLTextAreaElement;
    input.value = '炮二平五 炮8平5 马二进三';
    buttonByText(dialog, 'Import').click();
    expect(root.textContent).toContain('h3-e3');
    document.querySelector('.xqa-import-dialog')?.remove();
    root.remove();
  });

  it('shows an error in the dialog for an unparseable paste', () => {
    const root = freshRoot();
    mountXiangqiAnalysisPage(root);
    buttonByText(root, 'Import game').click();
    const dialog = document.querySelector('.xqa-import-dialog') as HTMLElement;
    const input = dialog.querySelector('.xqa-import-dialog__input') as HTMLTextAreaElement;
    input.value = 'not a game';
    buttonByText(dialog, 'Import').click();
    expect(dialog.querySelector('.xqa-import-dialog__error')?.textContent).toBeTruthy();
    dialog.remove();
    root.remove();
  });
});
