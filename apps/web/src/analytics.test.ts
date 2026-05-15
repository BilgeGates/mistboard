import { describe, expect, it } from 'vitest';
import { classifyTimeControl } from './analytics.js';

describe('classifyTimeControl', () => {
  it('classifies bullet (1+0)', () => {
    expect(classifyTimeControl(60_000, 0)).toBe('bullet');
  });

  it('classifies blitz (3+2)', () => {
    expect(classifyTimeControl(3 * 60_000, 2_000)).toBe('blitz');
  });

  it('classifies rapid (10+0)', () => {
    expect(classifyTimeControl(10 * 60_000, 0)).toBe('rapid');
  });

  it('classifies classical (30+0)', () => {
    expect(classifyTimeControl(30 * 60_000, 0)).toBe('classical');
  });

  it('uses increment in estimate (1+3 → blitz)', () => {
    // 1*60000 + 40*3000 = 60000 + 120000 = 180000 = 3 min → bullet boundary exact → blitz
    expect(classifyTimeControl(60_000, 3_000)).toBe('blitz');
  });
});
