import type { JungleFlipColor } from '@mistboard/game';
import { flipSeatInk } from './flip-seat-ink.js';

// Flip Jungle seats are first/second mover ('red' seat = first); the ink binds on the
// opening flip and travels as the view's `firstColor`. The recorded result and the
// timeline's `color` are keyed by SEAT, so the raw token shows "Red" even when the
// first-mover seat flipped black. Translate seat -> bound ink for every player-facing
// label, falling back to move order before the flip binds. Import-light on purpose so
// result-only surfaces can reuse it without pulling in board renderers. The seat -> ink
// map itself lives in flip-seat-ink.ts, shared with Banqi and the /watch seat rows.

export function jungleFlipSeatInk(
  seat: JungleFlipColor,
  firstColor: JungleFlipColor | null,
): JungleFlipColor | null {
  return flipSeatInk(seat, firstColor);
}

export function jungleFlipSeatInkLabel(
  seat: JungleFlipColor,
  firstColor: JungleFlipColor | null,
): string {
  const ink = jungleFlipSeatInk(seat, firstColor);
  if (ink === null) return seat === 'red' ? 'First' : 'Second';
  // The Jungle family brands its navy ink "Blue" (internal id stays 'black').
  return ink === 'red' ? 'Red' : 'Blue';
}

export function jungleFlipResultLabel(result: string, firstColor: JungleFlipColor | null): string {
  if (result === 'red-wins') return `${jungleFlipSeatInkLabel('red', firstColor)} wins`;
  if (result === 'black-wins') return `${jungleFlipSeatInkLabel('black', firstColor)} wins`;
  if (result === 'draw') return 'Draw';
  return result
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
