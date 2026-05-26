import { beforeEach, describe, expect, it } from 'vitest';
import {
  createAnalysisToolToggleBar,
  createEnginePanelDock,
  type EngineReviewPanels,
} from './replay-engine-panels.js';

beforeEach(() => {
  window.history.pushState({}, '', '/game/example');
});

describe('createAnalysisToolToggleBar', () => {
  it('renders toggle buttons and reports the next pressed state', () => {
    const bar = createAnalysisToolToggleBar();
    const toggles: boolean[] = [];

    bar.addToggle('belief', 'Belief', true, (visible) => toggles.push(visible));
    const button = bar.el.querySelector('button')!;

    expect(button.textContent).toBe('Belief');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.classList.contains('active')).toBe(true);

    button.click();
    expect(toggles).toEqual([false]);

    bar.setPressed('belief', false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.classList.contains('active')).toBe(false);
  });
});

describe('createEnginePanelDock', () => {
  const panels: EngineReviewPanels = {
    belief: {
      available: true,
      defaultOpen: true,
      seats: ['white'],
      snapshotKinds: ['policy', 'value'],
    },
    trace: {
      available: true,
      seats: ['black'],
    },
  };

  it('returns null when no engine review panels are available', () => {
    expect(createEnginePanelDock(undefined)).toBeNull();
    expect(createEnginePanelDock({ belief: { available: false } })).toBeNull();
  });

  it('renders engine panel tabs and honors the panel URL parameter', () => {
    window.history.pushState({}, '', '/game/example?panel=trace');

    const dock = createEnginePanelDock(panels)!;
    const buttons = [...dock.el.querySelectorAll('button')];

    expect(buttons.map((button) => button.textContent)).toEqual(['Belief', 'Trace']);
    expect(buttons[1]?.classList.contains('active')).toBe(true);
    expect(dock.el.querySelector('h2')?.textContent).toBe('Engine Trace');
    expect(dock.el.querySelector('.engine-review-meta')?.textContent).toBe('Seats: Black');

    buttons[1]?.click();
    expect(dock.el.querySelector('.engine-review-empty')?.textContent).toBe(
      'Engine review panels are available for this game.',
    );

    buttons[0]?.click();
    expect(dock.el.querySelector('h2')?.textContent).toBe('Belief Inspector');
    expect(dock.el.querySelector('.engine-review-meta')?.textContent).toBe(
      'Seats: WhiteSnapshots: policy, value',
    );
  });
});
