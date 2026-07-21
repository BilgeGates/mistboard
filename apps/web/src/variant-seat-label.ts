import { maybeGameSpecForId } from '@mistboard/game';

// Display word for a seat color. The Jungle family (Jungle Chess + Flip Jungle)
// brands its dark side "Blue": the pieces are navy (#28323c) and read as blue,
// not black. The INTERNAL color id stays 'black' (no data/protocol migration) —
// this is a presentation-only rename. Every other variant shows the literal
// color word. Centralized so seat rows, result lines, POV toggles, and matchup
// labels all agree on the word.
export function seatColorWord(variant: string | null | undefined, color: string): string {
  if (color === 'red') return 'Red';
  if (color === 'white') return 'White';
  if (color === 'black') {
    const family = variant ? maybeGameSpecForId(variant)?.family : undefined;
    return family === 'jungle' ? 'Blue' : 'Black';
  }
  return color.charAt(0).toUpperCase() + color.slice(1);
}
