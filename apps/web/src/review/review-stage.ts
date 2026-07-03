// Shared review review-stage: arranges a variant's review boards as ONE dominant
// primary board with any secondary boards in a smaller row beneath it. This is
// the platform replacement for the fog "3 co-equal boards" triptych AND the
// single-board case — a 1-board variant passes a single primary slot and renders
// pixel-identically to today.
//
// Secondary boards are click-to-promote: clicking one swaps it into the primary
// position (and demotes the old primary), so a reviewer can enlarge whichever
// seat's view they want. onPromote fires after the swap so the surface can
// re-sync board contents if needed.
//
// Renderer-agnostic: a slot's element is a self-contained board host (label +
// board element) whose board may be a mounted chessground Api or an SVG
// innerHTML host. Sizing is pure CSS (review-stage.css) — the primary slot takes
// the variant's normal single-board footprint, secondaries a fraction of it.

import './review-stage.css';

export type BoardStageTier = 'primary' | 'secondary';

export type BoardStageSlot = {
  /** Stable identity for this board (e.g. 'truth' | 'white' | 'black'). */
  key: string;
  /** A self-contained board host (e.g. a label + board element). Placed as-is. */
  el: HTMLElement;
  /** Initial tier. Exactly one slot should start as 'primary'. */
  tier: BoardStageTier;
};

export type BoardStageOptions = {
  /** Fires after a click promotes a secondary board to primary. */
  onPromote?(key: string): void;
};

export type BoardStageHandle = {
  el: HTMLElement;
  /** Programmatically promote a board to primary. */
  promote(key: string): void;
  /** The key currently shown as the primary (dominant) board. */
  primaryKey(): string;
};

export function createBoardStage(
  slots: readonly BoardStageSlot[],
  options: BoardStageOptions = {},
): BoardStageHandle {
  const stage = document.createElement('div');
  stage.className = 'review-stage';

  const primaryRow = document.createElement('div');
  primaryRow.className = 'review-stage__primary';
  const secondaryRow = document.createElement('div');
  secondaryRow.className = 'review-stage__secondaries';
  stage.append(primaryRow, secondaryRow);

  // Preserve the caller's order for a stable secondary row; the primary is
  // whichever key is currently promoted.
  const order = slots.map((slot) => slot.key);
  const byKey = new Map(slots.map((slot) => [slot.key, slot.el]));
  let currentPrimary = slots.find((slot) => slot.tier === 'primary')?.key ?? slots[0]?.key ?? '';

  for (const slot of slots) {
    slot.el.addEventListener('click', () => promote(slot.key));
  }

  function layout(): void {
    const canPromote = order.length > 1;
    for (const key of order) {
      const el = byKey.get(key);
      if (!el) continue;
      const isPrimary = key === currentPrimary;
      el.classList.toggle('review-stage__slot', true);
      el.classList.toggle('review-stage__slot--primary', isPrimary);
      el.classList.toggle('review-stage__slot--secondary', !isPrimary);
      // Only secondaries are click-to-promote targets.
      el.classList.toggle('review-stage__slot--promotable', canPromote && !isPrimary);
      (isPrimary ? primaryRow : secondaryRow).append(el);
    }
    secondaryRow.hidden = secondaryRow.childElementCount === 0;
  }

  function promote(key: string): void {
    if (key === currentPrimary || !byKey.has(key)) return;
    currentPrimary = key;
    layout();
    options.onPromote?.(key);
  }

  layout();
  return { el: stage, promote, primaryKey: () => currentPrimary };
}
