// Static SVG diagrams for the Crossroads Chess rules article.
//
// These are didactic positions (a lone piece showing its moves, a screen for the
// cannon, a blocked horse leg, the king's race). They are drawn by the SAME
// renderer the live board uses — renderCrossroadsChessBoardSvg over the shared
// descriptor-driven cell-board core — so an article diagram is pixel-identical to
// the real game. This module only adapts: it parses the article's board FEN into
// a CrossroadsChessPlayerView, maps the didactic overlays (move dots, capture rings,
// highlights, arrows, blocked-target marks) onto the renderer's options, and
// re-wraps the result in the article's responsive `.crossroads-article-svg` shell
// (single board, or a labelled row of boards). No board geometry or piece art
// lives here anymore.

import type {
  CrossroadsChessColor,
  CrossroadsChessPieceRole,
  CrossroadsChessPlayerBoard,
  CrossroadsChessPlayerView,
  CrossroadsChessSquare,
} from '@mistboard/game';
import { renderCrossroadsChessBoardSvg } from './crossroads-chess-render.js';
import type { XiangqiPieceSet } from './xiangqi-piece-sets.js';

export const CROSSROADS_FILES = 6;
export const CROSSROADS_RANKS = 8;
export const CROSSROADS_CHESS_START_FEN = 'bknhcv/pppooo/6/6/6/6/OOOPPP/VCHNKB';

const LABEL_H = 22;
const ROW_GAP = 10;
const LABEL_INK = '#5b4636'; // meerkat frame brown
const CELL = 50;
const PAD = 6;
const FRAME_PAD = 9;
const RIVER_AFTER_ROW = 4;
const RIVER_H = 11;
const CROSS_INK = 'rgba(125,20,20,0.72)';

export type CrossroadsDiagramSquare = string; // file letter + rank digit, e.g. "e4"
export type CrossroadsDiagramArrow = { from: CrossroadsDiagramSquare; to: CrossroadsDiagramSquare };

export type CrossroadsDiagramBoardOptions = {
  fen: string;
  moveDots?: CrossroadsDiagramSquare[];
  captures?: CrossroadsDiagramSquare[];
  highlights?: CrossroadsDiagramSquare[];
  arrows?: CrossroadsDiagramArrow[];
  crosses?: CrossroadsDiagramSquare[];
  label?: string;
  // Pin the xiangqi disk art (defaults to the stored/product set). Mainly for
  // tests that probe a specific glyph; production diagrams follow the default.
  xiangqiPieceSet?: XiangqiPieceSet;
};

// FEN piece letter -> role. Uppercase = White, lowercase = Red. This is the same
// encoding the kernel's replay fixtures use (VCHNKB = chariot/cannon/horse/
// knight/king/bishop), so the diagram FENs and real games speak one language.
const ROLE_OF: Record<string, CrossroadsChessPieceRole> = {
  k: 'king',
  q: 'queen',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
  v: 'chariot',
  c: 'cannon',
  h: 'horse',
  o: 'soldier',
};

// A diagram is a perfect-information snapshot, so every piece is visible and the
// kernel-only fields are placeholders (the renderer reads board/perspective only).
function fenToView(fen: string): CrossroadsChessPlayerView {
  const rows = fen.trim().split(/\s+/)[0]!.split('/');
  const board: CrossroadsChessPlayerBoard = {};
  rows.forEach((row, rowIndex) => {
    const rank = CROSSROADS_RANKS - rowIndex; // row 0 = rank 8 (top)
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += Number(ch);
        continue;
      }
      const role = ROLE_OF[ch.toLowerCase()];
      if (role) {
        const color: CrossroadsChessColor = ch === ch.toUpperCase() ? 'white' : 'red';
        const square = `${String.fromCharCode(97 + file)}${rank}` as CrossroadsChessSquare;
        board[square] = { piece: { color, role }, shrouded: false };
      }
      file += 1;
    }
  });
  return {
    id: 'crossroads-diagram',
    perspective: 'white',
    board,
    visibleSquares: [],
    legalMoves: [],
    status: { type: 'playing', turn: 'white' },
    moveNumber: 0,
  };
}

// Render one board through the live renderer. Move dots and capture rings are the
// renderer's `targets` (it picks dot vs ring from occupancy); highlights and
// arrows are its study overlays.
function coreBoard(opts: CrossroadsDiagramBoardOptions): string {
  const core = renderCrossroadsChessBoardSvg(fenToView(opts.fen), {
    showFog: false,
    ...(opts.xiangqiPieceSet ? { xiangqiPieceSet: opts.xiangqiPieceSet } : {}),
    targets: [...(opts.moveDots ?? []), ...(opts.captures ?? [])] as CrossroadsChessSquare[],
    highlights: opts.highlights as CrossroadsChessSquare[] | undefined,
    arrows: opts.arrows as { from: CrossroadsChessSquare; to: CrossroadsChessSquare }[] | undefined,
  });
  return opts.crosses?.length ? addCrossMarks(core, opts.crosses) : core;
}

function viewBoxDims(coreSvg: string): { w: number; h: number } {
  const m = coreSvg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  return { w: Number(m?.[1] ?? 0), h: Number(m?.[2] ?? 0) };
}

function squareCenter(square: CrossroadsDiagramSquare): { x: number; y: number } {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square.slice(1));
  const row = CROSSROADS_RANKS - rank;
  const riverOffset = row >= RIVER_AFTER_ROW ? RIVER_H : 0;
  return {
    x: PAD + FRAME_PAD + file * CELL + CELL / 2,
    y: PAD + FRAME_PAD + row * CELL + riverOffset + CELL / 2,
  };
}

function addCrossMarks(coreSvg: string, squares: CrossroadsDiagramSquare[]): string {
  const marks = squares
    .map((square) => {
      const { x, y } = squareCenter(square);
      const r = CELL * 0.24;
      return `<g class="crossroads-article-cross" opacity="0.9"><line x1="${x - r}" y1="${y - r}" x2="${x + r}" y2="${y + r}" stroke="${CROSS_INK}" stroke-width="4" stroke-linecap="round"/><line x1="${x + r}" y1="${y - r}" x2="${x - r}" y2="${y + r}" stroke="${CROSS_INK}" stroke-width="4" stroke-linecap="round"/></g>`;
    })
    .join('');
  const insertAt = coreSvg.lastIndexOf('</svg>');
  if (insertAt < 0) return coreSvg;
  return `${coreSvg.slice(0, insertAt)}${marks}${coreSvg.slice(insertAt)}`;
}

// Re-skin the live renderer's root <svg class="crossroads-live-svg"> as the article's
// responsive shell. Width rides on --crossroads-svg-width; the CSS caps single boards
// tighter than wide rows.
function asArticleSvg(coreSvg: string, layout: 'single' | 'wide', width: number): string {
  return coreSvg.replace(
    /^<svg class="crossroads-live-svg"/,
    `<svg class="crossroads-article-svg" data-crossroads-layout="${layout}" style="--crossroads-svg-width: ${width}px"`,
  );
}

// Embed a board as a nested <svg> at (x, y) inside a row, preserving its viewBox.
function asNestedSvg(coreSvg: string, x: number, y: number, w: number, h: number): string {
  return coreSvg.replace(
    /^<svg class="crossroads-live-svg" viewBox="([^"]+)"[^>]*>/,
    `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="$1" xmlns="http://www.w3.org/2000/svg">`,
  );
}

export function renderCrossroadsChessBoard(opts: CrossroadsDiagramBoardOptions): string {
  const core = coreBoard(opts);
  const { w } = viewBoxDims(core);
  return asArticleSvg(core, 'single', w);
}

// Render a live player view (e.g. a replay ply) into the article shell, so a
// stepped game looks identical to the static diagrams on the same page.
export function renderCrossroadsChessViewBoard(
  view: CrossroadsChessPlayerView,
  opts: { lastMove?: { from: CrossroadsChessSquare; to: CrossroadsChessSquare } | null } = {},
): string {
  const core = renderCrossroadsChessBoardSvg(view, {
    showFog: false,
    lastMove: opts.lastMove ?? null,
  });
  const { w } = viewBoxDims(core);
  return asArticleSvg(core, 'single', w);
}

export function renderCrossroadsChessRow(boards: CrossroadsDiagramBoardOptions[]): string {
  const cores = boards.map(coreBoard);
  const { w: bw, h: bh } = viewBoxDims(cores[0]!);
  const totalW = boards.length * bw + Math.max(0, boards.length - 1) * ROW_GAP;
  const totalH = LABEL_H + bh;
  const body = boards
    .map((opts, index) => {
      const xOffset = index * (bw + ROW_GAP);
      const label = opts.label
        ? `<text x="${xOffset + bw / 2}" y="14" font-size="12" font-weight="600" fill="${LABEL_INK}" text-anchor="middle" letter-spacing="0.5">${opts.label}</text>`
        : '';
      return label + asNestedSvg(cores[index]!, xOffset, LABEL_H, bw, bh);
    })
    .join('');
  return `<svg class="crossroads-article-svg" data-crossroads-layout="wide" style="--crossroads-svg-width: ${totalW}px" viewBox="0 0 ${totalW} ${totalH}" role="img" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}
