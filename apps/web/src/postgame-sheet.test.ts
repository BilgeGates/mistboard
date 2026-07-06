import { describe, expect, it } from 'vitest';
import { postgameReviewUrl, postgameSheetVariants } from './postgame-sheet.js';

describe('postgame sheet', () => {
  it('builds encoded native review URLs', () => {
    expect(postgameReviewUrl('/jungle/game', 'jgl room')).toBe('/jungle/game/jgl%20room');
    expect(postgameReviewUrl('/game', 'legacy_room')).toBe('/game/legacy_room');
  });

  it('includes the legacy dark-chess page and tenant-native postgame pages', () => {
    const variants = postgameSheetVariants();

    expect(variants.some((variant) => variant.label === 'Fog Chess')).toBe(true);
    expect(
      variants.some(
        (variant) => variant.label === 'Jungle Chess' && variant.routeBase === '/jungle/game',
      ),
    ).toBe(true);
    expect(variants.every((variant) => variant.channel.length > 0)).toBe(true);
  });
});
