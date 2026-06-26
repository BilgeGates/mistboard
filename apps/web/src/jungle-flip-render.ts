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

const DISC_FILL = '#fdf3df';
const INK: Record<JungleFlipColor, string> = { red: '#b5322b', black: '#28323c' };

const GLYPH: Record<JungleFlipPieceRole, string> = {
  rat: '鼠',
  cat: '猫',
  dog: '狗',
  wolf: '狼',
  leopard: '豹',
  tiger: '虎',
  lion: '狮',
  elephant: '象',
};
const CJK_FONT = "'PingFang SC','Noto Sans CJK SC','Hiragino Sans','Microsoft YaHei',sans-serif";

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
    `<radialGradient id="${gid}-disc" cx="0.5" cy="0.36" r="0.7">`,
    `<stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#ead7ad"/>`,
    `</radialGradient>`,
    `<radialGradient id="${gid}-back" cx="0.5" cy="0.36" r="0.75">`,
    `<stop offset="0" stop-color="#caa05a"/><stop offset="1" stop-color="#9c7536"/>`,
    `</radialGradient>`,
    `<filter id="${gid}-tok" x="-25%" y="-25%" width="150%" height="160%">`,
    `<feDropShadow dx="0" dy="1" stdDeviation="0.9" flood-color="#3a2c20" flood-opacity="0.4"/>`,
    `</filter>`,
  ].join('');
}

function pieces(board: JungleFlipRenderBoard, geom: GridGeometry, gid: string): string {
  const parts: string[] = [];
  const r = geom.cell * 0.4;
  for (const square of ALL_JUNGLE_FLIP_SQUARES) {
    const entry = board[square];
    if (!entry) continue;
    const { file, rank } = jungleFlipCoordOf(square);
    const { x, y } = geom.center(file, rank);
    if (entry.faceDown) {
      // Neutral back — carries no ink/identity (symmetric mask).
      parts.push(
        `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${gid}-back)" stroke="#6e5028" stroke-width="2" filter="url(#${gid}-tok)"/>`,
        `<circle cx="${x}" cy="${y}" r="${r - 5}" fill="none" stroke="rgba(255,245,220,0.45)" stroke-width="1"/>`,
      );
      continue;
    }
    const ink = INK[entry.color];
    parts.push(
      `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${gid}-disc)" stroke="${ink}" stroke-width="2" filter="url(#${gid}-tok)"/>`,
      `<circle cx="${x}" cy="${y}" r="${r - 3}" fill="none" stroke="${ink}" stroke-width="0.75" opacity="0.45"/>`,
      `<text x="${x}" y="${y}" font-size="${geom.cell * 0.46}" fill="${ink}" text-anchor="middle" dominant-baseline="central" font-family="${CJK_FONT}">${GLYPH[entry.role]}</text>`,
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
    renderPieces: (geom) => pieces(board, geom, gid),
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
