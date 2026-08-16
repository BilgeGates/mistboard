// Shared SVG arrow geometry for board overlays. Variant renderers own the square
// transform; this helper owns the visual anatomy once two board-space points are
// known. Keeping those concerns separate lets every SVG board expose the same
// engine/drawing overlay without pretending their grids share coordinates.

export type SvgBoardPoint = { x: number; y: number };

export type SvgBoardArrowStyle = {
  /** Extra class supplied by the caller, for example `xq-arrow--pv1`. */
  className?: string;
  color?: string;
  dashed?: boolean;
  opacity?: number;
  width?: number;
};

export type SvgBoardArrowOptions = {
  /** Base class shared by every arrow on this board family. */
  baseClassName?: string;
  color?: string;
  defaultWidth?: number;
  /** Distance from the origin point before the shaft begins. */
  startInset?: number;
  /** Distance before the destination point where the tip lands. */
  tipInset?: number;
};

const DEFAULT_COLOR = '#2b6cb8';
const DEFAULT_WIDTH = 9;
const DEFAULT_START_INSET = 12;
const DEFAULT_TIP_INSET = 0;
const HEAD_LENGTH_RATIO = 20 / 9;
const HEAD_HALF_WIDTH_RATIO = 11 / 9;

const fmt = (value: number): number => Math.round(value * 10) / 10;

/** Render one round-capped shaft plus a triangular head between board-space
 * points. Width carries engine-candidate strength, so the head scales with it. */
export function svgBoardArrow(
  arrow: SvgBoardArrowStyle,
  from: SvgBoardPoint,
  to: SvgBoardPoint,
  options: SvgBoardArrowOptions = {},
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return '';

  const ux = dx / dist;
  const uy = dy / dist;
  const startInset = options.startInset ?? DEFAULT_START_INSET;
  const tipInset = options.tipInset ?? DEFAULT_TIP_INSET;
  const startX = from.x + ux * startInset;
  const startY = from.y + uy * startInset;
  const tipX = to.x - ux * tipInset;
  const tipY = to.y - uy * tipInset;
  const width = arrow.width ?? options.defaultWidth ?? DEFAULT_WIDTH;

  // A wide head on a one-step move can be longer than the span between the two
  // insets. Clamp it so the shaft never flips backwards.
  const span = dist - startInset - tipInset;
  const headLength = Math.min(width * HEAD_LENGTH_RATIO, Math.max(span, 0));
  const headHalfWidth = width * HEAD_HALF_WIDTH_RATIO;
  const baseX = tipX - ux * headLength;
  const baseY = tipY - uy * headLength;
  const px = -uy;
  const py = ux;
  const opacity = arrow.opacity ?? 0.9;
  const color = arrow.color ?? options.color ?? DEFAULT_COLOR;
  const baseClassName = options.baseClassName ?? 'board-arrow';
  const className = arrow.className ? `${baseClassName} ${arrow.className}` : baseClassName;
  // Long dashes, not dots: with a round linecap a 10/8 pattern reads as a
  // dotted line and the arrow stops looking like a line of force.
  const dash = arrow.dashed ? ' stroke-dasharray="26 14"' : '';
  const head =
    `${fmt(tipX)},${fmt(tipY)} ` +
    `${fmt(baseX + px * headHalfWidth)},${fmt(baseY + py * headHalfWidth)} ` +
    `${fmt(baseX - px * headHalfWidth)},${fmt(baseY - py * headHalfWidth)}`;

  return (
    `<g class="${className}" opacity="${opacity}" fill="${color}" stroke="${color}" pointer-events="none">` +
    `<line x1="${fmt(startX)}" y1="${fmt(startY)}" x2="${fmt(baseX)}" y2="${fmt(baseY)}" stroke-width="${fmt(width)}" stroke-linecap="round"${dash}/>` +
    `<polygon points="${head}" stroke="none"/>` +
    `</g>`
  );
}
