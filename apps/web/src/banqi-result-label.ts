import type { BanqiColor } from '@mistboard/game';
import { flipSeatInk } from './flip-seat-ink.js';

// Banqi seats are first/second mover ('red' seat = first); the ink binds on the opening flip
// and travels as the game state's `firstColor`. The recorded result and the timeline's `color`
// are keyed by SEAT, so the raw token shows "Red" even when the first-mover seat flipped black.
// Translate seat -> bound ink for every player-facing label, falling back to move order before
// the flip binds. This module is import-light on purpose so result-only surfaces (the watch
// queue) can reuse it without pulling in board renderers. The seat -> ink map itself lives in
// flip-seat-ink.ts, shared with Flip Jungle and the /watch seat rows.

export function seatInkLabel(seat: BanqiColor, firstColor: BanqiColor | null): string {
  const ink = flipSeatInk(seat, firstColor);
  if (ink === null) return seat === 'red' ? 'First' : 'Second';
  return ink === 'red' ? 'Red' : 'Black';
}

export function banqiResultLabel(result: string, firstColor: BanqiColor | null): string {
  if (result === 'red-wins') return `${seatInkLabel('red', firstColor)} wins`;
  if (result === 'black-wins') return `${seatInkLabel('black', firstColor)} wins`;
  if (result === 'draw') return 'Draw';
  return result
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
