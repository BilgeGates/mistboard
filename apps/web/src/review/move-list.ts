// Shared clickable move list for the review shell — lichess-style: numbered rows
// pairing the two sides, every move a button that jumps to that ply, the current
// ply highlighted and scrolled into view. Variants build a flat MoveListEntry[]
// (from their timeline) and wire it through the layout's renderMoves hook:
//
//   const moveList = createMoveList(entries, { title: 'Moves' });
//   mountReviewLayout(root, {
//     moves: moveList.el,
//     renderMoves: (ctx, jump) => moveList.update(ctx.ply, jump),
//     ...
//   });
//
// This is the linear foundation the interactive move TREE (variations) extends —
// same row/cell/highlight machinery, with branch children added later.
import './move-list.css';

export type MoveListEntry = {
  /** 1-based ply this move produced (the ply you land on by clicking it). */
  ply: number;
  /** Rendered move text (SAN / from-to / whatever the variant shows). */
  label: string;
  /** Optional per-move annotation shown after the label (eval, glyph). Filled by
   *  the engine phases; absent today. */
  suffix?: string;
  /** Optional suffix colour class hook, e.g. 'blunder' → .review-move--blunder. */
  suffixClass?: string;
};

export type MoveList = {
  el: HTMLElement;
  /** Highlight the move at `currentPly` (scroll into view) and bind `jump` to the
   *  move buttons. Call from the layout's renderMoves on every ply change. */
  update(currentPly: number, jump: (ply: number) => void): void;
};

export type MoveListOptions = {
  title?: string;
  /** Which side moves first — 'a' pairs (a,b) per row (chess/xiangqi: red/white
   *  first). Default 'a'. */
  firstMover?: 'a' | 'b';
};

export function createMoveList(entries: MoveListEntry[], opts: MoveListOptions = {}): MoveList {
  const panel = document.createElement('section');
  panel.className = 'review-move-list';
  if (opts.title) {
    const heading = document.createElement('h2');
    heading.className = 'review-move-list__title';
    heading.textContent = opts.title;
    panel.append(heading);
  }
  const list = document.createElement('ol');
  list.className = 'review-move-list__rows';
  panel.append(list);

  const cellsByPly = new Map<number, HTMLButtonElement>();
  let onJump: ((ply: number) => void) | null = null;

  if (entries.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'review-move-list__empty';
    empty.textContent = 'No moves';
    list.append(empty);
  } else {
    // Pair entries two-per-row. `firstMover` sets which column the first ply lands
    // in so an odd leading ply (rare) still aligns under the right side.
    const leadOffset = opts.firstMover === 'b' ? 1 : 0;
    let row: HTMLLIElement | null = null;
    entries.forEach((entry, index) => {
      const slot = (index + leadOffset) % 2;
      if (slot === 0) {
        row = document.createElement('li');
        row.className = 'review-move-list__row';
        const number = document.createElement('span');
        number.className = 'review-move-list__number';
        number.textContent = String(Math.floor((index + leadOffset) / 2) + 1);
        row.append(number);
        list.append(row);
      }
      row?.append(moveCell(entry));
    });
  }

  function moveCell(entry: MoveListEntry): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'review-move-list__move';
    button.append(document.createTextNode(entry.label));
    if (entry.suffix) {
      const suffix = document.createElement('span');
      suffix.className = 'review-move-list__suffix';
      if (entry.suffixClass) suffix.classList.add(`review-move--${entry.suffixClass}`);
      suffix.textContent = ` ${entry.suffix}`;
      button.append(suffix);
    }
    button.addEventListener('click', () => onJump?.(entry.ply));
    cellsByPly.set(entry.ply, button);
    return button;
  }

  function update(currentPly: number, jump: (ply: number) => void): void {
    onJump = jump;
    let current: HTMLButtonElement | undefined;
    for (const [ply, cell] of cellsByPly) {
      const isCurrent = ply === currentPly;
      cell.classList.toggle('review-move-list__move--current', isCurrent);
      if (isCurrent) current = cell;
    }
    current?.scrollIntoView({ block: 'nearest' });
  }

  return { el: panel, update };
}
