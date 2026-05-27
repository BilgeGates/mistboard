import type { Color, PieceRole } from '@mistboard/game';
import { sortCaptureRoles } from './captures.js';

export type CaptureRowInput = {
  capturedColor: Color;
  capturedRoles: PieceRole[];
};

export function captureRow(
  capturedRoles: PieceRole[],
  capturedColor: Color,
): HTMLDivElement | null {
  return combinedCaptureRow([{ capturedRoles, capturedColor }]);
}

export function combinedCaptureRow(inputs: CaptureRowInput[]): HTMLDivElement | null {
  const row = document.createElement('div');
  row.className = 'captures-row';
  for (const input of inputs) {
    appendCaptureGroups(row, input.capturedRoles, input.capturedColor);
  }
  return row.children.length > 0 ? row : null;
}

function appendCaptureGroups(
  row: HTMLDivElement,
  capturedRoles: PieceRole[],
  capturedColor: Color,
): void {
  for (const group of groupedCaptureRoles(capturedRoles)) {
    row.append(capturePieceEl(group.role, capturedColor, group.count));
  }
}

function groupedCaptureRoles(
  capturedRoles: PieceRole[],
): Array<{ role: PieceRole; count: number }> {
  const groups: Array<{ role: PieceRole; count: number }> = [];
  for (const role of sortCaptureRoles(capturedRoles)) {
    const last = groups.at(-1);
    if (last?.role === role) {
      last.count += 1;
    } else {
      groups.push({ role, count: 1 });
    }
  }
  return groups;
}

// Builds a chessground-styled piece sprite for capture rows. The outer span
// carries the cg-wrap class so chessground.cburnett.css applies its
// background-image rules; the inner <piece> element matches chessground's
// .role.color selector.
function capturePieceEl(role: PieceRole, color: Color, count: number): HTMLSpanElement {
  const wrap = document.createElement('span');
  wrap.className = `captures-piece cg-wrap${count > 1 ? ' has-count' : ''}`;
  wrap.setAttribute('aria-label', count > 1 ? `${color} ${role} x${count}` : `${color} ${role}`);
  const piece = document.createElement('piece');
  piece.className = `${color} ${role}`;
  wrap.append(piece);
  if (count > 1) {
    const badge = document.createElement('span');
    badge.className = 'captures-count-badge';
    badge.textContent = String(count);
    badge.setAttribute('aria-hidden', 'true');
    wrap.append(badge);
  }
  return wrap;
}
