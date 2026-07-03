// Flanking captured-material columns: instead of strips above and below the
// board, a variant can place captures in two narrow vertical columns beside it —
// opponent's material top-left, the near side's material bottom-right. Because
// the columns sit level with the board (not stacked over it), they add no
// vertical chrome, so the board fills more of the viewport height.
//
// The board element is placed between the two columns in a flex row. The review
// layout sizes the board via --review-stage-primary-max and budgets the columns'
// width into the fit (see FLANK_COLUMNS_PX in review-layout.ts).

export type FlankCaptures = {
  /** The flex row [left column, board, right column] — hand this to the slot. */
  host: HTMLElement;
  /** Opponent's captured material, top-aligned on the left. */
  leftColumn: HTMLElement;
  /** Near side's captured material, bottom-aligned on the right. */
  rightColumn: HTMLElement;
};

export function createFlankCaptures(boardEl: HTMLElement): FlankCaptures {
  const host = document.createElement('div');
  host.className = 'review-flank';

  const leftColumn = document.createElement('div');
  leftColumn.className = 'captures-strip review-flank__col review-flank__col--left';
  const rightColumn = document.createElement('div');
  rightColumn.className = 'captures-strip review-flank__col review-flank__col--right';

  boardEl.classList.add('review-flank__board');
  host.append(leftColumn, boardEl, rightColumn);
  return { host, leftColumn, rightColumn };
}
