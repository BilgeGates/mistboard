import { describe, expect, it, vi } from 'vitest';
import { handlePostgameReplayKeyboard } from './postgame-keyboard.js';

describe('postgame replay keyboard', () => {
  it('maps replay arrow keys and flip consistently', () => {
    const actions = {
      flip: vi.fn(),
      first: vi.fn(),
      previous: vi.fn(),
      next: vi.fn(),
      last: vi.fn(),
    };

    expect(handlePostgameReplayKeyboard(key('ArrowLeft'), actions)).toBe(true);
    expect(handlePostgameReplayKeyboard(key('ArrowRight'), actions)).toBe(true);
    expect(handlePostgameReplayKeyboard(key('ArrowUp'), actions)).toBe(true);
    expect(handlePostgameReplayKeyboard(key('ArrowDown'), actions)).toBe(true);
    expect(handlePostgameReplayKeyboard(key('f'), actions)).toBe(true);

    expect(actions.previous).toHaveBeenCalledTimes(1);
    expect(actions.next).toHaveBeenCalledTimes(1);
    expect(actions.first).toHaveBeenCalledTimes(1);
    expect(actions.last).toHaveBeenCalledTimes(1);
    expect(actions.flip).toHaveBeenCalledTimes(1);
  });

  it('leaves text entry alone', () => {
    const input = document.createElement('input');
    const actions = { previous: vi.fn() };
    const event = key('ArrowLeft');
    Object.defineProperty(event, 'target', { value: input });

    expect(handlePostgameReplayKeyboard(event, actions)).toBe(false);
    expect(actions.previous).not.toHaveBeenCalled();
  });
});

function key(value: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: value, cancelable: true });
}
