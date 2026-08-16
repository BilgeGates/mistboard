/**
 * Renders the board figures for the basic-endgame write-up.
 *
 * International piece art, because the point of that piece set is a reader who
 * cannot read 俥/傌/仕 — the same reader the endgame write-up is for.
 *
 * Captions live in the prose, not in the image: a baked-in caption is unreadable
 * once the PNG is downscaled to a content column, cannot be selected or read by
 * a screen reader, and needs a re-render to fix a typo.
 *
 * The board grid still comes from board-render so the geometry matches the site,
 * but pieces are overlaid here because the international set is PNG art living in
 * apps/web, while board-render only carries the Hanzi glyph paths.
 *
 * Geometry is copied from renderXiangqiOgBoardSvg rather than re-derived:
 *   cell = height / (ranks - 1 + 2 * 0.58);  margin = 0.58 * cell
 *   width = 2 * margin + (files - 1) * cell   ->  width = 0.9016 * height
 * The nested board <svg> is offset by (centerX - width/2, y), so piece centres
 * computed in board space need that offset added to land in canvas space.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderXiangqiOgBoardSvg, type XiangqiOgPiece } from '@mistboard/board-render';
import {
  endgameEntryState,
  XIANGQI_ENDGAME_CORPUS,
  type XiangqiBoard,
  type XiangqiGameState,
} from '@mistboard/game';
import { svgToPng } from './og-image.js';

const FONT = 'Helvetica, Arial, sans-serif';
const ART = 'apps/web/public/piece-sets/xiangqi/international';
const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const ROLE: Record<string, string> = {
  k: 'general',
  a: 'advisor',
  b: 'elephant',
  n: 'horse',
  r: 'chariot',
  c: 'cannon',
  p: 'soldier',
};

const FILES = 9;
const RANKS = 10;
/** width / height for a 9x10 board, from the renderer's own ratios. */
const ASPECT = (2 * 0.58 + (FILES - 1)) / (RANKS - 1 + 2 * 0.58);

/** Per-role art framing inside the 100x100 piece box, copied from the web set. */
const FRAMES: Record<string, { x: number; y: number; width: number; height: number }> = {
  general: { x: -7, y: -7, width: 114, height: 114 },
  advisor: { x: -7, y: -7, width: 114, height: 114 },
  elephant: { x: -5, y: -5, width: 110, height: 110 },
  horse: { x: -7, y: -7, width: 114, height: 114 },
  chariot: { x: -5.5, y: -7, width: 111, height: 114 },
  cannon: { x: -11, y: -11, width: 122, height: 122 },
  soldier: { x: 0, y: 0, width: 100, height: 100 },
};

const artCache = new Map<string, string>();
function pieceDataUri(color: string, role: string): string {
  const key = `${color}-${role}`;
  const hit = artCache.get(key);
  if (hit) return hit;
  const buf = readFileSync(resolve(REPO_ROOT, ART, `${key}.png`));
  const uri = `data:image/png;base64,${buf.toString('base64')}`;
  artCache.set(key, uri);
  return uri;
}

function stateFromTokens(tokens: string[]): XiangqiGameState {
  const board: Record<string, { color: string; role: string }> = {};
  for (const t of tokens) {
    const letter = t.slice(0, 1);
    board[t.slice(1)] = {
      color: letter === letter.toUpperCase() ? 'red' : 'black',
      role: ROLE[letter.toLowerCase()] as string,
    };
  }
  return {
    id: 'fig',
    board: board as unknown as XiangqiBoard,
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
    progressClock: 0,
    positionCounts: {},
  } as XiangqiGameState;
}

function piecesOf(state: XiangqiGameState): XiangqiOgPiece[] {
  return Object.entries(state.board).flatMap(([square, piece]) =>
    piece
      ? [
          {
            file: square.charCodeAt(0) - 97,
            rank: Number(square.slice(1)),
            color: piece.color,
            role: piece.role as XiangqiOgPiece['role'],
          },
        ]
      : [],
  );
}

function fromCorpus(id: string): XiangqiOgPiece[] {
  const entry = XIANGQI_ENDGAME_CORPUS.find((e) => e.id === id);
  if (!entry) throw new Error(`no entry ${id}`);
  return piecesOf(endgameEntryState(entry));
}

/** Bare grid plus international piece art, positioned in canvas coordinates. */
function board(pieces: XiangqiOgPiece[], centerX: number, y: number, height: number): string {
  const grid = renderXiangqiOgBoardSvg({
    files: FILES,
    ranks: RANKS,
    pieces: [],
    lineWidth: GRID_LINE,
    riverBetweenRanks: [5, 6],
    palaces: [
      { fileLo: 3, fileHi: 5, rankLo: 1, rankHi: 3 },
      { fileLo: 3, fileHi: 5, rankLo: 8, rankHi: 10 },
    ],
    centerX,
    y,
    height,
  });

  const cell = height / (RANKS - 1 + 2 * 0.58);
  const margin = 0.58 * cell;
  const width = 2 * margin + (FILES - 1) * cell;
  const ox = centerX - width / 2;
  // Mirrors apps/web/src/xiangqi-piece-sets.ts: a cream disc with a coloured rim,
  // then the art on top, framed per role inside a 100x100 box. Without the disc
  // the outline art washes out against the board and grid lines show through it.
  const size = 0.92 * cell;
  const art = pieces.map((p) => {
    const cx = ox + margin + p.file * cell;
    const cy = y + margin + (RANKS - p.rank) * cell;
    const f = FRAMES[p.role] ?? FRAMES.soldier;
    const u = size / 100; // 100x100 piece box -> board units
    const rim = p.color === 'red' ? '#c30d0d' : '#202427';
    return [
      `<circle cx="${cx}" cy="${cy}" r="${46 * u}" fill="#fef0d7" stroke="${rim}" stroke-width="${4.2 * u}"/>`,
      `<image href="${pieceDataUri(p.color, p.role)}" x="${cx - size / 2 + f.x * u}" y="${cy - size / 2 + f.y * u}" width="${f.width * u}" height="${f.height * u}" preserveAspectRatio="xMidYMid meet"/>`,
    ].join('');
  });
  return grid + art.join('');
}

type Panel = { pieces: XiangqiOgPiece[]; title: string; verdict: string; win: boolean };

const TITLE_Y = 52;
const BOARD_Y = 78;

// These two are set against the post's 680px content column, and they trade
// against each other.
//
// A pair figure is ~1386 units wide and displays at 680 CSS px, so the SVG is
// authored at almost exactly 2x its display size and rasterizes at zoom 1. The
// earlier zoom of 2 was not extra quality: 2772px downscaled 4x by the browser
// turned the grid into grey mush, because the line is defined in board units and
// a board is ~630 units wide. One unit lands at half a CSS pixel however many
// device pixels the PNG has, so the fix is a thicker line, not a bigger file.
//
// 2.4 units puts the grid just over one CSS pixel at the size it is read.
const GRID_LINE = 2.4;
const FIGURE_ZOOM = 1;

function pair(panels: [Panel, Panel], out: string): void {
  const BOARD_H = 700;
  const boardW = BOARD_H * ASPECT;
  const gap = 56;
  const pad = 34;
  const W = Math.round(2 * boardW + gap + 2 * pad);
  const verdictY = BOARD_Y + BOARD_H + 52;
  const H = Math.round(verdictY + 28);

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#0f1115"/>`,
  ];
  panels.forEach((panel, i) => {
    const cx = i === 0 ? pad + boardW / 2 : W - pad - boardW / 2;
    parts.push(board(panel.pieces, cx, BOARD_Y, BOARD_H));
    parts.push(
      `<text x="${cx}" y="${TITLE_Y}" text-anchor="middle" font-family="${FONT}" font-size="34" font-weight="700" fill="#f3f4f6">${panel.title}</text>`,
      `<text x="${cx}" y="${verdictY}" text-anchor="middle" font-family="${FONT}" font-size="31" font-weight="700" fill="${panel.win ? '#e0b341' : '#9ca3af'}">${panel.verdict}</text>`,
    );
  });
  parts.push(`</svg>`);
  writeFileSync(out, svgToPng(parts.join(''), '#0f1115', FIGURE_ZOOM));
  console.log(`wrote ${out} (${W}x${H}, board ${Math.round(boardW)}x${BOARD_H})`);
}

// A single board gets the same 2x treatment as a pair, but a pair fills the
// column and a lone board should not: the post displays these at 380px via an
// explicit width, so the file is authored at ~760 and halves on the page.
function single(panel: Panel, out: string): void {
  const BOARD_H = 750;
  const boardW = BOARD_H * ASPECT;
  const pad = 40;
  const W = Math.round(boardW + 2 * pad);
  const verdictY = BOARD_Y + BOARD_H + 52;
  const H = Math.round(verdictY + 26);
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#0f1115"/>`,
    board(panel.pieces, W / 2, BOARD_Y, BOARD_H),
    `<text x="${W / 2}" y="${TITLE_Y}" text-anchor="middle" font-family="${FONT}" font-size="33" font-weight="700" fill="#f3f4f6">${panel.title}</text>`,
    `<text x="${W / 2}" y="${verdictY}" text-anchor="middle" font-family="${FONT}" font-size="31" font-weight="700" fill="#9ca3af">${panel.verdict}</text>`,
    `</svg>`,
  ];
  writeFileSync(out, svgToPng(parts.join(''), '#0f1115', FIGURE_ZOOM));
  console.log(`wrote ${out} (${W}x${H}, board ${Math.round(boardW)}x${BOARD_H})`);
}

const dir = process.argv[2] ?? '.';
const DEFENCE = ['ke10', 'ae9', 'af10', 'be8', 'bc10'];

// The opening figure only. This script deliberately does NOT emit thumbnail.png
// or social-card.png any more: a feed thumbnail is a tall crop shown in a fixed
// box, a share card is landscape at a fixed size, and an in-body figure is
// downscaled into the content column. They want different crops at different
// sizes, and pointing all three at one file meant whichever pipeline ran last
// decided how the other two looked. Those two are produced by the site's own
// image pass, in the blog repo.
pair(
  [
    {
      pieces: fromCorpus('chariot-vs-full-defence'),
      title: 'Chariot',
      verdict: 'Draw',
      win: false,
    },
    {
      pieces: fromCorpus('three-soldiers-vs-full-defence'),
      title: 'Three soldiers',
      verdict: 'Mate in 15',
      win: true,
    },
  ],
  `${dir}/chariot-vs-soldiers.png`,
);

pair(
  [
    {
      pieces: fromCorpus('chariot-vs-horse-two-elephants-fortress'),
      title: 'Elephant on g6',
      verdict: 'Draw',
      win: false,
    },
    {
      pieces: fromCorpus('chariot-vs-horse-two-elephants-broken'),
      title: 'Elephant on g10',
      verdict: 'Red wins',
      win: true,
    },
  ],
  `${dir}/fortress-pair.png`,
);

pair(
  [
    {
      pieces: fromCorpus('three-soldiers-vs-full-defence'),
      title: 'Soldiers on the 7th',
      verdict: 'Mate in 15',
      win: true,
    },
    {
      pieces: piecesOf(stateFromTokens(['Ke1', 'Pc6', 'Pe6', 'Pg6', ...DEFENCE])),
      title: 'Soldiers on the 6th',
      // Not a tempo verdict: c6 and g6 are two of the seven points a black
      // elephant can ever stand on, so a soldier there is simply hanging.
      verdict: 'Black takes one',
      win: false,
    },
  ],
  `${dir}/soldier-rank-pair.png`,
);

pair(
  [
    {
      pieces: piecesOf(stateFromTokens(['Ke1', 'Ra5', 'kf9', 'cf10', 'nd7'])),
      title: 'Cannon behind the general',
      verdict: 'Draw',
      win: false,
    },
    {
      pieces: piecesOf(stateFromTokens(['Ke1', 'Ra5', 'kf9', 'ce10', 'nd7'])),
      title: 'Cannon one point across',
      verdict: 'Mate in 12',
      win: true,
    },
  ],
  `${dir}/cannon-behind-general.png`,
);

pair(
  [
    {
      pieces: piecesOf(stateFromTokens(['Kd1', 'Ra5', 'Cc5', 'kf10', 're5'])),
      title: 'Defender on the 5th',
      verdict: 'Draw (0.00)',
      win: false,
    },
    {
      pieces: piecesOf(stateFromTokens(['Kd1', 'Ra5', 'Cc5', 'kf10', 're6'])),
      title: 'Defender on the 6th',
      verdict: 'Red wins (+6.65)',
      win: true,
    },
  ],
  `${dir}/middle-file-pair.png`,
);

single(
  {
    pieces: fromCorpus('soldiers-five-on-last-rank'),
    title: 'Five soldiers against a bare general',
    verdict: 'Draw',
    win: false,
  },
  `${dir}/five-soldiers.png`,
);
