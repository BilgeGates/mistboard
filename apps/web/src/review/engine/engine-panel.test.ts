import { describe, expect, it, vi } from 'vitest';
import { createEnginePanel } from './engine-panel.js';

// happy-dom is not cross-origin isolated, so cevalSupported() is false here:
// the panel mounts disabled and never touches the WASM engine. That still pins
// the arrow-feed contract on the clear path — onLines(null) fires whenever the
// output clears, starting with the initial clearOutput() at construction.

describe('createEnginePanel onLines', () => {
  it('fires null on construction (cleared output = no arrows)', () => {
    const onLines = vi.fn();
    const panel = createEnginePanel({ variant: 'xiangqi', onLines });
    expect(onLines).toHaveBeenCalledWith(null);
    expect(onLines).toHaveBeenCalledTimes(1);
    panel.dispose();
  });

  it('does not feed arrows from setPosition while the engine is unsupported/off', () => {
    const onLines = vi.fn();
    const panel = createEnginePanel({ variant: 'xiangqi', onLines });
    onLines.mockClear();
    panel.setPosition(['h3e3']);
    expect(onLines).not.toHaveBeenCalled();
    panel.dispose();
  });
});

describe('createEnginePanel arrow toggle', () => {
  const checkbox = (panel: { el: HTMLElement }): HTMLInputElement =>
    panel.el.querySelector('.engine-panel__setting-checkbox') as HTMLInputElement;

  it('renders the toggle in the settings popover, defaulting on', () => {
    const panel = createEnginePanel({ variant: 'xiangqi' });
    expect(checkbox(panel)).not.toBeNull();
    expect(checkbox(panel).checked).toBe(true);
    expect(panel.el.textContent).toContain('Best move arrows');
    panel.dispose();
  });

  it('honours an initially-off preference', () => {
    const panel = createEnginePanel({ variant: 'xiangqi', showArrows: false });
    expect(checkbox(panel).checked).toBe(false);
    panel.dispose();
  });

  it('reports a click on the checkbox', () => {
    const onShowArrowsChange = vi.fn();
    const panel = createEnginePanel({ variant: 'xiangqi', onShowArrowsChange });
    const box = checkbox(panel);
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(onShowArrowsChange).toHaveBeenCalledWith(false);
    panel.dispose();
  });

  it('setShowArrows drives the checkbox and reports, so `a` and a click agree', () => {
    const onShowArrowsChange = vi.fn();
    const panel = createEnginePanel({ variant: 'xiangqi', onShowArrowsChange });
    panel.setShowArrows(false);
    expect(checkbox(panel).checked).toBe(false);
    expect(onShowArrowsChange).toHaveBeenCalledWith(false);
    panel.dispose();
  });

  it('setShowArrows is a no-op when already in that state', () => {
    const onShowArrowsChange = vi.fn();
    const panel = createEnginePanel({ variant: 'xiangqi', onShowArrowsChange });
    panel.setShowArrows(true);
    expect(onShowArrowsChange).not.toHaveBeenCalled();
    panel.dispose();
  });
});
