import type { Color, PieceRole } from '@mistboard/game';
import { PIECE_SVGS } from './pieces.js';
import { BOARD_BORDER, DARK_SQUARE, FOG_FILL, FOG_OPACITY, LIGHT_SQUARE } from './tokens.js';

export type PieceOnBoard = { file: number; rank: number; color: Color; role: PieceRole };
export type FogSquare = { file: number; rank: number };

export function renderBoardSvg(
  pieces: PieceOnBoard[],
  fogSquares: FogSquare[],
  x: number,
  y: number,
  size: number,
): string {
  const sq = size / 8;
  const out: string[] = [];
  out.push(`<g>`);
  for (let f = 0; f < 8; f += 1) {
    for (let r = 0; r < 8; r += 1) {
      const isLight = (f + r) % 2 === 1;
      const sx = x + f * sq;
      const sy = y + (7 - r) * sq;
      out.push(`<rect x="${sx}" y="${sy}" width="${sq}" height="${sq}" fill="${isLight ? LIGHT_SQUARE : DARK_SQUARE}"/>`);
    }
  }
  const fogSet = new Set(fogSquares.map((s) => `${s.file},${s.rank}`));
  for (const piece of pieces) {
    if (fogSet.has(`${piece.file},${piece.rank}`)) continue;
    const svg = PIECE_SVGS[`${piece.color}:${piece.role}`];
    if (!svg) continue;
    const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const px = x + piece.file * sq;
    const py = y + (7 - piece.rank) * sq;
    out.push(`<svg x="${px}" y="${py}" width="${sq}" height="${sq}" viewBox="0 0 45 45">${inner}</svg>`);
  }
  for (const fog of fogSquares) {
    const fx = x + fog.file * sq;
    const fy = y + (7 - fog.rank) * sq;
    out.push(`<rect x="${fx}" y="${fy}" width="${sq}" height="${sq}" fill="${FOG_FILL}" fill-opacity="${FOG_OPACITY}"/>`);
  }
  out.push(`<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="none" stroke="${BOARD_BORDER}" stroke-width="2"/>`);
  out.push(`</g>`);
  return out.join('');
}
