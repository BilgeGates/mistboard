// Live, fog-aware board renderer for Dual Chess (中西象棋).
//
// A thin variant adapter over the shared descriptor-driven cell-board core
// (@mistboard/board-render renderGridBoardSvg). The core owns geometry
// (orientation flip + river-strip offset), furniture (grid, river, coords,
// frame, clip), and the generic interaction layers (last-move, selection,
// targets, fog, hit). This file supplies only what is Dual-Chess-specific: the
// 6x8 + river descriptor, the disk/recolour piece glyphs, and the gradient defs.
//
// Driven by the engine's DualChessPlayerView (packages/game/variants-dual-chess),
// orientation-aware (Red sees the board flipped) and fog-aware (hidden squares
// fogged; shrouded enemies render as colour-only silhouettes).

import {
  type GridBoardDescriptor,
  type GridCellRef,
  type GridGeometry,
  PIECE_SVGS,
  renderGridBoardSvg,
} from '@mistboard/board-render';
import type {
  DualChessColor,
  DualChessPieceRole,
  DualChessPlayerView,
  DualChessSquare,
} from '@mistboard/game';

const FILES = 6;
const RANKS = 8;
const CELL = 50;

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
const SELECTED = 'rgba(255,205,80,0.55)';
const DOT = 'rgba(45,100,45,0.62)';
const CAP = 'rgba(170,40,40,0.62)';
const FOG = 'rgba(22,18,14,0.66)';

// The 6x8 river board, expressed as data for the shared core. Its layout knobs
// (framePad 9, pad 6, frame radius 14/12.5, board radius 5, edge 1.5) are the
// core defaults, so they need not be restated.
const DUAL_CHESS_DESCRIPTOR: GridBoardDescriptor = {
  files: FILES,
  ranks: RANKS,
  cell: CELL,
  strips: [{ afterRow: 4, height: 11, fill: '#5aa0d6', highlightFill: 'rgba(255,255,255,0.4)' }],
  palette: {
    lightCell: WOOD_L,
    darkCell: WOOD_D,
    frameBg: FRAME_BG,
    frameInner: FRAME_INNER,
    boardEdge: BOARD_EDGE,
    coord: CO,
    lastMove: LASTMOVE,
    selected: SELECTED,
    targetDot: DOT,
    targetRing: CAP,
    fog: FOG,
  },
  svgClass: 'dual-live-svg',
};

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
  // The currently selected square (highlighted).
  selected?: DualChessSquare | null;
  // Legal destination squares for the selection (dots / capture rings).
  targets?: readonly DualChessSquare[];
  // Squares to emphasise under the pieces (study / diagram callouts).
  highlights?: readonly DualChessSquare[];
  // Annotation arrows drawn over the board (study / diagram callouts).
  arrows?: readonly { from: DualChessSquare; to: DualChessSquare }[];
  // Add a transparent hit layer of <rect data-square="..."> for click handling.
  interactive?: boolean;
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
  const occupied = new Set<DualChessSquare>(Object.keys(view.board) as DualChessSquare[]);
  const lastMove = options.lastMove ?? view.lastMove ?? null;

  return renderGridBoardSvg(DUAL_CHESS_DESCRIPTOR, {
    id,
    flip: perspective === 'red',
    extraDefs: dualChessDefs(id),
    renderPieces: (geom) => pieceLayer(view, geom, id),
    lastMove: lastMove ? [coordOf(lastMove.from), coordOf(lastMove.to)] : null,
    selected: options.selected ? coordOf(options.selected) : null,
    highlights: (options.highlights ?? []).map(coordOf),
    targets: (options.targets ?? []).map((sq) => ({ ...coordOf(sq), occupied: occupied.has(sq) })),
    arrows: (options.arrows ?? []).map((a) => ({ from: coordOf(a.from), to: coordOf(a.to) })),
    fogHidden: showFog ? hiddenSquares(visible) : null,
    interactive: options.interactive ?? false,
    squareName: (file, rank) => squareAt(file, rank),
  });
}

export const DUAL_CHESS_BOARD_PX = CELL;

// ── Coordinates ─────────────────────────────────────────────────────────────

function coordOf(square: DualChessSquare): GridCellRef {
  return { file: square.charCodeAt(0) - 'a'.charCodeAt(0), rank: Number(square.slice(1)) };
}

function squareAt(file: number, rank: number): DualChessSquare {
  return `${String.fromCharCode('a'.charCodeAt(0) + file)}${rank}` as DualChessSquare;
}

// Hidden squares, in the core's grid-iteration order (file outer, rank inner).
function hiddenSquares(visible: Set<DualChessSquare>): GridCellRef[] {
  const refs: GridCellRef[] = [];
  for (let file = 0; file < FILES; file += 1) {
    for (let rank = 1; rank <= RANKS; rank += 1) {
      if (!visible.has(squareAt(file, rank))) refs.push({ file, rank });
    }
  }
  return refs;
}

// ── Pieces (the Dual-Chess-specific layer) ──────────────────────────────────

function pieceLayer(view: DualChessPlayerView, geom: GridGeometry, id: string): string {
  const parts: string[] = [];
  for (const [square, entry] of Object.entries(view.board)) {
    if (!entry) continue;
    const { file, rank } = coordOf(square as DualChessSquare);
    const { x, y } = geom.topLeft(file, rank);
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

function dualChessDefs(id: string): string {
  return [
    `<linearGradient id="${id}-river" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#86c0ea"/><stop offset="1" stop-color="#3f86c4"/></linearGradient>`,
    `<radialGradient id="${id}-ivory" cx="0.38" cy="0.32" r="0.8"><stop offset="0" stop-color="#fdf6e4"/><stop offset="1" stop-color="#f3e6c4"/></radialGradient>`,
    `<radialGradient id="${id}-red" cx="0.38" cy="0.3" r="0.85"><stop offset="0" stop-color="#c1453b"/><stop offset="1" stop-color="#a4291f"/></radialGradient>`,
  ].join('');
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

// A shrouded enemy: colour is known under fog (field of fire), identity is not.
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
