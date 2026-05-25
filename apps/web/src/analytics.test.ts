import { DARK_CHESS_SPEC_ID, DARK_DRAFT960_SPEC_ID, gameSpecForId } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { classifyTimeControl, gameSpecAnalyticsProps } from './analytics.js';

describe('classifyTimeControl', () => {
  it('classifies bullet (1+0)', () => {
    expect(classifyTimeControl(60_000, 0)).toBe('bullet');
  });

  it('classifies blitz (3+2)', () => {
    expect(classifyTimeControl(3 * 60_000, 2_000)).toBe('blitz');
  });

  it('classifies official rapid (5+5)', () => {
    expect(classifyTimeControl(5 * 60_000, 5_000)).toBe('rapid');
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

describe('gameSpecAnalyticsProps', () => {
  it('maps standard Dark chess to structured analytics fields', () => {
    const spec = gameSpecForId(DARK_CHESS_SPEC_ID);

    expect(gameSpecAnalyticsProps({ variant: 'dark-chess' })).toEqual({
      game_spec: spec.id,
      family: spec.family,
      setup: spec.setup,
      visibility: spec.visibility,
      rating_pool: spec.ratingPoolBase,
    });
  });

  it('maps hidden Draft960 to structured analytics fields', () => {
    const spec = gameSpecForId(DARK_DRAFT960_SPEC_ID);

    expect(gameSpecAnalyticsProps({ variant: 'dark-chess', hiddenDraft960: true })).toEqual({
      game_spec: spec.id,
      family: spec.family,
      setup: spec.setup,
      visibility: spec.visibility,
      rating_pool: spec.ratingPoolBase,
    });
  });

  it('maps legacy and canonical Draft960 aliases to the canonical spec', () => {
    expect(gameSpecAnalyticsProps({ variant: 'fog-draft960' }).game_spec).toBe(
      DARK_DRAFT960_SPEC_ID,
    );
    expect(gameSpecAnalyticsProps({ variant: 'dark-draft960' }).game_spec).toBe(
      DARK_DRAFT960_SPEC_ID,
    );
  });
});
