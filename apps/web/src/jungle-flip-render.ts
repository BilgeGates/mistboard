// Board renderer for Flip Jungle (兽棋 / 翻翻棋) — the 4×4 flip animal chess board.
//
// Thin adapter over the shared descriptor-driven cell-board core
// (@mistboard/board-render renderGridBoardSvg), like jungle-render.ts. Symmetric
// hidden-identity: a face-down tile draws as a neutral "back" disc (no ink/identity);
// a revealed tile draws as an ink-coloured animal character disc.
//
// Self-contained (its own glyph table + concrete colours) so it doesn't couple to the
// vanilla jungle-render.ts whose piece art is being refined in a parallel session; a
// later pass can extract a shared animal-disc module both renderers import.

import {
  type GridBoardDescriptor,
  type GridCellRef,
  type GridGeometry,
  renderGridBoardSvg,
} from '@mistboard/board-render';
import {
  ALL_JUNGLE_FLIP_SQUARES,
  type JungleFlipColor,
  type JungleFlipPieceRole,
  type JungleFlipSquare,
  jungleFlipCoordOf,
} from '@mistboard/game';

const FILES = 4;
const RANKS = 4;
const CELL = 64;

const PALETTE = {
  // Solid (non-alternating) board: one warm tan for every cell.
  lightCell: '#e7ce96',
  darkCell: '#e7ce96',
  // Borderless: no frame band or board edge, matching the vanilla Jungle board.
  frameBg: 'transparent',
  frameInner: 'transparent',
  boardEdge: 'transparent',
  coord: 'rgba(60,45,30,0.55)',
  lastMove: 'rgba(255,205,80,0.5)',
  selected: 'rgba(31,111,91,0.32)',
  targetDot: 'rgba(31,111,91,0.72)',
  targetRing: 'rgba(31,111,91,0.48)',
  targetHover: 'rgba(31,111,91,0.30)',
  fog: 'rgba(22,18,14,0.66)',
} as const;

// Tile-separating grid lines, banqi-style (matches the vanilla Jungle board).
const GRID_STROKE = 'rgba(91,74,50,0.55)';

// Revealed animals render as the origami art set (transparent papercraft PNGs,
// shared with the vanilla Jungle board under /piece-sets/jungle/origami). A
// face-down tile carries no identity, so it stays a neutral disc (see pieces()).
function animalHref(color: JungleFlipColor, role: JungleFlipPieceRole): string {
  return `/piece-sets/jungle/origami/${color}-${role}.png`;
}

// A masked board entry (mirrors JungleFlipVisibleBoardEntry on the wire).
export type JungleFlipRenderEntry =
  | { faceDown: true }
  | { faceDown: false; color: JungleFlipColor; role: JungleFlipPieceRole };
export type JungleFlipRenderBoard = Partial<Record<JungleFlipSquare, JungleFlipRenderEntry>>;

const DESCRIPTOR: GridBoardDescriptor = {
  files: FILES,
  ranks: RANKS,
  cell: CELL,
  palette: PALETTE,
  framePad: 0,
  pad: 0,
  boardRadius: 0,
  boardEdgeWidth: 0,
  svgClass: 'jungle-flip-live-svg',
};

export type JungleFlipRenderOptions = {
  lastMove?: { from: JungleFlipSquare; to: JungleFlipSquare } | null;
  selected?: JungleFlipSquare | null;
  targets?: readonly JungleFlipSquare[];
  interactive?: boolean;
  idSuffix?: string;
};

function cellRef(square: JungleFlipSquare): GridCellRef {
  const { file, rank } = jungleFlipCoordOf(square);
  return { file, rank };
}

function defs(gid: string): string {
  return [
    `<filter id="${gid}-tok" x="-25%" y="-25%" width="150%" height="160%">`,
    `<feDropShadow dx="0" dy="1" stdDeviation="0.9" flood-color="#3a2c20" flood-opacity="0.4"/>`,
    `</filter>`,
  ].join('');
}

// Grid on every cell boundary (incl. the outer edge); drawn under the pieces.
function gridLines(geom: GridGeometry): string {
  const c = geom.cell;
  const boardW = FILES * c;
  const boardH = RANKS * c;
  const parts: string[] = [];
  for (let i = 0; i <= FILES; i += 1) {
    const x = i * c;
    parts.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${boardH}" stroke="${GRID_STROKE}" stroke-width="1" stroke-linecap="round"/>`,
    );
  }
  for (let j = 0; j <= RANKS; j += 1) {
    const y = j * c;
    parts.push(
      `<line x1="0" y1="${y}" x2="${boardW}" y2="${y}" stroke="${GRID_STROKE}" stroke-width="1" stroke-linecap="round"/>`,
    );
  }
  return parts.join('');
}

function pieces(board: JungleFlipRenderBoard, geom: GridGeometry, gid: string): string {
  const parts: string[] = [];
  const r = geom.cell * 0.4;
  const s = geom.cell * 0.96;
  for (const square of ALL_JUNGLE_FLIP_SQUARES) {
    const entry = board[square];
    if (!entry) continue;
    const { file, rank } = jungleFlipCoordOf(square);
    const { x, y } = geom.center(file, rank);
    if (entry.faceDown) {
      // Face-down back mirrors banqi's: a flat jade disc, single ring, no inner
      // ring or identity (the deal is hidden from both sides). Same fill/stroke
      // as live-banqi-render's .banqi-back so the two hidden-identity surfaces read
      // identically.
      parts.push(
        `<circle cx="${x}" cy="${y}" r="${r}" fill="#2f8f6b" stroke="#184a38" stroke-width="2" filter="url(#${gid}-tok)"/>`,
      );
      continue;
    }
    parts.push(
      `<image href="${animalHref(entry.color, entry.role)}" x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" preserveAspectRatio="xMidYMid meet"/>`,
    );
  }
  return parts.join('');
}

export function renderJungleFlipBoardSvg(
  board: JungleFlipRenderBoard,
  options: JungleFlipRenderOptions = {},
): string {
  const gid = `jungleflip${options.idSuffix ?? ''}`;
  return renderGridBoardSvg(DESCRIPTOR, {
    id: gid,
    flip: false, // the deal has no sides — a fixed orientation is least confusing
    extraDefs: defs(gid),
    coords: false,
    renderPieces: (geom) => gridLines(geom) + pieces(board, geom, gid),
    lastMove: options.lastMove
      ? [cellRef(options.lastMove.from), cellRef(options.lastMove.to)]
      : null,
    selected: options.selected ? cellRef(options.selected) : null,
    targets: (options.targets ?? []).map((sq) => {
      const ref = cellRef(sq);
      return { ...ref, occupied: board[sq] !== undefined };
    }),
    squareName: (file, rank) => `${'abcd'[file]}${rank}`,
    interactive: options.interactive ?? false,
  });
}
