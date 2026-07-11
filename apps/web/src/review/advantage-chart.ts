// Advantage chart for the review board's underboard slot (P3.5). A win%-per-ply
// curve over a red/black split field: above the midline Red is favoured, below it
// Black. The advantage area is filled in the leading side's colour (the curve
// clipped against each half), lichess-style. Click anywhere to jump to that ply;
// a cursor marks the current ply. Win% (bounded, mate-aware) is used instead of
// raw cp so mates don't spike the axis.
import { winPercent } from '@mistboard/game';
import './advantage-chart.css';
import type { PlyEval } from './game-analysis.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW_W = 300;
const VIEW_H = 100;

/** Unique clip-path ids per mounted chart (re-mounts must not collide). */
let chartInstance = 0;

export interface AdvantageChart {
  el: HTMLElement;
  setPly(ply: number): void;
}

function svg(tag: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

export function createAdvantageChart(
  evals: PlyEval[],
  opts: { onJump: (ply: number) => void },
): AdvantageChart {
  const maxPly = Math.max(1, evals.length - 1);
  const xOf = (ply: number) => (ply / maxPly) * VIEW_W;
  const yOf = (e: PlyEval) => (1 - winPercent(e.cp, e.mate) / 100) * VIEW_H;

  const el = document.createElement('section');
  el.className = 'advantage-chart';

  const chart = svg('svg', {
    viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
    preserveAspectRatio: 'none',
    class: 'advantage-chart__svg',
  });

  // One clip rect per half: the SAME advantage polygon renders twice, clipped to
  // the red (top) and black (bottom) halves, so each side's advantage fills in
  // that side's colour.
  chartInstance += 1;
  const redClipId = `advantage-chart-red-${chartInstance}`;
  const blackClipId = `advantage-chart-black-${chartInstance}`;
  const defs = svg('defs', {});
  const redClip = svg('clipPath', { id: redClipId });
  redClip.append(svg('rect', { x: '0', y: '0', width: `${VIEW_W}`, height: `${VIEW_H / 2}` }));
  const blackClip = svg('clipPath', { id: blackClipId });
  blackClip.append(
    svg('rect', { x: '0', y: `${VIEW_H / 2}`, width: `${VIEW_W}`, height: `${VIEW_H / 2}` }),
  );
  defs.append(redClip, blackClip);

  chart.append(
    defs,
    svg('rect', {
      x: '0',
      y: '0',
      width: `${VIEW_W}`,
      height: `${VIEW_H / 2}`,
      class: 'advantage-chart__zone advantage-chart__zone--red',
    }),
    svg('rect', {
      x: '0',
      y: `${VIEW_H / 2}`,
      width: `${VIEW_W}`,
      height: `${VIEW_H / 2}`,
      class: 'advantage-chart__zone advantage-chart__zone--black',
    }),
    svg('line', {
      x1: '0',
      y1: `${VIEW_H / 2}`,
      x2: `${VIEW_W}`,
      y2: `${VIEW_H / 2}`,
      class: 'advantage-chart__mid',
    }),
  );

  // Filled area between the curve and the midline (once per colour half), then
  // the curve on top.
  const points = evals.map((e) => `${xOf(e.ply).toFixed(1)},${yOf(e).toFixed(1)}`);
  const areaPoints = `0,${VIEW_H / 2} ${points.join(' ')} ${VIEW_W},${VIEW_H / 2}`;
  const areaRed = svg('polygon', {
    points: areaPoints,
    'clip-path': `url(#${redClipId})`,
    class: 'advantage-chart__area advantage-chart__area--red',
  });
  const areaBlack = svg('polygon', {
    points: areaPoints,
    'clip-path': `url(#${blackClipId})`,
    class: 'advantage-chart__area advantage-chart__area--black',
  });
  const line = svg('polyline', { points: points.join(' '), class: 'advantage-chart__line' });
  const cursor = svg('line', {
    x1: '0',
    y1: '0',
    x2: '0',
    y2: `${VIEW_H}`,
    class: 'advantage-chart__cursor',
  });
  chart.append(areaRed, areaBlack, line, cursor);
  el.append(chart);

  el.addEventListener('click', (event) => {
    const box = chart.getBoundingClientRect();
    if (box.width === 0) return;
    const frac = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
    opts.onJump(Math.round(frac * maxPly));
  });

  function setPly(ply: number): void {
    const x = `${xOf(Math.max(0, Math.min(maxPly, ply)))}`;
    cursor.setAttribute('x1', x);
    cursor.setAttribute('x2', x);
  }

  return { el, setPly };
}
