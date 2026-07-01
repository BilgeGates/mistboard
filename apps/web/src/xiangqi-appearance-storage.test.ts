import { describe, expect, it } from 'vitest';
import {
  normalizeXiangqiBoardTheme,
  normalizeXiangqiPieceSet,
  readStoredXiangqiPieceSet,
  writeStoredXiangqiPieceSet,
} from './xiangqi-appearance-storage.js';

function installLocalStorage(): Storage {
  const values = new Map<string, string>();
  const storage: Storage = {
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    get length() {
      return values.size;
    },
  };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
  return storage;
}

describe('xiangqi appearance storage normalization', () => {
  it('accepts the paper garden board theme', () => {
    expect(normalizeXiangqiBoardTheme('paper-garden')).toBe('paper-garden');
  });

  it('uses paper garden as the default board theme', () => {
    expect(normalizeXiangqiBoardTheme(null)).toBe('paper-garden');
    expect(normalizeXiangqiBoardTheme('unknown')).toBe('paper-garden');
  });

  it('migrates old animal piece-set values to Dobutsu', () => {
    expect(normalizeXiangqiPieceSet('animal')).toBe('animal-dobutsu');
    expect(normalizeXiangqiPieceSet('animal-seal')).toBe('animal-dobutsu');
    expect(normalizeXiangqiPieceSet('animal-origami')).toBe('animal-dobutsu');
  });

  it('resets existing browser piece-set storage to Dobutsu on this rollout', () => {
    const storage = installLocalStorage();
    storage.setItem('mistboard.xiangqiPieceSet', 'traditional');
    expect(readStoredXiangqiPieceSet()).toBe('animal-dobutsu');
    expect(storage.getItem('mistboard.xiangqiPieceSet')).toBe('animal-dobutsu');
    expect(storage.getItem('mistboard.xiangqiPieceSetVersion')).toBe('2');
  });

  it('keeps user changes after the Dobutsu rollout version is written', () => {
    installLocalStorage();
    writeStoredXiangqiPieceSet('traditional');
    expect(readStoredXiangqiPieceSet()).toBe('traditional');
  });
});
