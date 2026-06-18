import './variant-mini-boards.css';
import { PIECE_SVGS } from '@mistboard/board-render';
import {
  createInitialXiangqiState,
  getPlayerView as getXiangqiPlayerView,
  type XiangqiColor,
  type XiangqiPieceRole,
} from '@mistboard/game';
import {
  boardAppearanceChangedEvent,
  type PieceSet,
  readStoredPieceSet,
  xiangqiAppearanceChangedEvent,
} from './theme.js';
import { readStoredXiangqiPieceSet } from './xiangqi-appearance-storage.js';
import { renderXiangqiPieceGlyphed, type XiangqiPieceSet } from './xiangqi-piece-sets.js';

// Small "mini board" tiles that represent each variant by a recognizable cropped
// board fragment. Reuses the real cburnett chess art and xiangqi character
// glyphs so the tiles read as the actual game at a glance. Pure SVG strings, no
// mounting, so they drop straight into any surface (homepage carousel, watch
// rail, profile, article cards, the variant lab).
//
// Board surface colours are emitted as CSS classes (variant-mini-boards.css),
// not baked hex, so the markers follow the board / xiangqi / fog pickers through
// the cascade with no re-render, exactly like the live boards and article
// diagrams. Piece ART (which set) is read from the stored appearance at render
// time and rebuilt on a piece-set change via refreshVariantMiniBoards(), because
// an inline-SVG <image> href or baked glyph can't be driven by CSS. Piece INK
// (the xiangqi cream disc + red/black marks) stays fixed by intent.

export type VariantMiniId =
  | 'chess'
  | 'dark-chess'
  | 'draft960'
  | 'xiangqi'
  | 'dark-xiangqi'
  | 'mini-xiangqi'
  | 'dark-mini-xiangqi'
  | 'jieqi'
  | 'banqi'
  | 'crossroads'
  | 'dark-crossroads-chess'
  | 'kriegspiel'
  | 'dark-crazyhouse'
  | 'reveal-chess';

export type VariantMiniFamily = 'chess' | 'xiangqi';

export interface VariantMiniDef {
  id: VariantMiniId;
  label: string;
  shortLabel: string;
  accent: string;
  blurb: string;
  // Which board family the tile belongs to. Drives the frame colour class
  // (chess frame tracks --board-frame; xiangqi frame is a fixed wood brown).
  family: VariantMiniFamily;
}

// The active piece sets a tile is drawn with. Read from stored appearance per
// render; overridable for tests / deterministic prerender.
interface MiniCtx {
  chessSet: PieceSet;
  xqSet: XiangqiPieceSet;
}

// board geometry inside the 100x100 viewBox (leaves room for the rounded frame)
const OX = 2;
const OY = 2;
const SIZE = 96;

// ---- low-level draw helpers ----------------------------------------------

// 'white:king' -> 'wK' etc. — the file naming under /pieces/<set>/.
const CHESS_CODE: Record<string, string> = {
  'white:king': 'wK',
  'white:queen': 'wQ',
  'white:rook': 'wR',
  'white:bishop': 'wB',
  'white:knight': 'wN',
  'white:pawn': 'wP',
  'black:king': 'bK',
  'black:queen': 'bQ',
  'black:rook': 'bR',
  'black:bishop': 'bB',
  'black:knight': 'bN',
  'black:pawn': 'bP',
};

function chessPieceAt(key: string, cx: number, cy: number, cell: number, set: PieceSet): string {
  const s = cell * 0.92;
  const x = cx - s / 2;
  const y = cy - s / 2;
  // cburnett ships as inline SVG art in board-render (no /pieces/cburnett file
  // set), so the default stays inline; every other set is a same-origin asset.
  if (set === 'cburnett') {
    const svg = PIECE_SVGS[key];
    if (!svg) return '';
    const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    return `<svg x="${x}" y="${y}" width="${s}" height="${s}" viewBox="0 0 45 45">${inner}</svg>`;
  }
  const code = CHESS_CODE[key];
  if (!code) return '';
  return `<image href="/pieces/${set}/${code}.svg" x="${x}" y="${y}" width="${s}" height="${s}"/>`;
}

// A face-down chess piece (Reveal Chess): a blank ivory token with a dark rim.
// Identity-hiding only, so it does not vary with the chosen piece set.
function chessBackToken(cx: number, cy: number, cell: number): string {
  const r = cell * 0.4;
  return [
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#efe7d6" stroke="#33312c" stroke-width="2"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${r * 0.58}" fill="none" stroke="#33312c" stroke-width="1" opacity="0.4"/>`,
  ].join('');
}

function checker(cols: number, rows: number, cell: number): string {
  const out: string[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const light = (r + c) % 2 === 0;
      out.push(
        `<rect class="${light ? 'vm-sq-light' : 'vm-sq-dark'}" x="${OX + c * cell}" y="${OY + r * cell}" width="${cell}" height="${cell}"/>`,
      );
    }
  }
  return out.join('');
}

function fogCell(c: number, r: number, cell: number): string {
  // Matches the live 'solid' fog: a flat dark square with a 1px inset shadow.
  const x = OX + c * cell;
  const y = OY + r * cell;
  return [
    `<rect class="vm-chess-fog" x="${x}" y="${y}" width="${cell}" height="${cell}"/>`,
    `<rect class="vm-chess-fog-inset" x="${x + 0.5}" y="${y + 0.5}" width="${cell - 1}" height="${cell - 1}" fill="none" stroke-width="0.8"/>`,
  ].join('');
}

// ---- canonical xiangqi rendering (delegates to the live piece renderer) -----

// A piece disc with the active xiangqi set's mark (traditional/simplified/
// western/symbols), reusing the same renderer the live board + OG cards use so
// every surface renders one identical glyph. Ink (cream disc, red/black) is
// fixed inside that renderer by intent. `size` is the disc's bounding box.
function xiangqiDisc(
  cx: number,
  cy: number,
  size: number,
  color: XiangqiColor,
  role: XiangqiPieceRole,
  set: XiangqiPieceSet,
): string {
  return renderXiangqiPieceGlyphed({ color, role }, set, {
    x: cx - size / 2,
    y: cy - size / 2,
    size,
  });
}

// A face-down piece back (the 'back' shrouded style): a flat colour disc. The
// back art is identity-agnostic, so the set is irrelevant; role is a filler.
function xiangqiBackDisc(
  cx: number,
  cy: number,
  size: number,
  color: XiangqiColor,
  set: XiangqiPieceSet,
): string {
  return renderXiangqiPieceGlyphed({ color, role: 'general' }, set, {
    x: cx - size / 2,
    y: cy - size / 2,
    size,
    shrouded: true,
    shroudedStyle: 'back',
  });
}

// ---- xiangqi intersection-grid geometry -----------------------------------

interface XqGeom {
  px: (c: number) => number;
  py: (r: number) => number;
  gx: number;
  gy: number;
  cols: number;
  rows: number;
}

function xqGeom(cols: number, rows: number, margin = 9): XqGeom {
  const gx = (SIZE - 2 * margin) / (cols - 1);
  const gy = (SIZE - 2 * margin) / (rows - 1);
  const left = OX + margin;
  const top = OY + margin;
  return { px: (c) => left + c * gx, py: (r) => top + r * gy, gx, gy, cols, rows };
}

// Bamboo board + grid lines; interior verticals break at the river gap, and an
// optional palace box gets corner-to-corner diagonals.
function xqBoard(
  g: XqGeom,
  opts: {
    riverGapAfterRow?: number;
    palace?: { cLo: number; cHi: number; rLo: number; rHi: number };
  } = {},
): string {
  const lines: string[] = [];
  for (let r = 0; r < g.rows; r += 1) {
    lines.push(`<line x1="${g.px(0)}" y1="${g.py(r)}" x2="${g.px(g.cols - 1)}" y2="${g.py(r)}"/>`);
  }
  for (let c = 0; c < g.cols; c += 1) {
    const edge = c === 0 || c === g.cols - 1;
    if (opts.riverGapAfterRow !== undefined && !edge) {
      const rg = opts.riverGapAfterRow;
      lines.push(`<line x1="${g.px(c)}" y1="${g.py(0)}" x2="${g.px(c)}" y2="${g.py(rg)}"/>`);
      lines.push(
        `<line x1="${g.px(c)}" y1="${g.py(rg + 1)}" x2="${g.px(c)}" y2="${g.py(g.rows - 1)}"/>`,
      );
    } else {
      lines.push(
        `<line x1="${g.px(c)}" y1="${g.py(0)}" x2="${g.px(c)}" y2="${g.py(g.rows - 1)}"/>`,
      );
    }
  }
  if (opts.palace) {
    const p = opts.palace;
    lines.push(
      `<line x1="${g.px(p.cLo)}" y1="${g.py(p.rLo)}" x2="${g.px(p.cHi)}" y2="${g.py(p.rHi)}"/>`,
    );
    lines.push(
      `<line x1="${g.px(p.cHi)}" y1="${g.py(p.rLo)}" x2="${g.px(p.cLo)}" y2="${g.py(p.rHi)}"/>`,
    );
  }
  return [
    `<rect class="vm-xq-bg" x="${OX}" y="${OY}" width="${SIZE}" height="${SIZE}"/>`,
    `<g class="vm-xq-line" stroke-width="1" stroke-linecap="round">${lines.join('')}</g>`,
  ].join('');
}

// ---- per-variant tile bodies ---------------------------------------------

// Shared 5x5 chess-family crop: white's back rank (caller-supplied files) under
// a rank of pawns. `fogRows` lists which of the three empty front ranks — rows
// 0-2, counted from the top — are shrouded: none for plain chess; just the top
// (rank 5) for the field-of-fire dark variants, since white sees ranks 1-4 in
// full (own pieces, every pawn's one/two-square advance and capture squares, and
// the knight jumps — verified against darkChessVariant.getPlayerView); all three
// for kriegspiel, where only your own army is ever visible.
function fiveWideChessBody(
  backRank: readonly string[],
  fogRows: readonly number[],
  ctx: MiniCtx,
): string {
  const cell = SIZE / 5;
  const center = (c: number, r: number) => ({ x: OX + (c + 0.5) * cell, y: OY + (r + 0.5) * cell });
  const pieces: string[] = [];
  for (let c = 0; c < 5; c += 1) {
    const pawn = center(c, 3);
    const piece = center(c, 4);
    pieces.push(chessPieceAt('white:pawn', pawn.x, pawn.y, cell, ctx.chessSet));
    pieces.push(chessPieceAt(backRank[c]!, piece.x, piece.y, cell, ctx.chessSet));
  }
  const fog: string[] = [];
  for (const r of fogRows) {
    for (let c = 0; c < 5; c += 1) fog.push(fogCell(c, r, cell));
  }
  return [checker(5, 5, cell), ...pieces, ...fog].join('');
}

// Files d..h on white's back rank: queen, king, bishop, knight, rook.
const KINGSIDE_FIVE = ['white:queen', 'white:king', 'white:bishop', 'white:knight', 'white:rook'];

// Plain board, nothing hidden.
function chessCornerBody(ctx: MiniCtx): string {
  return fiveWideChessBody(KINGSIDE_FIVE, [], ctx);
}

// Field-of-fire vision: white sees ranks 1-4, so only the 5th rank (top row) fogs.
function darkChessBody(ctx: MiniCtx): string {
  return fiveWideChessBody(KINGSIDE_FIVE, [0], ctx);
}

// A Chess960-style scramble — queen + king off their standard files so the
// arrangement reads as shuffled vs. dark chess. Same opening vision (pawns still
// on rank 2 → ranks 3-4 visible), so the fog still sits only on the top row.
function draft960Body(ctx: MiniCtx): string {
  return fiveWideChessBody(
    ['white:king', 'white:rook', 'white:queen', 'white:knight', 'white:bishop'],
    [0],
    ctx,
  );
}

// Red's accurate vision of the xiangqi opening: a square is visible iff a red
// piece can move to it (field of fire); everything else is fogged.
const XQ_RED_VISIBLE = new Set<string>(
  getXiangqiPlayerView(createInitialXiangqiState('xq-mini-tile'), 'red').visibleSquares,
);

function xiangqiCourtBody(showFog: boolean, ctx: MiniCtx): string {
  // Red's base on files a..e, ranks 1..5, mirrored horizontally (columns flipped
  // f -> 4-f; glyphs stay upright). The back-rank court (chariot, horse, elephant,
  // advisor, general), the cannon on b3 behind the rank-4 soldiers (a, c, e), and
  // (in Dark Xiangqi) real-vision fog — the advisor file (d) blind spot (d2, d4,
  // d5) plus c2 where the elephant screens the horse's leg. Standard xiangqi
  // leaves those same squares as plain intersections.
  // Inset the grid a touch more than the default so the points pull in from the
  // frame, leaving room for larger, more legible discs without edge clipping.
  const g = xqGeom(5, 5, 11);
  const disc = g.gx * 0.92;
  const px = (f: number) => g.px(4 - f); // mirror columns; keep pieces unflipped
  const fileCh = (f: number) => String.fromCharCode(97 + f);
  // Fog cells tile from midpoint to midpoint between grid points, clamped to the
  // board frame at the outer edges, and render as a SINGLE translucent path so
  // adjacent cells merge with no anti-aliased seams and the edge cells sit flush
  // against the border (drawing them as separate translucent rects leaves both).
  const fog: string[] = [];
  if (showFog) {
    const cells: string[] = [];
    for (let f = 0; f <= 4; f += 1) {
      for (let rank = 1; rank <= 5; rank += 1) {
        if (XQ_RED_VISIBLE.has(`${fileCh(f)}${rank}`)) continue;
        const dc = 4 - f; // display column (columns are mirrored)
        const dr = 5 - rank; // display row (rank 5 at the top)
        const x0 = dc === 0 ? OX : (g.px(dc - 1) + g.px(dc)) / 2;
        const x1 = dc === 4 ? OX + SIZE : (g.px(dc) + g.px(dc + 1)) / 2;
        const y0 = dr === 0 ? OY : (g.py(dr - 1) + g.py(dr)) / 2;
        const y1 = dr === 4 ? OY + SIZE : (g.py(dr) + g.py(dr + 1)) / 2;
        cells.push(`M${x0} ${y0}H${x1}V${y1}H${x0}Z`);
      }
    }
    if (cells.length) fog.push(`<path class="vm-xq-fog" d="${cells.join('')}"/>`);
  }
  const court: XiangqiPieceRole[] = ['chariot', 'horse', 'elephant', 'advisor', 'general'];
  const courtPieces = court.map((role, f) =>
    xiangqiDisc(px(f), g.py(4), disc, 'red', role, ctx.xqSet),
  );
  // The visible half of the palace: file f is off this crop, so draw the two
  // diagonals over the advisor (file d) and general (file e) files only.
  const halfPalace = `<g class="vm-xq-line" stroke-width="1" stroke-linecap="round"><line x1="${px(3)}" y1="${g.py(4)}" x2="${px(4)}" y2="${g.py(3)}"/><line x1="${px(3)}" y1="${g.py(2)}" x2="${px(4)}" y2="${g.py(3)}"/></g>`;
  const pieces = [
    ...courtPieces,
    xiangqiDisc(px(1), g.py(2), disc, 'red', 'cannon', ctx.xqSet),
    // soldiers sit on rank 4, two rows ahead of the cannon's rank
    ...[0, 2, 4].map((f) => xiangqiDisc(px(f), g.py(1), disc, 'red', 'soldier', ctx.xqSet)),
  ];
  return [xqBoard(g), halfPalace, fog.join(''), ...pieces].join('');
}

function miniXiangqiCutBody(showFog: boolean, ctx: MiniCtx): string {
  // A 3x3-cell (4x4-point) cut of the real mini-xiangqi opening: files d..g,
  // ranks 1..4 (one file + one rank tighter than the full court, so the pieces
  // read larger). The general sits on the cropped left edge (file d), showing
  // the right half of its palace; horse and cannon fill the back rank and a
  // chariot anchors the right.
  // Wider margin than the default: with only 4 points across, the cells (and so
  // the discs) grow, and the outer-ring pieces would overflow the rounded frame
  // unless the grid is inset further from the edge.
  const g = xqGeom(4, 4, 13);
  const disc = g.gx * 0.9;
  // file d..g -> col 0..3 ; rank 1..4 -> row 3..0 (red on the near/bottom side)
  const at = (file: number, rank: number) => ({ x: g.px(file - 3), y: g.py(4 - rank) });
  const backRank: Array<[number, XiangqiPieceRole]> = [
    [3, 'general'],
    [4, 'horse'],
    [5, 'cannon'],
    [6, 'chariot'],
  ];
  const pieces = [
    ...backRank.map(([file, role]) => {
      const p = at(file, 1);
      return xiangqiDisc(p.x, p.y, disc, 'red', role, ctx.xqSet);
    }),
    // soldiers sit in front of files d, e, g (the cannon file f stays open)
    ...[3, 4, 6].map((file) => {
      const p = at(file, 2);
      return xiangqiDisc(p.x, p.y, disc, 'red', 'soldier', ctx.xqSet);
    }),
  ].join('');
  // The visible (right) half of the general's palace: its centre (d2) sits on
  // the cropped left edge, so draw the two diagonals fanning in toward file e.
  const halfPalace = `<g class="vm-xq-line" stroke-width="1" stroke-linecap="round"><line x1="${g.px(0)}" y1="${g.py(2)}" x2="${g.px(1)}" y2="${g.py(1)}"/><line x1="${g.px(0)}" y1="${g.py(2)}" x2="${g.px(1)}" y2="${g.py(3)}"/></g>`;
  // Dark variant: red sees ranks 1-3 in full; only the 4th rank (the top row) is
  // fogged, and even there the cannon file (f, col 2) stays open — its sightline
  // up the board is clear. Verified against getMiniXiangqiPlayerView. Standard
  // mini-xiangqi shows the same approach as plain board.
  let fog = '';
  if (showFog) {
    const fogYBottom = (g.py(0) + g.py(1)) / 2;
    const leftX1 = (g.px(1) + g.px(2)) / 2;
    const rightX0 = (g.px(2) + g.px(3)) / 2;
    fog = [
      `<rect class="vm-xq-fog" x="${OX}" y="${OY}" width="${leftX1 - OX}" height="${fogYBottom - OY}"/>`,
      `<rect class="vm-xq-fog" x="${rightX0}" y="${OY}" width="${OX + SIZE - rightX0}" height="${fogYBottom - OY}"/>`,
    ].join('');
  }
  return [xqBoard(g), halfPalace, pieces, fog].join('');
}

function jieqiBody(ctx: MiniCtx): string {
  // Same crop as Dark Xiangqi (mirrored), but jieqi hides identities, not
  // positions: every piece except the general is flipped to its blank
  // solid-colour back. No position fog — the whole board is visible.
  // Inset the grid a touch more than the default so the points pull in from the
  // frame, leaving room for larger, more legible discs without edge clipping.
  const g = xqGeom(5, 5, 11);
  const disc = g.gx * 0.92;
  const px = (f: number) => g.px(4 - f);
  const court: XiangqiPieceRole[] = ['chariot', 'horse', 'elephant', 'advisor', 'general'];
  const courtPieces = court.map((role, f) =>
    role === 'general'
      ? xiangqiDisc(px(f), g.py(4), disc, 'red', role, ctx.xqSet)
      : xiangqiBackDisc(px(f), g.py(4), disc, 'red', ctx.xqSet),
  );
  const halfPalace = `<g class="vm-xq-line" stroke-width="1" stroke-linecap="round"><line x1="${px(3)}" y1="${g.py(4)}" x2="${px(4)}" y2="${g.py(3)}"/><line x1="${px(3)}" y1="${g.py(2)}" x2="${px(4)}" y2="${g.py(3)}"/></g>`;
  const pieces = [
    ...courtPieces,
    xiangqiBackDisc(px(1), g.py(2), disc, 'red', ctx.xqSet),
    ...[0, 2, 4].map((f) => xiangqiBackDisc(px(f), g.py(1), disc, 'red', ctx.xqSet)),
  ];
  return [xqBoard(g), halfPalace, ...pieces].join('');
}

function banqiBody(ctx: MiniCtx): string {
  // Banqi plays in cells (not on intersections): a 3x3 cell crop of face-down
  // pieces, two flipped. Cells distinguish it from jieqi's point grid.
  const cols = 3;
  const rows = 3;
  const margin = 6;
  const cw = (SIZE - 2 * margin) / cols;
  const ch = (SIZE - 2 * margin) / rows;
  const left = OX + margin;
  const top = OY + margin;
  const ccx = (c: number) => left + (c + 0.5) * cw;
  const ccy = (r: number) => top + (r + 0.5) * ch;
  const disc = Math.min(cw, ch) * 0.86;
  const lines: string[] = [];
  for (let r = 0; r <= rows; r += 1) {
    lines.push(
      `<line x1="${left}" y1="${top + r * ch}" x2="${left + cols * cw}" y2="${top + r * ch}"/>`,
    );
  }
  for (let c = 0; c <= cols; c += 1) {
    lines.push(
      `<line x1="${left + c * cw}" y1="${top}" x2="${left + c * cw}" y2="${top + rows * ch}"/>`,
    );
  }
  // Two generals flipped face-up on opposite corners (red bottom-left, black
  // top-right); everything else a uniform face-down back (banqi backs are
  // colour-agnostic — you don't know colour or rank until a flip).
  const redGeneral: [number, number] = [0, 2];
  const blackGeneral: [number, number] = [2, 0];
  const revealed = new Set([
    `${redGeneral[0]},${redGeneral[1]}`,
    `${blackGeneral[0]},${blackGeneral[1]}`,
  ]);
  const backs: string[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (revealed.has(`${c},${r}`)) continue;
      backs.push(xiangqiBackDisc(ccx(c), ccy(r), disc, 'black', ctx.xqSet));
    }
  }
  return [
    `<rect class="vm-xq-bg" x="${OX}" y="${OY}" width="${SIZE}" height="${SIZE}"/>`,
    `<g class="vm-xq-line" stroke-width="1" stroke-linecap="round">${lines.join('')}</g>`,
    backs.join(''),
    xiangqiDisc(ccx(redGeneral[0]), ccy(redGeneral[1]), disc, 'red', 'general', ctx.xqSet),
    xiangqiDisc(ccx(blackGeneral[0]), ccy(blackGeneral[1]), disc, 'black', 'general', ctx.xqSet),
  ].join('');
}

function crossroadsBody(ctx: MiniCtx): string {
  // The crossroads: xiangqi pieces hold the left flank, chess pieces the right,
  // on one chess checker. Bottom rank cannon-horse | knight-king; the rank in
  // front two soldiers | two pawns. The river gets its own band along the top,
  // so the checker sits fully below it (no clipped top row).
  const riverH = 7;
  const boardTop = OY + riverH;
  const cw = SIZE / 4;
  const ch = (SIZE - riverH) / 4;
  const cx = (c: number) => OX + (c + 0.5) * cw;
  const cy = (r: number) => boardTop + (r + 0.5) * ch;
  const pieceCell = Math.min(cw, ch);
  const disc = pieceCell * 0.86;
  const cells: string[] = [];
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      const light = (r + c) % 2 === 0;
      cells.push(
        `<rect class="${light ? 'vm-sq-light' : 'vm-sq-dark'}" x="${OX + c * cw}" y="${boardTop + r * ch}" width="${cw}" height="${ch}"/>`,
      );
    }
  }
  const river = `<rect class="vm-river" x="${OX}" y="${OY}" width="${SIZE}" height="${riverH}"/>`;
  const pieces = [
    xiangqiDisc(cx(0), cy(3), disc, 'black', 'cannon', ctx.xqSet),
    xiangqiDisc(cx(1), cy(3), disc, 'black', 'horse', ctx.xqSet),
    xiangqiDisc(cx(0), cy(2), disc, 'black', 'soldier', ctx.xqSet),
    xiangqiDisc(cx(1), cy(2), disc, 'black', 'soldier', ctx.xqSet),
    chessPieceAt('white:knight', cx(2), cy(3), pieceCell, ctx.chessSet),
    chessPieceAt('white:king', cx(3), cy(3), pieceCell, ctx.chessSet),
    chessPieceAt('white:pawn', cx(2), cy(2), pieceCell, ctx.chessSet),
    chessPieceAt('white:pawn', cx(3), cy(2), pieceCell, ctx.chessSet),
  ];
  return [cells.join(''), river, ...pieces].join('');
}

// Blind chess: you only ever see your own army. Every square without one of your
// own pieces or pawns is dark, so all three empty ranks in front are fogged —
// the inverse of dark chess, where field-of-fire vision keeps them clear.
function kriegspielBody(ctx: MiniCtx): string {
  return fiveWideChessBody(KINGSIDE_FIVE, [0, 1, 2], ctx);
}

// Crazyhouse under fog: the dark-chess field-of-fire board (only the top row
// fogs), plus a piece PARACHUTED onto a fogged square, the crazyhouse signature.
function darkCrazyhouseBody(ctx: MiniCtx): string {
  const cell = SIZE / 5;
  const drop = { x: OX + 2.5 * cell, y: OY + 0.5 * cell };
  return (
    fiveWideChessBody(KINGSIDE_FIVE, [0], ctx) +
    chessPieceAt('white:knight', drop.x, drop.y, cell, ctx.chessSet)
  );
}

// Dark Crossroads: the chess+xiangqi fusion board with fog laid over the two
// empty ranks ahead of the armies (the dark layer on the Crossroads board).
function darkCrossroadsBody(ctx: MiniCtx): string {
  const riverH = 7;
  const boardTop = OY + riverH;
  const cw = SIZE / 4;
  const ch = (SIZE - riverH) / 4;
  const fog: string[] = [];
  for (let r = 0; r < 2; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      const x = OX + c * cw;
      const y = boardTop + r * ch;
      fog.push(
        `<rect class="vm-chess-fog" x="${x}" y="${y}" width="${cw}" height="${ch}"/>`,
        `<rect class="vm-chess-fog-inset" x="${x + 0.5}" y="${y + 0.5}" width="${cw - 1}" height="${ch - 1}" fill="none" stroke-width="0.8"/>`,
      );
    }
  }
  return crossroadsBody(ctx) + fog.join('');
}

function revealChessBody(ctx: MiniCtx): string {
  // Hidden-identity chess (chess jieqi): every piece starts face-down (a blank
  // token) except the king, which is face-up. No fog — only identities hide.
  const cell = SIZE / 4;
  const center = (c: number, r: number) => ({ x: OX + (c + 0.5) * cell, y: OY + (r + 0.5) * cell });
  const kingCol = 1;
  const pieces: string[] = [];
  for (let c = 0; c < 4; c += 1) {
    const pawn = center(c, 2);
    const back = center(c, 3);
    pieces.push(chessBackToken(pawn.x, pawn.y, cell));
    if (c === kingCol) {
      pieces.push(chessPieceAt('white:king', back.x, back.y, cell, ctx.chessSet));
    } else {
      pieces.push(chessBackToken(back.x, back.y, cell));
    }
  }
  return [checker(4, 4, cell), ...pieces].join('');
}

// ---- registry + render entry ----------------------------------------------

const BODIES: Record<VariantMiniId, (ctx: MiniCtx) => string> = {
  chess: chessCornerBody,
  'dark-chess': darkChessBody,
  draft960: draft960Body,
  xiangqi: (ctx) => xiangqiCourtBody(false, ctx),
  'dark-xiangqi': (ctx) => xiangqiCourtBody(true, ctx),
  'mini-xiangqi': (ctx) => miniXiangqiCutBody(false, ctx),
  'dark-mini-xiangqi': (ctx) => miniXiangqiCutBody(true, ctx),
  jieqi: jieqiBody,
  banqi: banqiBody,
  crossroads: crossroadsBody,
  'dark-crossroads-chess': darkCrossroadsBody,
  kriegspiel: kriegspielBody,
  'dark-crazyhouse': darkCrazyhouseBody,
  'reveal-chess': revealChessBody,
};

export const VARIANT_MINIS: readonly VariantMiniDef[] = [
  {
    id: 'chess',
    label: 'Chess',
    shortLabel: 'CH',
    accent: '#6b7280',
    blurb: 'The classic start: a back rank under a rank of pawns, nothing hidden.',
    family: 'chess',
  },
  {
    id: 'dark-chess',
    label: 'Dark chess',
    shortLabel: 'DC',
    accent: '#1f6f5b',
    blurb: 'Four pawns over a back rank; the enemy half all fog.',
    family: 'chess',
  },
  {
    id: 'draft960',
    label: 'Dark Draft960',
    shortLabel: '960',
    accent: '#8a5a18',
    blurb: "White's back rank shuffled, the enemy half all fog.",
    family: 'chess',
  },
  {
    id: 'xiangqi',
    label: 'Xiangqi',
    shortLabel: 'XQ',
    accent: '#8b5a24',
    blurb: "Red's court and cannon across the river board, nothing hidden.",
    family: 'xiangqi',
  },
  {
    id: 'dark-xiangqi',
    label: 'Dark Xiangqi',
    shortLabel: 'DX',
    accent: '#9f342d',
    blurb: "Red's court and cannon; fog marks the squares no red piece can reach.",
    family: 'xiangqi',
  },
  {
    id: 'mini-xiangqi',
    label: 'Mini Xiangqi',
    shortLabel: 'MX',
    accent: '#a16207',
    blurb: 'The small-board opening: general by its palace, cannon, and chariot.',
    family: 'xiangqi',
  },
  {
    id: 'dark-mini-xiangqi',
    label: 'Dark Mini Xiangqi',
    shortLabel: 'DMX',
    accent: '#c2410c',
    blurb: 'A real-opening cut: general by its palace, cannon, and chariot.',
    family: 'xiangqi',
  },
  {
    id: 'jieqi',
    label: 'Jieqi',
    shortLabel: 'JQ',
    accent: '#6d4aa0',
    blurb: 'The xiangqi opening with every piece flipped face-down but the general.',
    family: 'xiangqi',
  },
  {
    id: 'banqi',
    label: 'Banqi',
    shortLabel: 'BQ',
    accent: '#2563a6',
    blurb: 'Face-down pieces in cells; both generals flipped up.',
    family: 'xiangqi',
  },
  {
    id: 'crossroads',
    label: 'Crossroads Chess',
    shortLabel: 'CR',
    accent: '#3f7d4e',
    blurb: 'Xiangqi cannon and horse beside chess knight and king, river on top.',
    family: 'chess',
  },
  {
    id: 'dark-crossroads-chess',
    label: 'Dark Crossroads',
    shortLabel: 'DC',
    accent: '#2f5d4a',
    blurb: 'The Crossroads fusion played blind: race the king to the far rank or capture it.',
    family: 'chess',
  },
  {
    id: 'kriegspiel',
    label: 'Kriegspiel',
    shortLabel: 'KS',
    accent: '#566273',
    blurb: 'Blind chess: only your own army, alone on the board.',
    family: 'chess',
  },
  {
    id: 'dark-crazyhouse',
    label: 'Dark Crazyhouse',
    shortLabel: 'CZ',
    accent: '#7a4f86',
    blurb: 'Fog chess with drops: captures flip to your hand and parachute back in.',
    family: 'chess',
  },
  {
    id: 'reveal-chess',
    label: 'Reveal Chess',
    shortLabel: 'RV',
    accent: '#9b3f74',
    blurb: 'Chess with hidden identities: every piece face-down but the king.',
    family: 'chess',
  },
];

export function variantMiniForId(id: VariantMiniId): VariantMiniDef {
  const def = VARIANT_MINIS.find((candidate) => candidate.id === id);
  if (!def) throw new Error(`Unknown variant mini: ${id}`);
  return def;
}

let clipSeq = 0;

export function renderVariantMiniBoard(
  id: VariantMiniId,
  opts: {
    className?: string;
    label?: string;
    size?: number;
    chessSet?: PieceSet;
    xqSet?: XiangqiPieceSet;
  } = {},
): string {
  const def = variantMiniForId(id);
  const size = opts.size ?? 96;
  const label = opts.label ?? `${def.label} board`;
  const ctx: MiniCtx = {
    chessSet: opts.chessSet ?? readStoredPieceSet(),
    xqSet: opts.xqSet ?? readStoredXiangqiPieceSet(),
  };
  // First render in a browser wires the listeners that rebuild markers on a
  // piece-set change (board/fog colours need no rebuild — they cascade).
  bindAppearanceListeners();
  clipSeq += 1;
  const clipId = `mini-clip-${clipSeq}`;
  const body = BODIES[id](ctx);
  const frameClass = def.family === 'xiangqi' ? 'vm-frame-xq' : 'vm-frame-chess';
  const className = opts.className ? `variant-mini ${opts.className}` : 'variant-mini';
  const dataClass = opts.className ? ` data-mini-class="${escapeAttr(opts.className)}"` : '';
  return [
    `<svg class="${escapeAttr(className)}" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${escapeAttr(label)}" data-mini-id="${id}" data-mini-size="${size}" data-mini-label="${escapeAttr(label)}"${dataClass} xmlns="http://www.w3.org/2000/svg">`,
    `<defs><clipPath id="${clipId}"><rect x="${OX}" y="${OY}" width="${SIZE}" height="${SIZE}" rx="11"/></clipPath></defs>`,
    `<g clip-path="url(#${clipId})">${body}</g>`,
    `<rect class="${frameClass}" x="${OX}" y="${OY}" width="${SIZE}" height="${SIZE}" rx="11" fill="none" stroke-width="2.5"/>`,
    `</svg>`,
  ].join('');
}

// Rebuild every mounted marker with the current piece sets. Board / xiangqi /
// fog colours follow the CSS cascade and need no rebuild; piece ART can't be
// swapped by CSS, so the SVG is re-rendered. Cheap: there are only a handful of
// markers on any page, and this only fires on an appearance change.
export function refreshVariantMiniBoards(root?: ParentNode): void {
  if (typeof document === 'undefined') return;
  const scope = root ?? document;
  for (const svg of Array.from(scope.querySelectorAll<SVGElement>('svg[data-mini-id]'))) {
    const id = svg.getAttribute('data-mini-id');
    if (!id || !VARIANT_MINIS.some((d) => d.id === id)) continue;
    const sizeAttr = Number(svg.getAttribute('data-mini-size'));
    const size = Number.isFinite(sizeAttr) && sizeAttr > 0 ? sizeAttr : undefined;
    const label = svg.getAttribute('data-mini-label') ?? undefined;
    const className = svg.getAttribute('data-mini-class') ?? undefined;
    svg.outerHTML = renderVariantMiniBoard(id as VariantMiniId, { size, label, className });
  }
}

let appearanceListenersBound = false;
function bindAppearanceListeners(): void {
  if (appearanceListenersBound) return;
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  appearanceListenersBound = true;
  const refresh = (): void => {
    refreshVariantMiniBoards();
  };
  window.addEventListener(boardAppearanceChangedEvent, refresh);
  window.addEventListener(xiangqiAppearanceChangedEvent, refresh);
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
