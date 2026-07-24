// Shared SVG circle-marker geometry for board overlays. Variant renderers own
// square transforms and ring radii; this helper owns the common engine/user ink.

import type { SvgBoardPoint } from './svg-board-arrow.js';

export type SvgBoardMarkerStyle = {
  className?: string;
  color?: string;
  opacity?: number;
  width?: number;
};

export type SvgBoardMarkerOptions = {
  baseClassName?: string;
  color?: string;
  defaultWidth?: number;
};

const fmt = (value: number): number => Math.round(value * 10) / 10;

export function svgBoardCircleMarker(
  marker: SvgBoardMarkerStyle,
  center: SvgBoardPoint,
  radius: number,
  options: SvgBoardMarkerOptions = {},
): string {
  const baseClassName = options.baseClassName ?? 'board-marker';
  const className = marker.className ? `${baseClassName} ${marker.className}` : baseClassName;
  const color = marker.color ?? options.color ?? '#2b6cb8';
  const opacity = marker.opacity ?? 0.9;
  const width = marker.width ?? options.defaultWidth ?? 4;
  return `<circle class="${className}" cx="${fmt(center.x)}" cy="${fmt(center.y)}" r="${fmt(radius)}" fill="none" stroke="${color}" stroke-width="${fmt(width)}" opacity="${opacity}" pointer-events="none"/>`;
}
