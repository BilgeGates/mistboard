import { describe, expect, it } from 'vitest';
import {
  createGameHeaderStrip,
  createGameMetaPanel,
  renderGameHeader,
  renderGameMetaPanel,
  thinkingBudgetMsFromMeta,
  timeControlLabelFromMeta,
} from './replay-meta.js';

describe('timeControlLabelFromMeta', () => {
  it('preserves existing metadata time-control labels', () => {
    expect(timeControlLabelFromMeta({ label: '  3+2 blitz  ' })).toBe('3+2 blitz');
    expect(timeControlLabelFromMeta({ kind: 'none' })).toBe('Untimed');
    expect(timeControlLabelFromMeta({ initial_seconds: 300 })).toBe('5:00');
    expect(timeControlLabelFromMeta({ initial_seconds: 300, increment_seconds: 2 })).toBe('5:00+2');
    expect(timeControlLabelFromMeta({ initial_ms: 180_000 })).toBe('3:00');
    expect(timeControlLabelFromMeta({ initial_ms: 180_000, increment_ms: 1_000 })).toBe('3:00+1');
    expect(timeControlLabelFromMeta({ kind: 'per-move', milliseconds: 5_000 })).toBe('0:05 / move');
    expect(timeControlLabelFromMeta({ kind: 'custom-fast' })).toBe('custom-fast');
  });
});

describe('thinkingBudgetMsFromMeta', () => {
  it('reads explicit millisecond and second budgets', () => {
    expect(thinkingBudgetMsFromMeta({ budget_ms: 1_500 })).toBe(1_500);
    expect(thinkingBudgetMsFromMeta({ per_move_seconds: 2 })).toBe(2_000);
    expect(thinkingBudgetMsFromMeta({ budget_ms: 0, per_move_seconds: 0 })).toBeNull();
  });
});

describe('replay metadata rendering', () => {
  const meta = {
    blackName: 'Engine',
    gameUrl: '/games/example',
    modeLabel: 'Fog of War',
    plyCount: 42,
    result: 'white-wins',
    termination: 'king-captured',
    timeControl: { initial_seconds: 300, increment_seconds: 2 },
    whiteName: 'Guest',
  };

  it('renders header metadata from the extracted module', () => {
    const header = createGameHeaderStrip();
    renderGameHeader(header, meta);

    expect(header.title.textContent).toBe('Fog of War');
    expect(header.result.querySelector('.replay-game-header-result-chip')?.textContent).toBe(
      'White wins',
    );
    expect(header.result.querySelector('.replay-game-header-result-detail')?.textContent).toBe(
      'by king captured',
    );
    expect(header.meta.textContent).toContain('5:00+2');
    expect(header.meta.textContent).toContain('42 plies');
  });

  it('renders panel metadata from the extracted module', () => {
    const panel = createGameMetaPanel();
    renderGameMetaPanel(panel, meta, 'sample-id');

    expect(panel.el.hidden).toBe(false);
    expect(panel.details.textContent).toContain('Fog of War');
    expect(panel.details.textContent).toContain('White wins');
    expect(panel.details.textContent).toContain('King Captured');
    expect(panel.details.textContent).toContain('5:00+2');
    expect(panel.details.textContent).toContain('sample-id');
  });
});
