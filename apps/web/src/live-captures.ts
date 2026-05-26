import type { Color, PieceRole, PlayerView } from '@mistboard/game';
import { sortCaptureRoles } from './captures.js';
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
    for (const color of ['white', 'black'] as Color[]) {
      const row = captureRow(tally[color], oppositeColor(color));
      if (row) {
        refs.captures.append(row);
        any = true;
      }
    }
  }
  refs.captures.classList.toggle('has-captures', any);
}

export function captureRow(
  capturedRoles: PieceRole[],
  capturedColor: Color,
): HTMLDivElement | null {
  if (capturedRoles.length === 0) return null;
  const row = document.createElement('div');
  row.className = 'captures-row';
  for (const role of sortCaptureRoles(capturedRoles)) {
    row.append(capturePieceEl(role, capturedColor));
  }
  return row;
}

// Builds a chessground-styled piece sprite for capture rows. The outer span
// carries the cg-wrap class so chessground.cburnett.css applies its
// background-image rules; the inner <piece> element matches chessground's
// .role.color selector.
function capturePieceEl(role: PieceRole, color: Color): HTMLSpanElement {
  const wrap = document.createElement('span');
  wrap.className = `captures-piece cg-wrap`;
  wrap.setAttribute('aria-label', `${color} ${role}`);
  const piece = document.createElement('piece');
  piece.className = `${color} ${role}`;
  wrap.append(piece);
  return wrap;
}
