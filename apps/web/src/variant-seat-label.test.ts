import { describe, expect, it } from 'vitest';
import { seatColorWord } from './variant-seat-label.js';

describe('seatColorWord', () => {
  it('brands the Jungle family dark seat "Blue", keeps every other variant literal', () => {
    // Jungle Chess + Flip Jungle: the navy side is "Blue".
    expect(seatColorWord('jungle', 'black')).toBe('Blue');
    expect(seatColorWord('jungle-flip', 'black')).toBe('Blue');
    // The first seat is Red in the Jungle family.
    expect(seatColorWord('jungle', 'red')).toBe('Red');
    // Non-jungle variants keep "Black".
    expect(seatColorWord('xiangqi', 'black')).toBe('Black');
    expect(seatColorWord('dark-chess', 'black')).toBe('Black');
    expect(seatColorWord('crossroads-chess', 'white')).toBe('White');
  });

  it('is safe on a missing/unknown variant and unknown color ids', () => {
    // No variant → cannot be jungle, so 'black' stays "Black".
    expect(seatColorWord(undefined, 'black')).toBe('Black');
    expect(seatColorWord(null, 'black')).toBe('Black');
    expect(seatColorWord('not-a-variant', 'black')).toBe('Black');
    // Unknown color id title-cases rather than throwing.
    expect(seatColorWord('jungle', 'green')).toBe('Green');
  });
});
