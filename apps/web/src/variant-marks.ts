export type VariantMarkId = 'dark-chess' | 'draft960' | 'dark-xiangqi';

export interface VariantMarkDef {
  id: VariantMarkId;
  label: string;
  shortLabel: string;
  description: string;
  accent: string;
  body: string;
}

const darkChessBody = [
  '<path d="M29 7h6v9h9v6h-9v8h-6v-8h-9v-6h9z" fill="currentColor"/>',
  '<path d="M21 31h22l5 17H16z" fill="currentColor"/>',
  '<path d="M13 50h38v7H13z" fill="currentColor"/>',
  '<path d="M38 6h18v52H33l6-9-4-12 5-13z" fill="var(--variant-mark-bg, #fff)"/>',
  '<path d="M43 16h10M40 27h13M39 38h13M41 49h9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
].join('');

const draft960Body = [
  '<path d="M14 23h13c7 0 9 10 17 10h6" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>',
  '<path d="M14 41h13c7 0 9-10 17-10h6" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" opacity=".62"/>',
  '<path d="M47 22l8 9-8 9" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>',
  '<rect x="11" y="49" width="42" height="7" rx="2" fill="currentColor"/>',
  '<path d="M16 49v7M21 49v7M26 49v7M32 49v7M37 49v7M43 49v7M48 49v7" stroke="var(--variant-mark-bg, #fff)" stroke-width="2"/>',
  '<path d="M17 44h6v5h-6zM29 40h6v9h-6zM42 44h6v5h-6z" fill="currentColor"/>',
].join('');

const darkXiangqiBody = [
  '<path d="M16 17h32M16 47h32M24 13v38M40 13v38M21 21l22 22M43 21 21 43" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".34"/>',
  '<path d="M14 32h36" stroke="currentColor" stroke-width="6" stroke-linecap="round" opacity=".24"/>',
  '<circle cx="30" cy="32" r="19" fill="currentColor"/>',
  '<circle cx="30" cy="32" r="13" fill="var(--variant-mark-bg, #fff)"/>',
  '<text x="30" y="32" fill="currentColor" font-family="serif" font-size="20" font-weight="800" text-anchor="middle" dominant-baseline="central">將</text>',
  '<path d="M38 6h18v52H32l6-9-4-12 5-13z" fill="var(--variant-mark-bg, #fff)"/>',
  '<path d="M43 16h10M40 27h13M39 38h13M41 49h9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
].join('');

export const VARIANT_MARKS: readonly VariantMarkDef[] = [
  {
    id: 'dark-chess',
    label: 'Dark chess',
    shortLabel: 'Dark',
    description: 'A chess king partly removed by the shared hidden-information mask.',
    accent: '#1f6f5b',
    body: darkChessBody,
  },
  {
    id: 'draft960',
    label: 'Draft960',
    shortLabel: '960',
    description: 'A back-rank strip crossed by one unmistakable shuffle gesture.',
    accent: '#8a5a18',
    body: draft960Body,
  },
  {
    id: 'dark-xiangqi',
    label: 'Dark Xiangqi',
    shortLabel: 'XQ',
    description: 'A Xiangqi general disk with river and palace cues under the same mask.',
    accent: '#9f342d',
    body: darkXiangqiBody,
  },
];

export function variantMarkForId(id: VariantMarkId): VariantMarkDef {
  const mark = VARIANT_MARKS.find((candidate) => candidate.id === id);
  if (!mark) throw new Error(`Unknown variant mark: ${id}`);
  return mark;
}

export function renderVariantMark(
  id: VariantMarkId,
  opts: { className?: string; label?: string; size?: number } = {},
): string {
  const mark = variantMarkForId(id);
  const classAttr = opts.className ? ` class="${escapeAttr(opts.className)}"` : '';
  const size = opts.size ?? 64;
  const label = opts.label ?? mark.label;
  return `<svg${classAttr} width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="${escapeAttr(label)}" xmlns="http://www.w3.org/2000/svg">${mark.body}</svg>`;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
