export type CompositionLayout = 'single' | 'pair' | 'triptych';

export function boardsInLayout(layout: CompositionLayout): 1 | 2 | 3 {
  if (layout === 'single') return 1;
  if (layout === 'pair') return 2;
  return 3;
}

// X-coordinates for each board's top-left corner, given a centered layout
// on a canvas of `canvasWidth`. Boards are equal size and separated by `gap`.
export function layoutPlacements(
  layout: CompositionLayout,
  canvasWidth: number,
  boardSize: number,
  gap: number,
): number[] {
  const count = boardsInLayout(layout);
  const totalWidth = count * boardSize + (count - 1) * gap;
  const startX = Math.round((canvasWidth - totalWidth) / 2);
  return Array.from({ length: count }, (_, i) => startX + i * (boardSize + gap));
}
