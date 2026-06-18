// Live, fog-aware board renderer for Dark Shogi (9x9).
//
// A thin variant adapter over the shared descriptor-driven cell-board core
// (@mistboard/board-render renderGridBoardSvg), the same core the chess /
// Crossroads boards ride. The core owns geometry (orientation flip), furniture
// (grid, coords, frame, clip) and the generic interaction layers (last-move,
// selection, targets, fog, hit). This file supplies only what is shogi-specific:
// the 9x9 descriptor, the pentagonal koma glyph (kanji on a wedge tile that
// points toward the enemy), and the hand-koma used by the reserves strip.
//
// Driven by the engine's ShogiPlayerView. There are NO shrouded silhouettes —
// shogi has no screen mechanic, so the fog view simply omits pieces off vision;
// every board entry it carries is a fully-known piece (color, role, promoted).

import {
  type GridCellRef,
  type GridGeometry,
  type GridPalette,
  renderGridBoardSvg,
} from '@mistboard/board-render';
import {
  isShogiDrop,
  type ShogiColor,
  type ShogiHandRole,
  type ShogiMove,
  type ShogiPiece,
  type ShogiPieceRole,
  type ShogiPlayerView,
  type ShogiSquare,
  shogiCoordOf,
  shogiSquareOf,
} from '@mistboard/game';

const FILES = 9;
const RANKS = 9;
const CELL = 48;

// Single-character koma faces. King differs by side (王 sente / 玉 gote), the
// rest share a face; ownership reads from tile color + orientation.
const KANJI: Record<ShogiPieceRole, string> = {
  K: '王',
  R: '飛',
  B: '角',
  G: '金',
  S: '銀',
  N: '桂',
  L: '香',
  P: '歩',
};
const PROMOTED_KANJI: Partial<Record<ShogiPieceRole, string>> = {
  R: '龍',
  B: '馬',
  S: '全',
  N: '圭',
  L: '杏',
  P: 'と',
};
const KANJI_FONT = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif';

// Wood-tile palette. Literal colors (not theme vars) — Dark Shogi is a hidden
// dev-spike with no board-theme axis yet, so it stays self-contained.
const SHOGI_PALETTE: GridPalette = {
  lightCell: '#f4ddb0',
  darkCell: '#ecd09c',
  frameBg: '#5a4327',
  frameInner: '#d8b97e',
  boardEdge: '#7a5c33',
  coord: '#8a6d3f',
  lastMove: 'rgba(230,201,95,0.62)',
  selected: 'rgba(207,227,154,0.70)',
  targetDot: '#5f7d33',
  targetRing: '#5f7d33',
  // A pale mist over un-attacked cells (the fog overlay is drawn over pieces, so
  // it must be translucent; off-vision pieces are already absent from the view).
  fog: 'rgba(231,221,197,0.88)',
};

const SHOGI_DESCRIPTOR = {
  files: FILES,
  ranks: RANKS,
  cell: CELL,
  palette: SHOGI_PALETTE,
  // Shogi files run 9..1 left-to-right from Black's side; ranks fall back to the
  // core's numeric labels (the core has no rank-letter hook — cosmetic only,
  // every interaction is click-driven by data-square).
  fileLabel: (file: number) => String(FILES - file),
  svgClass: 'shogi-board-svg',
};

export type ShogiRenderOptions = {
  // Whose side sits at the bottom. Defaults to the view's own perspective.
  perspective?: ShogiColor;
  // Draw the fog overlay over non-visible squares. Defaults to true.
  showFog?: boolean;
  lastMove?: ShogiMove | null;
  selected?: ShogiSquare | null;
  // Legal destinations for the current selection / drop (dots or capture rings).
  targets?: readonly ShogiSquare[];
  // Add a transparent hit layer of <rect data-square="..."> for click handling.
  interactive?: boolean;
};

let boardCounter = 0;

export function renderShogiBoardSvg(
  view: ShogiPlayerView,
  options: ShogiRenderOptions = {},
): string {
  const perspective = options.perspective ?? view.perspective;
  const showFog = options.showFog ?? true;
  boardCounter += 1;
  const id = `shogi-live-${boardCounter}`;

  const visible = new Set<ShogiSquare>(view.visibleSquares);
  const occupied = new Set<ShogiSquare>(Object.keys(view.board) as ShogiSquare[]);
  const lastMove = options.lastMove ?? view.lastMove ?? null;
  const lastCells = lastMove
    ? isShogiDrop(lastMove)
      ? [coordOf(lastMove.to)]
      : [coordOf(lastMove.from), coordOf(lastMove.to)]
    : null;

  return renderGridBoardSvg(SHOGI_DESCRIPTOR, {
    id,
    flip: perspective === 'white',
    renderPieces: (geom) => pieceLayer(view, geom, perspective),
    lastMove: lastCells,
    selected: options.selected ? coordOf(options.selected) : null,
    targets: (options.targets ?? []).map((sq) => ({ ...coordOf(sq), occupied: occupied.has(sq) })),
    fogHidden: showFog ? hiddenSquares(visible) : null,
    interactive: options.interactive ?? false,
    squareName: (file, rank) => squareAt(file, rank),
  });
}

// A standalone mini-koma (reserves strip, promotion preview). pointsUp false
// renders an opponent-oriented (upside-down) tile, used for the postgame top
// reserve.
export function shogiKomaSvg(piece: ShogiPiece, pointsUp = true): string {
  const size = 40;
  return `<svg viewBox="0 0 ${size} ${size}" class="shogi-hand-koma__svg" role="img" aria-label="${piece.color} ${piece.role}${piece.promoted ? ' promoted' : ''}" xmlns="http://www.w3.org/2000/svg">${komaFragment(
    piece,
    0,
    0,
    size,
    pointsUp,
  )}</svg>`;
}

// Reserves are always unpromoted hand pieces — a thin wrapper over the general
// koma for the hand strip.
export function shogiHandKomaSvg(role: ShogiHandRole, color: ShogiColor, pointsUp = true): string {
  return shogiKomaSvg({ color, role, promoted: false }, pointsUp);
}

export const SHOGI_HAND_ORDER: readonly ShogiHandRole[] = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];

// ── Coordinates ─────────────────────────────────────────────────────────────
// Black's home rank (i) sits at the bottom; file 9 sits on the left. The core's
// `flip` rotates the whole board 180° for White's perspective.

function coordOf(square: ShogiSquare): GridCellRef {
  const { file, rankIndex } = shogiCoordOf(square);
  return { file: FILES - file, rank: RANKS - rankIndex };
}

function squareAt(file: number, rank: number): ShogiSquare {
  return shogiSquareOf(FILES - file, RANKS - rank);
}

function hiddenSquares(visible: Set<ShogiSquare>): GridCellRef[] {
  const refs: GridCellRef[] = [];
  for (let file = 0; file < FILES; file += 1) {
    for (let rank = 1; rank <= RANKS; rank += 1) {
      if (!visible.has(squareAt(file, rank))) refs.push({ file, rank });
    }
  }
  return refs;
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function pieceLayer(view: ShogiPlayerView, geom: GridGeometry, perspective: ShogiColor): string {
  const tile = CELL * 0.9;
  const inset = (CELL - tile) / 2;
  const parts: string[] = [];
  for (const [square, piece] of Object.entries(view.board)) {
    if (!piece) continue;
    const { file, rank } = coordOf(square as ShogiSquare);
    const { x, y } = geom.topLeft(file, rank);
    // A piece you own points up-screen (toward the enemy); the opponent's points
    // down. Your side is whoever sits at the bottom (the perspective player).
    const pointsUp = piece.color === perspective;
    parts.push(komaFragment(piece, x + inset, y + inset, tile, pointsUp));
  }
  return parts.join('');
}

// A single pentagonal koma at (x,y) of the given size. The shape is always drawn
// pointing up and rotated 180° for the down orientation, so the kanji rotates
// with the tile (you read the opponent's pieces upside-down, as in real shogi).
function komaFragment(
  piece: ShogiPiece,
  x: number,
  y: number,
  size: number,
  pointsUp: boolean,
): string {
  const fill = piece.color === 'black' ? '#d9a441' : '#f3e6c8';
  const stroke = piece.color === 'black' ? '#9a7320' : '#b89f68';
  const textFill = piece.promoted ? '#b22222' : '#3a2c14';
  const path = pentagonPath(x, y, size);
  const glyph = kanjiFor(piece);
  const body =
    `<path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<text x="${x + size / 2}" y="${y + size * 0.66}" text-anchor="middle" font-size="${(size * 0.5).toFixed(1)}" font-family='${KANJI_FONT}' font-weight="600" fill="${textFill}">${glyph}</text>`;
  if (pointsUp) return body;
  return `<g transform="rotate(180 ${x + size / 2} ${y + size / 2})">${body}</g>`;
}

// Home-plate pentagon (apex up), as an absolute-coordinate path.
function pentagonPath(x: number, y: number, s: number): string {
  const pts: Array<[number, number]> = [
    [0.5, 0.05],
    [0.8, 0.3],
    [0.86, 0.95],
    [0.14, 0.95],
    [0.2, 0.3],
  ];
  return `${pts
    .map(
      ([px, py], i) =>
        `${i === 0 ? 'M' : 'L'}${(x + px * s).toFixed(2)} ${(y + py * s).toFixed(2)}`,
    )
    .join(' ')} Z`;
}

function kanjiFor(piece: ShogiPiece): string {
  if (piece.role === 'K') return piece.color === 'black' ? '王' : '玉';
  if (piece.promoted) return PROMOTED_KANJI[piece.role] ?? KANJI[piece.role];
  return KANJI[piece.role];
}
