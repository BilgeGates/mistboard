import { describe, expect, it } from 'vitest';
import {
  normalizeXiangqiBoardTheme,
  normalizeXiangqiPieceSet,
} from './xiangqi-appearance-storage.js';

describe('xiangqi appearance storage normalization', () => {
  it('accepts the paper garden board theme', () => {
    expect(normalizeXiangqiBoardTheme('paper-garden')).toBe('paper-garden');
  });

  it('uses paper garden as the default board theme', () => {
    expect(normalizeXiangqiBoardTheme(null)).toBe('paper-garden');
    expect(normalizeXiangqiBoardTheme('unknown')).toBe('paper-garden');
  });

  it('migrates the prototype animal piece-set value to origami', () => {
    expect(normalizeXiangqiPieceSet('animal')).toBe('animal-origami');
  });
});
