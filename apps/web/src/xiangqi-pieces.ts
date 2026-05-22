// SVG piece sprites for the FoW Xiangqi spike.
//
// Authored in-repo so we own the licensing. Two glyph sets per the traditional
// red/black convention (the "two-sets" tradition used in Chinese chess sets):
//   Red:   帥 仕 相 傌 俥 炮 兵
//   Black: 將 士 象 馬 車 砲 卒
//
// Each sprite is a simple SVG: a circular wood-tone piece base with a colored
// border + the Chinese character centered in the piece's color. Designed to be
// styled with CSS in Step 6 (board renderer); the rendered string is a complete
// inline `<svg>` element so it can be dropped into innerHTML.

import type { XiangqiColor, XiangqiPiece, XiangqiPieceRole } from '@mistboard/game';

const CHARACTERS: Record<XiangqiColor, Record<XiangqiPieceRole, string>> = {
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

export type XiangqiPieceRenderOptions = {
  // Set to true to render the piece as "shrouded" — the FoW mode-B/C render
  // for cannon-target squares. Currently shows a ?-glyph in the piece color
  // instead of the character. The renderer can override this with CSS classes.
  shrouded?: boolean;
  // Optional CSS class to add to the root <svg>. The board renderer uses this
  // to size pieces inside their grid cells.
  className?: string;
  // Optional positioning + size — for embedding the sprite as a nested <svg>
  // inside a parent SVG. When provided, the rendered root <svg> includes
  // x/y/width/height so the piece appears at (x,y) sized `size×size` in the
  // parent's coordinate system.
  x?: number;
  y?: number;
  size?: number;
};

export function xiangqiCharacter(color: XiangqiColor, role: XiangqiPieceRole): string {
  return CHARACTERS[color][role];
}

export function renderXiangqiPiece(piece: XiangqiPiece, opts: XiangqiPieceRenderOptions = {}): string {
  const colorHex = piece.color === 'red' ? '#b91c1c' : '#1f2937';
  const baseFill = '#f3e6c4';
  const ringWidth = 2.5;
  const glyph = opts.shrouded ? '?' : xiangqiCharacter(piece.color, piece.role);
  const classAttr = opts.className ? ` class="${escapeAttr(opts.className)}"` : '';
  const posAttrs = opts.size !== undefined || opts.x !== undefined || opts.y !== undefined
    ? ` x="${opts.x ?? 0}" y="${opts.y ?? 0}" width="${opts.size ?? 100}" height="${opts.size ?? 100}"`
    : '';
  return [
    `<svg${classAttr}${posAttrs} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-label="${piece.color} ${piece.role}">`,
    // Outer ring shadow (subtle depth)
    `<circle cx="50" cy="50" r="46" fill="${baseFill}" stroke="${colorHex}" stroke-width="${ringWidth}"/>`,
    // Inner ring — traditional double-ring look
    `<circle cx="50" cy="50" r="38" fill="none" stroke="${colorHex}" stroke-width="1.5"/>`,
    // Glyph
    `<text x="50" y="50" font-family="serif" font-size="46" font-weight="700" fill="${colorHex}" text-anchor="middle" dominant-baseline="central">${glyph}</text>`,
    `</svg>`,
  ].join('');
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
