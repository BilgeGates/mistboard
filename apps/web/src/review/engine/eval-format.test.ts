import { describe, expect, it } from 'vitest';
import { advantageSymbol } from './eval-format.js';

describe('advantageSymbol', () => {
  it('reads a near-equal position as equal', () => {
    expect(advantageSymbol(0, null)).toBe('=');
    expect(advantageSymbol(40, null)).toBe('=');
    expect(advantageSymbol(-59, null)).toBe('=');
  });

  it('distinguishes slight, clear, and winning for red (positive cp)', () => {
    expect(advantageSymbol(90, null)).toBe('⩲');
    expect(advantageSymbol(250, null)).toBe('±');
    expect(advantageSymbol(600, null)).toBe('+−');
  });

  it('mirrors the bands for black (negative cp)', () => {
    expect(advantageSymbol(-90, null)).toBe('⩱');
    expect(advantageSymbol(-250, null)).toBe('∓');
    expect(advantageSymbol(-600, null)).toBe('−+');
  });

  it('treats a mate as decisive on the mating side', () => {
    expect(advantageSymbol(null, 3)).toBe('+−');
    expect(advantageSymbol(null, -2)).toBe('−+');
    // A checkmated position is encoded as a decisive ±30000cp, not a "+300".
    expect(advantageSymbol(30000, null)).toBe('+−');
    expect(advantageSymbol(-30000, null)).toBe('−+');
  });

  it('is empty when there is no score', () => {
    expect(advantageSymbol(null, null)).toBe('');
  });
});
