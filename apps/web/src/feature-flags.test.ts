import { describe, expect, it } from 'vitest';
import { darkXiangqiEnabled } from './feature-flags.js';

describe('client feature flags', () => {
  it('keeps Dark Xiangqi disabled by default', () => {
    expect(darkXiangqiEnabled()).toBe(false);
  });
});
