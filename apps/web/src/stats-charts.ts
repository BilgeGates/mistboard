// Shared statistics rendering: the cumulative-activity SVG chart, the public
// stats shape, and number/date formatting. Used by the /about platform-activity
// section (pages-static.ts) and the dedicated /stats + /metrics pages
// (metrics.ts) so every stats surface draws one identical chart.

import './stats-charts.css';
import { currentLocale, LOCALE_META, type Locale } from './i18n/locale.js';

export type PublicStatsMode = 'pvp' | 'pve' | 'eve';

export type PublicStatsDay = {
  date: string;
  completedGames: number;
  cumulativeGames: number;
};

export type PublicSiteStats = {
  generatedAt: string;
  totalCompletedGames: number;
  last30dCompletedGames: number;
  publicGames: number;
  modeTotals: Record<PublicStatsMode, number>;
  variantTotals: Array<{ variant: string; count: number }>;
  dailyCompletedGames: PublicStatsDay[];
};

export function formatStatNumber(value: number, locale: Locale = currentLocale()): string {
  return new Intl.NumberFormat(LOCALE_META[locale].dateLocale).format(value);
}

// A cumulative-games area+line chart over the daily series. Returns an <svg>
// with a description passed by the caller (the about page and /stats word the
// aria-label differently). Renders nothing meaningful for an empty series — the
// caller checks `days.length` and shows its own empty state.
export function buildActivityChart(
  days: PublicStatsDay[],
  ariaLabel: string,
  locale: Locale = currentLocale(),
): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 340 150');
  svg.setAttribute('role', 'img');
  svg.setAttribute('class', 'platform-activity-svg');
  svg.setAttribute('aria-label', ariaLabel);

  const yScale = yAxisScale(days);
  const xTicks = xAxisTicks(days);
  const points = chartPoints(days, yScale.max);

  const area = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  area.setAttribute('class', 'platform-activity-area');
  area.setAttribute(
    'points',
    `${points} ${chartBounds.xMax},${chartBounds.yMax} ${chartBounds.xMin},${chartBounds.yMax}`,
  );

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('class', 'platform-activity-line');
  line.setAttribute('points', points);

  svg.append(buildYGrid(yScale, locale), buildXAxisTicks(xTicks, locale), area, line);
  return svg;
}

const chartBounds = {
  xMin: 42,
  xMax: 322,
  yMin: 20,
  yMax: 112,
};

function chartPoints(days: PublicStatsDay[], scaleMax: number): string {
  return chartCoordinates(days, scaleMax)
    .map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');
}

function chartCoordinates(
  days: PublicStatsDay[],
  scaleMax: number,
): Array<{ x: number; y: number }> {
  const max = Math.max(scaleMax, 1);
  return days.map((day, index) => {
    const x =
      days.length === 1
        ? (chartBounds.xMin + chartBounds.xMax) / 2
        : chartBounds.xMin + (index / (days.length - 1)) * (chartBounds.xMax - chartBounds.xMin);
    const y =
      chartBounds.yMax - (day.cumulativeGames / max) * (chartBounds.yMax - chartBounds.yMin);
    return { x, y };
  });
}

function buildYGrid(scale: { max: number; ticks: number[] }, locale: Locale): SVGElement {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('class', 'platform-activity-y-axis');
  for (const tick of scale.ticks) {
    const y = chartBounds.yMax - (tick / scale.max) * (chartBounds.yMax - chartBounds.yMin);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(chartBounds.xMin));
    line.setAttribute('x2', String(chartBounds.xMax));
    line.setAttribute('y1', y.toFixed(1));
    line.setAttribute('y2', y.toFixed(1));
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(chartBounds.xMin - 10));
    label.setAttribute('y', String(y + 4));
    label.textContent = formatStatNumber(tick, locale);
    group.append(line, label);
  }
  return group;
}

function buildXAxisTicks(
  ticks: Array<{ position: number; date: string }>,
  locale: Locale,
): SVGElement {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('class', 'platform-activity-x-axis');
  for (const tick of ticks) {
    const x = chartBounds.xMin + tick.position * (chartBounds.xMax - chartBounds.xMin);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x.toFixed(1));
    line.setAttribute('x2', x.toFixed(1));
    line.setAttribute('y1', String(chartBounds.yMax));
    line.setAttribute('y2', String(chartBounds.yMax + 5));
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', x.toFixed(1));
    label.setAttribute('y', String(chartBounds.yMax + 20));
    label.textContent = formatDateLabel(tick.date, locale);
    group.append(line, label);
  }
  return group;
}

function yAxisScale(days: PublicStatsDay[]): { max: number; ticks: number[] } {
  const max = chartMax(days);
  if (max <= 6) return { max, ticks: Array.from({ length: max + 1 }, (_, i) => i) };
  const step = niceTickStep(max / 3);
  const scaleMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= scaleMax; value += step) ticks.push(value);
  return { max: scaleMax, ticks };
}

function chartMax(days: PublicStatsDay[]): number {
  return Math.max(...days.map((day) => day.cumulativeGames), 1);
}

function niceTickStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function xAxisTicks(days: PublicStatsDay[]): Array<{ position: number; date: string }> {
  if (days.length === 1) return [{ position: 0.5, date: days[0]?.date ?? '' }];
  const tickCount = Math.min(days.length, 5);
  const lastIndex = days.length - 1;
  const ticks: Array<{ position: number; date: string }> = [];
  for (let i = 0; i < tickCount; i++) {
    const position = i / (tickCount - 1);
    const index = Math.round(position * lastIndex);
    const day = days[index];
    if (day) ticks.push({ position, date: day.date });
  }
  return ticks;
}

function formatDateLabel(value: string | undefined, locale: Locale = currentLocale()): string {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00.000Z`);
  return date.toLocaleDateString(LOCALE_META[locale].dateLocale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
