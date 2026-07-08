// Shared board resize grip (lichess-style). A small handle at the board's
// bottom-right corner drags the board size continuously between MIN_SCALE and
// the max viewport fit; the uniboard grid re-centers the columns around it.
// The scale is one global token (--uni-board-scale on <html>), consumed by the
// room and review sizing formulas alike, and persisted per browser so every
// board surface opens at the user's chosen size. Double-click resets to max.

const STORAGE_KEY = 'mistboard-board-scale';
const MIN_SCALE = 0.5;
const MAX_SCALE = 1;

function clampScale(value: number): number {
  if (!Number.isFinite(value)) return MAX_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

export function currentBoardScale(): number {
  const raw = document.documentElement.style.getPropertyValue('--uni-board-scale');
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : MAX_SCALE;
}

function applyBoardScale(scale: number): void {
  const value = clampScale(scale);
  document.documentElement.style.setProperty('--uni-board-scale', value.toFixed(3));
  try {
    localStorage.setItem(STORAGE_KEY, value.toFixed(3));
  } catch {
    // Storage unavailable (private mode); the scale still applies this session.
  }
  // The review layout's viewport fit and the eval gauge both re-measure on
  // window resize; reuse that path so a scale change re-fits everything.
  window.dispatchEvent(new Event('resize'));
}

/** Restore the persisted scale. Call once per page mount before boards render. */
export function restoreBoardScale(): void {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return;
  document.documentElement.style.setProperty('--uni-board-scale', clampScale(parsed).toFixed(3));
}

/**
 * Attach a resize grip inside `host` (which must be positioned) and size
 * against the resolved board element's rendered width. Dragging right grows
 * the board up to its max fit; left shrinks it. Returns the grip element so
 * callers can reposition it (the review stage aligns it to the primary slot's
 * corner). `board` may be a resolver when the target element changes over time
 * (fog review promotes secondaries into the primary slot).
 */
export function attachBoardResizeGrip(
  host: HTMLElement,
  board: HTMLElement | (() => HTMLElement | null),
): HTMLElement {
  const resolveBoard = (): HTMLElement | null => (typeof board === 'function' ? board() : board);
  const grip = document.createElement('button');
  grip.type = 'button';
  grip.className = 'board-resize-grip';
  grip.title = 'Drag to resize the board (double-click to reset)';
  grip.setAttribute('aria-label', 'Resize board');
  host.append(grip);

  let baseWidth = 0;
  let startX = 0;
  let startScale = 1;

  grip.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = resolveBoard()?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    startScale = currentBoardScale();
    baseWidth = rect.width / startScale;
    startX = event.clientX;
    grip.setPointerCapture(event.pointerId);
    document.documentElement.classList.add('board-resizing');
  });
  grip.addEventListener('pointermove', (event) => {
    if (baseWidth === 0 || !grip.hasPointerCapture(event.pointerId)) return;
    applyBoardScale(startScale + (event.clientX - startX) / baseWidth);
  });
  const endDrag = (event: PointerEvent): void => {
    if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId);
    baseWidth = 0;
    document.documentElement.classList.remove('board-resizing');
  };
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', endDrag);
  grip.addEventListener('dblclick', (event) => {
    event.preventDefault();
    applyBoardScale(MAX_SCALE);
  });

  return grip;
}
