// Board renderer for Jungle / Dou Shou Qi (斗兽棋).
//
// A thin variant adapter over the shared descriptor-driven cell-board core
// (@mistboard/board-render renderGridBoardSvg). The core owns geometry
// (orientation flip), furniture (grid, coords, frame, clip) and the generic
// interaction layers (last-move, selection, targets, hit). This file supplies
// what is Jungle-specific: the near-solid 7×9 descriptor, the two river lakes +
// dens + traps drawn as a decoration layer, and the eight animal pieces as
// character tokens.
//
// Jungle's water is NOT a full-width strip (it is two 2×3 lakes with land lanes
// between), so each lake is drawn as a single rounded rectangle (not per-cell, so
// no internal grid lines) inside the renderPieces callback, along with the dens
// and traps. Concrete colours + namespaced <defs> (gradients / drop-shadow) so the
// SAME function renders both in-browser and standalone (OG cards, static previews
// via rsvg/resvg).

import {
  type GridBoardDescriptor,
  type GridCellRef,
  type GridGeometry,
  renderGridBoardSvg,
} from '@mistboard/board-render';
import {
  ALL_JUNGLE_SQUARES,
  JUNGLE_DENS,
  type JungleBoard,
  type JungleColor,
  type JunglePieceRole,
  type JungleSquare,
  jungleCoordOf,
  jungleTrapOwner,
} from '@mistboard/game';

const FILES = 7;
const RANKS = 9;
const CELL = 48;

// Warm-tan board, near-solid (the two shades give a faint texture, not a chess
// checker). Water/den/trap furniture carries the Jungle identity.
const PALETTE = {
  lightCell: '#e9cf9b',
  darkCell: '#e3c78b',
  frameBg: '#5b4636',
  frameInner: '#6e5743',
  boardEdge: '#3a2c20',
  coord: 'rgba(60,45,30,0.55)',
  lastMove: 'rgba(255,205,80,0.5)',
  selected: 'rgba(31,111,91,0.32)',
  targetDot: 'rgba(31,111,91,0.72)',
  targetRing: 'rgba(31,111,91,0.48)',
  targetHover: 'rgba(31,111,91,0.30)',
  fog: 'rgba(22,18,14,0.66)',
} as const;

const DEN_FILL = '#c79a4f';
const TRAP_STROKE = 'rgba(90,60,30,0.55)';
const LAKE_STROKE = 'rgba(70,128,168,0.55)';

// The side colour inks the token ring + glyph (xiangqi-style legibility); the disc
// face is a warm radial gradient for a tactile, raised look.
const INK: Record<JungleColor, string> = { red: '#b5322b', black: '#28323c' };

const GLYPH: Record<JunglePieceRole, string> = {
  rat: '鼠',
  cat: '猫',
  dog: '狗',
  wolf: '狼',
  leopard: '豹',
  tiger: '虎',
  lion: '狮',
  elephant: '象',
};
// Single-quoted family names: this string is interpolated into a double-quoted
// XML attribute (font-family="…"), so inner double quotes would break the parse.
const CJK_FONT = "'PingFang SC','Noto Sans CJK SC','Hiragino Sans','Microsoft YaHei',sans-serif";

// The two lakes, as [file, file] × [rank…] blocks (0-based files: b=1,c=2,e=4,f=5).
const LAKES: ReadonlyArray<{ files: readonly number[]; ranks: readonly number[] }> = [
  { files: [1, 2], ranks: [4, 5, 6] },
  { files: [4, 5], ranks: [4, 5, 6] },
];

const DESCRIPTOR: GridBoardDescriptor = {
  files: FILES,
  ranks: RANKS,
  cell: CELL,
  palette: PALETTE,
  svgClass: 'jungle-live-svg',
};

export type JungleRenderOptions = {
  // Black sees the board flipped (its den at the bottom).
  perspective?: JungleColor;
  lastMove?: { from: JungleSquare; to: JungleSquare } | null;
  selected?: JungleSquare | null;
  targets?: readonly JungleSquare[];
  interactive?: boolean;
  idSuffix?: string;
};

function cellRef(square: JungleSquare): GridCellRef {
  const { file, rank } = jungleCoordOf(square);
  return { file, rank };
}

function defs(gid: string): string {
  return [
    `<radialGradient id="${gid}-disc" cx="0.5" cy="0.36" r="0.7">`,
    `<stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#ead7ad"/>`,
    `</radialGradient>`,
    `<linearGradient id="${gid}-water" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="#93c3e4"/><stop offset="1" stop-color="#6ba6cf"/>`,
    `</linearGradient>`,
    `<filter id="${gid}-tok" x="-25%" y="-25%" width="150%" height="160%">`,
    `<feDropShadow dx="0" dy="1" stdDeviation="0.9" flood-color="#3a2c20" flood-opacity="0.4"/>`,
    `</filter>`,
  ].join('');
}

// The lakes / dens / traps, painted under the pieces (the renderPieces layer draws
// over the base grid + last-move, under the interaction targets).
function furniture(geom: GridGeometry, gid: string): string {
  const parts: string[] = [];
  const c = geom.cell;

  // Each lake as ONE rounded rect (its 6-cell bounding box), so there are no
  // internal grid lines across the water. Bounding box is flip-safe.
  for (const lake of LAKES) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const f of lake.files) {
      for (const r of lake.ranks) {
        const { x, y } = geom.topLeft(f, r);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + c);
        maxY = Math.max(maxY, y + c);
      }
    }
    parts.push(
      `<rect x="${minX + 1}" y="${minY + 1}" width="${maxX - minX - 2}" height="${maxY - minY - 2}" rx="7" fill="url(#${gid}-water)" stroke="${LAKE_STROKE}" stroke-width="1"/>`,
    );
  }

  for (const square of ALL_JUNGLE_SQUARES) {
    const { file, rank } = jungleCoordOf(square);
    const { x, y } = geom.topLeft(file, rank);
    const denOwner =
      square === JUNGLE_DENS.red ? 'red' : square === JUNGLE_DENS.black ? 'black' : null;
    if (denOwner) {
      const cx = x + c / 2;
      const cy = y + c / 2;
      parts.push(
        `<rect x="${x + 2}" y="${y + 2}" width="${c - 4}" height="${c - 4}" rx="4" fill="${DEN_FILL}"/>`,
        `<rect x="${x + 2}" y="${y + 2}" width="${c - 4}" height="${c - 4}" rx="4" fill="none" stroke="${INK[denOwner]}" stroke-width="1" opacity="0.5"/>`,
        `<text x="${cx}" y="${cy}" font-size="${c * 0.5}" fill="${INK[denOwner]}" text-anchor="middle" dominant-baseline="central" font-family="${CJK_FONT}" opacity="0.9">穴</text>`,
      );
      continue;
    }
    if (jungleTrapOwner(square)) {
      const m = c * 0.26;
      parts.push(
        `<line x1="${x + m}" y1="${y + m}" x2="${x + c - m}" y2="${y + c - m}" stroke="${TRAP_STROKE}" stroke-width="1.5"/>`,
        `<line x1="${x + c - m}" y1="${y + m}" x2="${x + m}" y2="${y + c - m}" stroke="${TRAP_STROKE}" stroke-width="1.5"/>`,
      );
    }
  }
  return parts.join('');
}

function pieces(board: JungleBoard, geom: GridGeometry, gid: string): string {
  const parts: string[] = [];
  const r = geom.cell * 0.4;
  for (const square of ALL_JUNGLE_SQUARES) {
    const piece = board[square];
    if (!piece) continue;
    const { file, rank } = jungleCoordOf(square);
    const { x, y } = geom.center(file, rank);
    const ink = INK[piece.color];
    parts.push(
      `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${gid}-disc)" stroke="${ink}" stroke-width="2" filter="url(#${gid}-tok)"/>`,
      `<circle cx="${x}" cy="${y}" r="${r - 3}" fill="none" stroke="${ink}" stroke-width="0.75" opacity="0.45"/>`,
      `<text x="${x}" y="${y}" font-size="${geom.cell * 0.46}" fill="${ink}" text-anchor="middle" dominant-baseline="central" font-family="${CJK_FONT}">${GLYPH[piece.role]}</text>`,
    );
  }
  return parts.join('');
}

export function renderJungleBoardSvg(
  board: JungleBoard,
  options: JungleRenderOptions = {},
): string {
  const gid = `jungle${options.idSuffix ?? ''}`;
  return renderGridBoardSvg(DESCRIPTOR, {
    id: gid,
    flip: options.perspective === 'black',
    extraDefs: defs(gid),
    renderPieces: (geom) => furniture(geom, gid) + pieces(board, geom, gid),
    lastMove: options.lastMove
      ? [cellRef(options.lastMove.from), cellRef(options.lastMove.to)]
      : null,
    selected: options.selected ? cellRef(options.selected) : null,
    targets: (options.targets ?? []).map((sq) => {
      const ref = cellRef(sq);
      return { ...ref, occupied: board[sq] !== undefined };
    }),
    squareName: (file, rank) => `${'abcdefg'[file]}${rank}`,
    interactive: options.interactive ?? false,
  });
}
