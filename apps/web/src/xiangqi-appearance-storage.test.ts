import { describe, expect, it } from 'vitest';
import {
  normalizeXiangqiBoardTheme,
  normalizeXiangqiPieceSet,
  readStoredXiangqiBoardTheme,
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
  it('uses tournament as the default board theme and paper garden migration target', () => {
    expect(normalizeXiangqiBoardTheme(null)).toBe('tournament');
    expect(normalizeXiangqiBoardTheme('unknown')).toBe('tournament');
    expect(normalizeXiangqiBoardTheme('paper-garden')).toBe('tournament');
  });

  it('migrates stored paper garden board theme to tournament', () => {
    const storage = installLocalStorage();
    storage.setItem('mistboard.xiangqiBoardTheme', 'paper-garden');
    storage.setItem('mistboard.xiangqiBoardThemeVersion', '2');
    expect(readStoredXiangqiBoardTheme()).toBe('tournament');
    expect(storage.getItem('mistboard.xiangqiBoardTheme')).toBe('tournament');
    expect(storage.getItem('mistboard.xiangqiBoardThemeVersion')).toBe('3');
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
