import { maybeGameSpecForId } from '@mistboard/game';
import { t } from './i18n/catalog.js';

// Display word for a seat color. The Jungle family (Jungle Chess + Flip Jungle)
// brands its dark side "Blue": the pieces are navy (#28323c) and read as blue,
// not black. The INTERNAL color id stays 'black' (no data/protocol migration) —
// this is a presentation-only rename. Every other variant shows the literal
// color word. Centralized so seat rows, result lines, POV toggles, and matchup
// labels all agree on the word, which is also why translating it here reaches
// every one of those surfaces at once.
export function seatColorWord(variant: string | null | undefined, color: string): string {
  if (color === 'red') return t('setup.red');
  if (color === 'white') return t('setup.white');
  if (color === 'black') {
    const family = variant ? maybeGameSpecForId(variant)?.family : undefined;
    return family === 'jungle' ? t('setup.blue') : t('setup.black');
  }
  return color.charAt(0).toUpperCase() + color.slice(1);
}
