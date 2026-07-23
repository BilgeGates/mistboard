import { beforeEach, describe, expect, it } from 'vitest';
import { readEngineArrowsEnabled, writeEngineArrowsEnabled } from './engine-arrow-pref.js';

const KEY = 'mistboard.review.engineArrows';

// This happy-dom build ships no window.localStorage; back it with memory (same
// idiom as xiangqi-board.test.ts / puzzles.test.ts).
const storageValues = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    get length() {
      return storageValues.size;
    },
    clear: () => storageValues.clear(),
    getItem: (key: string) => storageValues.get(key) ?? null,
    key: (index: number) => [...storageValues.keys()][index] ?? null,
    removeItem: (key: string) => void storageValues.delete(key),
    setItem: (key: string, value: string) => void storageValues.set(key, value),
  } satisfies Storage,
});

describe('engine arrow preference', () => {
  beforeEach(() => {
    storageValues.clear();
  });

  it('defaults to on for a first-time analyst', () => {
    expect(readEngineArrowsEnabled()).toBe(true);
  });

  it('round-trips both states', () => {
    writeEngineArrowsEnabled(false);
    expect(readEngineArrowsEnabled()).toBe(false);
    writeEngineArrowsEnabled(true);
    expect(readEngineArrowsEnabled()).toBe(true);
  });

  it('treats an unrecognised stored value as on rather than off', () => {
    // Only the explicit 'off' sentinel disables, so a stale or hand-edited value
    // fails toward showing the arrows instead of silently hiding the engine.
    window.localStorage.setItem(KEY, 'yes-please');
    expect(readEngineArrowsEnabled()).toBe(true);
  });

  it('falls back to on when storage is unavailable (Safari private mode throws)', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    expect(readEngineArrowsEnabled()).toBe(true);
    expect(() => writeEngineArrowsEnabled(false)).not.toThrow();
    if (original) Object.defineProperty(window, 'localStorage', original);
  });
});
