import type { Color, PieceRole, Square } from '@mistboard/game';
import { PIECE_SVGS } from './pieces.js';
import {
  BOARD_BORDER,
  DARK_SQUARE,
  FOG_DARK_FILL,
  FOG_LIGHT_FILL,
  FOG_LINE,
  FOG_LINE_SOFT,
  FOG_TILE_SIZE,
  LIGHT_SQUARE,
} from './tokens.js';

export type PieceOnBoard = { file: number; rank: number; color: Color; role: PieceRole };

const FILE_CHARS = 'abcdefgh';
const FOG_LIGHT_PATTERN_ID = 'mb-fog-light';
const FOG_DARK_PATTERN_ID = 'mb-fog-dark';

function squareToFileRank(square: Square): { file: number; rank: number } {
  const file = FILE_CHARS.indexOf(square[0]!);
  const rank = Number(square[1]) - 1;
  return { file, rank };
}

// SVG <defs> with the two fog patterns. Callers (composers, OG renderers)
// include this once per outer <svg>. Stripe widths and stops mirror the
// CSS gradient: stripe at 0-22% of the 14 px tile (~3 px), transparent
// 22-50%, light stripe 50-72%, transparent 72-100%. patternTransform
// rotates 45° to produce the diagonal "\" lines the live game uses.
export function fogPatternDefs(): string {
  const t = FOG_TILE_SIZE;
  return [
    `<defs>`,
    `<pattern id="${FOG_LIGHT_PATTERN_ID}" width="${t}" height="${t}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`,
    `<rect width="${t}" height="${t}" fill="${FOG_LIGHT_FILL}"/>`,
    `<rect width="3" height="${t}" fill="${FOG_LINE}"/>`,
    `<rect x="7" width="3" height="${t}" fill="${FOG_LINE_SOFT}"/>`,
    `</pattern>`,
    `<pattern id="${FOG_DARK_PATTERN_ID}" width="${t}" height="${t}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`,
    `<rect width="${t}" height="${t}" fill="${FOG_DARK_FILL}"/>`,
    `<rect width="3" height="${t}" fill="${FOG_LINE_SOFT}"/>`,
    `<rect x="7" width="3" height="${t}" fill="${FOG_LINE}"/>`,
    `</pattern>`,
    `</defs>`,
  ].join('');
}

export function renderBoardSvg(
  pieces: PieceOnBoard[],
  fogSquares: Square[],
  x: number,
  y: number,
  size: number,
  orientation: Color = 'white',
): string {
  const sq = size / 8;
  const out: string[] = [];
  const fogCoords = fogSquares.map(squareToFileRank);
  // For orientation 'white': file 0 → left, rank 0 → bottom.
  // For orientation 'black': flip both so the viewer's pieces sit at the bottom.
  const fileToCol = (file: number): number => (orientation === 'white' ? file : 7 - file);
  const rankToRow = (rank: number): number => (orientation === 'white' ? 7 - rank : rank);
  out.push(`<g>`);
  for (let f = 0; f < 8; f += 1) {
    for (let r = 0; r < 8; r += 1) {
      const isLight = (f + r) % 2 === 1;
      const sx = x + fileToCol(f) * sq;
      const sy = y + rankToRow(r) * sq;
      out.push(`<rect x="${sx}" y="${sy}" width="${sq}" height="${sq}" fill="${isLight ? LIGHT_SQUARE : DARK_SQUARE}"/>`);
    }
  }
  const fogSet = new Set(fogCoords.map((s) => `${s.file},${s.rank}`));
  for (const piece of pieces) {
    if (fogSet.has(`${piece.file},${piece.rank}`)) continue;
    const svg = PIECE_SVGS[`${piece.color}:${piece.role}`];
    if (!svg) continue;
    const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const px = x + fileToCol(piece.file) * sq;
    const py = y + rankToRow(piece.rank) * sq;
    out.push(`<svg x="${px}" y="${py}" width="${sq}" height="${sq}" viewBox="0 0 45 45">${inner}</svg>`);
  }
  for (const fog of fogCoords) {
    const fx = x + fileToCol(fog.file) * sq;
    const fy = y + rankToRow(fog.rank) * sq;
    // Square color polarity mirrors chessground's .fog-hidden.white /
    // .fog-hidden.black: light squares get the lighter base + dark-then-soft
    // stripe order, dark squares get the inverse. Matches (file+rank)%2.
    const isLight = (fog.file + fog.rank) % 2 === 1;
    const patternId = isLight ? FOG_LIGHT_PATTERN_ID : FOG_DARK_PATTERN_ID;
    out.push(`<rect x="${fx}" y="${fy}" width="${sq}" height="${sq}" fill="url(#${patternId})"/>`);
  }
  out.push(`<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="none" stroke="${BOARD_BORDER}" stroke-width="2"/>`);
  out.push(`</g>`);
  return out.join('');
}
