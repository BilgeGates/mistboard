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
