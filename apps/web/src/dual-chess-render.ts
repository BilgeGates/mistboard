// Live, fog-aware board renderer for Dual Chess (中西象棋).
//
// Driven by the engine's DualChessPlayerView (packages/game/variants-dual-chess),
// not a FEN string. It is orientation-aware (Red sees the board flipped) and
// fog-aware (hidden squares are fogged; shrouded enemies render as color-only
// silhouettes). The palette, geometry and piece treatment are kept identical to
// the article diagram (apps/web/src/dual-chess-diagram.ts) so the live board and
// the rules article look the same; the two can be unified once both are on main.

import { PIECE_SVGS } from '@mistboard/board-render';
import type {
  DualChessColor,
  DualChessPieceRole,
  DualChessPlayerView,
  DualChessSquare,
} from '@mistboard/game';

const FILES = 6;
const RANKS = 8;
const HALF = RANKS / 2;
const CELL = 50;
const STRIP = 11; // river strip between ranks 4 and 5
const BOARD_W = FILES * CELL; // 300
const BOARD_H = RANKS * CELL + STRIP; // 411
const FRAME_PAD = 9;
const FRAME_W = BOARD_W + FRAME_PAD * 2;
const FRAME_H = BOARD_H + FRAME_PAD * 2;
const PAD = 6;

// meerkat palette (matches dual-chess-diagram.ts)
const WOOD_L = '#f0d9b5';
const WOOD_D = '#b58863';
const FRAME_BG = '#5b4636';
const FRAME_INNER = '#6e5743';
const BOARD_EDGE = '#3a2c20';
const RED = '#b5322b';
const INK_W = '#28323c';
const INK_R = '#1a1a1a';
const CO = 'rgba(60,45,30,0.55)';
const LASTMOVE = 'rgba(255,205,80,0.45)';

const CHESS_ROLES = new Set<DualChessPieceRole>(['king', 'queen', 'bishop', 'knight', 'pawn']);
const DISK_GLYPH: Partial<Record<DualChessPieceRole, { white: string; red: string }>> = {
  chariot: { white: '車', red: '俥' },
  horse: { white: '馬', red: '傌' },
  cannon: { white: '砲', red: '炮' },
  soldier: { white: '卒', red: '兵' },
};

export type DualChessRenderOptions = {
  // Whose side is at the bottom. Defaults to the view's own perspective.
  perspective?: DualChessColor;
  // Draw the fog overlay over non-visible squares. Pass false for the
  // perfect-information (open) view. Defaults to true.
  showFog?: boolean;
  lastMove?: { from: DualChessSquare; to: DualChessSquare } | null;
};

let boardCounter = 0;

export function renderDualChessBoardSvg(
  view: DualChessPlayerView,
  options: DualChessRenderOptions = {},
): string {
  const perspective = options.perspective ?? view.perspective;
  const showFog = options.showFog ?? true;
  boardCounter += 1;
  const id = `dual-live-${boardCounter}`;

  const visible = new Set<DualChessSquare>(view.visibleSquares);
  const clipped = [
    gridLayer(perspective),
    riverLayer(),
    lastMoveLayer(options.lastMove ?? view.lastMove ?? null, perspective),
    coordsLayer(perspective),
    pieceLayer(view, perspective, id),
    showFog ? fogLayer(visible, perspective) : '',
  ].join('');

  return [
    `<svg class="dual-live-svg" viewBox="0 0 ${FRAME_W + PAD * 2} ${FRAME_H + PAD * 2}" role="img" xmlns="http://www.w3.org/2000/svg">`,
    `<defs>${defs(id)}</defs>`,
    `<g transform="translate(${PAD} ${PAD})">`,
    `<rect x="0" y="0" width="${FRAME_W}" height="${FRAME_H}" rx="14" fill="${FRAME_BG}"/>`,
    `<rect x="1.5" y="1.5" width="${FRAME_W - 3}" height="${FRAME_H - 3}" rx="12.5" fill="none" stroke="${FRAME_INNER}" stroke-width="2"/>`,
    `<g transform="translate(${FRAME_PAD} ${FRAME_PAD})">`,
    `<g clip-path="url(#${id}-clip)">${clipped}</g>`,
    `<rect x="0" y="0" width="${BOARD_W}" height="${BOARD_H}" rx="5" fill="none" stroke="${BOARD_EDGE}" stroke-width="1.5"/>`,
    `</g></g></svg>`,
  ].join('');
}

export const DUAL_CHESS_BOARD_PX = CELL;

// ── Geometry (orientation-aware) ────────────────────────────────────────────

// Display row/col with the river always in the geometric middle. White sees
// rank 8 at the top and file a on the left; Red sees a 180-degree rotation.
function displayRowCol(
  file: number,
  rank: number,
  perspective: DualChessColor,
): {
  row: number;
  col: number;
} {
  if (perspective === 'white') return { row: RANKS - rank, col: file };
  return { row: rank - 1, col: FILES - 1 - file };
}

function coordOf(square: DualChessSquare): { file: number; rank: number } {
  return { file: square.charCodeAt(0) - 'a'.charCodeAt(0), rank: Number(square.slice(1)) };
}

function cellTopLeft(
  file: number,
  rank: number,
  perspective: DualChessColor,
): {
  x: number;
  y: number;
} {
  const { row, col } = displayRowCol(file, rank, perspective);
  return { x: col * CELL, y: row * CELL + (row >= HALF ? STRIP : 0) };
}

// ── Layers ──────────────────────────────────────────────────────────────────

function defs(id: string): string {
  return [
    `<clipPath id="${id}-clip"><rect x="0" y="0" width="${BOARD_W}" height="${BOARD_H}" rx="5"/></clipPath>`,
    `<linearGradient id="${id}-river" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#86c0ea"/><stop offset="1" stop-color="#3f86c4"/></linearGradient>`,
    `<radialGradient id="${id}-ivory" cx="0.38" cy="0.32" r="0.8"><stop offset="0" stop-color="#fdf6e4"/><stop offset="1" stop-color="#f3e6c4"/></radialGradient>`,
    `<radialGradient id="${id}-red" cx="0.38" cy="0.3" r="0.85"><stop offset="0" stop-color="#c1453b"/><stop offset="1" stop-color="#a4291f"/></radialGradient>`,
  ].join('');
}

function gridLayer(perspective: DualChessColor): string {
  const parts: string[] = [];
  for (let file = 0; file < FILES; file += 1) {
    for (let rank = 1; rank <= RANKS; rank += 1) {
      const { x, y } = cellTopLeft(file, rank, perspective);
      const fill = (file + rank) % 2 === 0 ? WOOD_D : WOOD_L;
      parts.push(`<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="${fill}"/>`);
    }
  }
  return parts.join('');
}

function riverLayer(): string {
  const y = HALF * CELL;
  // The river sits at the geometric middle for both orientations.
  return `<rect x="0" y="${y}" width="${BOARD_W}" height="${STRIP}" fill="#5aa0d6"/><rect x="0" y="${y}" width="${BOARD_W}" height="1" fill="rgba(255,255,255,0.4)"/>`;
}

function coordsLayer(perspective: DualChessColor): string {
  const parts: string[] = [];
  for (let file = 0; file < FILES; file += 1) {
    const bottomRank = perspective === 'white' ? 1 : RANKS;
    const { x, y } = cellTopLeft(file, bottomRank, perspective);
    const letter = String.fromCharCode('a'.charCodeAt(0) + file);
    parts.push(
      `<text x="${x + CELL - 4}" y="${y + CELL - 4}" font-size="9" fill="${CO}" text-anchor="end">${letter}</text>`,
    );
  }
  for (let rank = 1; rank <= RANKS; rank += 1) {
    const leftFile = perspective === 'white' ? 0 : FILES - 1;
    const { x, y } = cellTopLeft(leftFile, rank, perspective);
    parts.push(`<text x="${x + 3}" y="${y + 11}" font-size="9" fill="${CO}">${rank}</text>`);
  }
  return parts.join('');
}

function lastMoveLayer(
  move: { from: DualChessSquare; to: DualChessSquare } | null,
  perspective: DualChessColor,
): string {
  if (!move) return '';
  return [move.from, move.to]
    .map((sq) => {
      const { file, rank } = coordOf(sq);
      const { x, y } = cellTopLeft(file, rank, perspective);
      return `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="${LASTMOVE}"/>`;
    })
    .join('');
}

function pieceLayer(view: DualChessPlayerView, perspective: DualChessColor, id: string): string {
  const parts: string[] = [];
  for (const [square, entry] of Object.entries(view.board)) {
    if (!entry) continue;
    const { file, rank } = coordOf(square as DualChessSquare);
    const { x, y } = cellTopLeft(file, rank, perspective);
    if (entry.shrouded) {
      parts.push(silhouette(entry.color, x, y, id));
      continue;
    }
    const piece = entry.piece;
    if (CHESS_ROLES.has(piece.role)) {
      const size = CELL * 0.86;
      const inset = (CELL - size) / 2;
      parts.push(chessPiece(piece.role, piece.color, x + inset, y + inset, size));
    } else if (DISK_GLYPH[piece.role]) {
      const size = CELL * 0.82;
      const inset = (CELL - size) / 2;
      parts.push(diskPiece(piece.role, piece.color, x + inset, y + inset, size, id));
    }
  }
  return parts.join('');
}

function chessPiece(
  role: DualChessPieceRole,
  color: DualChessColor,
  x: number,
  y: number,
  size: number,
): string {
  let raw = PIECE_SVGS[`white:${role}`];
  if (!raw) return '';
  if (color === 'red') {
    raw = raw
      .replace(/#fff(?![0-9a-fA-F])/g, RED)
      .replace(/#ffffff\b/gi, RED)
      .replace(/#fbfbf9/gi, RED);
  }
  return raw.replace(
    /^<svg[^>]*>/,
    `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">`,
  );
}

function diskPiece(
  role: DualChessPieceRole,
  color: DualChessColor,
  x: number,
  y: number,
  size: number,
  id: string,
): string {
  const glyph = DISK_GLYPH[role]![color];
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size / 2 - 1;
  const ink = color === 'white' ? INK_W : INK_R;
  const grad = color === 'white' ? `${id}-ivory` : `${id}-red`;
  return [
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${grad})" stroke="${ink}" stroke-width="2.4"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${r - 4}" fill="none" stroke="${ink}" stroke-width="1" opacity="0.55"/>`,
    `<text x="${cx}" y="${cy + 1}" font-family="'Songti SC','STSong','Noto Serif CJK SC','Noto Serif CJK TC',serif" font-weight="700" font-size="${size * 0.5}" fill="${ink}" text-anchor="middle" dominant-baseline="central">${glyph}</text>`,
  ].join('');
}

// A shrouded enemy: color is known under fog (field of fire), identity is not.
function silhouette(color: DualChessColor, x: number, y: number, id: string): string {
  const size = CELL * 0.7;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  const r = size / 2;
  const grad = color === 'white' ? `${id}-ivory` : `${id}-red`;
  const ink = color === 'white' ? INK_W : INK_R;
  return [
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${grad})" stroke="${ink}" stroke-width="1.5" opacity="0.62"/>`,
    `<text x="${cx}" y="${cy + 1}" font-size="${size * 0.6}" fill="${ink}" text-anchor="middle" dominant-baseline="central" opacity="0.7">?</text>`,
  ].join('');
}

function fogLayer(visible: Set<DualChessSquare>, perspective: DualChessColor): string {
  const parts: string[] = [];
  for (let file = 0; file < FILES; file += 1) {
    for (let rank = 1; rank <= RANKS; rank += 1) {
      const square = `${String.fromCharCode('a'.charCodeAt(0) + file)}${rank}` as DualChessSquare;
      if (visible.has(square)) continue;
      const { x, y } = cellTopLeft(file, rank, perspective);
      parts.push(
        `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="rgba(22,18,14,0.66)"/>`,
      );
    }
  }
  return parts.join('');
}
