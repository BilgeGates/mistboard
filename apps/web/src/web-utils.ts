import type { Color, Square } from '@mistboard/game';

export const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const ranks = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export const allSquares: Square[] = ranks.flatMap((r) => files.map((f) => `${f}${r}` as Square));

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function isColor(value: unknown): value is Color {
  return value === 'white' || value === 'black';
}

export function formatClock(ms: number, showTenths = false): string {
  const bounded = Math.max(0, ms);
  const totalTenths = showTenths ? Math.ceil(bounded / 100) : Math.ceil(bounded / 1000) * 10;
  const totalSeconds = Math.floor(totalTenths / 10);
  const tenths = totalTenths % 10;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const suffix = showTenths ? `.${tenths}` : '';
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}${suffix}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}${suffix}`;
}

export function oppositeColor(color: Color): Color {
  return color === 'white' ? 'black' : 'white';
}
