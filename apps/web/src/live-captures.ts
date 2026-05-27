import type { Color, PlayerView } from '@mistboard/game';
import { captureRow, combinedCaptureRow } from './capture-render.js';
import { type LiveRefs, liveState } from './live-state.js';
import { currentCaptures } from './live-view.js';
import { isColor, oppositeColor } from './web-utils.js';

type CaptureRefs = Pick<LiveRefs, 'captures'>;

// Renders pieces the viewer has personally captured. For a seated player, that's
// their own color only because fog-filtered events naturally exclude opponent
// captures. EVE spectators see both sides.
export function renderCaptures(refs: CaptureRefs, view: PlayerView | null): void {
  refs.captures.replaceChildren();
  refs.captures.classList.toggle('has-captures', false);
  if (!view) return;

  const tally = currentCaptures();
  const seat = liveState.seat;

  let any = false;
  if (isColor(seat)) {
    const row = captureRow(tally[seat], oppositeColor(seat));
    if (row) {
      refs.captures.append(row);
      any = true;
    }
  } else {
    const row = combinedCaptureRow(
      (['white', 'black'] as Color[]).map((color) => ({
        capturedRoles: tally[color],
        capturedColor: oppositeColor(color),
      })),
    );
    if (row) {
      refs.captures.append(row);
      any = true;
    }
  }
  refs.captures.classList.toggle('has-captures', any);
}

export { captureRow };
