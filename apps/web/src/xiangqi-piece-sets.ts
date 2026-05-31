// Selectable piece sets for the xiangqi family.
//
// Covers all seven xiangqi roles (general/advisor/elephant/horse/chariot/cannon/
// soldier) so the same sets serve both Dark Mini Xiangqi (which uses five of them)
// and full Dark Xiangqi. Four sets: two Chinese-character scripts (traditional
// default + simplified) and two "piece diagram" sets (Western Latin initials +
// stroked line-art symbols). The disc/ring is shared; only the inner mark changes.

import type { XiangqiColor, XiangqiPiece, XiangqiPieceRole } from '@mistboard/game';

export type XiangqiPieceSet = 'traditional' | 'simplified' | 'western' | 'symbols';

export const XIANGQI_PIECE_SETS: ReadonlyArray<{ id: XiangqiPieceSet; label: string }> = [
  { id: 'traditional', label: 'Traditional' },
  { id: 'simplified', label: 'Simplified' },
  { id: 'western', label: 'Western' },
  { id: 'symbols', label: 'Symbols' },
];

export const DEFAULT_XIANGQI_PIECE_SET: XiangqiPieceSet = 'traditional';

// Traditional sets distinguish red and black with different characters (the
// two-set convention used on physical Chinese chess sets).
const TRADITIONAL: Record<XiangqiColor, Record<XiangqiPieceRole, string>> = {
  red: {
    general: '帥',
    advisor: '仕',
    elephant: '相',
    horse: '傌',
    chariot: '俥',
    cannon: '炮',
    soldier: '兵',
  },
  black: {
    general: '將',
    advisor: '士',
    elephant: '象',
    horse: '馬',
    chariot: '車',
    cannon: '砲',
    soldier: '卒',
  },
};

// Simplified sets share modern characters across colors where the simplification
// merges them (馬→马, 車→车, 砲/炮→炮); general keeps its color-distinct form.
const SIMPLIFIED: Record<XiangqiColor, Record<XiangqiPieceRole, string>> = {
  red: {
    general: '帅',
    advisor: '仕',
    elephant: '相',
    horse: '马',
    chariot: '车',
    cannon: '炮',
    soldier: '兵',
  },
  black: {
    general: '将',
    advisor: '士',
    elephant: '象',
    horse: '马',
    chariot: '车',
    cannon: '炮',
    soldier: '卒',
  },
};

const WESTERN: Record<XiangqiPieceRole, string> = {
  general: 'G',
  advisor: 'A',
  elephant: 'E',
  horse: 'H',
  cannon: 'C',
  chariot: 'R',
  soldier: 'S',
};

export type XiangqiPieceRenderOptions = {
  ariaLabel?: string;
  shrouded?: boolean;
  className?: string;
  x?: number;
  y?: number;
  size?: number;
};

export function xiangqiGlyph(
  set: XiangqiPieceSet,
  color: XiangqiColor,
  role: XiangqiPieceRole,
): string {
  if (set === 'simplified') return SIMPLIFIED[color][role];
  if (set === 'western') return WESTERN[role];
  return TRADITIONAL[color][role];
}

// A compact representative mark for the settings-panel tile (the red general).
export function xiangqiPreviewGlyph(set: XiangqiPieceSet): string {
  if (set === 'symbols') return '★';
  return xiangqiGlyph(set, 'red', 'general');
}

export function renderXiangqiPieceGlyphed(
  piece: XiangqiPiece,
  set: XiangqiPieceSet,
  opts: XiangqiPieceRenderOptions = {},
): string {
  const colorHex = piece.color === 'red' ? '#b91c1c' : '#1f2937';
  const baseFill = '#f3e6c4';
  const ringWidth = 2.5;
  const ariaLabel = opts.ariaLabel ?? `${piece.color} ${piece.role}`;
  const classAttr = opts.className ? ` class="${escapeAttr(opts.className)}"` : '';
  const posAttrs =
    opts.size !== undefined || opts.x !== undefined || opts.y !== undefined
      ? ` x="${opts.x ?? 0}" y="${opts.y ?? 0}" width="${opts.size ?? 100}" height="${opts.size ?? 100}"`
      : '';
  const inner = opts.shrouded
    ? glyphMark('?', colorHex)
    : set === 'symbols'
      ? symbolMark(piece.role, colorHex)
      : glyphMark(xiangqiGlyph(set, piece.color, piece.role), colorHex);
  return [
    `<svg${classAttr}${posAttrs} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-label="${escapeAttr(ariaLabel)}">`,
    `<circle cx="50" cy="50" r="46" fill="${baseFill}" stroke="${colorHex}" stroke-width="${ringWidth}"/>`,
    `<circle cx="50" cy="50" r="38" fill="none" stroke="${colorHex}" stroke-width="1.5"/>`,
    inner,
    `</svg>`,
  ].join('');
}

function glyphMark(glyph: string, colorHex: string): string {
  return `<text x="50" y="50" font-family="serif" font-size="46" font-weight="700" fill="${colorHex}" text-anchor="middle" dominant-baseline="central">${glyph}</text>`;
}

// Stroked line-art icons (the "Symbols" diagram set). One consistent visual style:
// piece-color strokes, no fill, rounded joins. Intentionally simple v1 art.
function symbolMark(role: XiangqiPieceRole, colorHex: string): string {
  const stroke = `fill="none" stroke="${colorHex}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"`;
  switch (role) {
    case 'general':
      // Five-point star (commander).
      return `<path d="M50 26 L55.9 41.9 L72.8 42.6 L59.5 53.1 L64.1 69.4 L50 60 L35.9 69.4 L40.5 53.1 L27.2 42.6 L44.1 41.9 Z" ${stroke}/>`;
    case 'advisor':
      // Diamond (palace guard).
      return `<path d="M50 30 L68 51 L50 72 L32 51 Z" ${stroke}/>`;
    case 'elephant':
      // Diagonal cross (the elephant moves diagonally).
      return `<path d="M37 38 L63 64 M63 38 L37 64" ${stroke}/>`;
    case 'chariot':
      // Battlemented tower (rook/chariot).
      return [
        `<rect x="36" y="46" width="28" height="24" ${stroke}/>`,
        `<rect x="36" y="38" width="8" height="8" ${stroke}/>`,
        `<rect x="46" y="38" width="8" height="8" ${stroke}/>`,
        `<rect x="56" y="38" width="8" height="8" ${stroke}/>`,
      ].join('');
    case 'horse':
      // Open-bottom horseshoe.
      return `<path d="M36 66 A16 16 0 1 1 64 66" fill="none" stroke="${colorHex}" stroke-width="8" stroke-linecap="round"/>`;
    case 'cannon':
      // Bore ring with a centered shot (the cannon's muzzle).
      return `<circle cx="50" cy="51" r="16" ${stroke}/><circle cx="50" cy="51" r="5" fill="${colorHex}"/>`;
    case 'soldier':
      // Double advancing chevron.
      return `<path d="M36 60 L50 44 L64 60" ${stroke}/><path d="M36 70 L50 54 L64 70" ${stroke}/>`;
  }
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
