// Continuous-mist fog positioning for the Mistveil fog theme.
//
// Mistveil uses ONE 1024x1024 source image as a board-spanning continuous
// mist. The CSS sets `background-size: 800% 800%` on every fog-hidden
// square (so the source image effectively covers the whole 8x8 board),
// and each square shows a different 1/8x1/8 region of it via
// `background-position: calc(var(--fog-file) * 100% / 7) calc(var(--fog-rank)
// * 100% / 7)`. The result is that adjacent fog-hidden squares show visually
// continuous mist instead of 64 identical tiled copies.
//
// This module watches every `cg-board` element in the document, parses each
// `.fog-hidden` square's `transform: translate(Xpx, Ypx)` to derive its
// file/rank position, and sets the `--fog-file` and `--fog-rank` CSS custom
// properties on the element. Triggered re-computation handles chessground
// re-renders, POV flips, board resizes, and theme toggles.

const TRANSFORM_RE = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/;

function updateBoard(cgBoard: HTMLElement): void {
  const rect = cgBoard.getBoundingClientRect();
  if (rect.width === 0) return;
  const squareSize = rect.width / 8;
  if (squareSize === 0) return;
  const squares = cgBoard.querySelectorAll<HTMLElement>('square.fog-hidden');
  for (const sq of squares) {
    const match = TRANSFORM_RE.exec(sq.style.transform);
    if (!match) continue;
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    const file = Math.round(x / squareSize);
    const rank = Math.round(y / squareSize);
    // Clamp 0-7 in case of rounding edge cases.
    const f = Math.max(0, Math.min(7, file));
    const r = Math.max(0, Math.min(7, rank));
    sq.style.setProperty('--fog-file', String(f));
    sq.style.setProperty('--fog-rank', String(r));
  }
}

const boardObservers = new WeakMap<HTMLElement, MutationObserver>();
const boardResizeObservers = new WeakMap<HTMLElement, ResizeObserver>();

function attachToBoard(cgBoard: HTMLElement): void {
  if (boardObservers.has(cgBoard)) return;
  updateBoard(cgBoard);

  const mut = new MutationObserver(() => updateBoard(cgBoard));
  mut.observe(cgBoard, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style'],
  });
  boardObservers.set(cgBoard, mut);

  const resize = new ResizeObserver(() => updateBoard(cgBoard));
  resize.observe(cgBoard);
  boardResizeObservers.set(cgBoard, resize);
}

let docObserver: MutationObserver | null = null;

export function initFogPositioning(): void {
  if (docObserver) return;
  // Attach to any cg-board elements already mounted.
  document.querySelectorAll<HTMLElement>('cg-board').forEach(attachToBoard);
  // And keep watching for newly-mounted boards.
  docObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.tagName.toLowerCase() === 'cg-board') {
          attachToBoard(node);
        } else {
          node.querySelectorAll<HTMLElement>('cg-board').forEach(attachToBoard);
        }
      }
    }
  });
  docObserver.observe(document.body, { childList: true, subtree: true });
}
