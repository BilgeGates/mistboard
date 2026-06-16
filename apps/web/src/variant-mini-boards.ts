import { GREEN_PALETTE, PIECE_SVGS, XIANGQI_GLYPH_PATHS } from '@mistboard/board-render';
import { createInitialXiangqiState, getPlayerView as getXiangqiPlayerView } from '@mistboard/game';

// Dev-only prototype: small "mini board" tiles that represent each variant by a
// recognizable cropped board fragment (vs. the abstract glyphs in
// variant-marks.ts). Reuses the real cburnett chess art and xiangqi character
// glyphs so the tiles read as the actual game at a glance. Pure SVG strings,
// no mounting, so they drop straight into the variant lab review surface.

export type VariantMiniId =
  | 'dark-chess'
  | 'draft960'
  | 'dark-xiangqi'
  | 'dark-mini-xiangqi'
  | 'jieqi'
  | 'banqi'
  | 'crossroads';

export interface VariantMiniDef {
  id: VariantMiniId;
  label: string;
  shortLabel: string;
  accent: string;
  blurb: string;
  frame: string;
}

// ---- shared palette -------------------------------------------------------

// Chess-family squares + frame come from the product's default in-app green
// theme, so the tiles read like the live game room and the article boards.
const CHESS_LIGHT = GREEN_PALETTE.light;
const CHESS_DARK = GREEN_PALETTE.dark;
const CHESS_FRAME = GREEN_PALETTE.frame;
// Fog matches the default 'solid' fog theme: a flat dark square + inset shadow.
const FOG_SOLID = GREEN_PALETTE.fogSolidLightFill;
const FOG_INSET = GREEN_PALETTE.fogShadow;

// Xiangqi-family colours mirror the article diagram palette (--xq-diagram-*)
// and the OG card renderer, so the tiles read like the live xiangqi boards.
const XQ_BG = '#d9bd82';
const XQ_LINE = '#4b3c2a';
const XQ_FRAME = '#8b5a24';
const XQ_DISC = '#f3e6c4';
const XQ_RED = '#b91c1c';
const XQ_BLACK = '#1f2937';
const XQ_FOG = 'rgba(36, 25, 15, 0.6)';
// Face-down piece backs (jieqi/banqi) — the 'back' shrouded style.
const XQ_BACK_RED_FILL = '#a95f4a';
const XQ_BACK_RED_RING = '#6f342c';
const XQ_BACK_BLACK_FILL = '#2f7d62';
const XQ_BACK_BLACK_RING = '#174536';
// Crossroads keeps a faint river band over its chess checker.
const RIVER_FILL = 'rgba(214, 230, 234, 0.62)';

// board geometry inside the 100x100 viewBox (leaves room for the rounded frame)
const OX = 4;
const OY = 4;
const SIZE = 92;

// ---- low-level draw helpers ----------------------------------------------

function chessPieceAt(key: string, cx: number, cy: number, cell: number): string {
  const svg = PIECE_SVGS[key];
  if (!svg) return '';
  const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const s = cell * 0.92;
  return `<svg x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" viewBox="0 0 45 45">${inner}</svg>`;
}

function checker(cols: number, rows: number, cell: number): string {
  const out: string[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const light = (r + c) % 2 === 0;
      out.push(
        `<rect x="${OX + c * cell}" y="${OY + r * cell}" width="${cell}" height="${cell}" fill="${light ? CHESS_LIGHT : CHESS_DARK}"/>`,
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
    `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${FOG_SOLID}"/>`,
    `<rect x="${x + 0.5}" y="${y + 0.5}" width="${cell - 1}" height="${cell - 1}" fill="none" stroke="${FOG_INSET}" stroke-width="0.8"/>`,
  ].join('');
}

// ---- canonical xiangqi rendering (mirrors renderXiangqiOgBoardSvg) ---------

type XqColor = 'red' | 'black';

const XQ_TRAD: Record<XqColor, Record<string, string>> = {
  red: { general: '帥', advisor: '仕', elephant: '相', horse: '傌', chariot: '俥', cannon: '炮', soldier: '兵' },
  black: { general: '將', advisor: '士', elephant: '象', horse: '馬', chariot: '車', cannon: '砲', soldier: '卒' },
};

// A piece disc with the baked traditional glyph path (font-independent), sized
// like the OG cards: r46 cream disc, r38 inner ring, glyph filled in ink. `size`
// is the disc's bounding box (the glyph viewBox is 0..100).
function xiangqiDisc(cx: number, cy: number, size: number, color: XqColor, role: string): string {
  const ink = color === 'red' ? XQ_RED : XQ_BLACK;
  const path = XIANGQI_GLYPH_PATHS[XQ_TRAD[color][role]!];
  const scale = size / 100;
  return [
    `<g transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${scale})">`,
    `<circle cx="50" cy="50" r="46" fill="${XQ_DISC}" stroke="${ink}" stroke-width="2.5"/>`,
    `<circle cx="50" cy="50" r="38" fill="none" stroke="${ink}" stroke-width="1.5"/>`,
    path ? `<path d="${path}" fill="${ink}"/>` : '',
    `</g>`,
  ].join('');
}

// A face-down piece back (the 'back' shrouded style): a flat colour disc.
function xiangqiBackDisc(cx: number, cy: number, size: number, color: XqColor): string {
  const fill = color === 'red' ? XQ_BACK_RED_FILL : XQ_BACK_BLACK_FILL;
  const stroke = color === 'red' ? XQ_BACK_RED_RING : XQ_BACK_BLACK_RING;
  const scale = size / 100;
  return `<g transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${scale})"><circle cx="50" cy="50" r="43" fill="${fill}" stroke="${stroke}" stroke-width="3"/></g>`;
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
  opts: { riverGapAfterRow?: number; palace?: { cLo: number; cHi: number; rLo: number; rHi: number } } = {},
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
      lines.push(`<line x1="${g.px(c)}" y1="${g.py(rg + 1)}" x2="${g.px(c)}" y2="${g.py(g.rows - 1)}"/>`);
    } else {
      lines.push(`<line x1="${g.px(c)}" y1="${g.py(0)}" x2="${g.px(c)}" y2="${g.py(g.rows - 1)}"/>`);
    }
  }
  if (opts.palace) {
    const p = opts.palace;
    lines.push(`<line x1="${g.px(p.cLo)}" y1="${g.py(p.rLo)}" x2="${g.px(p.cHi)}" y2="${g.py(p.rHi)}"/>`);
    lines.push(`<line x1="${g.px(p.cHi)}" y1="${g.py(p.rLo)}" x2="${g.px(p.cLo)}" y2="${g.py(p.rHi)}"/>`);
  }
  return [
    `<rect x="${OX}" y="${OY}" width="${SIZE}" height="${SIZE}" fill="${XQ_BG}"/>`,
    `<g stroke="${XQ_LINE}" stroke-width="1" stroke-linecap="round">${lines.join('')}</g>`,
  ].join('');
}

// ---- per-variant tile bodies ---------------------------------------------

function darkChessBody(): string {
  const cell = SIZE / 4;
  const center = (c: number, r: number) => ({ x: OX + (c + 0.5) * cell, y: OY + (r + 0.5) * cell });
  // Friendly half: a real chess quarter — back rank under a rank of pawns.
  const backRank = ['white:king', 'white:bishop', 'white:knight', 'white:rook'];
  const pieces: string[] = [];
  for (let c = 0; c < 4; c += 1) {
    const pawn = center(c, 2);
    const piece = center(c, 3);
    pieces.push(chessPieceAt('white:pawn', pawn.x, pawn.y, cell));
    pieces.push(chessPieceAt(backRank[c]!, piece.x, piece.y, cell));
  }
  // Enemy half (top two rows) fully shrouded — hidden pieces aren't drawn.
  const fog: string[] = [];
  for (let c = 0; c < 4; c += 1) {
    fog.push(fogCell(c, 0, cell));
    fog.push(fogCell(c, 1, cell));
  }
  return [checker(4, 4, cell), ...pieces, ...fog].join('');
}

function draft960Body(): string {
  const cell = SIZE / 4;
  const center = (c: number, r: number) => ({ x: OX + (c + 0.5) * cell, y: OY + (r + 0.5) * cell });
  // White's back rank, shuffled Chess960-style — queen + king off their
  // standard files so the arrangement reads as scrambled vs. dark chess.
  const backRank = ['white:queen', 'white:king', 'white:rook', 'white:knight'];
  const pieces: string[] = [];
  for (let c = 0; c < 4; c += 1) {
    const pawn = center(c, 2);
    const piece = center(c, 3);
    pieces.push(chessPieceAt('white:pawn', pawn.x, pawn.y, cell));
    pieces.push(chessPieceAt(backRank[c]!, piece.x, piece.y, cell));
  }
  // Enemy half (top two rows) shrouded, same as dark chess.
  const fog: string[] = [];
  for (let c = 0; c < 4; c += 1) {
    fog.push(fogCell(c, 0, cell));
    fog.push(fogCell(c, 1, cell));
  }
  return [checker(4, 4, cell), ...pieces, ...fog].join('');
}

// Red's accurate vision of the xiangqi opening: a square is visible iff a red
// piece can move to it (field of fire); everything else is fogged.
const XQ_RED_VISIBLE = new Set<string>(
  getXiangqiPlayerView(createInitialXiangqiState('xq-mini-tile'), 'red').visibleSquares,
);

function darkXiangqiBody(): string {
  // Red's base on files a..e, ranks 1..5: the back-rank court (chariot, horse,
  // elephant, advisor, general), the cannon on b3 behind the rank-4 soldiers
  // (a, c, e). Fog is computed from real vision — the advisor file (d) has a
  // blind spot (d2, d4, d5) and c2 is screened by the elephant's horse-leg.
  const g = xqGeom(5, 5);
  const disc = g.gx * 0.86;
  const fileCh = (f: number) => String.fromCharCode(97 + f);
  const fog: string[] = [];
  for (let f = 0; f <= 4; f += 1) {
    for (let rank = 1; rank <= 5; rank += 1) {
      if (XQ_RED_VISIBLE.has(`${fileCh(f)}${rank}`)) continue;
      const cx = g.px(f);
      const cy = g.py(5 - rank);
      fog.push(
        `<rect x="${cx - g.gx / 2}" y="${cy - g.gy / 2}" width="${g.gx}" height="${g.gy}" fill="${XQ_FOG}"/>`,
      );
    }
  }
  const court = ['chariot', 'horse', 'elephant', 'advisor', 'general'].map((role, c) =>
    xiangqiDisc(g.px(c), g.py(4), disc, 'red', role),
  );
  // The visible half of the palace: file f is off this crop, so draw the two
  // diagonals over the advisor (col 3) and general (col 4) files only.
  const halfPalace = `<g stroke="${XQ_LINE}" stroke-width="1" stroke-linecap="round"><line x1="${g.px(3)}" y1="${g.py(4)}" x2="${g.px(4)}" y2="${g.py(3)}"/><line x1="${g.px(3)}" y1="${g.py(2)}" x2="${g.px(4)}" y2="${g.py(3)}"/></g>`;
  const pieces = [
    ...court,
    xiangqiDisc(g.px(1), g.py(2), disc, 'red', 'cannon'),
    // soldiers sit on rank 4, two rows ahead of the cannon's rank
    ...[0, 2, 4].map((c) => xiangqiDisc(g.px(c), g.py(1), disc, 'red', 'soldier')),
  ];
  return [xqBoard(g), halfPalace, fog.join(''), ...pieces].join('');
}

function darkMiniXiangqiBody(): string {
  // A 4x4-cell (5x5-point) cut of the real mini-xiangqi opening, window shifted
  // right one file (c..g): horse-general-horse-cannon-chariot back rank, so the
  // palace + general sit off-centre left and a chariot enters on the right.
  const g = xqGeom(5, 5);
  const disc = g.gx * 0.9;
  // file c..g -> col 0..4 ; rank 1..5 -> row 4..0 (red on the near/bottom side)
  const at = (file: number, rank: number) => ({ x: g.px(file - 2), y: g.py(5 - rank) });
  const backRank: Array<[number, string]> = [
    [2, 'horse'],
    [3, 'general'],
    [4, 'horse'],
    [5, 'cannon'],
    [6, 'chariot'],
  ];
  const pieces = [
    ...backRank.map(([file, role]) => {
      const p = at(file as number, 1);
      return xiangqiDisc(p.x, p.y, disc, 'red', role as string);
    }),
    // soldiers sit in front of every file except the cannon's (file f)
    ...[2, 3, 4, 6].map((file) => {
      const p = at(file, 2);
      return xiangqiDisc(p.x, p.y, disc, 'red', 'soldier');
    }),
  ].join('');
  // Fog the far approach but leave the cannon file (col 3) open — its sightline
  // is clear; every other file is screened by a soldier.
  const fogYBottom = (g.py(1) + g.py(2)) / 2;
  const leftX1 = (g.px(2) + g.px(3)) / 2;
  const rightX0 = (g.px(3) + g.px(4)) / 2;
  const fog = [
    `<rect x="${OX}" y="${OY}" width="${leftX1 - OX}" height="${fogYBottom - OY}" fill="${XQ_FOG}"/>`,
    `<rect x="${rightX0}" y="${OY}" width="${OX + SIZE - rightX0}" height="${fogYBottom - OY}" fill="${XQ_FOG}"/>`,
  ].join('');
  return [xqBoard(g, { palace: { cLo: 0, cHi: 2, rLo: 2, rHi: 4 } }), pieces, fog].join('');
}

function jieqiBody(): string {
  // Full xiangqi board, every piece face-down except two revealed identities.
  const g = xqGeom(5, 5);
  const disc = g.gx * 0.94;
  const blackBacks: Array<[number, number]> = [[0, 0], [1, 0], [3, 0], [4, 0], [2, 1]];
  const redBacks: Array<[number, number]> = [[0, 4], [2, 4], [4, 4], [3, 3]];
  const backs = [
    ...blackBacks.map(([c, r]) => xiangqiBackDisc(g.px(c), g.py(r), disc, 'black')),
    ...redBacks.map(([c, r]) => xiangqiBackDisc(g.px(c), g.py(r), disc, 'red')),
  ].join('');
  return [
    xqBoard(g, { riverGapAfterRow: 2 }),
    backs,
    xiangqiDisc(g.px(1), g.py(1), disc, 'black', 'horse'),
    xiangqiDisc(g.px(1), g.py(4), disc, 'red', 'chariot'),
  ].join('');
}

function banqiBody(): string {
  // Banqi plays in cells (not on intersections): a 4x4 cell crop of face-down
  // pieces, a couple flipped. Cells distinguish it from jieqi's point grid.
  const cols = 4;
  const rows = 4;
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
    lines.push(`<line x1="${left}" y1="${top + r * ch}" x2="${left + cols * cw}" y2="${top + r * ch}"/>`);
  }
  for (let c = 0; c <= cols; c += 1) {
    lines.push(`<line x1="${left + c * cw}" y1="${top}" x2="${left + c * cw}" y2="${top + rows * ch}"/>`);
  }
  const revealed = new Set(['1,1', '2,2']);
  const colorAt = (c: number, r: number): XqColor => ((c + r) % 2 === 0 ? 'red' : 'black');
  const backs: string[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (revealed.has(`${c},${r}`)) continue;
      backs.push(xiangqiBackDisc(ccx(c), ccy(r), disc, colorAt(c, r)));
    }
  }
  return [
    `<rect x="${OX}" y="${OY}" width="${SIZE}" height="${SIZE}" fill="${XQ_BG}"/>`,
    `<g stroke="${XQ_LINE}" stroke-width="1" stroke-linecap="round">${lines.join('')}</g>`,
    backs.join(''),
    xiangqiDisc(ccx(1), ccy(1), disc, 'red', 'general'),
    xiangqiDisc(ccx(2), ccy(2), disc, 'black', 'chariot'),
  ].join('');
}

function crossroadsBody(): string {
  const cell = SIZE / 4;
  const center = (c: number, r: number) => ({ x: OX + (c + 0.5) * cell, y: OY + (r + 0.5) * cell });
  const k = center(1, 0);
  const n = center(3, 0);
  // chess top, river across the middle, xiangqi disc below
  const river = `<rect x="${OX}" y="${OY + cell * 1.85}" width="${SIZE}" height="${cell * 0.3}" fill="${RIVER_FILL}"/>`;
  const road = `<line x1="${OX + SIZE / 2}" y1="${OY}" x2="${OX + SIZE / 2}" y2="${OY + SIZE}" stroke="${XQ_LINE}" stroke-width="1.2" opacity="0.4"/>`;
  const g = center(2, 3);
  const g2 = center(0, 3);
  return [
    checker(4, 4, cell),
    river,
    road,
    chessPieceAt('white:king', k.x, k.y, cell),
    chessPieceAt('black:knight', n.x, n.y, cell),
    xiangqiDisc(g.x, g.y, cell * 0.84, 'red', 'cannon'),
    xiangqiDisc(g2.x, g2.y, cell * 0.84, 'black', 'elephant'),
  ].join('');
}

// ---- registry + render entry ----------------------------------------------

const BODIES: Record<VariantMiniId, () => string> = {
  'dark-chess': darkChessBody,
  draft960: draft960Body,
  'dark-xiangqi': darkXiangqiBody,
  'dark-mini-xiangqi': darkMiniXiangqiBody,
  jieqi: jieqiBody,
  banqi: banqiBody,
  crossroads: crossroadsBody,
};

export const VARIANT_MINIS: readonly VariantMiniDef[] = [
  {
    id: 'dark-chess',
    label: 'Dark chess',
    shortLabel: 'DC',
    accent: '#1f6f5b',
    blurb: 'Four pawns over a back rank; the enemy half all fog.',
    frame: CHESS_FRAME,
  },
  {
    id: 'draft960',
    label: 'Dark Draft960',
    shortLabel: '960',
    accent: '#8a5a18',
    blurb: "White's back rank shuffled, the enemy half all fog.",
    frame: CHESS_FRAME,
  },
  {
    id: 'dark-xiangqi',
    label: 'Dark Xiangqi',
    shortLabel: 'XQ',
    accent: '#9f342d',
    blurb: "Red's court and cannon; fog marks the squares no red piece can reach.",
    frame: XQ_FRAME,
  },
  {
    id: 'dark-mini-xiangqi',
    label: 'Dark Mini Xiangqi',
    shortLabel: 'MX',
    accent: '#c2410c',
    blurb: "A real-opening cut: general by its palace, cannon, and chariot.",
    frame: XQ_FRAME,
  },
  {
    id: 'jieqi',
    label: 'Jieqi',
    shortLabel: 'JQ',
    accent: '#6d4aa0',
    blurb: 'Face-down discs on the points, two identities shown.',
    frame: XQ_FRAME,
  },
  {
    id: 'banqi',
    label: 'Banqi',
    shortLabel: 'BQ',
    accent: '#2563a6',
    blurb: 'Face-down pieces in cells, a couple flipped.',
    frame: XQ_FRAME,
  },
  {
    id: 'crossroads',
    label: 'Crossroads Chess',
    shortLabel: 'CR',
    accent: '#3f7d4e',
    blurb: 'Chess above, river across, a cannon below.',
    frame: CHESS_FRAME,
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
  opts: { className?: string; label?: string; size?: number } = {},
): string {
  const def = variantMiniForId(id);
  const size = opts.size ?? 96;
  const label = opts.label ?? `${def.label} board`;
  const classAttr = opts.className ? ` class="${escapeAttr(opts.className)}"` : '';
  const clipId = `mini-clip-${(clipSeq += 1)}`;
  const body = BODIES[id]();
  return [
    `<svg${classAttr} width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${escapeAttr(label)}" xmlns="http://www.w3.org/2000/svg">`,
    `<defs><clipPath id="${clipId}"><rect x="${OX}" y="${OY}" width="${SIZE}" height="${SIZE}" rx="11"/></clipPath></defs>`,
    `<g clip-path="url(#${clipId})">${body}</g>`,
    `<rect x="${OX}" y="${OY}" width="${SIZE}" height="${SIZE}" rx="11" fill="none" stroke="${def.frame}" stroke-width="2.5"/>`,
    `</svg>`,
  ].join('');
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
