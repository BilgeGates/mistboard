// Advantage chart for the review board's underboard slot (P3.5). A win%-per-ply
// curve over a red/black split field: above the midline Red is favoured, below it
// Black. Click anywhere to jump to that ply; a cursor marks the current ply. Win%
// (bounded, mate-aware) is used instead of raw cp so mates don't spike the axis.
import { winPercent } from '@mistboard/game';
import './advantage-chart.css';
import type { PlyEval } from './game-analysis.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW_W = 300;
const VIEW_H = 76;

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
  const head = document.createElement('p');
  head.className = 'advantage-chart__title';
  head.textContent = 'Computer analysis';
  el.append(head);

  const chart = svg('svg', {
    viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
    preserveAspectRatio: 'none',
    class: 'advantage-chart__svg',
  });
  chart.append(
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

  // Filled area between the curve and the midline, then the curve on top.
  const points = evals.map((e) => `${xOf(e.ply).toFixed(1)},${yOf(e).toFixed(1)}`);
  const area = svg('polygon', {
    points: `0,${VIEW_H / 2} ${points.join(' ')} ${VIEW_W},${VIEW_H / 2}`,
    class: 'advantage-chart__area',
  });
  const line = svg('polyline', { points: points.join(' '), class: 'advantage-chart__line' });
  const cursor = svg('line', {
    x1: '0',
    y1: '0',
    x2: '0',
    y2: `${VIEW_H}`,
    class: 'advantage-chart__cursor',
  });
  chart.append(area, line, cursor);
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
